"use client";

import { useEffect } from "react";
import {
  Activity, User, ClipboardList, Pill, HeartPulse, ShieldAlert, Sun, Moon
} from "lucide-react";
import { useAppStore } from "@/stores/useAppStore";
import { ChannelSidebar } from "./ChannelSidebar";
import { RightPanel } from "./RightPanel";
import { CareTeamLounge } from "@/components/rooms/CareTeamLounge";
import { AgentRoom } from "@/components/rooms/AgentRoom";
import { PTRoom } from "@/components/rooms/PTRoom";
import { generateLoungeConversation } from "@/lib/lounge";
import type { DischargeState, RoomId } from "@/types";

/* ── Room names ────────────────────────────────────────────────────────── */

const ROOM_NAMES: Record<RoomId, string> = {
  "lounge": "Care Team Lounge",
  "medication-room": "Medication Room",
  "recovery-room": "Recovery Room",
  "emergency-room": "Emergency Room",
  "pt-studio": "PT Studio",
  "overview": "Overview",
  "medications": "Medications",
  "restrictions": "Restrictions",
  "warning-signs": "Warning Signs",
};

const ROOM_VIEWS = new Set<RoomId>(["lounge", "medication-room", "recovery-room", "emergency-room", "pt-studio"]);

/* ── TopBar ────────────────────────────────────────────────────────────── */

function TopBar() {
  const discharge = useAppStore((s) => s.discharge);
  const rightPanelOpen = useAppStore((s) => s.rightPanelOpen);
  const toggleRightPanel = useAppStore((s) => s.toggleRightPanel);
  const activeRoom = useAppStore((s) => s.activeRoom);

  const physician = discharge?.patient_profile.attending_physician
    .split(",")[0].replace(/^Dr\.\s*/, "") ?? "—";
  const dischargeDate = discharge?.patient_profile.discharge_date ?? "—";
  const theme = useAppStore((s) => s.theme);
  const toggleTheme = useAppStore((s) => s.toggleTheme);

  return (
    <header className="flex items-center justify-between px-5 h-[48px] bg-[var(--color-surface)] border-b border-[var(--color-border)] shrink-0">
      <div className="flex items-center gap-2">
        <Activity size={16} style={{ color: "var(--color-accent)" }} />
        <span className="text-[13px] font-semibold tracking-[-0.01em]" style={{ color: "var(--color-ink)" }}>CampfireCare</span>
        <span className="mx-1 text-xs" style={{ color: "var(--color-dim)" }}>/</span>
        <span className="text-[12px]" style={{ color: "var(--color-muted)" }}>{ROOM_NAMES[activeRoom]}</span>
      </div>
      <div className="flex items-center gap-2">
        {discharge && (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md border" style={{ background: "var(--color-accent-soft)", borderColor: "var(--color-border)" }}>
            <User size={11} style={{ color: "var(--color-muted)" }} />
            <span className="text-[11px]" style={{ color: "var(--color-secondary)" }}>{physician} · {dischargeDate}</span>
          </div>
        )}

        {/* Light / Dark toggle */}
        <button
          onClick={toggleTheme}
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          className="flex items-center justify-center w-7 h-7 rounded-md border transition-all duration-200 hover:scale-105"
          style={{ background: "var(--color-faint)", borderColor: "var(--color-border)", color: "var(--color-secondary)" }}
        >
          {theme === 'dark' ? <Sun size={13} /> : <Moon size={13} />}
        </button>

        <button
          onClick={toggleRightPanel}
          className={`text-[11px] font-medium px-2.5 py-1 rounded-md border transition-all duration-150 ${rightPanelOpen
            ? "bg-[#6366f1]/8 border-[#6366f1]/20 text-[#818cf8]"
            : "border-[var(--color-border)] hover:border-[var(--color-border-hover)]"
            }`}
          style={{ color: rightPanelOpen ? undefined : "var(--color-muted)" }}
        >
          Activity
        </button>
      </div>
    </header>
  );
}

/* ── Status bar ────────────────────────────────────────────────────────── */

function StatusBar() {
  const activeRoom = useAppStore((s) => s.activeRoom);
  if (!ROOM_VIEWS.has(activeRoom)) return null;

  return (
    <div className="flex items-center justify-between px-4 py-1.5 bg-white/[0.02] border-b border-white/[0.04] shrink-0">
      <div className="flex items-center gap-3">
        {["Medication", "Recovery", "Emergency"].map((a) => (
          <div key={a} className="flex items-center gap-1.5">
            <span className="w-[5px] h-[5px] rounded-full bg-[#22c55e] shrink-0" />
            <span className="text-[10px] text-[#52525b]">{a}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Care Plan panels ──────────────────────────────────────────────────── */

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-baseline gap-4 py-2.5 border-b border-white/[0.04] last:border-0">
      <span className="text-[12px] text-[#52525b] shrink-0">{label}</span>
      <span className="text-[12px] text-[#a1a1aa] text-right">{value}</span>
    </div>
  );
}

function OverviewPanel({ d }: { d: DischargeState }) {
  const p = d.patient_profile;
  return (
    <div className="rounded-lg border border-white/[0.06] bg-[#111113] p-5">
      <div className="flex items-center gap-2 mb-4">
        <ClipboardList size={16} className="text-[#6366f1]" />
        <h2 className="text-[15px] font-semibold text-[#fafafa]">Overview</h2>
      </div>
      <InfoRow label="Procedure" value={p.procedure} />
      <InfoRow label="Discharged" value={p.discharge_date} />
      <InfoRow label="Physician" value={p.attending_physician} />
    </div>
  );
}

function MedicationsPanel({ d }: { d: DischargeState }) {
  return (
    <div className="rounded-lg border border-white/[0.06] bg-[#111113] p-5">
      <div className="flex items-center gap-2 mb-4">
        <Pill size={16} className="text-[#6366f1]" />
        <h2 className="text-[15px] font-semibold text-[#fafafa]">Medications</h2>
      </div>
      <div className="space-y-3">
        {d.medications.map((m) => (
          <div key={m.name} className="rounded-md border border-white/[0.06] p-3.5 border-l-2 border-l-[#6366f1]/40">
            <div className="flex items-baseline gap-2 mb-0.5">
              <span className="text-[13px] font-medium text-[#fafafa]">{m.name}</span>
              <span className="text-[11px] text-[#52525b]">{m.dosage}</span>
            </div>
            <p className="text-[11px] text-[#52525b] mb-0.5">{m.frequency}</p>
            <p className="text-[11px] text-[#71717a]">{m.instructions}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function RestrictionsPanel({ d }: { d: DischargeState }) {
  return (
    <div className="rounded-lg border border-white/[0.06] bg-[#111113] p-5">
      <div className="flex items-center gap-2 mb-4">
        <HeartPulse size={16} className="text-[#22c55e]" />
        <h2 className="text-[15px] font-semibold text-[#fafafa]">Restrictions</h2>
      </div>
      <div className="space-y-3">
        {d.restrictions.map((r) => (
          <div key={r.category} className="rounded-md border border-white/[0.06] p-3.5 border-l-2 border-l-[#22c55e]/40">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <span className="text-[13px] font-medium text-[#fafafa]">{r.category}</span>
              {r.timeline && (
                <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[#22c55e]/8 text-[#22c55e] font-medium">
                  {r.timeline}
                </span>
              )}
            </div>
            <p className="text-[11px] text-[#71717a] mb-1.5">{r.rule}</p>
            {r.strict_prohibitions && (
              <ul className="space-y-0.5">
                {r.strict_prohibitions.map((p) => (
                  <li key={p} className="text-[11px] text-[#ef4444]/80 flex items-center gap-1.5">
                    <span className="text-[8px]">✕</span> {p}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function WarningsPanel({ d }: { d: DischargeState }) {
  const isCritical = (action: string) => /emergency room|immediately/i.test(action);
  return (
    <div className="rounded-lg border border-white/[0.06] bg-[#111113] p-5">
      <div className="flex items-center gap-2 mb-4">
        <ShieldAlert size={16} className="text-[#eab308]" />
        <h2 className="text-[15px] font-semibold text-[#fafafa]">Warning Signs</h2>
      </div>
      <div className="space-y-3">
        {d.warning_signs.map((w) => {
          const critical = isCritical(w.action);
          return (
            <div key={w.symptom} className={`rounded-md border border-white/[0.06] p-3.5 border-l-2 ${critical ? "border-l-[#ef4444]/50" : "border-l-[#eab308]/40"}`}>
              <span className="text-[13px] font-medium text-[#fafafa]">{w.symptom}</span>
              <p className="text-[11px] text-[#52525b] mt-0.5">{w.implication}</p>
              <p className={`text-[11px] font-medium mt-1 ${critical ? "text-[#ef4444]/80" : "text-[#eab308]/80"}`}>→ {w.action}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Loading ───────────────────────────────────────────────────────────── */

function LoadingSpinner() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="text-center">
        <div className="w-6 h-6 border-[1.5px] border-[#6366f1]/30 border-t-[#6366f1] rounded-full animate-spin mx-auto mb-3" />
        <p className="text-[11px] text-[#52525b]">Loading…</p>
      </div>
    </div>
  );
}

/* ── Router ────────────────────────────────────────────────────────────── */

function MainContent() {
  const activeRoom = useAppStore((s) => s.activeRoom);
  const discharge = useAppStore((s) => s.discharge);

  switch (activeRoom) {
    case "lounge": return <CareTeamLounge />;
    case "medication-room": return <AgentRoom key="medication-room" roomId="medication-room" />;
    case "recovery-room": return <AgentRoom key="recovery-room" roomId="recovery-room" />;
    case "emergency-room": return <AgentRoom key="emergency-room" roomId="emergency-room" />;
    case "pt-studio": return <PTRoom />;
    case "overview": return discharge ? <OverviewPanel d={discharge} /> : <LoadingSpinner />;
    case "medications": return discharge ? <MedicationsPanel d={discharge} /> : <LoadingSpinner />;
    case "restrictions": return discharge ? <RestrictionsPanel d={discharge} /> : <LoadingSpinner />;
    case "warning-signs": return discharge ? <WarningsPanel d={discharge} /> : <LoadingSpinner />;
    default: return <CareTeamLounge />;
  }
}

/* ── AppShell ──────────────────────────────────────────────────────────── */

export function AppShell() {
  const rightPanelOpen = useAppStore((s) => s.rightPanelOpen);
  const activeRoom = useAppStore((s) => s.activeRoom);
  const setDischarge = useAppStore((s) => s.setDischarge);
  const setLoungeMessages = useAppStore((s) => s.setLoungeMessages);
  const theme = useAppStore((s) => s.theme);
  const isRoomView = ROOM_VIEWS.has(activeRoom);

  // Apply data-theme attribute to <html> on mount and whenever it changes
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    // Smooth color-scheme transition
    document.documentElement.style.transition = 'background-color 0.3s ease, color 0.3s ease';
  }, [theme]);

  useEffect(() => {
    fetch("/api/discharge")
      .then((r) => r.json())
      .then((data: DischargeState) => {
        setDischarge(data);
        setLoungeMessages(generateLoungeConversation(data));
      })
      .catch(() => {
        import("@/mock/discharge_state.json").then((m) => {
          const data = m.default as DischargeState;
          setDischarge(data);
          setLoungeMessages(generateLoungeConversation(data));
        });
      });
  }, [setDischarge, setLoungeMessages]);

  return (
    <div
      className="flex flex-col h-screen"
      style={{ background: "var(--color-bg)", color: "var(--color-ink)", transition: "background 0.3s ease, color 0.3s ease" }}
    >
      <TopBar />
      <div className="flex flex-1 overflow-hidden">
        <ChannelSidebar />
        <div className="flex flex-col flex-1 overflow-hidden">
          <StatusBar />
          <main
            className={`flex-1 ${isRoomView ? "overflow-hidden" : "overflow-y-auto p-5"}`}
            style={{ background: "var(--color-bg)" }}
          >
            <MainContent />
          </main>
        </div>
        {rightPanelOpen && <RightPanel />}
      </div>
    </div>
  );
}
