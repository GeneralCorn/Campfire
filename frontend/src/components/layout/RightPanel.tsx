"use client";

import { Activity, Clock } from "lucide-react";
import { useAppStore } from "@/stores/useAppStore";

export function RightPanel() {
  const loungeMessages = useAppStore((s) => s.loungeMessages);
  const recent = loungeMessages.slice(-6);

  return (
    <div className="w-[240px] bg-[#111113] border-l border-white/[0.06] flex flex-col shrink-0">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 h-[48px] border-b border-white/[0.06] shrink-0">
        <Activity size={13} className="text-[#6366f1]" />
        <span className="text-[12px] font-semibold text-[#fafafa]">Activity</span>
      </div>

      {/* Feed */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-1">
        {recent.length === 0 ? (
          <p className="text-[11px] text-[#3f3f46] text-center mt-8">No recent activity</p>
        ) : (
          recent.map((msg, i) => (
            <div key={i} className="flex gap-2 px-2 py-2 rounded-md hover:bg-white/[0.02] transition-colors">
              <div className="w-5 h-5 rounded-full bg-white/[0.04] flex items-center justify-center shrink-0 mt-0.5">
                <span className="text-[8px] font-semibold text-[#52525b]">
                  {msg.sender.charAt(0)}
                </span>
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className="text-[10px] font-medium text-[#71717a]">{msg.sender}</span>
                  <Clock size={8} className="text-[#27272a]" />
                  <span className="text-[9px] text-[#27272a]">{msg.time}</span>
                </div>
                <p className="text-[11px] text-[#52525b] leading-[1.5] line-clamp-2">{msg.text}</p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
