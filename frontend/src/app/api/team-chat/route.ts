/**
 * THE ORCHESTRATOR — Next.js API route that coordinates team conversation.
 *
 * Flow per teammate turn:
 * 1. Emit { event: 'thinking', teammate }
 * 2. Call Modal agent_respond(config, history, input, mode, task)
 * 3. Emit { event: 'task_result', teammate, thinking, action, artifact_update, confidence, sentiment }
 * 4. Emit { event: 'voice_text', teammate, text } for subtitles
 * 5. Stream TTS via ElevenLabs WebSocket, emitting { event: 'audio_chunk', teammate, audio } per packet
 * 6. Emit { event: 'turn_end', teammate }
 * 7. Check abort signal → break if interrupted
 *
 * User interrupt: abort the fetch → signal.aborted → stop loop
 */

import { NextRequest } from "next/server";
import WebSocket from "ws";

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

/**
 * Stream TTS via ElevenLabs WebSocket.
 * Opens a WS connection, sends BOS → text → EOS, and emits audio_chunk events
 * as PCM packets arrive. Much lower latency than REST (audio starts ~200ms in).
 *
 * Protocol ported from backend/orchestrator.py task_elevenlabs_streaming().
 */
async function streamTTS(
  voiceId: string,
  text: string,
  teammateId: string,
  emit: (data: Record<string, unknown>) => void
): Promise<void> {
  if (!ELEVENLABS_API_KEY || !text.trim()) return;

  const wsUrl = `wss://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream-input?model_id=eleven_flash_v2_5&output_format=pcm_24000`;

  return new Promise<void>((resolve) => {
    const ws = new WebSocket(wsUrl);

    ws.on("open", () => {
      // 1. BOS (Beginning of Stream)
      ws.send(
        JSON.stringify({
          text: " ",
          voice_settings: { stability: 0.5, similarity_boost: 0.8 },
          xi_api_key: ELEVENLABS_API_KEY,
        })
      );

      // 2. Send the full text
      ws.send(
        JSON.stringify({
          text: text + " ",
          try_trigger_generation: true,
        })
      );

      // 3. EOS (End of Stream)
      ws.send(JSON.stringify({ text: "" }));
    });

    ws.on("message", (raw: Buffer | string) => {
      try {
        const data = JSON.parse(raw.toString());

        if (data.audio) {
          emit({
            event: "audio_chunk",
            teammate: teammateId,
            audio: data.audio,
          });
        }

        if (data.isFinal) {
          ws.close();
        }
      } catch {
        // Skip malformed messages
      }
    });

    ws.on("close", () => resolve());
    ws.on("error", () => {
      ws.close();
      resolve();
    });
  });
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
          // 3. Task result (thinking, action, artifact, confidence, sentiment)
          emit({
            event: "task_result",
            teammate: teammateId,
            thinking: result.thinking,
            action: result.action,
            artifact_update: result.artifact_update,
            confidence: result.confidence,
            sentiment: result.sentiment,
          });

          // 4. Voice text (full subtitle text emitted once)
          const voiceText = (result.voice_text as string) || (result.result as string) || "";

          emit({
            event: "voice_text",
            teammate: teammateId,
            text: voiceText,
          });

          // 5. Stream TTS audio via ElevenLabs WebSocket
          const voiceConfig = TEAMMATE_CONFIGS[teammateId];
          if (voiceConfig && !request.signal.aborted) {
            await streamTTS(voiceConfig.voice_id, voiceText, teammateId, emit);
          }

          // 6. Memory node
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

        // 7. Turn end
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
