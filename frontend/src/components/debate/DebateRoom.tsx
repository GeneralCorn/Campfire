"use client";

import { useAppStore } from "@/stores/useAppStore";
import { TaskInput } from "@/components/team-room/TaskInput";
import { PipelineGraph } from "./PipelineGraph";
import { FlaskConical, Radio } from "lucide-react";

export function DebateRoom() {
  const isLive = useAppStore((s) => s.isLive);

  return (
    <div className="flex h-full">
      {/* Left: task input */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex items-center justify-between px-4 h-12 border-b border-white/[0.06] border-t-2 border-t-purple-500/60 shrink-0">
          <div className="flex items-center gap-2">
            <FlaskConical size={18} className="text-text-dim" />
            <span className="font-bold text-sm">lab</span>
            <span className="text-xs text-text-dim hidden sm:inline">
              Full pipeline with live containers
            </span>
          </div>
          <div className="flex items-center gap-3">
            {isLive && (
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-broadcast/15 text-broadcast border border-broadcast/20 shadow-[0_0_8px_rgba(240,160,48,0.2)]">
                <Radio size={10} className="animate-live-dot" />
                ON AIR
              </span>
            )}
          </div>
        </div>
        <div className="flex-1" />
        <TaskInput />
      </div>

      {/* Right: pipeline graph */}
      <div className="w-[340px] shrink-0 border-l border-white/[0.06] bg-surface-1/30">
        <PipelineGraph />
      </div>
    </div>
  );
}
