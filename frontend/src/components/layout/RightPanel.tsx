"use client";

import { Radio, X } from "lucide-react";
import { useAppStore } from "@/stores/useAppStore";
import type { ActivityRoute, ActivityEntry } from "@/types";

const ROUTE_COLORS: Record<ActivityRoute, string> = {
  medications: "#0891B2",
  recovery:    "#059669",
  emergency:   "#DC2626",
  confer:      "#0891B2",
  blocked:     "#94A3B8",
};

const ROUTE_LABELS: Record<ActivityRoute, string> = {
  medications: "Medication Agent",
  recovery:    "Recovery Agent",
  emergency:   "Emergency Agent",
  confer:      "Confer Mode",
  blocked:     "Off-topic",
};

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function ActivityCard({ entry }: { entry: ActivityEntry }) {
  const color = ROUTE_COLORS[entry.route];
  const label = ROUTE_LABELS[entry.route];
  const isConfer = entry.route === "confer";
  const preview = entry.audio_text.slice(0, 80) + (entry.audio_text.length > 80 ? "…" : "");

  const borderStyle = isConfer
    ? { borderLeft: "3px solid", borderImage: "linear-gradient(to bottom, #0891B2, #059669) 1" }
    : { borderLeft: `3px solid ${color}` };

  return (
    <div
      className="relative rounded-md bg-[#F8FAFC] p-3 mb-2"
      style={borderStyle}
    >
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span
            className="text-xs font-medium px-2 py-0.5 rounded-full"
            style={{ color, backgroundColor: `${color}18` }}
          >
            {label}
          </span>
          {entry.off_topic && (
            <span className="text-xs text-[#DC2626] font-medium">Off-topic</span>
          )}
        </div>
        <span className="text-[10px] text-[#94A3B8] shrink-0 mt-0.5">
          {formatTime(entry.timestamp)}
        </span>
      </div>
      <p className="text-sm text-[#64748B] leading-relaxed">{preview}</p>
    </div>
  );
}

export function RightPanel() {
  const toggleRightPanel = useAppStore((s) => s.toggleRightPanel);
  const activities = useAppStore((s) => s.activities);

  return (
    <div className="flex h-full w-[280px] flex-col bg-white border-l border-[#E2E8F0] shrink-0">
      {/* Header */}
      <div className="flex items-center justify-between px-4 h-14 border-b border-[#E2E8F0]">
        <div className="flex items-center gap-2">
          <Radio size={16} className="text-[#0891B2]" />
          <span className="text-base font-semibold text-[#1E293B]">Care Team Activity</span>
        </div>
        <button
          onClick={toggleRightPanel}
          className="text-[#94A3B8] hover:text-[#1E293B] transition-colors cursor-pointer"
        >
          <X size={16} />
        </button>
      </div>

      {/* Activity feed */}
      <div className="flex-1 overflow-y-auto p-4">
        {activities.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-8">
            <Radio size={28} className="text-[#E2E8F0] mb-3" />
            <p className="text-sm font-medium text-[#94A3B8] mb-1">No activity yet</p>
            <p className="text-xs text-[#CBD5E1]">
              Ask the Copilot a question to see agent responses here.
            </p>
          </div>
        ) : (
          [...activities].reverse().map((entry) => (
            <ActivityCard key={entry.id} entry={entry} />
          ))
        )}
      </div>
    </div>
  );
}
