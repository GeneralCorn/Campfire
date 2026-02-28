/**
 * Hangout API route — 1:1 conversation with a single teammate.
 * Same two-layer pattern as team-chat but only one teammate responds.
 */

import { NextRequest } from "next/server";

const MODAL_ENDPOINT = process.env.MODAL_ENDPOINT_URL || "";
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY || "";

const VOICE_IDS: Record<string, string> = {
  mika: "21m00Tcm4TlvDq8ikWAM",
  rune: "29vD33N1CtxCmqQRPOHJ",
  sage: "EXAVITQu4vr4xnSDxMaL",
};

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

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { teammate, message, history = [] } = body;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      function emit(data: Record<string, unknown>) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(data)}\n\n`)
        );
      }

      emit({ event: "thinking", teammate });

      // Call Modal
      let result = null;
      if (MODAL_ENDPOINT) {
        try {
          const res = await fetch(MODAL_ENDPOINT, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              config_id: teammate,
              conversation_history: history,
              current_input: message,
              mode: "chat",
              task: "",
            }),
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
        });

        const voiceText = result.voice_text || result.result || "";
        const sentences = voiceText.match(/[^.!?—]+[.!?—]*/g) || [voiceText];

        for (const sentence of sentences) {
          if (request.signal.aborted) break;
          const trimmed = sentence.trim();
          if (!trimmed) continue;
          const audio = await callTTS(VOICE_IDS[teammate], trimmed);
          emit({ event: "voice_chunk", teammate, text: trimmed, audio });
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
