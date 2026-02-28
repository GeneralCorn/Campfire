/**
 * Hangout API route — 1:1 conversation with a single teammate.
 * Same two-layer pattern as team-chat but only one teammate responds.
 *
 * Debrief mode: If a sessionId is provided, queries Supermemory for
 * session-scoped memories and injects them into the system prompt,
 * grounding the agent's responses in what they actually said/thought.
 */

import { NextRequest } from "next/server";
import WebSocket from "ws";

const MODAL_ENDPOINT = process.env.MODAL_ENDPOINT_URL || "";
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY || "";
const SUPERMEMORY_API_KEY = process.env.SUPERMEMORY_API_KEY || "";

const VOICE_IDS: Record<string, string> = {
  mika: "21m00Tcm4TlvDq8ikWAM",
  rune: "29vD33N1CtxCmqQRPOHJ",
  sage: "EXAVITQu4vr4xnSDxMaL",
};

/**
 * Query Supermemory for session-scoped memories (debrief mode).
 * Pattern from orchestrator.py query_debrief_memory().
 */
async function querySessionMemory(
  sessionId: string,
  agentTag: string,
  query: string
): Promise<string> {
  if (!SUPERMEMORY_API_KEY || !sessionId) return "";

  const payload: Record<string, unknown> = {
    q: query,
    containerTags: [sessionId],
    limit: 5,
    rerank: true,
  };

  if (agentTag && agentTag !== "all") {
    payload.filters = {
      AND: [{ key: "agent_id", value: agentTag }],
    };
  }

  try {
    const res = await fetch("https://api.supermemory.ai/v4/search", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SUPERMEMORY_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) return "";
    const data = await res.json();
    const results = data.results || [];
    if (results.length === 0) return "";

    return results
      .map((r: Record<string, unknown>) => {
        const meta = (r.metadata || {}) as Record<string, unknown>;
        const turn = meta.turn_number ?? "?";
        const agent = (meta.agent_id as string) || "unknown";
        const content = (r.content as string) || "";
        return `[Turn ${turn} - ${agent.toUpperCase()}]\n${content}`;
      })
      .join("\n\n");
  } catch {
    return "";
  }
}

/**
 * Stream TTS via ElevenLabs WebSocket (same as team-chat route).
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
      ws.send(
        JSON.stringify({
          text: " ",
          voice_settings: { stability: 0.5, similarity_boost: 0.8 },
          xi_api_key: ELEVENLABS_API_KEY,
        })
      );
      ws.send(
        JSON.stringify({
          text: text + " ",
          try_trigger_generation: true,
        })
      );
      ws.send(JSON.stringify({ text: "" }));
    });

    ws.on("message", (raw: Buffer | string) => {
      try {
        const data = JSON.parse(raw.toString());
        if (data.audio) {
          emit({ event: "audio_chunk", teammate: teammateId, audio: data.audio });
        }
        if (data.isFinal) ws.close();
      } catch {
        // Skip malformed
      }
    });

    ws.on("close", () => resolve());
    ws.on("error", () => {
      ws.close();
      resolve();
    });
  });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { teammate, message, history = [], sessionId } = body;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      function emit(data: Record<string, unknown>) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(data)}\n\n`)
        );
      }

      emit({ event: "thinking", teammate });

      // Debrief: query session memory if sessionId provided
      let memoryContext = "";
      if (sessionId) {
        memoryContext = await querySessionMemory(sessionId, teammate, message);
      }

      // Call Modal
      let result = null;
      if (MODAL_ENDPOINT) {
        try {
          const modalBody: Record<string, unknown> = {
            config_id: teammate,
            conversation_history: history,
            current_input: message,
            mode: "chat",
            task: "",
          };

          // If we have session memory, inject it as extra context
          if (memoryContext) {
            modalBody.current_input =
              `[DEBRIEF CONTEXT — Your memories from the recent session:\n${memoryContext}\n]\n\nUser question: ${message}`;
          }

          const res = await fetch(MODAL_ENDPOINT, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(modalBody),
          });
          if (res.ok) result = await res.json();
        } catch {
          /* fallthrough */
        }
      }

      if (result) {
        emit({
          event: "task_result",
          teammate,
          thinking: result.thinking,
          confidence: result.confidence,
          sentiment: result.sentiment,
        });

        const voiceText = result.voice_text || result.result || "";

        // Emit full text for subtitles
        emit({ event: "voice_text", teammate, text: voiceText });

        // Stream TTS audio
        const voiceId = VOICE_IDS[teammate];
        if (voiceId && !request.signal.aborted) {
          await streamTTS(voiceId, voiceText, teammate, emit);
        }

        if (result.memory) {
          emit({ event: "memory_node", teammate, content: result.memory });
        }
      }

      emit({ event: "turn_end", teammate });
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
