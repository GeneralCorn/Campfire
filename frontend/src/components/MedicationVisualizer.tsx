"use client";

import { useState } from "react";
import { X, ChevronDown, Pill, Clock, Sparkles, CheckCircle2 } from "lucide-react";
import type { VisualData, ScheduleSlot, SlotId } from "@/types";

// ── Slot metadata ─────────────────────────────────────────────────────────────

const SLOT_META: Record<SlotId, { emoji: string; bg: string }> = {
  morning:   { emoji: "🌅", bg: "from-teal-950/40"    },
  afternoon: { emoji: "☀️",  bg: "from-amber-950/40"   },
  evening:   { emoji: "🌆", bg: "from-violet-950/40"  },
  night:     { emoji: "🌙", bg: "from-blue-950/40"    },
};

// ── Tool-call indicator (appears while fetching + 1s after) ───────────────────

export type ToolCallState = "calling" | "done" | "idle";

export function ToolCallBubble({
  state,
  color,
}: {
  state: ToolCallState;
  color: string;
}) {
  if (state === "idle") return null;

  return (
    <div
      className="flex items-end gap-2 mb-3"
      style={{ animation: "fade-in 0.25s ease-out" }}
    >
      {/* Agent avatar */}
      <div
        className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 mb-4"
        style={{ background: `${color}22`, border: `1px solid ${color}40` }}
      >
        <Pill size={10} style={{ color }} />
      </div>

      {/* Tool call pill */}
      <div
        className="px-3.5 py-2 rounded-2xl rounded-tl-sm flex items-center gap-2.5"
        style={{
          background: `${color}0c`,
          border: `1px solid ${color}28`,
          animation: state === "calling" ? "tool-call-pulse 1.5s ease-in-out infinite" : "none",
        }}
      >
        {state === "calling" ? (
          <>
            <div
              className="w-1.5 h-1.5 rounded-full"
              style={{ background: color, animation: "status-pulse 1s ease-in-out infinite" }}
            />
            <span className="text-xs font-mono" style={{ color }}>
              generate_medication_schedule()
            </span>
            <span className="text-[10px] text-[#52525b]">· calling Modal sandbox…</span>
          </>
        ) : (
          <>
            <CheckCircle2 size={12} style={{ color }} />
            <span className="text-xs font-mono" style={{ color }}>
              generate_medication_schedule
            </span>
            <span className="text-[10px] text-[#52525b]">· complete</span>
          </>
        )}
      </div>
    </div>
  );
}

// ── Individual medication card ─────────────────────────────────────────────────

function MedCard({
  med,
  index,
  expanded,
  onToggle,
}: {
  med: { name: string; dosage: string; frequency: string; instructions: string; color: string };
  index: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      className="rounded-xl cursor-pointer select-none transition-all duration-200 overflow-hidden"
      style={{
        background: `${med.color}09`,
        border: `1px solid ${med.color}${expanded ? "40" : "20"}`,
        animation: `card-enter 0.35s ease-out ${index * 0.07}s both`,
        boxShadow: expanded ? `0 4px 20px ${med.color}10` : "none",
      }}
      onClick={onToggle}
    >
      {/* Card header */}
      <div className="flex items-center justify-between px-3.5 py-3">
        <div className="flex items-center gap-3">
          {/* Animated pill icon */}
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-all duration-300"
            style={{
              background: `${med.color}${expanded ? "28" : "14"}`,
              border: `1.5px solid ${med.color}${expanded ? "50" : "28"}`,
            }}
          >
            <Pill size={14} style={{ color: med.color }} />
          </div>

          <div>
            <p className="text-sm font-semibold text-[#e4e4e7] leading-tight">{med.name}</p>
            <p className="text-xs font-mono mt-0.5" style={{ color: med.color }}>
              {med.dosage}
            </p>
          </div>
        </div>

        <ChevronDown
          size={14}
          className="transition-transform duration-300 shrink-0"
          style={{
            color: "#52525b",
            transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
          }}
        />
      </div>

      {/* Expanded details */}
      <div
        className="overflow-hidden transition-all duration-300 ease-in-out"
        style={{ maxHeight: expanded ? "200px" : "0px" }}
      >
        <div
          className="px-3.5 pb-3.5 space-y-2.5"
          style={{ borderTop: `1px solid ${med.color}18` }}
        >
          <div className="pt-2.5">
            <p
              className="text-[9px] font-semibold uppercase tracking-widest mb-1"
              style={{ color: `${med.color}80` }}
            >
              Frequency
            </p>
            <p className="text-xs text-[#a1a1aa] leading-relaxed">{med.frequency}</p>
          </div>
          <div>
            <p
              className="text-[9px] font-semibold uppercase tracking-widest mb-1"
              style={{ color: `${med.color}80` }}
            >
              Instructions
            </p>
            <p className="text-xs text-[#a1a1aa] leading-relaxed">{med.instructions}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Slot tab button ───────────────────────────────────────────────────────────

function SlotTab({
  slot,
  active,
  onClick,
}: {
  slot: ScheduleSlot;
  active: boolean;
  onClick: () => void;
}) {
  const meta = SLOT_META[slot.slot_id];
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 whitespace-nowrap shrink-0"
      style={
        active
          ? {
              background: `${slot.color}20`,
              border: `1px solid ${slot.color}45`,
              color: slot.color,
              boxShadow: `0 0 12px ${slot.color}18`,
            }
          : {
              background: "#1c1c1f",
              border: "1px solid #27272a",
              color: "#52525b",
            }
      }
    >
      <span>{meta.emoji}</span>
      <span>{slot.label}</span>
      <span
        className="ml-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-mono"
        style={{
          background: active ? `${slot.color}28` : "#27272a",
          color: active ? slot.color : "#52525b",
        }}
      >
        {slot.medications.length}
      </span>
    </button>
  );
}

// ── Main MedicationVisualizer ─────────────────────────────────────────────────

interface Props {
  data: VisualData;
  color: string;
  onDismiss: () => void;
}

export function MedicationVisualizer({ data, color, onDismiss }: Props) {
  const [activeSlot, setActiveSlot] = useState<SlotId>(
    (data.schedule[0]?.slot_id as SlotId) ?? "morning"
  );
  const [expandedMed, setExpandedMed] = useState<string | null>(null);
  const [imgLoaded, setImgLoaded] = useState(false);

  const activeSlotData = data.schedule.find((s) => s.slot_id === activeSlot);

  return (
    <div
      className="mt-3 rounded-2xl overflow-hidden"
      style={{
        background: "linear-gradient(135deg, #111116 0%, #0d0d12 100%)",
        border: `1px solid ${color}22`,
        animation: "visual-enter 0.45s cubic-bezier(0.16, 1, 0.3, 1) both",
        boxShadow: `0 0 0 1px ${color}12, 0 8px 32px rgba(0,0,0,0.5), 0 0 60px ${color}06`,
      }}
    >
      {/* ── Header bar ─────────────────────────────────────────────────────── */}
      <div
        className="flex items-center justify-between px-4 py-2.5"
        style={{ borderBottom: `1px solid ${color}14` }}
      >
        <div className="flex items-center gap-2.5">
          <Sparkles size={12} style={{ color }} />
          <span
            className="text-[11px] font-mono font-medium px-2 py-0.5 rounded"
            style={{ background: `${color}12`, color, border: `1px solid ${color}24` }}
          >
            ✓ generate_medication_schedule
          </span>
          <span className="text-[10px] text-[#3f3f46]">
            {data.medication_count} medication{data.medication_count !== 1 ? "s" : ""}
          </span>
        </div>
        <button
          onClick={onDismiss}
          className="w-5 h-5 rounded-full flex items-center justify-center transition-all duration-150 text-[#52525b] hover:text-[#a1a1aa] hover:bg-[#27272a]"
        >
          <X size={11} />
        </button>
      </div>

      {/* ── Generated image ─────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden">
        {/* Skeleton while image loads */}
        {!imgLoaded && (
          <div
            className="w-full rounded-none"
            style={{
              height: 200,
              background: "linear-gradient(90deg, #1a1a1f 25%, #222228 50%, #1a1a1f 75%)",
              backgroundSize: "200% 100%",
              animation: "shimmer 1.5s ease-in-out infinite",
            }}
          />
        )}

        {/* The Modal-generated PNG */}
        <img
          src={`data:image/png;base64,${data.image_base64}`}
          alt="AI-generated medication schedule"
          className="w-full block"
          style={{
            opacity: imgLoaded ? 1 : 0,
            transition: "opacity 0.6s ease-out",
            display: imgLoaded ? "block" : "none",
          }}
          onLoad={() => setImgLoaded(true)}
        />

        {/* Gradient fade at bottom of image */}
        {imgLoaded && (
          <div
            className="absolute bottom-0 left-0 right-0 h-10 pointer-events-none"
            style={{
              background: "linear-gradient(to bottom, transparent, #0d0d12)",
            }}
          />
        )}
      </div>

      {/* ── Interactive schedule ─────────────────────────────────────────────── */}
      <div className="px-4 pb-4">
        {/* Section label */}
        <div className="flex items-center gap-2 mt-3 mb-2.5">
          <Clock size={10} className="text-[#3f3f46]" />
          <p className="text-[9px] font-semibold uppercase tracking-widest text-[#3f3f46]">
            Interactive Daily Schedule
          </p>
        </div>

        {/* Time slot tabs */}
        <div className="flex gap-1.5 overflow-x-auto pb-1.5 scrollbar-none">
          {data.schedule.map((slot) => (
            <SlotTab
              key={slot.slot_id}
              slot={slot}
              active={activeSlot === slot.slot_id}
              onClick={() => {
                setActiveSlot(slot.slot_id as SlotId);
                setExpandedMed(null);
              }}
            />
          ))}
        </div>

        {/* Medication cards for active slot */}
        {activeSlotData && (
          <div
            className="mt-2.5 flex flex-col gap-2"
            key={activeSlot}
            style={{ animation: "fade-in 0.25s ease-out" }}
          >
            {activeSlotData.medications.map((med, i) => (
              <MedCard
                key={med.name}
                med={med}
                index={i}
                expanded={expandedMed === med.name}
                onToggle={() =>
                  setExpandedMed(expandedMed === med.name ? null : med.name)
                }
              />
            ))}
          </div>
        )}

        {/* Empty slot message */}
        {!activeSlotData && (
          <div
            className="mt-2.5 py-6 text-center"
            style={{ animation: "fade-in 0.25s ease-out" }}
          >
            <p className="text-sm text-[#3f3f46]">No medications at this time</p>
          </div>
        )}

        {/* Disclaimer */}
        <p className="text-[9px] text-[#2a2a30] mt-3 text-center leading-relaxed">
          Always follow your prescribing doctor&apos;s instructions. This is a visual aid only.
        </p>
      </div>
    </div>
  );
}
