"use client";

import { useState } from "react";
import { useAppStore } from "@/stores/useAppStore";
import { teammates } from "@/lib/teammates";
import { X, Maximize2, Minimize2 } from "lucide-react";

export function ArtifactPanel() {
  const artifactSections = useAppStore((s) => s.artifactSections);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<string | null>(null);

  // Only show sections that have html and haven't been dismissed
  const htmlArtifacts = artifactSections.filter(
    (s) => s.html && s.id && !dismissed.has(s.id)
  );

  if (htmlArtifacts.length === 0) return null;

  const latest = htmlArtifacts[htmlArtifacts.length - 1];
  const isExpanded = expanded === latest.id;
  const t = latest.authorId ? teammates[latest.authorId as keyof typeof teammates] : undefined;
  const accent = t?.colorHex ?? "#4ECDC4";

  return (
    <>
      {/* Fullscreen overlay when expanded */}
      {isExpanded && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-8">
          <div
            className="relative w-full max-w-4xl h-[80vh] rounded-xl overflow-hidden border"
            style={{ borderColor: accent + "40" }}
          >
            {/* Header */}
            <div
              className="flex items-center justify-between px-4 py-2 shrink-0"
              style={{ background: accent + "18", borderBottom: `1px solid ${accent}30` }}
            >
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full" style={{ background: accent }} />
                <span className="text-xs font-bold uppercase tracking-wider" style={{ color: accent }}>
                  {latest.heading}
                </span>
                {t && (
                  <span className="text-[10px] text-text-dim font-mono">
                    by {t.name}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setExpanded(null)}
                  className="p-1 rounded hover:bg-white/10 transition-colors"
                >
                  <Minimize2 size={14} className="text-text-dim" />
                </button>
                <button
                  onClick={() => {
                    setExpanded(null);
                    if (latest.id) setDismissed((s) => new Set(s).add(latest.id!));
                  }}
                  className="p-1 rounded hover:bg-white/10 transition-colors"
                >
                  <X size={14} className="text-text-dim" />
                </button>
              </div>
            </div>

            {/* Iframe */}
            <iframe
              srcDoc={latest.html}
              sandbox="allow-same-origin"
              className="w-full flex-1 bg-[#0f0f0f]"
              style={{ height: "calc(100% - 36px)", border: "none" }}
              title={latest.heading}
            />
          </div>
        </div>
      )}

      {/* Inline mini-panel (below the pipeline graph) */}
      {!isExpanded && (
        <div
          className="mx-3 mb-2 rounded-lg overflow-hidden border animate-in slide-in-from-bottom-2 duration-300"
          style={{ borderColor: accent + "30" }}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-3 py-1.5"
            style={{ background: accent + "12", borderBottom: `1px solid ${accent}20` }}
          >
            <div className="flex items-center gap-2">
              <div
                className="w-1.5 h-1.5 rounded-full animate-pulse"
                style={{ background: accent }}
              />
              <span
                className="text-[10px] font-bold uppercase tracking-wider"
                style={{ color: accent }}
              >
                {latest.heading}
              </span>
            </div>
            <div className="flex items-center gap-0.5">
              <button
                onClick={() => setExpanded(latest.id ?? null)}
                className="p-1 rounded hover:bg-white/10 transition-colors"
                title="Expand"
              >
                <Maximize2 size={12} className="text-text-dim" />
              </button>
              <button
                onClick={() => {
                  if (latest.id) setDismissed((s) => new Set(s).add(latest.id!));
                }}
                className="p-1 rounded hover:bg-white/10 transition-colors"
                title="Dismiss"
              >
                <X size={12} className="text-text-dim" />
              </button>
            </div>
          </div>

          {/* Preview iframe */}
          <div
            className="cursor-pointer"
            onClick={() => setExpanded(latest.id ?? null)}
          >
            <iframe
              srcDoc={latest.html}
              sandbox="allow-same-origin"
              className="w-full pointer-events-none bg-[#0f0f0f]"
              style={{ height: 180, border: "none" }}
              title={latest.heading}
            />
          </div>
        </div>
      )}
    </>
  );
}
