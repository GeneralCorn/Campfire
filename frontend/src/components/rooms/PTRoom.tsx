"use client";

import { useState } from "react";
import { Dumbbell } from "lucide-react";
import LivePTCamera, { EXERCISES, type ExerciseId } from "@/components/LivePTCamera";

const EXERCISE_LIST = Object.values(EXERCISES);

export function PTRoom() {
    const [selectedExercise, setSelectedExercise] = useState<ExerciseId>("bicep_curl");
    const [totalReps, setTotalReps] = useState(0);
    const ex = EXERCISES[selectedExercise];

    return (
        <div className="flex flex-col h-full bg-[#09090b]">
            {/* Header */}
            <div className="flex items-center justify-between px-5 h-[52px] border-b border-white/[0.06] bg-[#111113] shrink-0">
                <div className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-full bg-[#6366f1]/10 flex items-center justify-center shrink-0">
                        <Dumbbell size={13} className="text-[#818cf8]" />
                    </div>
                    <div>
                        <h2 className="text-[13px] font-semibold text-[#fafafa] tracking-[-0.01em]">PT Studio</h2>
                        <p className="text-[10px] text-[#52525b]">AI-guided physical therapy with live pose tracking</p>
                    </div>
                </div>
                <select
                    value={selectedExercise}
                    onChange={(e) => {
                        setSelectedExercise(e.target.value as ExerciseId);
                        setTotalReps(0);
                    }}
                    className="bg-[#111113] border border-white/[0.06] text-[#a1a1aa] text-[12px] rounded-md px-2.5 py-1.5 outline-none focus:border-[#6366f1]/30 transition-colors"
                >
                    {EXERCISE_LIST.map((ex) => (
                        <option key={ex.id} value={ex.id}>{ex.name}</option>
                    ))}
                </select>
            </div>

            {/* Content */}
            <div className="flex-1 flex items-center justify-center gap-5 p-5 overflow-hidden">
                <div className="shrink-0">
                    <LivePTCamera
                        exercise={selectedExercise}
                        showLabels={true}
                        onBreach={(angle) => console.log(`[PT] Breach at ${angle}°`)}
                        onRepComplete={(reps) => setTotalReps(reps)}
                    />
                </div>

                <div className="w-[240px] shrink-0 space-y-3 self-start">
                    {/* Exercise info */}
                    <div className="rounded-lg border border-white/[0.06] bg-[#111113] p-4">
                        <h3 className="text-[13px] font-semibold text-[#fafafa] mb-0.5">{ex.name}</h3>
                        <p className="text-[9px] text-[#3f3f46] uppercase tracking-[0.08em] mb-2.5">{ex.muscle}</p>
                        <p className="text-[11px] text-[#52525b] leading-[1.6]">{ex.instruction}</p>
                    </div>

                    {/* Stats */}
                    <div className="rounded-lg border border-white/[0.06] bg-[#111113] p-4">
                        <p className="text-[9px] font-medium text-[#3f3f46] uppercase tracking-[0.08em] mb-3">Session Stats</p>
                        <div className="space-y-2.5">
                            <div className="flex justify-between items-center">
                                <span className="text-[11px] text-[#52525b]">Total Reps</span>
                                <span className="text-[15px] font-semibold text-[#fafafa] font-mono">{totalReps}</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-[11px] text-[#52525b]">Target ROM</span>
                                <span className="text-[11px] text-[#71717a] font-mono">{ex.contractedAngle}°–{ex.extendedAngle}°</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-[11px] text-[#52525b]">Breach Limit</span>
                                <span className="text-[11px] text-[#ef4444]/70 font-mono">&lt; {ex.breachBelow}°</span>
                            </div>
                        </div>
                    </div>

                    {/* Legend */}
                    <div className="rounded-lg border border-white/[0.06] bg-[#111113] p-4">
                        <p className="text-[9px] font-medium text-[#3f3f46] uppercase tracking-[0.08em] mb-3">Overlay Legend</p>
                        <div className="space-y-1.5 text-[10px]">
                            {[
                                { color: "bg-[#00FFFF]/30", label: "Full skeleton" },
                                { color: "bg-[#00FF88]", label: "Active chain" },
                                { color: "bg-[#FFD600]", label: "Caution zone" },
                                { color: "bg-[#FF4444]", label: "ROM breach" },
                            ].map((l) => (
                                <div key={l.label} className="flex items-center gap-2">
                                    <span className={`w-3 h-0.5 ${l.color} rounded`} />
                                    <span className="text-[#52525b]">{l.label}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
