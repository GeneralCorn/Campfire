"use client";

import { useAppStore } from "@/stores/useAppStore";
import { teammates } from "@/lib/teammates";
import type { TeammateId } from "@/types";

export function NowThinkingStrip() {
  const teammateStates = useAppStore((s) => s.teammateStates);

  const thinkingId = Object.entries(teammateStates).find(
    ([, s]) => s === "thinking"
  )?.[0] as TeammateId | undefined;

  if (!thinkingId) return null;

  const t = teammates[thinkingId];

  return (
    <div
      className="flex items-center gap-2 px-4 py-1.5 text-xs font-mono text-text-secondary bg-white/[0.03] backdrop-blur-sm animate-slide-up shrink-0"
      style={{ borderLeft: `3px solid ${t.colorHex}` }}
    >
      <span
        className="inline-block h-2 w-2 rounded-full animate-live-dot"
        style={{ backgroundColor: t.colorHex }}
      />
      <span style={{ color: t.colorHex }}>{t.name}</span>
      <span className="text-text-dim">is thinking...</span>
    </div>
  );
}
