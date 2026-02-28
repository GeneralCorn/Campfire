"use client";

import { Plus, Settings } from "lucide-react";

export function ServerBar() {
  return (
    <div className="flex h-full w-16 flex-col items-center bg-surface-0 py-3 border-r border-white/[0.04]">
      {/* AgentFM Logo */}
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-broadcast/20 text-broadcast font-bold font-mono text-sm hover:rounded-xl transition-all duration-200 cursor-pointer border border-broadcast/20 shadow-[0_0_12px_rgba(240,160,48,0.1)]">
        FM
      </div>

      <div className="my-2 h-px w-8 bg-white/[0.06]" />

      {/* Active workspace */}
      <div className="relative flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-3 text-text-primary font-mono text-xs hover:rounded-xl transition-all duration-200 cursor-pointer">
        {/* Active indicator pill */}
        <div className="absolute -left-1.5 top-1/2 -translate-y-1/2 h-5 w-1 rounded-r-full bg-text-primary" />
        YT
      </div>

      <div className="flex-1" />

      {/* Add workspace */}
      <button className="flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-2 text-live hover:rounded-xl hover:bg-live/20 transition-all duration-200 cursor-pointer mb-2">
        <Plus size={20} />
      </button>

      {/* Settings */}
      <button className="flex h-10 w-10 items-center justify-center rounded-full text-text-secondary hover:text-text-primary transition-colors cursor-pointer">
        <Settings size={18} />
      </button>
    </div>
  );
}
