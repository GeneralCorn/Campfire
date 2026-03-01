"use client";

import {
  Users, Pill, HeartPulse, ShieldAlert, ClipboardList,
  ChevronDown, Settings, Dumbbell,
} from "lucide-react";
import { useAppStore } from "@/stores/useAppStore";
import type { RoomId } from "@/types";

/* ── Room definitions ──────────────────────────────────────────────────── */

interface RoomItem { id: RoomId; name: string; Icon: React.ElementType; }

const LOBBY: RoomItem[] = [
  { id: "lounge", name: "Care Team Lounge", Icon: Users },
];

const AGENT_ROOMS: RoomItem[] = [
  { id: "medication-room", name: "Medication Room", Icon: Pill },
  { id: "recovery-room", name: "Recovery Room", Icon: HeartPulse },
  { id: "emergency-room", name: "Emergency Room", Icon: ShieldAlert },
  { id: "pt-studio", name: "PT Studio", Icon: Dumbbell },
];

const CARE_PLAN: RoomItem[] = [
  { id: "overview", name: "Overview", Icon: ClipboardList },
  { id: "medications", name: "Medications", Icon: Pill },
  { id: "restrictions", name: "Restrictions", Icon: HeartPulse },
  { id: "warning-signs", name: "Warning Signs", Icon: ShieldAlert },
];

/* ── Sub-components ────────────────────────────────────────────────────── */

function SectionLabel({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-1 px-3 pb-1.5 pt-1 text-[10px] font-medium text-[#52525b] uppercase tracking-[0.08em]">
      <ChevronDown size={9} className="text-[#3f3f46]" />
      {title}
    </div>
  );
}

/* ── ChannelSidebar ────────────────────────────────────────────────────── */

export function ChannelSidebar() {
  const activeRoom = useAppStore((s) => s.activeRoom);
  const setActiveRoom = useAppStore((s) => s.setActiveRoom);
  const discharge = useAppStore((s) => s.discharge);
  const pulsedRooms = useAppStore((s) => s.pulsedRooms);
  const loungeUnread = useAppStore((s) => s.loungeUnread);
  const setLoungeUnread = useAppStore((s) => s.setLoungeUnread);
  const setPulse = useAppStore((s) => s.setPulse);

  function handleClick(id: RoomId) {
    setActiveRoom(id);
    if (id === "lounge") setLoungeUnread(false);
    if (pulsedRooms[id]) setPulse(id, false);
  }

  function renderRoom(room: RoomItem) {
    const isActive = activeRoom === room.id;
    const isPulsing = !!pulsedRooms[room.id];
    const showUnread = room.id === "lounge" && loungeUnread;

    return (
      <button
        key={room.id}
        onClick={() => handleClick(room.id)}
        className={`group flex w-full items-center gap-2.5 px-3 py-[7px] rounded-md text-[13px] transition-all duration-150 ${isPulsing ? "channel-pulse" : ""
          } ${isActive
            ? "bg-white/[0.06] text-[#fafafa] font-medium"
            : "text-[#71717a] hover:bg-white/[0.03] hover:text-[#a1a1aa]"
          }`}
      >
        <room.Icon size={15} className={isActive ? "text-[#818cf8]" : "text-[#3f3f46] group-hover:text-[#52525b]"} />
        <span className="flex-1 text-left truncate">{room.name}</span>

        {room.id === "warning-signs" && discharge && (
          <span className="text-[9px] font-medium text-[#eab308] bg-[#eab308]/8 px-1.5 py-0.5 rounded-full">
            {discharge.warning_signs.length}
          </span>
        )}
        {showUnread && <span className="w-1.5 h-1.5 rounded-full bg-[#6366f1] shrink-0" />}
      </button>
    );
  }

  return (
    <div className="flex h-full w-[220px] flex-col bg-[#111113] border-r border-white/[0.06] shrink-0">

      {/* Workspace header */}
      <div className="flex items-center justify-between px-4 h-[52px] border-b border-white/[0.06]">
        <div className="min-w-0">
          <div className="font-semibold text-[13px] text-[#fafafa] tracking-[-0.01em]">CampfireCare</div>
          {discharge && (
            <div className="text-[10px] text-[#52525b] truncate max-w-[140px]">
              {discharge.patient_profile.procedure}
            </div>
          )}
        </div>
        <ChevronDown size={12} className="text-[#3f3f46] shrink-0" />
      </div>

      {/* Navigation */}
      <div className="flex-1 overflow-y-auto px-2 py-3 space-y-4">
        <div>
          <SectionLabel title="Lobby" />
          <div className="space-y-px">{LOBBY.map(renderRoom)}</div>
        </div>
        <div>
          <SectionLabel title="Agent Rooms" />
          <div className="space-y-px">{AGENT_ROOMS.map(renderRoom)}</div>
        </div>
        <div>
          <SectionLabel title="Care Plan" />
          <div className="space-y-px">{CARE_PLAN.map(renderRoom)}</div>
        </div>
      </div>

      {/* Agent status */}
      <div className="px-4 py-3 border-t border-white/[0.06]">
        <p className="text-[9px] font-medium text-[#3f3f46] uppercase tracking-[0.08em] mb-2">Agents</p>
        {["Medication", "Recovery", "Emergency"].map((a) => (
          <div key={a} className="flex items-center gap-2 mb-1">
            <span className="w-[5px] h-[5px] rounded-full bg-[#22c55e] shrink-0" />
            <span className="text-[11px] text-[#52525b]">{a}</span>
          </div>
        ))}
      </div>

      {/* Identity bar */}
      <div className="flex items-center gap-2 px-3 py-2.5 bg-[#09090b] border-t border-white/[0.06]">
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#6366f1]/8 text-[#818cf8] text-[9px] font-semibold border border-[#6366f1]/15 shrink-0">
          PT
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[11px] font-medium text-[#a1a1aa] truncate">Patient</div>
          <div className="text-[9px] text-[#3f3f46] truncate">
            {discharge?.patient_profile.discharge_date ?? "—"}
          </div>
        </div>
        <Settings size={13} className="text-[#3f3f46] hover:text-[#71717a] cursor-pointer transition-colors" />
      </div>
    </div>
  );
}
