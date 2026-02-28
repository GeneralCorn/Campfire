"use client";

import { useAppStore } from "@/stores/useAppStore";
import { TeammateStage } from "./TeammateStage";
import { NowThinkingStrip } from "./NowThinkingStrip";
import { ChatArea } from "./ChatArea";
import { TaskInput } from "./TaskInput";
import { Volume2, Radio, Users } from "lucide-react";

export function TeamRoom() {
  const isLive = useAppStore((s) => s.isLive);
  const elapsedTime = useAppStore((s) => s.elapsedTime);

  const minutes = Math.floor(elapsedTime / 60);
  const seconds = elapsedTime % 60;
  const timeStr = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

  return (
    <div className="flex flex-col h-full">
      {/* Top bar with accent border */}
      <div className="flex items-center justify-between px-4 h-12 border-b border-white/[0.06] border-t-2 border-t-broadcast shrink-0">
        <div className="flex items-center gap-2">
          <Volume2 size={18} className="text-text-dim" />
          <span className="font-bold text-sm">team-room</span>
          <span className="text-xs text-text-dim hidden sm:inline">
            Your AI team, working together
          </span>
        </div>
        <div className="flex items-center gap-3">
          {isLive && (
            <>
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-broadcast/15 text-broadcast border border-broadcast/20 shadow-[0_0_8px_rgba(240,160,48,0.2)]">
                <Radio size={10} className="animate-live-dot" />
                ON AIR
              </span>
              <span className="font-mono text-xs text-text-dim">{timeStr}</span>
            </>
          )}
          <Users size={16} className="text-text-dim" />
        </div>
      </div>

      {/* Teammate stage */}
      <TeammateStage />

      {/* Now thinking strip */}
      <NowThinkingStrip />

      {/* Chat area */}
      <ChatArea />

      {/* Input */}
      <TaskInput />
    </div>
  );
}
