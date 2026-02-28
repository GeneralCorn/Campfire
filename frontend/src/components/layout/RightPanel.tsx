"use client";

import { X } from "lucide-react";
import { useAppStore } from "@/stores/useAppStore";
import { teammates } from "@/lib/teammates";

export function RightPanel() {
  const rightPanelOpen = useAppStore((s) => s.rightPanelOpen);
  const toggleRightPanel = useAppStore((s) => s.toggleRightPanel);
  const focusedTeammate = useAppStore((s) => s.focusedTeammate);
  const teammateStates = useAppStore((s) => s.teammateStates);
  const memories = useAppStore((s) => s.memories);

  if (!rightPanelOpen) return null;

  const t = focusedTeammate ? teammates[focusedTeammate] : null;
  const state = focusedTeammate ? teammateStates[focusedTeammate] : "idle";
  const teammateMemories = focusedTeammate
    ? memories.filter((m) => m.teammateId === focusedTeammate)
    : [];

  return (
    <div className="flex h-full w-[280px] flex-col bg-surface-2 border-l border-white/[0.04]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 h-12 border-b border-white/[0.06]">
        <span className="text-xs font-mono text-text-dim uppercase tracking-[0.08em]">
          {t ? "Profile" : "Team Info"}
        </span>
        <button
          onClick={toggleRightPanel}
          className="text-text-dim hover:text-text-primary cursor-pointer"
        >
          <X size={16} />
        </button>
      </div>

      {t ? (
        <div className="flex-1 overflow-y-auto p-4">
          {/* Glass profile card */}
          <div
            className="rounded-lg p-4 mb-4 border border-white/[0.06] backdrop-blur-xl"
            style={{
              background: `linear-gradient(to bottom, ${t.colorHex}08 0%, rgba(255,255,255,0.02) 40%, transparent 100%)`,
            }}
          >
            {/* Avatar */}
            <div className="flex flex-col items-center">
              <div
                className="flex h-24 w-24 items-center justify-center rounded-lg font-mono text-2xl font-bold pixelated backdrop-blur-md"
                style={{
                  backgroundColor: t.colorHex + "15",
                  border: `3px solid ${t.colorHex}`,
                  color: t.colorHex,
                  boxShadow: state === "talking"
                    ? `0 0 24px ${t.colorHex}40, 0 0 8px ${t.colorHex}20`
                    : state === "thinking"
                    ? `inset 0 0 15px ${t.colorHex}15`
                    : `0 0 12px ${t.colorHex}10`,
                }}
              >
                {t.badge}
              </div>
              <h3 className="mt-3 text-lg font-bold" style={{ color: t.colorHex }}>
                {t.name}
              </h3>
              <span className="text-xs font-mono text-text-secondary uppercase tracking-[0.08em]">{t.role}</span>
              <span className="mt-1 text-[10px] font-mono text-text-dim">
                {state === "idle" ? "○ chilling" : state === "thinking" ? "◌ thinking..." : "● talking"}
              </span>
            </div>

            {/* Personality */}
            <p className="text-xs text-text-secondary italic leading-relaxed mt-4 px-2 text-center">
              &ldquo;{t.personality}&rdquo;
            </p>
          </div>

          {/* Stats */}
          <div className="border-t border-white/[0.06] pt-3 mb-4">
            <div className="text-[9px] font-mono text-text-dim uppercase tracking-[0.08em] mb-2">
              Stats
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <div className="text-lg font-bold" style={{ color: t.colorHex }}>
                  {memories.filter((m) => m.teammateId === focusedTeammate).length}
                </div>
                <div className="text-[9px] font-mono text-text-dim uppercase tracking-[0.08em]">memories</div>
              </div>
              <div>
                <div className="text-lg font-bold" style={{ color: t.colorHex }}>—</div>
                <div className="text-[9px] font-mono text-text-dim uppercase tracking-[0.08em]">messages</div>
              </div>
              <div>
                <div className="text-lg font-bold" style={{ color: t.colorHex }}>—</div>
                <div className="text-[9px] font-mono text-text-dim uppercase tracking-[0.08em]">tasks</div>
              </div>
            </div>
          </div>

          {/* Recent memories */}
          <div className="border-t border-white/[0.06] pt-3">
            <div className="text-[9px] font-mono text-text-dim uppercase tracking-[0.08em] mb-2">
              Recent Memories
            </div>
            {teammateMemories.length === 0 ? (
              <p className="text-xs text-text-dim italic">No memories yet</p>
            ) : (
              <div className="space-y-2">
                {teammateMemories.slice(-5).reverse().map((m) => (
                  <div
                    key={m.id}
                    className="p-2 rounded bg-white/[0.03] text-xs text-text-secondary leading-relaxed border border-white/[0.04]"
                    style={{ borderLeft: `2px solid ${t.colorHex}30` }}
                  >
                    &ldquo;{m.content}&rdquo;
                    <div className="mt-1 text-[9px] font-mono text-text-dim">
                      {m.crossSession ? "Previous session" : formatTime(m.timestamp)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center p-4 text-center">
          <div className="text-4xl mb-3 opacity-30">👥</div>
          <p className="text-sm text-text-secondary">Click a teammate to see their profile</p>
          <p className="text-xs text-text-dim mt-1">
            View memories, stats, and recent activity
          </p>
        </div>
      )}
    </div>
  );
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}
