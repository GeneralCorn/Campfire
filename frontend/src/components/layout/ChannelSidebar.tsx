"use client";

import { Volume2, Mic, Hash, ChevronDown, Settings, Headphones } from "lucide-react";
import { useAppStore } from "@/stores/useAppStore";
import { teammates, teammateList } from "@/lib/teammates";
import { channels } from "@/lib/channels";
import type { ChannelId, TeammateId } from "@/types";

function TeammatePresence({ id }: { id: TeammateId }) {
  const state = useAppStore((s) => s.teammateStates[id]);
  const t = teammates[id];

  return (
    <div className="flex items-center gap-2 py-0.5 px-2 ml-4 rounded hover:bg-white/[0.03] cursor-pointer group">
      <span
        className="inline-flex items-center justify-center h-5 min-w-[36px] px-1 rounded text-[10px] font-mono font-bold"
        style={{
          backgroundColor: t.colorHex + "15",
          color: t.colorHex,
          border: `1px solid ${t.colorHex}30`,
          backdropFilter: "blur(8px)",
          boxShadow: `0 0 12px ${t.colorHex}15`,
        }}
      >
        {t.badge}
      </span>
      <span className="text-xs text-text-secondary group-hover:text-text-primary transition-colors">
        {t.name}
      </span>
      <div className="flex-1" />
      {state === "talking" && (
        <span className="text-[10px] font-mono" style={{ color: t.colorHex }}>
          [talking]
        </span>
      )}
      {state === "thinking" && (
        <span className="text-[10px] font-mono text-text-dim animate-pulse">
          [thinking]
        </span>
      )}
      <Volume2 size={12} className="text-text-dim opacity-0 group-hover:opacity-100 transition-opacity" />
    </div>
  );
}

export function ChannelSidebar() {
  const activeChannel = useAppStore((s) => s.activeChannel);
  const setActiveChannel = useAppStore((s) => s.setActiveChannel);
  const isLive = useAppStore((s) => s.isLive);
  const memories = useAppStore((s) => s.memories);

  const grouped = channels.reduce(
    (acc, ch) => {
      if (!acc[ch.section]) acc[ch.section] = [];
      acc[ch.section].push(ch);
      return acc;
    },
    {} as Record<string, typeof channels>
  );

  return (
    <div className="flex h-full w-[220px] flex-col bg-surface-1 border-r border-white/[0.04]">
      {/* Workspace header */}
      <div className="flex items-center justify-between px-4 h-12 border-b border-white/[0.06] hover:bg-white/[0.02] cursor-pointer">
        <div className="flex items-center gap-2">
          <span className="font-bold text-sm text-text-primary tracking-[0.08em] uppercase">
            AgentFM
          </span>
          {isLive && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-danger/20 text-danger border border-danger/30">
              <span className="h-1.5 w-1.5 rounded-full bg-danger animate-live-dot" />
              LIVE
            </span>
          )}
        </div>
        <ChevronDown size={14} className="text-text-dim" />
      </div>

      {/* Status line */}
      <div className="px-4 py-1.5 text-[10px] font-mono text-text-dim">
        3 online · {memories.length} memories
      </div>

      {/* Channel sections */}
      <div className="flex-1 overflow-y-auto px-2 py-1">
        {Object.entries(grouped).map(([section, chs]) => (
          <div key={section} className="mb-3">
            <div className="flex items-center gap-1 px-2 py-1 text-[10px] font-mono font-bold text-text-dim uppercase tracking-[0.08em]">
              <ChevronDown size={10} />
              {section}
            </div>

            {chs.map((ch) => {
              const isActive = activeChannel === ch.id;
              const Icon = ch.type === "voice" ? (ch.id === "hangout" ? Headphones : Volume2) : Hash;

              return (
                <div key={ch.id}>
                  <button
                    onClick={() => setActiveChannel(ch.id as ChannelId)}
                    className={`flex w-full items-center gap-2 px-2 py-1 rounded text-sm cursor-pointer transition-colors ${
                      isActive
                        ? "bg-white/[0.04] text-text-primary border-l-2 border-broadcast"
                        : "text-text-secondary hover:bg-white/[0.03] hover:text-text-primary border-l-2 border-transparent"
                    }`}
                  >
                    <Icon size={16} className={isActive ? "text-text-primary" : "text-text-dim"} />
                    <span>{ch.name}</span>
                    {ch.id === "team-room" && isLive && (
                      <span className="ml-auto text-[9px] font-mono font-bold text-live">
                        LIVE
                      </span>
                    )}
                    {ch.id === "team-room" && !isLive && (
                      <span className="ml-auto text-[9px] font-mono text-text-dim">

                      </span>
                    )}
                  </button>

                  {/* Nested teammates under team-room */}
                  {ch.id === "team-room" && (
                    <div className="mt-0.5 mb-1">
                      {teammateList.map((t) => (
                        <TeammatePresence key={t.id} id={t.id} />
                      ))}
                    </div>
                  )}

                  {/* User nested under hangout */}
                  {ch.id === "hangout" && (
                    <div className="mt-0.5 mb-1">
                      <div className="flex items-center gap-2 py-0.5 px-2 ml-4 rounded">
                        <span className="inline-flex items-center justify-center h-5 min-w-[36px] px-1 rounded text-[10px] font-mono font-bold bg-white/[0.05] text-text-secondary border border-white/[0.08]">
                          YOU
                        </span>
                        <span className="text-xs text-text-secondary">You</span>
                        <div className="flex-1" />
                        <Mic size={12} className="text-text-dim" />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* User identity bar */}
      <div className="flex items-center gap-2 px-3 py-2 bg-surface-0/50 border-t border-white/[0.06]">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/[0.04] text-text-secondary text-[10px] font-mono font-bold border border-white/[0.08]">
          YOU
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-medium text-text-primary truncate">operator</div>
          <div className="text-[10px] font-mono text-text-dim truncate flex items-center gap-1">
            <Volume2 size={8} />
            {activeChannel}
          </div>
        </div>
        <Mic size={14} className="text-text-dim hover:text-text-primary cursor-pointer" />
        <Settings size={14} className="text-text-dim hover:text-text-primary cursor-pointer" />
      </div>
    </div>
  );
}
