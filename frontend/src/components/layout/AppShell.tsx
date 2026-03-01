"use client";

import { useEffect, useState } from "react";
import {
  Activity, User, ClipboardList, Pill, HeartPulse, ShieldAlert, X, Calendar, Stethoscope,
} from "lucide-react";
import { useAppStore } from "@/stores/useAppStore";
import { ChannelSidebar } from "./ChannelSidebar";
import { RightPanel } from "./RightPanel";
import { CareTeamLounge } from "@/components/rooms/CareTeamLounge";
import { AgentRoom } from "@/components/rooms/AgentRoom";
import { generateLoungeConversation } from "@/lib/lounge";
import type { DischargeState, RoomId } from "@/types";

// ── Room name map (breadcrumb) ────────────────────────────────────────────────

const ROOM_NAMES: Record<RoomId, string> = {
  "lounge":         "Care Team Lounge",
  "medication-room":"Medication Room",
  "recovery-room":  "Recovery Room",
  "emergency-room": "Emergency Room",
  "overview":       "Overview",
  "medications":    "Medications",
  "restrictions":   "Restrictions",
  "warning-signs":  "Warning Signs",
};

const ROOM_VIEWS = new Set<RoomId>(["lounge", "medication-room", "recovery-room", "emergency-room"]);

// ── Top Bar ───────────────────────────────────────────────────────────────────

function PatientProfilePanel({ onClose }: { onClose: () => void }) {
  const discharge = useAppStore((s) => s.discharge);
  if (!discharge) return null;

  const p = discharge.patient_profile;
  const recoveryDay = p.discharge_date
    ? Math.max(1, Math.ceil((Date.now() - new Date(p.discharge_date).getTime()) / 86_400_000))
    : null;

  return (
    <div className="fixed right-6 top-[57px] z-50 w-[380px] max-h-[calc(100vh-80px)] flex flex-col bg-white border border-[#E2E8F0] rounded-2xl shadow-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-start justify-between px-5 pt-5 pb-4 border-b border-[#E2E8F0] shrink-0">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-lg font-bold text-[#1E293B]">{p.patient_name ?? "Patient"}</span>
            {recoveryDay !== null && (
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[#F0FDFA] text-[#0891B2] border border-[#0891B2]/30">
                Day {recoveryDay}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 text-xs text-[#64748B]">
            <Stethoscope size={11} />
            <span>{p.procedure}</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-[#94A3B8] mt-0.5">
            <Calendar size={11} />
            <span>Discharged {p.discharge_date} · {p.attending_physician}</span>
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-[#94A3B8] hover:text-[#1E293B] transition-colors cursor-pointer mt-0.5 shrink-0"
        >
          <X size={16} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Medications */}
        <section className="px-5 py-4 border-b border-[#E2E8F0]">
          <div className="flex items-center gap-1.5 mb-3">
            <Pill size={13} className="text-[#0891B2]" />
            <span className="text-xs font-semibold text-[#1E293B] uppercase tracking-wide">Medications</span>
          </div>
          <div className="space-y-2">
            {discharge.medications.map((m) => (
              <div key={m.name} className="flex items-start justify-between gap-3 rounded-lg bg-[#F8FAFC] px-3 py-2.5">
                <div className="min-w-0">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-sm font-semibold text-[#1E293B]">{m.name}</span>
                    <span className="text-xs text-[#64748B]">{m.dosage}</span>
                  </div>
                  <p className="text-xs text-[#64748B] mt-0.5">{m.frequency}</p>
                  <p className="text-[11px] text-[#94A3B8] mt-0.5 leading-snug">{m.instructions}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Restrictions */}
        <section className="px-5 py-4">
          <div className="flex items-center gap-1.5 mb-3">
            <HeartPulse size={13} className="text-[#059669]" />
            <span className="text-xs font-semibold text-[#1E293B] uppercase tracking-wide">Restrictions</span>
          </div>
          <div className="space-y-2">
            {discharge.restrictions.map((r) => (
              <div key={r.category} className="rounded-lg border border-[#E2E8F0] px-3 py-2.5" style={{ borderLeft: "3px solid #059669" }}>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-semibold text-[#1E293B]">{r.category}</span>
                  {r.timeline && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[#F0FDFA] text-[#059669] border border-[#059669]/25 font-medium">
                      {r.timeline}
                    </span>
                  )}
                </div>
                <p className="text-xs text-[#64748B] leading-snug">{r.rule}</p>
                {r.strict_prohibitions && (
                  <ul className="mt-1.5 space-y-0.5">
                    {r.strict_prohibitions.map((p) => (
                      <li key={p} className="text-[11px] text-[#DC2626] flex items-center gap-1">
                        <span>✕</span> {p}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function TopBar() {
  const discharge        = useAppStore((s) => s.discharge);
  const rightPanelOpen   = useAppStore((s) => s.rightPanelOpen);
  const toggleRightPanel = useAppStore((s) => s.toggleRightPanel);
  const activeRoom       = useAppStore((s) => s.activeRoom);
  const [profileOpen, setProfileOpen] = useState(false);

  const dischargeDate = discharge?.patient_profile.discharge_date;
  const firstName = discharge?.patient_profile.patient_name
    ?? discharge?.patient_profile.attending_physician.split(",")[0].replace(/^Dr\.\s*/, "").split(" ")[0]
    ?? null;
  const procedure = discharge?.patient_profile.procedure ?? "";
  const procDisplay = procedure.length > 32 ? procedure.slice(0, 32) + "…" : procedure;

  const recoveryDay = dischargeDate
    ? Math.max(1, Math.ceil((Date.now() - new Date(dischargeDate).getTime()) / 86_400_000))
    : null;

  return (
    <header className="flex items-center justify-between px-6 h-14 bg-white border-b border-[#E2E8F0] shrink-0 relative z-40">
      <div className="flex items-center gap-2">
        <Activity size={20} className="text-[#0891B2]" />
        <span className="text-lg font-semibold text-[#1E293B]">CareLounge</span>
        <span className="text-[#CBD5E1] mx-1">/</span>
        <span className="text-sm text-[#64748B]">{ROOM_NAMES[activeRoom]}</span>
      </div>

      <div className="flex items-center gap-3">
        {discharge && recoveryDay !== null ? (
          <button
            onClick={() => setProfileOpen((o) => !o)}
            className={`flex items-center gap-2 px-3 py-2 rounded-xl border transition-colors cursor-pointer ${
              profileOpen
                ? "bg-[#E0F2FE] border-[#0891B2]"
                : "bg-[#F0FDFA] border-[#0891B2] hover:bg-[#E0F2FE]"
            }`}
          >
            <User size={13} className="text-[#0E7490] shrink-0" />
            <div className="text-left">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-[#0E7490] leading-none">{firstName}</span>
                <span className="text-[11px] text-[#0891B2] font-medium">Recovery Day {recoveryDay}</span>
              </div>
              {procDisplay && (
                <div className="text-[10px] text-[#64748B] leading-tight mt-0.5">{procDisplay}</div>
              )}
            </div>
          </button>
        ) : discharge ? (
          <button
            onClick={() => setProfileOpen((o) => !o)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#F0FDFA] border border-[#0891B2] hover:bg-[#E0F2FE] transition-colors cursor-pointer"
          >
            <User size={13} className="text-[#0E7490]" />
            <span className="text-sm text-[#0E7490] font-medium">{firstName}</span>
          </button>
        ) : null}
        <button
          onClick={toggleRightPanel}
          className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition-all duration-200 ${
            rightPanelOpen
              ? "bg-[#F0FDFA] border-[#0891B2] text-[#0891B2]"
              : "bg-white border-[#E2E8F0] text-[#64748B] hover:border-[#0891B2] hover:text-[#0891B2]"
          }`}
        >
          Care Team
        </button>
      </div>

      {/* Profile panel + backdrop */}
      {profileOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setProfileOpen(false)} />
          <PatientProfilePanel onClose={() => setProfileOpen(false)} />
        </>
      )}
    </header>
  );
}

// ── Care Team Banner (room views only) ────────────────────────────────────────

function CareBanner() {
  const activeRoom = useAppStore((s) => s.activeRoom);
  if (!ROOM_VIEWS.has(activeRoom)) return null;

  return (
    <div className="flex items-center gap-4 px-4 py-2 bg-[#F0FDFA] border-b border-[#E2E8F0] shrink-0">
      <div className="flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-[#059669] animate-pulse shrink-0" />
        <span className="text-xs font-medium text-[#0E7490]">Care Team Active</span>
      </div>
      <span className="text-[#CBD5E1]">·</span>
      <span className="text-xs text-[#64748B]">Medication safety checks on</span>
      <span className="text-[#CBD5E1]">·</span>
      <span className="text-xs text-[#64748B]">Escalates emergencies automatically</span>
    </div>
  );
}

// ── Care Plan panels ──────────────────────────────────────────────────────────

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-baseline gap-4 py-2 border-b border-[#E2E8F0] last:border-0">
      <span className="text-sm font-medium text-[#64748B] shrink-0">{label}</span>
      <span className="text-sm text-[#1E293B] text-right">{value}</span>
    </div>
  );
}

function OverviewPanel({ d }: { d: DischargeState }) {
  const p = d.patient_profile;
  return (
    <div className="bg-white rounded-lg border border-[#E2E8F0] p-6 space-y-4">
      <div className="flex items-center gap-2">
        <ClipboardList size={20} className="text-[#0891B2]" />
        <h2 className="text-xl font-semibold text-[#1E293B]">Overview</h2>
      </div>
      <div className="space-y-3">
        <InfoRow label="Procedure"  value={p.procedure} />
        <InfoRow label="Discharged" value={p.discharge_date} />
        <InfoRow label="Physician"  value={p.attending_physician} />
      </div>
    </div>
  );
}

function MedicationsPanel({ d }: { d: DischargeState }) {
  return (
    <div className="bg-white rounded-lg border border-[#E2E8F0] p-6 space-y-4">
      <div className="flex items-center gap-2">
        <Pill size={20} className="text-[#0891B2]" />
        <h2 className="text-xl font-semibold text-[#1E293B]">Medications</h2>
      </div>
      <div className="space-y-3">
        {d.medications.map((m) => (
          <div
            key={m.name}
            className="relative rounded-lg border border-[#E2E8F0] p-4 pl-5"
            style={{ borderLeft: "3px solid #0891B2" }}
          >
            <Pill size={14} className="absolute top-4 right-4 text-[#0891B2]" />
            <div className="flex items-baseline gap-2 mb-1">
              <span className="text-base font-medium text-[#1E293B]">{m.name}</span>
              <span className="text-sm text-[#64748B]">{m.dosage}</span>
            </div>
            <p className="text-sm text-[#64748B] mb-1">{m.frequency}</p>
            <p className="text-sm text-[#1E293B]">{m.instructions}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function RestrictionsPanel({ d }: { d: DischargeState }) {
  return (
    <div className="bg-white rounded-lg border border-[#E2E8F0] p-6 space-y-4">
      <div className="flex items-center gap-2">
        <HeartPulse size={20} className="text-[#059669]" />
        <h2 className="text-xl font-semibold text-[#1E293B]">Restrictions</h2>
      </div>
      <div className="space-y-3">
        {d.restrictions.map((r) => (
          <div
            key={r.category}
            className="rounded-lg border border-[#E2E8F0] p-4 pl-5"
            style={{ borderLeft: "3px solid #059669" }}
          >
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <HeartPulse size={14} className="text-[#059669]" />
              <span className="text-base font-medium text-[#1E293B]">{r.category}</span>
              {r.timeline && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-[#F0FDFA] text-[#059669] border border-[#059669]/30 font-medium">
                  {r.timeline}
                </span>
              )}
              {r.sandbox_trigger && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-[#F0FDFA] text-[#0891B2] border border-[#0891B2]/30 font-medium">
                  {r.sandbox_trigger}
                </span>
              )}
            </div>
            <p className="text-sm text-[#1E293B] mb-2">{r.rule}</p>
            {r.strict_prohibitions && (
              <ul className="space-y-1">
                {r.strict_prohibitions.map((p) => (
                  <li key={p} className="text-sm text-[#DC2626] flex items-center gap-1.5">
                    <span className="text-xs">✕</span> {p}
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

function WarningsPanel() {
  const warnings = useAppStore((s) => s.discoveredWarnings);

  return (
    <div className="bg-white rounded-lg border border-[#E2E8F0] p-6 space-y-4">
      <div className="flex items-center gap-2">
        <ShieldAlert size={20} className="text-[#D97706]" />
        <h2 className="text-xl font-semibold text-[#1E293B]">Warning Signs</h2>
        {warnings.length > 0 && (
          <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-[#FEF3C7] text-[#D97706] font-medium border border-[#D97706]/25">
            {warnings.length} flagged
          </span>
        )}
      </div>
      {warnings.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <ShieldAlert size={36} className="text-[#E2E8F0] mb-3" />
          <p className="text-sm text-[#94A3B8]">No warning signs identified yet.</p>
          <p className="text-xs text-[#CBD5E1] mt-1">
            Chat with your care team — they&apos;ll flag anything that needs attention.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {warnings.map((w) => (
            <div
              key={w.id}
              className="rounded-lg border border-[#E2E8F0] px-4 py-3"
              style={{ borderLeft: `3px solid ${w.severity === "urgent" ? "#DC2626" : "#D97706"}` }}
            >
              <div className="flex items-center gap-2">
                <span
                  className={`w-2 h-2 rounded-full shrink-0 ${w.severity === "urgent" ? "bg-[#DC2626]" : "bg-[#D97706]"}`}
                />
                <span className="text-sm font-semibold text-[#1E293B]">{w.symptom}</span>
                <span className="ml-auto text-[10px] text-[#94A3B8]">via {w.agent}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main content router ───────────────────────────────────────────────────────

function LoadingSpinner() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="text-center">
        <div className="w-8 h-8 border-2 border-[#0891B2] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-sm text-[#64748B]">Loading your care plan…</p>
      </div>
    </div>
  );
}

function MainContent() {
  const activeRoom = useAppStore((s) => s.activeRoom);
  const discharge  = useAppStore((s) => s.discharge);

  switch (activeRoom) {
    case "lounge":          return <CareTeamLounge />;
    case "medication-room": return <AgentRoom key="medication-room" roomId="medication-room" />;
    case "recovery-room":   return <AgentRoom key="recovery-room"   roomId="recovery-room" />;
    case "emergency-room":  return <AgentRoom key="emergency-room"  roomId="emergency-room" />;
    case "overview":        return discharge ? <OverviewPanel d={discharge} />     : <LoadingSpinner />;
    case "medications":     return discharge ? <MedicationsPanel d={discharge} />  : <LoadingSpinner />;
    case "restrictions":    return discharge ? <RestrictionsPanel d={discharge} /> : <LoadingSpinner />;
    case "warning-signs":   return <WarningsPanel />;
    default:                return <CareTeamLounge />;
  }
}

// ── AppShell ──────────────────────────────────────────────────────────────────

export function AppShell() {
  const rightPanelOpen   = useAppStore((s) => s.rightPanelOpen);
  const activeRoom       = useAppStore((s) => s.activeRoom);
  const setDischarge     = useAppStore((s) => s.setDischarge);
  const setLoungeMessages = useAppStore((s) => s.setLoungeMessages);

  const isRoomView = ROOM_VIEWS.has(activeRoom);

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
    <div className="flex flex-col h-screen bg-[#F0F4F8]">
      <TopBar />
      <div className="flex flex-1 overflow-hidden">
        <ChannelSidebar />
        <div className="flex flex-col flex-1 overflow-hidden">
          <CareBanner />
          <main className={`flex-1 ${isRoomView ? "overflow-hidden" : "overflow-y-auto p-6"}`}>
            <MainContent />
          </main>
        </div>
        {rightPanelOpen && <RightPanel />}
      </div>
    </div>
  );
}
