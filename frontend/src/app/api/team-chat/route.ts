/**
 * THE ORCHESTRATOR — Next.js API route that coordinates team conversation.
 *
 * Flow per teammate turn:
 * 1. Emit { event: 'thinking', teammate }
 * 2. Call Modal agent_respond(config, history, input, mode, task)
 * 3. Emit { event: 'task_result', teammate, thinking, action, artifact_update }
 * 4. Split voice_text on sentence boundaries
 * 5. For each sentence: call ElevenLabs TTS, emit voice_chunk
 * 6. Emit { event: 'turn_end', teammate }
 * 7. Check abort signal → break if interrupted
 *
 * User interrupt: abort the fetch → signal.aborted → stop loop
 */

import { NextRequest } from "next/server";

const MODAL_ENDPOINT = process.env.MODAL_ENDPOINT_URL || "";
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY || "";

// Teammate configs (mirrored from backend/config.py for turn order decisions)
const TEAMMATE_CONFIGS: Record<string, { voice_id: string }> = {
  mika: { voice_id: "21m00Tcm4TlvDq8ikWAM" },
  rune: { voice_id: "29vD33N1CtxCmqQRPOHJ" },
  sage: { voice_id: "EXAVITQu4vr4xnSDxMaL" },
};

function decideTurnOrder(task: string, mode: string): string[] {
  if (mode === "chat") return ["mika", "rune", "sage"];

  const lower = task.toLowerCase();
  const mikaWords = ["research", "find", "search", "look", "discover", "explore"];
  const runeWords = ["review", "check", "validate", "compare", "analyze", "critique"];
  const sageWords = ["summarize", "plan", "decide", "synthesize", "write", "recommend"];

  if (mikaWords.some((w) => lower.includes(w)))
    return ["mika", "rune", "mika", "rune", "sage", "mika", "rune", "sage"];
  if (runeWords.some((w) => lower.includes(w)))
    return ["rune", "mika", "sage", "rune", "mika", "sage"];
  if (sageWords.some((w) => lower.includes(w)))
    return ["sage", "mika", "rune", "sage"];

  return ["mika", "rune", "sage", "mika", "rune", "sage"];
}

function splitSentences(text: string): string[] {
  // Split on sentence boundaries: . ! ? — but keep the delimiter
  const sentences = text.match(/[^.!?—]+[.!?—]*/g) || [text];
  return sentences.map((s) => s.trim()).filter((s) => s.length > 0);
}

async function callTTS(voiceId: string, text: string): Promise<string | null> {
  if (!ELEVENLABS_API_KEY || !text.trim()) return null;

  try {
    const res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        method: "POST",
        headers: {
          "xi-api-key": ELEVENLABS_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text,
          model_id: "eleven_turbo_v2_5",
          voice_settings: { stability: 0.5, similarity_boost: 0.75 },
        }),
      }
    );

    if (!res.ok) return null;

    const buffer = await res.arrayBuffer();
    return Buffer.from(buffer).toString("base64");
  } catch {
    return null;
  }
}

async function callModalAgent(
  config: string,
  history: unknown[],
  input: string,
  mode: string,
  task: string
): Promise<Record<string, unknown> | null> {
  if (!MODAL_ENDPOINT) return null;

  try {
    const res = await fetch(MODAL_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        config_id: config,
        conversation_history: history,
        current_input: input,
        mode,
        task,
      }),
    });

    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { task, history = [], mode = "auto" } = body;

  // Auto-detect mode
  const resolvedMode =
    mode === "auto"
      ? ["research", "find", "write", "analyze", "create", "build", "help", "compare"].some(
          (kw) => task.toLowerCase().includes(kw)
        )
        ? "task"
        : "chat"
      : mode;

  const turnOrder = decideTurnOrder(task, resolvedMode);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      function emit(data: Record<string, unknown>) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(data)}\n\n`)
        );
      }

      emit({ event: "session_start", mode: resolvedMode, task });

      const conversationHistory = [...history];
      let lastMessage = task;

      for (const teammateId of turnOrder) {
        // Check if client disconnected
        if (request.signal.aborted) break;

        // 1. Thinking
        emit({ event: "thinking", teammate: teammateId });

        // 2. Call Modal agent_respond
        const result = await callModalAgent(
          teammateId,
          conversationHistory,
          lastMessage,
          resolvedMode,
          task
        );

        if (request.signal.aborted) break;

        if (result) {
          // 3. Task result (thinking, action, artifact)
          emit({
            event: "task_result",
            teammate: teammateId,
            thinking: result.thinking,
            action: result.action,
            artifact_update: result.artifact_update,
          });

          // 4. Voice chunks (sentence by sentence)
          const voiceText = (result.voice_text as string) || (result.result as string) || "";
          const sentences = splitSentences(voiceText);
          const voiceConfig = TEAMMATE_CONFIGS[teammateId];

          for (const sentence of sentences) {
            if (request.signal.aborted) break;

            const audio = await callTTS(voiceConfig.voice_id, sentence);
            emit({
              event: "voice_chunk",
              teammate: teammateId,
              text: sentence,
              audio: audio,
            });
          }

          // 5. Memory node
          if (result.memory) {
            emit({
              event: "memory_node",
              teammate: teammateId,
              content: result.memory,
            });
          }

          // Update conversation history
          conversationHistory.push({
            role: "assistant",
            content: `[${teammateId}]: ${voiceText}`,
          });
          lastMessage = voiceText;
        }

        // 6. Turn end
        emit({ event: "turn_end", teammate: teammateId });
      }

      emit({ event: "complete" });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
