"use client";

import { useAppStore } from "@/stores/useAppStore";
import { teammates } from "@/lib/teammates";
import { FileText } from "lucide-react";
import { ImageUploadPanel } from "./ImageUploadPanel";

export function SandboxView() {
  const artifactSections = useAppStore((s) => s.artifactSections);

  return (
    <div className="flex h-full">
      {/* Document / artifacts area */}
      <div className="flex-1 flex flex-col border-r border-white/[0.04]">
        <div className="flex items-center gap-2 px-4 h-12 border-b border-white/[0.06] shrink-0">
          <FileText size={18} className="text-text-dim" />
          <span className="font-bold text-sm">artifacts</span>
          <span className="text-xs text-text-dim">Documents and write-ups from the team</span>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {artifactSections.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <FileText size={40} className="text-text-dim/20 mb-3" />
              <p className="text-sm text-text-secondary">No artifacts yet</p>
              <p className="text-xs text-text-dim mt-1">
                Start a task in rounds to see the team&apos;s write-ups here
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

      {/* Image upload panel */}
      <div className="w-[300px] flex flex-col shrink-0">
        <ImageUploadPanel />
      </div>
    </div>
  );
}
