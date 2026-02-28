"use client";

import { useAppStore } from "@/stores/useAppStore";
import { teammates } from "@/lib/teammates";
import { FileText, Activity } from "lucide-react";
import type { TeammateId } from "@/types";

export function SandboxView() {
  const artifactSections = useAppStore((s) => s.artifactSections);
  const sandboxEntries = useAppStore((s) => s.sandboxEntries);

  return (
    <div className="flex h-full">
      {/* Document area */}
      <div className="flex-1 flex flex-col border-r border-white/[0.04]">
        <div className="flex items-center gap-2 px-4 h-12 border-b border-white/[0.06] shrink-0">
          <FileText size={18} className="text-text-dim" />
          <span className="font-bold text-sm">sandbox</span>
          <span className="text-xs text-text-dim">Live view of task being executed</span>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {artifactSections.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <FileText size={40} className="text-text-dim/20 mb-3" />
              <p className="text-sm text-text-secondary">No active document</p>
              <p className="text-xs text-text-dim mt-1">
                Start a task in the team room to see the team&apos;s work here
              </p>
            </div>
          ) : (
            <div className="max-w-2xl mx-auto space-y-4">
              {artifactSections.map((section) => {
                const t = teammates[section.authorId];
                return (
                  <div
                    key={section.id}
                    className="rounded-lg bg-white/[0.03] border border-white/[0.05] p-4"
                    style={{
                      borderLeft: `3px solid ${t.colorHex}30`,
                      boxShadow: `inset 2px 0 8px ${t.colorHex}08`,
                    }}
                  >
                    <h3 className="text-sm font-bold text-text-primary mb-2 uppercase tracking-[0.04em]">
                      {section.heading}
                    </h3>
                    <div className="text-sm text-text-secondary leading-relaxed whitespace-pre-wrap">
                      {section.content}
                    </div>
                    <div className="mt-2 text-[9px] font-mono text-text-dim">
                      Last updated by{" "}
                      <span style={{ color: t.colorHex }}>{t.name}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Activity log */}
      <div className="w-[300px] flex flex-col shrink-0">
        <div className="flex items-center gap-2 px-4 h-12 border-b border-white/[0.06]">
          <Activity size={14} className="text-text-dim" />
          <span className="text-xs font-mono text-text-dim uppercase tracking-[0.08em]">
            Activity Log
          </span>
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          {sandboxEntries.length === 0 ? (
            <p className="text-xs text-text-dim italic p-2">No activity yet</p>
          ) : (
            <div className="space-y-1">
              {sandboxEntries.map((entry) => {
                const t = teammates[entry.teammateId as TeammateId];
                return (
                  <div key={entry.id} className="flex items-start gap-2 py-1 text-[11px]">
                    <span className="font-mono text-text-dim shrink-0 w-12">
                      {formatTime(entry.timestamp)}
                    </span>
                    <span
                      className="font-mono font-bold shrink-0 w-10"
                      style={{ color: t?.colorHex }}
                    >
                      {t?.name}
                    </span>
                    <span className="inline-flex items-center px-1.5 py-0 rounded text-[9px] font-mono font-bold bg-white/[0.05] text-text-secondary uppercase shrink-0">
                      {entry.type}
                    </span>
                    <span className="text-text-secondary truncate">
                      {entry.text}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}
