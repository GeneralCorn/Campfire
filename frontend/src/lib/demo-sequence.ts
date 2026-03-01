import type { TeammateId } from "@/types";

export interface DemoStep {
  delay: number;
  action:
    | "user-message"
    | "thinking"
    | "start-response"
    | "stream-delta"
    | "end-response"
    | "sandbox-log"
    | "sandbox-write"
    | "memory-node"
    | "done";
  teammate?: TeammateId;
  content?: string;
  thinking?: string;
  sandboxType?: "log" | "write" | "flag";
  sandboxText?: string;
  artifactHeading?: string;
  artifactContent?: string;
  memoryContent?: string;
}

export const demoSequence: DemoStep[] = [
  // User sends discharge query
  {
    delay: 1500,
    action: "user-message",
    content: "Patient discharged with metformin 500mg twice daily, lisinopril 10mg once daily, and aspirin 81mg daily. Check for interactions.",
  },

  // === MAYA TURN 1 — NER extraction ===
  { delay: 800, action: "thinking", teammate: "maya" },
  { delay: 1200, action: "sandbox-log", teammate: "maya", sandboxType: "log", sandboxText: "[Maya] Loading BioBERT NER model (d4data/biomedical-ner-all)..." },
  { delay: 800, action: "sandbox-log", teammate: "maya", sandboxType: "log", sandboxText: "[Maya] Extracted: metformin (500mg BID), lisinopril (10mg QD), aspirin (81mg QD)" },
  { delay: 200, action: "start-response", teammate: "maya", thinking: "Running BioBERT NER on discharge text. Found 3 medications with dosages." },
  { delay: 0, action: "stream-delta", teammate: "maya", content: "I've extracted three medications from the discharge — " },
  { delay: 80, action: "stream-delta", teammate: "maya", content: "metformin 500mg twice daily, " },
  { delay: 80, action: "stream-delta", teammate: "maya", content: "lisinopril 10mg once daily, " },
  { delay: 80, action: "stream-delta", teammate: "maya", content: "and aspirin 81mg daily. Let me pull up the literature on these." },
  { delay: 300, action: "memory-node", teammate: "maya", memoryContent: "Medications: metformin 500mg BID, lisinopril 10mg QD, aspirin 81mg QD" },
  { delay: 200, action: "end-response", teammate: "maya" },

  // === REX TURN 1 — FDA interaction check ===
  { delay: 600, action: "thinking", teammate: "rex" },
  { delay: 1000, action: "sandbox-log", teammate: "rex", sandboxType: "log", sandboxText: "[Rex] Querying openFDA for metformin + lisinopril interactions..." },
  { delay: 800, action: "sandbox-log", teammate: "rex", sandboxType: "flag", sandboxText: "[Rex] FLAG: ACE inhibitor + metformin — monitor renal function" },
  { delay: 200, action: "start-response", teammate: "rex", thinking: "Checking FDA labels. Lisinopril (ACE inhibitor) + metformin needs renal monitoring. Low clinical risk but documented." },
  { delay: 0, action: "stream-delta", teammate: "rex", content: "The FDA label flags a known interaction — " },
  { delay: 80, action: "stream-delta", teammate: "rex", content: "lisinopril can impair renal function, " },
  { delay: 80, action: "stream-delta", teammate: "rex", content: "which affects metformin clearance. " },
  { delay: 80, action: "stream-delta", teammate: "rex", content: "Low risk at these doses, but renal function should be monitored." },
  { delay: 300, action: "memory-node", teammate: "rex", memoryContent: "ACE inhibitor + metformin: monitor renal function (eGFR). Low risk at standard doses." },
  { delay: 200, action: "end-response", teammate: "rex" },

  // === MAYA TURN 2 — PubMed search ===
  { delay: 500, action: "thinking", teammate: "maya" },
  { delay: 1000, action: "sandbox-log", teammate: "maya", sandboxType: "log", sandboxText: "[Maya] PubMed search: metformin + aspirin → 12 relevant results" },
  { delay: 200, action: "start-response", teammate: "maya", thinking: "Checking aspirin interaction. PubMed shows aspirin can increase metformin bioavailability slightly. Not clinically significant." },
  { delay: 0, action: "stream-delta", teammate: "maya", content: "Aspirin and metformin — " },
  { delay: 80, action: "stream-delta", teammate: "maya", content: "the literature shows aspirin can slightly increase metformin absorption, " },
  { delay: 80, action: "stream-delta", teammate: "maya", content: "but at 81mg this is not clinically significant." },
  { delay: 200, action: "end-response", teammate: "maya" },

  // === REX TURN 2 — Aspirin + lisinopril ===
  { delay: 500, action: "thinking", teammate: "rex" },
  { delay: 1000, action: "sandbox-log", teammate: "rex", sandboxType: "flag", sandboxText: "[Rex] aspirin may reduce lisinopril efficacy at high doses (>300mg)" },
  { delay: 200, action: "start-response", teammate: "rex", thinking: "Aspirin can blunt ACE inhibitor effect but only at anti-inflammatory doses (>300mg). At 81mg, no concern." },
  { delay: 0, action: "stream-delta", teammate: "rex", content: "One more thing — " },
  { delay: 80, action: "stream-delta", teammate: "rex", content: "aspirin can reduce ACE inhibitor efficacy, " },
  { delay: 80, action: "stream-delta", teammate: "rex", content: "but only at anti-inflammatory doses above 300mg. " },
  { delay: 80, action: "stream-delta", teammate: "rex", content: "At 81mg daily, no clinical concern." },
  { delay: 200, action: "end-response", teammate: "rex" },

  // === SOL TURN — Synthesis ===
  { delay: 600, action: "thinking", teammate: "sol" },
  { delay: 1500, action: "sandbox-write", teammate: "sol", artifactHeading: "Discharge Medication Review", artifactContent: "Medications: metformin 500mg BID, lisinopril 10mg QD, aspirin 81mg QD\n\nNo high-risk interactions at prescribed doses\nMonitor renal function (ACE inhibitor + metformin)\nLow-dose aspirin compatible with both medications\n\nRecommendation: Standard monitoring protocol. Check eGFR at 3-month follow-up." },
  { delay: 200, action: "start-response", teammate: "sol", thinking: "All three medications are safe together at these doses. One monitoring flag for renal function." },
  { delay: 0, action: "stream-delta", teammate: "sol", content: "Here's the bottom line — " },
  { delay: 80, action: "stream-delta", teammate: "sol", content: "all three medications are safe together at these doses. " },
  { delay: 80, action: "stream-delta", teammate: "sol", content: "The only flag is routine renal monitoring " },
  { delay: 80, action: "stream-delta", teammate: "sol", content: "because lisinopril and metformin both involve kidney clearance. " },
  { delay: 80, action: "stream-delta", teammate: "sol", content: "Recommend checking eGFR at the 3-month follow-up." },
  { delay: 300, action: "memory-node", teammate: "sol", memoryContent: "Discharge review complete: 3 meds safe, monitor eGFR at 3mo follow-up" },
  { delay: 200, action: "end-response", teammate: "sol" },

  { delay: 500, action: "done" },
];
