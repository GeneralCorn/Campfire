"use client";

import { useEffect, useState } from "react";
import { Dumbbell } from "lucide-react";
import LivePTCamera, { EXERCISES, type ExerciseId } from "@/components/LivePTCamera";
import { useAppStore } from "@/stores/useAppStore";

const EXERCISE_LIST = Object.values(EXERCISES);

export function PTRoom() {
  const ptExercise = useAppStore((s) => s.ptExercise);
  const setPtExercise = useAppStore((s) => s.setPtExercise);
  const [selectedExercise, setSelectedExercise] = useState<ExerciseId>(ptExercise ?? "bicep_curl");
  const [totalReps, setTotalReps] = useState(0);

  // Apply any exercise pre-selected by the chat router then clear the store value
  useEffect(() => {
    if (ptExercise) {
      setSelectedExercise(ptExercise);
      setTotalReps(0);
      setPtExercise(null);
    }
  }, [ptExercise, setPtExercise]);
  const ex = EXERCISES[selectedExercise];

  return (
    <div className="flex flex-col h-full bg-[#F0F4F8]">
      {/* Header */}
      <div className="flex items-center justify-between px-5 h-[52px] border-b border-[#E2E8F0] bg-white shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-full bg-[#6366f1]/10 flex items-center justify-center shrink-0">
            <Dumbbell size={13} className="text-[#6366f1]" />
          </div>
          <div>
            <h2 className="text-[13px] font-semibold text-[#1E293B] tracking-[-0.01em]">PT Studio</h2>
            <p className="text-[10px] text-[#94A3B8]">AI-guided physical therapy with live pose tracking</p>
          </div>
        </div>
        <select
          value={selectedExercise}
          onChange={(e) => {
            setSelectedExercise(e.target.value as ExerciseId);
            setTotalReps(0);
          }}
          className="bg-white border border-[#E2E8F0] text-[#475569] text-[12px] rounded-md px-2.5 py-1.5 outline-none focus:border-[#6366f1]/50 transition-colors"
        >
          {EXERCISE_LIST.map((ex) => (
            <option key={ex.id} value={ex.id}>{ex.name}</option>
          ))}
        </select>
      </div>

      {/* Content */}
      <div className="flex-1 flex items-center justify-center gap-5 p-5 overflow-hidden">
        {/* Camera — intentionally dark viewport for pose overlay visibility */}
        <div className="shrink-0">
          <LivePTCamera
            exercise={selectedExercise}
            showLabels={true}
            onBreach={(angle) => console.log(`[PT] Breach at ${angle}°`)}
            onRepComplete={(reps) => setTotalReps(reps)}
          />
        </div>

        {/* Info sidebar — light theme */}
        <div className="w-[240px] shrink-0 space-y-3 self-start">
          {/* Exercise info */}
          <div className="rounded-lg border border-[#E2E8F0] bg-white p-4">
            <h3 className="text-[13px] font-semibold text-[#1E293B] mb-0.5">{ex.name}</h3>
            <p className="text-[9px] text-[#94A3B8] uppercase tracking-[0.08em] mb-2.5">{ex.muscle}</p>
            <p className="text-[11px] text-[#64748B] leading-[1.6]">{ex.instruction}</p>
          </div>

          {/* Stats */}
          <div className="rounded-lg border border-[#E2E8F0] bg-white p-4">
            <p className="text-[9px] font-semibold text-[#94A3B8] uppercase tracking-[0.08em] mb-3">Session Stats</p>
            <div className="space-y-2.5">
              <div className="flex justify-between items-center">
                <span className="text-[11px] text-[#64748B]">Total Reps</span>
                <span className="text-[15px] font-semibold text-[#1E293B] font-mono">{totalReps}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[11px] text-[#64748B]">Target ROM</span>
                <span className="text-[11px] text-[#475569] font-mono">{ex.contractedAngle}°–{ex.extendedAngle}°</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[11px] text-[#64748B]">Breach Limit</span>
                <span className="text-[11px] text-[#DC2626] font-mono">&lt; {ex.breachBelow}°</span>
              </div>
            </div>
          </div>

          {/* Legend */}
          <div className="rounded-lg border border-[#E2E8F0] bg-white p-4">
            <p className="text-[9px] font-semibold text-[#94A3B8] uppercase tracking-[0.08em] mb-3">Overlay Legend</p>
            <div className="space-y-1.5 text-[10px]">
              {[
                { color: "bg-cyan-400/40",   label: "Full skeleton" },
                { color: "bg-emerald-400",   label: "Active chain"  },
                { color: "bg-yellow-400",    label: "Caution zone"  },
                { color: "bg-red-500",       label: "ROM breach"    },
              ].map((l) => (
                <div key={l.label} className="flex items-center gap-2">
                  <span className={`w-3 h-0.5 ${l.color} rounded`} />
                  <span className="text-[#64748B]">{l.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
