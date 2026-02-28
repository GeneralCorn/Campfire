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
  // User sends task
  {
    delay: 1500,
    action: "user-message",
    content: "Research the most effective transformer optimization techniques for 70B+ models",
  },

  // === MIKA TURN 1 ===
  { delay: 800, action: "thinking", teammate: "mika" },
  { delay: 1800, action: "sandbox-log", teammate: "mika", sandboxType: "log", sandboxText: 'SEARCH arxiv: "attention pruning transformers" → 47 results' },
  { delay: 200, action: "start-response", teammate: "mika", thinking: "Searching arxiv... found 47 results, filtering by citation count and recency." },
  { delay: 0, action: "stream-delta", teammate: "mika", content: "Okay I found three papers on transformer efficiency — " },
  { delay: 80, action: "stream-delta", teammate: "mika", content: "the most cited one is Chen et al., " },
  { delay: 80, action: "stream-delta", teammate: "mika", content: "claims attention pruning can cut inference latency by 40%. " },
  { delay: 80, action: "stream-delta", teammate: "mika", content: "Let me keep digging." },
  { delay: 300, action: "memory-node", teammate: "mika", memoryContent: "Chen et al. 2023: 40% latency reduction via attention pruning" },
  { delay: 200, action: "end-response", teammate: "mika" },

  // === RUNE TURN 1 ===
  { delay: 600, action: "thinking", teammate: "rune" },
  { delay: 1500, action: "sandbox-log", teammate: "rune", sandboxType: "flag", sandboxText: "REVIEW Chen et al: GPT-2 scale (1.5B). ⚠ Gap with 70B target." },
  { delay: 200, action: "start-response", teammate: "rune", thinking: "Cross-referencing benchmark conditions... 1.5B params vs 70B+ target. Significant gap." },
  { delay: 0, action: "stream-delta", teammate: "rune", content: "Hold on — Chen is from 2023. " },
  { delay: 80, action: "stream-delta", teammate: "rune", content: "Those benchmarks were on GPT-2 scale models. " },
  { delay: 80, action: "stream-delta", teammate: "rune", content: "I don't think those numbers transfer to 70B+ at all." },
  { delay: 300, action: "memory-node", teammate: "rune", memoryContent: "Chen benchmarks are GPT-2 scale (1.5B). Doesn't transfer to 70B+" },
  { delay: 200, action: "end-response", teammate: "rune" },

  // === MIKA TURN 2 ===
  { delay: 500, action: "thinking", teammate: "mika" },
  { delay: 1200, action: "sandbox-log", teammate: "mika", sandboxType: "log", sandboxText: "FILTER benchmark_scale > 70B → 2 results" },
  { delay: 200, action: "start-response", teammate: "mika", thinking: "Filtering for 70B+ benchmarks... found Park (2024) and Yamamoto (2024)." },
  { delay: 0, action: "stream-delta", teammate: "mika", content: "Fair point. Okay the two newer ones from 2024 — " },
  { delay: 80, action: "stream-delta", teammate: "mika", content: "Park and Yamamoto — " },
  { delay: 80, action: "stream-delta", teammate: "mika", content: "both actually tested on Llama-70B. " },
  { delay: 80, action: "stream-delta", teammate: "mika", content: "Park gets 28%, Yamamoto gets 31%." },
  { delay: 300, action: "memory-node", teammate: "mika", memoryContent: "Park (2024): 28% on Llama-70B. Yamamoto (2024): 31%" },
  { delay: 200, action: "end-response", teammate: "mika" },

  // === RUNE TURN 2 ===
  { delay: 500, action: "thinking", teammate: "rune" },
  { delay: 1200, action: "sandbox-log", teammate: "rune", sandboxType: "flag", sandboxText: "FLAG Yamamoto requires retraining. Park is inference-only." },
  { delay: 200, action: "start-response", teammate: "rune", thinking: "Yamamoto: fine-tuning pass needed. Park: plug-and-play at inference time. Big practical difference." },
  { delay: 0, action: "stream-delta", teammate: "rune", content: "Better. But Yamamoto requires retraining. " },
  { delay: 80, action: "stream-delta", teammate: "rune", content: "Park's is inference-only. " },
  { delay: 80, action: "stream-delta", teammate: "rune", content: "That's a huge practical difference you can't ignore." },
  { delay: 300, action: "memory-node", teammate: "rune", memoryContent: "Yamamoto requires retraining. Park is inference-only." },
  { delay: 200, action: "end-response", teammate: "rune" },

  // === SAGE TURN 1 ===
  { delay: 600, action: "thinking", teammate: "sage" },
  { delay: 1500, action: "sandbox-write", teammate: "sage", artifactHeading: "Primary Recommendation", artifactContent: "Park et al. (2024) — Inference-only attention pruning achieving 28% latency reduction on Llama-70B.\n✓ No retraining required\n✓ Benchmarked on target architecture" },
  { delay: 200, action: "start-response", teammate: "sage", thinking: "Weighing deployment complexity vs performance ceiling. Park is the clear primary choice." },
  { delay: 0, action: "stream-delta", teammate: "sage", content: "Here's what I'm seeing — " },
  { delay: 80, action: "stream-delta", teammate: "sage", content: "Park is our primary recommendation for immediate deployment, " },
  { delay: 80, action: "stream-delta", teammate: "sage", content: "Yamamoto as a phase-2 option, " },
  { delay: 80, action: "stream-delta", teammate: "sage", content: "Chen for baseline context only." },
  { delay: 300, action: "memory-node", teammate: "sage", memoryContent: "Primary: Park for deployment, Yamamoto phase-2, Chen baseline" },
  { delay: 200, action: "end-response", teammate: "sage" },

  // === MIKA TURN 3 ===
  { delay: 500, action: "thinking", teammate: "mika" },
  { delay: 1000, action: "sandbox-log", teammate: "mika", sandboxType: "log", sandboxText: "FOUND Liu (2025 preprint): 45% reduction, 2 citations" },
  { delay: 200, action: "start-response", teammate: "mika", thinking: "New result in latest arxiv batch. Very recent, low citations. Interesting though." },
  { delay: 0, action: "stream-delta", teammate: "mika", content: "Oh wait — there's a preprint from last week by Liu " },
  { delay: 80, action: "stream-delta", teammate: "mika", content: "that claims 45% reduction on Llama-70B, " },
  { delay: 80, action: "stream-delta", teammate: "mika", content: "no retraining needed. Only 2 citations though." },
  { delay: 300, action: "memory-node", teammate: "mika", memoryContent: "Liu (2025 preprint): 45% reduction, only 2 citations" },
  { delay: 200, action: "end-response", teammate: "mika" },

  // === RUNE TURN 3 ===
  { delay: 500, action: "thinking", teammate: "rune" },
  { delay: 1200, action: "sandbox-log", teammate: "rune", sandboxType: "flag", sandboxText: "FLAG Liu 2025 — insufficient validation. Watch list." },
  { delay: 200, action: "start-response", teammate: "rune", thinking: "Preprint, no peer review, n=1. High risk of non-reproduction." },
  { delay: 0, action: "stream-delta", teammate: "rune", content: "Two citations and one week old? Yeah that's a red flag. " },
  { delay: 80, action: "stream-delta", teammate: "rune", content: "No peer review, no reproduction. " },
  { delay: 80, action: "stream-delta", teammate: "rune", content: "Watch list only." },
  { delay: 300, action: "memory-node", teammate: "rune", memoryContent: "Liu insufficient validation — watch list only" },
  { delay: 200, action: "end-response", teammate: "rune" },

  // === SAGE TURN 2 ===
  { delay: 600, action: "thinking", teammate: "sage" },
  { delay: 1500, action: "sandbox-write", teammate: "sage", artifactHeading: "Emerging (Watch List)", artifactContent: "Liu (2025, preprint) — 45% on Llama-70B, unverified. Monitor for reproduction." },
  { delay: 200, action: "start-response", teammate: "sage", thinking: "Finalizing 4-tier recommendation structure." },
  { delay: 0, action: "stream-delta", teammate: "sage", content: "Noted. Final structure: " },
  { delay: 80, action: "stream-delta", teammate: "sage", content: "Park primary, Yamamoto phase-2, " },
  { delay: 80, action: "stream-delta", teammate: "sage", content: "Chen baseline, Liu on the watch list. " },
  { delay: 80, action: "stream-delta", teammate: "sage", content: "I'll write it up." },
  { delay: 300, action: "memory-node", teammate: "sage", memoryContent: "Final: Park primary, Yamamoto phase-2, Chen baseline, Liu watch" },
  { delay: 200, action: "end-response", teammate: "sage" },

  { delay: 500, action: "done" },
];
