/**
 * mock-pipeline.ts
 *
 * Generates a realistic SSE event stream for the AI pipeline when the backend
 * is unavailable (offline deployment, cold start, network error, etc.).
 *
 * The stream emits the same event shapes as the real LangGraph orchestrator so
 * useTeamChat / PipelineGraph / Avatar all animate normally — no frontend changes
 * required. Audio chunks are omitted since TTS is a backend service.
 *
 * Usage: pass the ReadableStream<Uint8Array> as the body of a Response with
 *   Content-Type: text/event-stream
 */

const encoder = new TextEncoder();

function sse(data: object): Uint8Array {
  return encoder.encode(`data: ${JSON.stringify(data)}\n\n`);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Extract rough topic keywords from the user's query for slightly contextual responses. */
function detectTopics(query: string): {
  hasMeds: boolean;
  hasWarning: boolean;
  hasDose: boolean;
  hasSurgery: boolean;
  meds: string[];
} {
  const q = query.toLowerCase();
  const medRx =
    /\b(metformin|lisinopril|aspirin|atorvastatin|omeprazole|amlodipine|losartan|gabapentin|hydrochlorothiazide|simvastatin|levothyroxine|warfarin|clopidogrel|prednisone|insulin|oxycodone|ibuprofen|cyclobenzaprine|acetaminophen|naproxen)\b/g;
  const meds = [...new Set([...(q.match(medRx) ?? [])])];
  return {
    hasMeds: meds.length > 0,
    hasWarning: /\b(pain|bleed|swell|nausea|dizzy|warning|urgent|emergency|severe)\b/.test(q),
    hasDose: /\b(mg|dosage?|dose|twice|daily|weekly|hourly)\b/.test(q),
    hasSurgery: /\b(surgery|procedure|operation|repair|discharge|post-op)\b/.test(q),
    meds,
  };
}

/** Build mock responses per agent based on topic context. */
function buildResponses(query: string, topics: ReturnType<typeof detectTopics>) {
  const medList =
    topics.meds.length > 0
      ? topics.meds.map((m) => m.charAt(0).toUpperCase() + m.slice(1)).join(", ")
      : "the listed medications";

  const mayaText = topics.hasMeds
    ? `I've run NER extraction on the discharge text and identified ${medList}. PubMed literature shows no high-risk interactions at standard dosing — the combination is well-documented in post-discharge protocols.`
    : `I've parsed the query and cross-referenced relevant medical literature. Based on available evidence, the clinical picture is consistent with standard care guidelines. No contraindications found in the published literature.`;

  const rexText = topics.hasWarning
    ? `FDA safety data flagged one item worth watching: monitor closely for the symptoms described. At standard doses the risk profile is manageable, but I'd recommend the care team note this in the discharge summary and schedule an early follow-up call.`
    : topics.hasMeds
    ? `I cross-checked ${medList} against the openFDA adverse event database. Risk profile at prescribed doses is low. Standard monitoring applies — no black-box warnings triggered at these dosages.`
    : `FDA safety review complete. No high-severity contraindications detected for the described scenario. Recommend standard monitoring protocol per discharge guidelines.`;

  const solText = topics.hasSurgery
    ? `Synthesizing the team's findings — Maya confirmed the medication profile is safe, and Rex cleared the FDA safety check. For post-operative care at this stage, the priority is pain management adherence and early detection of the warning signs we've flagged. I've prepared a summary card.`
    : `Here's the bottom line: Maya's literature review and Rex's FDA check both clear this combination. No critical flags. The recommended next step is routine monitoring at the scheduled follow-up, with patient education on the one item Rex flagged.`;

  return { mayaText, rexText, solText };
}

/**
 * Returns a ReadableStream that emits the full mock pipeline SSE sequence.
 * Pass the task string for light contextual adaptation of responses.
 */
export function createMockPipelineStream(task: string): ReadableStream<Uint8Array> {
  const topics = detectTopics(task);
  const { mayaText, rexText, solText } = buildResponses(task, topics);

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        // ── Router ────────────────────────────────────────────────────────────
        await delay(400);
        controller.enqueue(
          sse({
            event: "router_plan",
            plan: "Route to Maya (literature & NER) → Rex (FDA safety) → Sol (synthesis). [Demo Mode — backend offline]",
          })
        );

        // ── Maya turn ─────────────────────────────────────────────────────────
        await delay(500);
        controller.enqueue(sse({ event: "thinking", teammate: "maya" }));

        await delay(700);
        controller.enqueue(
          sse({
            event: "sandbox_spawn",
            teammate: "maya",
            model: "biobert",
            packages: ["transformers", "nltk", "scikit-learn"],
            gpu: "A10G",
          })
        );

        await delay(400);
        controller.enqueue(
          sse({
            event: "sandbox_output",
            teammate: "maya",
            line: "[stdout] Loading BioBERT NER model (d4data/biomedical-ner-all)...",
          })
        );

        await delay(500);
        controller.enqueue(
          sse({
            event: "sandbox_output",
            teammate: "maya",
            line:
              topics.meds.length > 0
                ? `[stdout] Extracted entities: ${topics.meds.join(", ")}`
                : "[stdout] NER extraction complete — 0 high-confidence drug entities detected",
          })
        );

        await delay(300);
        controller.enqueue(
          sse({
            event: "sandbox_output",
            teammate: "maya",
            line: "[stdout] PubMed query: 8 relevant results fetched",
          })
        );

        await delay(200);
        controller.enqueue(
          sse({
            event: "sandbox_complete",
            teammate: "maya",
            exit_code: 0,
            duration_ms: 1400,
          })
        );

        await delay(200);
        controller.enqueue(
          sse({
            event: "voice_text",
            teammate: "maya",
            text: mayaText,
            confidence: 0.91,
            sentiment: "analytical",
          })
        );

        await delay(300);
        controller.enqueue(
          sse({
            event: "memory_node",
            teammate: "maya",
            content:
              topics.meds.length > 0
                ? `Medications identified: ${topics.meds.join(", ")}. Literature review clear at standard doses.`
                : "Literature review complete. No contraindications found.",
          })
        );

        await delay(200);
        controller.enqueue(sse({ event: "turn_end", teammate: "maya" }));

        // ── Rex turn ──────────────────────────────────────────────────────────
        await delay(450);
        controller.enqueue(sse({ event: "thinking", teammate: "rex" }));

        await delay(600);
        controller.enqueue(
          sse({
            event: "sandbox_spawn",
            teammate: "rex",
            model: "fda-api",
            packages: ["requests", "pandas"],
          })
        );

        await delay(500);
        controller.enqueue(
          sse({
            event: "sandbox_output",
            teammate: "rex",
            line:
              topics.meds.length > 0
                ? `[stdout] Querying openFDA for: ${topics.meds.slice(0, 2).join(" + ")}...`
                : "[stdout] Querying openFDA adverse event database...",
          })
        );

        await delay(400);
        controller.enqueue(
          sse({
            event: "sandbox_output",
            teammate: "rex",
            line: topics.hasWarning
              ? "[stdout] ⚠  1 monitoring flag found — recommend early follow-up"
              : "[stdout] No black-box warnings at prescribed doses",
          })
        );

        await delay(200);
        controller.enqueue(
          sse({
            event: "sandbox_complete",
            teammate: "rex",
            exit_code: 0,
            duration_ms: 1100,
          })
        );

        await delay(200);
        controller.enqueue(
          sse({
            event: "voice_text",
            teammate: "rex",
            text: rexText,
            confidence: 0.87,
            sentiment: topics.hasWarning ? "skeptical" : "analytical",
          })
        );

        await delay(300);
        controller.enqueue(
          sse({
            event: "memory_node",
            teammate: "rex",
            content: topics.hasWarning
              ? "FDA check: 1 monitoring flag. No black-box contraindications. Early follow-up recommended."
              : "FDA safety review: clear. Standard monitoring protocol applies.",
          })
        );

        if (topics.hasWarning) {
          await delay(200);
          controller.enqueue(
            sse({
              event: "warning_flagged",
              symptom: "Symptom escalation pattern detected — monitor closely",
              severity: "watch",
              agent: "rex",
            })
          );
        }

        await delay(200);
        controller.enqueue(sse({ event: "turn_end", teammate: "rex" }));

        // ── Sol turn ──────────────────────────────────────────────────────────
        await delay(500);
        controller.enqueue(sse({ event: "thinking", teammate: "sol" }));

        await delay(1200);
        controller.enqueue(
          sse({
            event: "task_result",
            teammate: "sol",
            sentiment: "enthusiastic",
            action: {
              type: "write",
              detail: `Discharge Review Summary\n\n${
                topics.meds.length > 0
                  ? `Medications reviewed: ${topics.meds.join(", ")}\n`
                  : ""
              }Team assessment: Safe to proceed with standard protocol.\n${
                topics.hasWarning ? "Monitoring flag: schedule early follow-up call.\n" : ""
              }Recommendation: Routine check-in at 3-month follow-up. Patient education on warning signs.`,
            },
          })
        );

        await delay(300);
        controller.enqueue(
          sse({
            event: "voice_text",
            teammate: "sol",
            text: solText,
            confidence: 0.94,
            sentiment: "enthusiastic",
          })
        );

        await delay(300);
        controller.enqueue(
          sse({
            event: "memory_node",
            teammate: "sol",
            content: "Team review complete. Synthesis written. No high-risk flags.",
          })
        );

        await delay(200);
        controller.enqueue(sse({ event: "turn_end", teammate: "sol" }));

        // ── Complete ──────────────────────────────────────────────────────────
        await delay(400);
        controller.enqueue(sse({ event: "complete" }));
      } finally {
        controller.close();
      }
    },
  });
}
