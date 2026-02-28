"use client";

import { useState } from "react";
import { useAppStore } from "@/stores/useAppStore";
import { teammates, teammateList } from "@/lib/teammates";
import type { TeammateId } from "@/types";
import { Brain } from "lucide-react";

export function MemoriesView() {
  const memories = useAppStore((s) => s.memories);
  const [filter, setFilter] = useState<TeammateId | "all">("all");

  const filtered =
    filter === "all" ? memories : memories.filter((m) => m.teammateId === filter);

  return (
    <div className="flex flex-col h-full">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 h-12 border-b border-white/[0.06] shrink-0">
        <div className="flex items-center gap-2">
          <Brain size={18} className="text-text-dim" />
          <span className="font-bold text-sm">memories</span>
          <span className="text-xs text-text-dim">
            {memories.length} total memories
          </span>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-1 px-4 py-2 border-b border-white/[0.04] shrink-0">
        <button
          onClick={() => setFilter("all")}
          className={`px-3 py-1 rounded text-xs font-mono transition-colors cursor-pointer ${
            filter === "all"
              ? "bg-white/[0.06] text-text-primary"
              : "text-text-dim hover:text-text-secondary"
          }`}
          style={{
            borderBottom: filter === "all" ? "2px solid rgba(255,255,255,0.3)" : "2px solid transparent",
          }}
        >
          All
        </button>
        {teammateList.map((t) => (
          <button
            key={t.id}
            onClick={() => setFilter(t.id)}
            className={`px-3 py-1 rounded text-xs font-mono transition-colors cursor-pointer ${
              filter === t.id
                ? "text-text-primary"
                : "text-text-dim hover:text-text-secondary"
            }`}
            style={{
              backgroundColor: filter === t.id ? t.colorHex + "15" : undefined,
              borderBottom: filter === t.id ? `2px solid ${t.colorHex}` : "2px solid transparent",
            }}
          >
            {t.name}
          </button>
        ))}
      </div>

      {/* Memory list */}
      <div className="flex-1 overflow-y-auto p-4">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <Brain size={40} className="text-text-dim/20 mb-3" />
            <p className="text-sm text-text-secondary">No memories yet</p>
            <p className="text-xs text-text-dim mt-1">
              Memories are created as the team works on tasks
            </p>
          </div>
        ) : (
          <div className="max-w-2xl mx-auto space-y-2">
            {filtered.map((m) => {
              const t = teammates[m.teammateId];
              return (
                <div
                  key={m.id}
                  className="flex items-start gap-3 p-3 rounded-lg bg-white/[0.03] hover:bg-white/[0.05] transition-colors border border-white/[0.04]"
                  style={{
                    borderLeft: `3px solid ${t.colorHex}30`,
                    boxShadow: `inset 2px 0 8px ${t.colorHex}06`,
                  }}
                >
                  <span
                    className="inline-flex items-center justify-center h-6 min-w-[32px] px-1 rounded text-[9px] font-mono font-bold shrink-0 mt-0.5"
                    style={{
                      backgroundColor: t.colorHex + "15",
                      color: t.colorHex,
                      boxShadow: `0 0 8px ${t.colorHex}10`,
                    }}
                  >
                    {t.badge}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span
                        className="text-xs font-mono font-bold uppercase tracking-[0.02em]"
                        style={{ color: t.colorHex }}
                      >
                        {t.name}
                      </span>
                      <span className="text-[10px] font-mono text-text-dim">
                        {m.crossSession ? "Previous session" : formatTime(m.timestamp)}
                      </span>
                    </div>
                    <p className="text-sm text-text-secondary leading-relaxed mt-0.5">
                      &ldquo;{m.content}&rdquo;
                    </p>
                    {m.referencedBy && m.referencedBy.length > 0 && (
                      <div className="mt-1 text-[9px] font-mono text-text-dim">
                        Referenced by {m.referencedBy.join(", ")}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}
