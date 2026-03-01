/**
 * Hangout API route — 1:1 conversation with a single teammate.
 * Uses Anthropic API (Claude) for LLM responses and ElevenLabs for TTS.
 *
 * Debrief mode: If a sessionId is provided, queries Supermemory for
 * session-scoped memories and injects them into the system prompt,
 * grounding the agent's responses in what they actually said/thought.
 */

import { NextRequest } from "next/server";
import WebSocket from "ws";
import Anthropic from "@anthropic-ai/sdk";

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514";
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY || "";
const SUPERMEMORY_API_KEY = process.env.SUPERMEMORY_API_KEY || "";

const VOICE_IDS: Record<string, string> = {
  maya: "21m00Tcm4TlvDq8ikWAM",
  rex: "29vD33N1CtxCmqQRPOHJ",
  sol: "EXAVITQu4vr4xnSDxMaL",
};

const TEAMMATE_PROMPTS: Record<string, string> = {
  maya: `You are Maya, a medical research specialist. Methodical, thorough, detail-oriented. You read prescriptions, search PubMed, and extract structured data from medical documents. You say things like "let me pull up the details on that" and "here's what the literature says." Keep responses to 2-4 sentences.`,
  rex: `You are Rex, a drug interaction and safety specialist. Careful, authoritative, never hand-waves safety concerns. You cross-reference everything against FDA databases. You say things like "the FDA label says..." and "I need to flag this." Keep responses to 2-3 sentences.`,
  sol: `You are Sol, a synthesis and communication specialist. Warm, clear, makes complex medical information accessible. You say things like "here's the bottom line" and "let me put this together for you." Keep responses to 3-5 sentences.`,
};

/**
 * Query Supermemory for session-scoped memories (debrief mode).
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
 * Stream TTS via ElevenLabs WebSocket.
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

      // Build prompt
      const basePrompt = TEAMMATE_PROMPTS[teammate] || TEAMMATE_PROMPTS.maya;
      let systemPrompt = basePrompt;

      const formattingRules = `\n\nCRITICAL RULES:
1. You MUST wrap your entire internal reasoning process in <think>...</think> tags FIRST.
2. Immediately after the closing </think> tag, you MUST output a valid JSON object matching this exact schema:
{"spoken_message": "2-3 sentences max", "confidence": 0.9, "sentiment": "analytical"}
3. The 'spoken_message' MUST NOT contain any markdown, asterisks, or bullet points. Output raw spoken English only.`;

      if (memoryContext) {
        systemPrompt += `\n\nHere are your memories from the recent session:\n${memoryContext}`;
      }
      systemPrompt += formattingRules;

      // Call Anthropic API
      try {
        const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
        const response = await client.messages.create({
          model: ANTHROPIC_MODEL,
          max_tokens: 2048,
          system: systemPrompt,
          messages: [
            ...history.map((h: { role: string; content: string }) => ({
              role: h.role as "user" | "assistant",
              content: h.content,
            })),
            { role: "user" as const, content: message },
          ],
        });

        const rawText = response.content[0].type === "text" ? response.content[0].text : "";

        // Parse response — extract <think> tags and JSON
        let reasoning = "";
        let messageText = rawText;

        const thinkMatch = rawText.match(/<think>([\s\S]*?)<\/think>/);
        if (thinkMatch) {
          reasoning = thinkMatch[1].trim();
          messageText = rawText.replace(thinkMatch[0], "").trim();
        }

        // Strip markdown code fences
        const jsonMatch = messageText.match(/```json\s*([\s\S]*?)\s*```/i);
        if (jsonMatch) {
          messageText = jsonMatch[1].trim();
        }
        messageText = messageText.replace(/^`+|`+$/g, "").trim();

        let spokenMessage = "";
        let confidence = 0.5;
        let sentiment = "neutral";

        try {
          const parsed = JSON.parse(messageText);
          spokenMessage = (parsed.spoken_message || "").replace(/[*_#`~]/g, "");
          confidence = parseFloat(parsed.confidence || "0.5");
          sentiment = parsed.sentiment || "neutral";
        } catch {
          spokenMessage = messageText.replace(/[*_#`~]/g, "");
        }

        emit({
          event: "task_result",
          teammate,
          thinking: reasoning,
          confidence,
          sentiment,
        });

        emit({ event: "voice_text", teammate, text: spokenMessage });

        // Stream TTS audio
        const voiceId = VOICE_IDS[teammate];
        if (voiceId && !request.signal.aborted) {
          await streamTTS(voiceId, spokenMessage, teammate, emit);
        }
      } catch (err) {
        console.error("[Hangout] LLM error:", err);
        emit({ event: "voice_text", teammate, text: "I'm having trouble connecting right now. Try again in a moment." });
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
