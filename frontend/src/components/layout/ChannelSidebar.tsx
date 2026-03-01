"use client";

import {
  Users, Pill, HeartPulse, ShieldAlert, ClipboardList,
  ChevronDown, Settings,
} from "lucide-react";
import { useAppStore } from "@/stores/useAppStore";
import type { RoomId } from "@/types";

// ── Room definitions ──────────────────────────────────────────────────────────

interface RoomItem {
  id: RoomId;
  name: string;
  Icon: React.ElementType;
  color: string;
}

const LOBBY: RoomItem[] = [
  { id: "lounge", name: "Care Team Lounge", Icon: Users, color: "#0891B2" },
];

const AGENT_ROOMS: RoomItem[] = [
  { id: "medication-room", name: "Medication Room", Icon: Pill,        color: "#0891B2" },
  { id: "recovery-room",   name: "Recovery Room",   Icon: HeartPulse,  color: "#059669" },
  { id: "emergency-room",  name: "Emergency Room",  Icon: ShieldAlert, color: "#DC2626" },
];

const CARE_PLAN: RoomItem[] = [
  { id: "overview",      name: "Overview",       Icon: ClipboardList, color: "#64748B" },
  { id: "medications",   name: "Medications",    Icon: Pill,          color: "#64748B" },
  { id: "restrictions",  name: "Restrictions",   Icon: HeartPulse,    color: "#64748B" },
  { id: "warning-signs", name: "Warning Signs",  Icon: ShieldAlert,   color: "#64748B" },
];

const AGENTS = ["Medication Agent", "Recovery Agent", "Emergency Agent"];

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionHeader({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-1 px-2 pb-1 text-[10px] font-semibold text-[#94A3B8] uppercase tracking-widest">
      <ChevronDown size={10} />
      {title}
    </div>
  );
}

// ── ChannelSidebar ────────────────────────────────────────────────────────────

export function ChannelSidebar() {
  const activeRoom     = useAppStore((s) => s.activeRoom);
  const setActiveRoom  = useAppStore((s) => s.setActiveRoom);
  const discharge      = useAppStore((s) => s.discharge);
  const pulsedRooms    = useAppStore((s) => s.pulsedRooms);
  const loungeUnread   = useAppStore((s) => s.loungeUnread);
  const setLoungeUnread = useAppStore((s) => s.setLoungeUnread);
  const setPulse       = useAppStore((s) => s.setPulse);

  function handleClick(id: RoomId) {
    setActiveRoom(id);
    if (id === "lounge") setLoungeUnread(false);
    if (pulsedRooms[id]) setPulse(id, false);
  }

  function renderRoom(room: RoomItem) {
    const isActive   = activeRoom === room.id;
    const isPulsing  = !!pulsedRooms[room.id];
    const showUnread = room.id === "lounge" && loungeUnread;

    return (
      <button
        key={room.id}
        onClick={() => handleClick(room.id)}
        className={`flex w-full items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-all duration-200 border-l-[3px] ${
          isPulsing ? "channel-pulse" : ""
        } ${
          isActive
            ? "bg-[#F0FDFA] border-l-[3px] text-[#0E7490]"
            : "border-l-transparent text-[#64748B] hover:bg-[#F0FDFA] hover:text-[#0891B2]"
        }`}
        style={isActive ? { borderLeftColor: room.color } : {}}
      >
        <room.Icon
          size={16}
          style={{ color: isActive ? room.color : "#94A3B8" }}
        />
        <span className="flex-1 text-left" style={{ color: isActive ? room.color : undefined }}>
          {room.name}
        </span>

        {/* Warning signs badge */}
        {room.id === "warning-signs" && discharge && (
          <span className="text-[10px] font-semibold text-[#D97706] bg-[#D97706]/10 px-1.5 py-0.5 rounded-full">
            {discharge.warning_signs.length}
          </span>
        )}

        {/* Lounge unread dot */}
        {showUnread && (
          <span className="w-2 h-2 rounded-full bg-[#0891B2] shrink-0" />
        )}
      </button>
    );
  }

  return (
    <div className="flex h-full w-[240px] flex-col bg-white border-r border-[#E2E8F0] shrink-0">

      {/* Workspace header */}
      <div className="flex items-center justify-between px-4 h-14 border-b border-[#E2E8F0]">
        <div className="min-w-0">
          <div className="font-semibold text-sm text-[#1E293B] truncate">Hearthside</div>
          {discharge && (
            <div className="text-[10px] text-[#64748B] truncate max-w-[160px]">
              {discharge.patient_profile.procedure}
            </div>
          )}
        </div>
        <ChevronDown size={14} className="text-[#94A3B8] shrink-0" />
      </div>

      {/* Navigation */}
      <div className="flex-1 overflow-y-auto px-2 py-3 space-y-4">
        <div>
          <SectionHeader title="LOBBY" />
          <div className="space-y-0.5">{LOBBY.map(renderRoom)}</div>
        </div>
        <div>
          <SectionHeader title="AGENT ROOMS" />
          <div className="space-y-0.5">{AGENT_ROOMS.map(renderRoom)}</div>
        </div>
        <div>
          <SectionHeader title="CARE PLAN" />
          <div className="space-y-0.5">{CARE_PLAN.map(renderRoom)}</div>
        </div>
      </div>

      {/* Agent status */}
      <div className="px-4 py-3 border-t border-[#E2E8F0]">
        <p className="text-[10px] font-semibold text-[#94A3B8] uppercase tracking-widest mb-2">
          Agents
        </p>
        {AGENTS.map((a) => (
          <div key={a} className="flex items-center gap-2 mb-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#059669] shrink-0" />
            <span className="text-xs text-[#64748B]">{a}</span>
          </div>
        ))}
      </div>

      {/* Identity bar */}
      <div className="flex items-center gap-2 px-3 py-2.5 bg-[#F8FAFC] border-t border-[#E2E8F0]">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#F0FDFA] text-[#0891B2] text-[10px] font-bold border border-[#0891B2]/30 shrink-0">
          PT
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-medium text-[#1E293B] truncate">Patient</div>
          <div className="text-[10px] text-[#64748B] truncate">
            {discharge?.patient_profile.discharge_date ?? "—"}
          </div>
        </div>
        <Settings size={14} className="text-[#94A3B8] hover:text-[#0891B2] cursor-pointer transition-colors" />
      </div>
    </div>
  );
}
