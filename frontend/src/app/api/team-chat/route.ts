/**
 * SSE proxy — forwards team-chat requests to the LangGraph backend at /api/lab/run.
 *
 * The backend (FastAPI + LangGraph) handles:
 *   - Routing queries to Maya → Rex → Sol
 *   - Modal sandbox provisioning (BioBERT, VLM, FDA tools)
 *   - ElevenLabs TTS streaming
 *
 * This route simply proxies the SSE stream so the frontend can call a same-origin
 * endpoint (/api/team-chat) and receive events it already knows how to handle:
 *   thinking, voice_text, audio_chunk, sandbox_spawn, sandbox_output,
 *   sandbox_complete, turn_end, complete, error.
 */

import { NextRequest } from "next/server";

const ORCHESTRATOR_URL =
  process.env.NEXT_PUBLIC_ORCHESTRATOR_URL || "http://localhost:8001";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { task, history = [], mode = "auto", image } = body;

  // Extract medication names from the task text for the backend
  const medications: string[] = [];
  const medPatterns = /\b(metformin|lisinopril|aspirin|atorvastatin|omeprazole|amlodipine|losartan|gabapentin|hydrochlorothiazide|simvastatin|levothyroxine|warfarin|clopidogrel|prednisone|insulin)\b/gi;
  let match;
  while ((match = medPatterns.exec(task)) !== null) {
    const med = match[1].toLowerCase();
    if (!medications.includes(med)) medications.push(med);
  }

  try {
    const upstream = await fetch(`${ORCHESTRATOR_URL}/api/lab/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: task,
        medications,
        history,
        mode,
        ...(image ? { image } : {}),
      }),
      signal: request.signal,
    });

    if (!upstream.ok || !upstream.body) {
      return new Response(
        JSON.stringify({ error: "Backend unavailable" }),
        { status: 502, headers: { "Content-Type": "application/json" } }
      );
    }

    // Pipe the SSE stream directly through
    return new Response(upstream.body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (err) {
    if ((err as Error).name === "AbortError") {
      return new Response(null, { status: 499 });
    }
    console.error("Proxy error:", err);
    return new Response(
      JSON.stringify({ error: "Proxy error" }),
      { status: 502, headers: { "Content-Type": "application/json" } }
    );
  }
}
