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
 *
 * Fallback: when the backend is unreachable (cold start, offline deployment,
 * network error) the route returns a mock SSE stream so the pipeline graph and
 * avatars still animate. Responses are contextually adapted from the query text.
 * Audio chunks are omitted (TTS is a backend service).
 */

import { NextRequest } from "next/server";
import { createMockPipelineStream } from "@/lib/mock-pipeline";

const ORCHESTRATOR_URL =
  process.env.NEXT_PUBLIC_ORCHESTRATOR_URL || "http://localhost:8001";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { task, history = [], mode = "auto", image, patient_context } = body;

  // Seed medications from patient chart; fall back to regex extraction from query text
  const medications: string[] = [];
  if (patient_context?.medications?.length) {
    for (const m of patient_context.medications) {
      if (m.name && !medications.includes(m.name)) medications.push(m.name);
    }
  } else {
    const medPatterns = /\b(metformin|lisinopril|aspirin|atorvastatin|omeprazole|amlodipine|losartan|gabapentin|hydrochlorothiazide|simvastatin|levothyroxine|warfarin|clopidogrel|prednisone|insulin|oxycodone|ibuprofen|cyclobenzaprine)\b/gi;
    let match;
    while ((match = medPatterns.exec(task)) !== null) {
      const med = match[1].toLowerCase();
      if (!medications.includes(med)) medications.push(med);
    }
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
        ...(patient_context ? { patient_context } : {}),
      }),
      signal: request.signal,
    });

    if (!upstream.ok || !upstream.body) {
      console.warn(`[team-chat] Backend returned ${upstream.status} — serving mock pipeline`);
      return mockSSEResponse(task);
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
    console.warn("[team-chat] Backend unreachable —", (err as Error).message, "— serving mock pipeline");
    return mockSSEResponse(task);
  }
}

function mockSSEResponse(task: string): Response {
  return new Response(createMockPipelineStream(task), {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
