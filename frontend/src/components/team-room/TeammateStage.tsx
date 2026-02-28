"use client";

import { useAppStore } from "@/stores/useAppStore";
import { teammateList } from "@/lib/teammates";
import { Avatar } from "./Avatar";
import { VuMeter } from "./VuMeter";

export function TeammateStage() {
  const teammateStates = useAppStore((s) => s.teammateStates);
  const setFocusedTeammate = useAppStore((s) => s.setFocusedTeammate);

  const talkingId = Object.entries(teammateStates).find(
    ([, s]) => s === "talking"
  )?.[0];

  return (
    <div className="flex items-center justify-center gap-8 px-6 py-5 shrink-0 border-b border-white/[0.04] bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,0.02)_0%,transparent_70%)]">
      {teammateList.map((t) => {
        const state = teammateStates[t.id];
        const isActive = state === "talking";
        const hasTalker = !!talkingId;
        const dimmed = hasTalker && !isActive && state !== "thinking";

        return (
          <div
            key={t.id}
            className="flex flex-col items-center gap-2 transition-all duration-300 rounded-lg px-4 py-3 bg-white/[0.02] border border-white/[0.05]"
            style={{
              opacity: dimmed ? 0.45 : 1,
              transform: isActive ? "scale(1.05)" : "scale(1)",
            }}
          >
            <div className="flex items-center gap-2">
              <Avatar
                teammateId={t.id}
                state={state}
                onClick={() => setFocusedTeammate(t.id)}
              />
              <VuMeter teammateId={t.id} state={state} />
            </div>

            <div className="flex flex-col items-center">
              <span
                className="text-xs font-mono font-bold uppercase tracking-[0.02em]"
                style={{ color: t.colorHex }}
              >
                {t.name}
              </span>
              <span className="text-[10px] font-mono text-text-dim">
                {state === "idle"
                  ? "○ chilling"
                  : state === "thinking"
                  ? "◌ thinking..."
                  : "● talking"}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
