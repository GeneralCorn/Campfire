"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Dumbbell, Mic, Square, Volume2 } from "lucide-react";
import { useConversation } from "@elevenlabs/react";
import LivePTCamera, { EXERCISES, type ExerciseId } from "@/components/LivePTCamera";

const EXERCISE_LIST = Object.values(EXERCISES);
const PT_AGENT_ID = process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID_PT ?? "";

// Fire encouragement every N reps
const REP_MILESTONE = 5;

export function PTRoom() {
    const [selectedExercise, setSelectedExercise] = useState<ExerciseId>("bicep_curl");
    const [totalReps, setTotalReps] = useState(0);
    const ex = EXERCISES[selectedExercise];

    // Track last milestone we already cheered for
    const lastCheeredMilestoneRef = useRef(0);

    /* ── ElevenLabs voice coach ─────────────────────────────────────────── */
    const conversation = useConversation({
        onConnect: () => {
            // Greet and explain the exercise as soon as the session opens
            conversation.sendContextualUpdate(
                `The patient just started the PT Studio. They are about to do: ${ex.name} (targets ${ex.muscle}). ` +
                `The full range of motion is ${ex.contractedAngle}°–${ex.extendedAngle}°. ` +
                `Briefly introduce yourself as their PT coach, explain the exercise, and encourage them to begin.`
            );
        },
        onDisconnect: () => { lastCheeredMilestoneRef.current = 0; },
        onError: (e) => console.error("[PT Coach]", e),
    });

    const isConnected  = conversation.status === "connected";
    const isConnecting = conversation.status === "connecting";
    const isActive     = isConnected || isConnecting;

    async function handleVoiceToggle() {
        if (isActive) {
            await conversation.endSession();
        } else {
            try {
                await navigator.mediaDevices.getUserMedia({ audio: true });
                await conversation.startSession({ agentId: PT_AGENT_ID } as any);
            } catch (err) {
                console.error("[PT Coach] Failed to start session", err);
            }
        }
    }

    /* ── Send context when exercise changes mid-session ─────────────────── */
    useEffect(() => {
        if (!isConnected) return;
        lastCheeredMilestoneRef.current = 0;
        conversation.sendContextualUpdate(
            `The patient switched exercise to: ${ex.name} (targets ${ex.muscle}). ` +
            `ROM: ${ex.contractedAngle}°–${ex.extendedAngle}°. ` +
            `Acknowledge the switch and briefly explain the new exercise.`
        );
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedExercise]);

    /* ── Rep milestone encouragement ────────────────────────────────────── */
    const handleRepComplete = useCallback((reps: number) => {
        setTotalReps(reps);
        if (!isConnected) return;
        const milestone = Math.floor(reps / REP_MILESTONE) * REP_MILESTONE;
        if (milestone > 0 && milestone !== lastCheeredMilestoneRef.current) {
            lastCheeredMilestoneRef.current = milestone;
            conversation.sendContextualUpdate(
                `The patient just completed ${reps} reps of ${ex.name}. Give them specific, energetic encouragement.`
            );
        }
    }, [isConnected, ex.name, conversation]);

    /* ── ROM breach warning ─────────────────────────────────────────────── */
    const handleBreach = useCallback((angle: number) => {
        if (!isConnected) return;
        conversation.sendContextualUpdate(
            `The patient's joint angle dropped to ${angle}°, breaching the safe limit of ${ex.breachBelow}° during ${ex.name}. ` +
            `Immediately but calmly tell them to correct their form and explain how.`
        );
    }, [isConnected, ex.name, ex.breachBelow, conversation]);

    /* ── Reset rep counter on exercise change ────────────────────────────── */
    function handleExerciseChange(id: ExerciseId) {
        setSelectedExercise(id);
        setTotalReps(0);
        lastCheeredMilestoneRef.current = 0;
    }

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
                        <div className="flex items-center gap-1.5">
                            <p className="text-[10px] text-[#52525b]">AI-guided physical therapy with live pose tracking</p>
                            {isConnecting && (
                                <span className="text-[10px] text-[#6366f1] animate-pulse">· Connecting coach</span>
                            )}
                            {isConnected && (
                                <span className="text-[10px] text-[#22c55e]">· Coach active</span>
                            )}
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    {/* Speaking indicator */}
                    {isConnected && conversation.isSpeaking && (
                        <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-[#6366f1]/10 border border-[#6366f1]/20">
                            <Volume2 size={11} className="text-[#818cf8] animate-pulse" />
                            <span className="text-[10px] text-[#818cf8]">Coach speaking</span>
                        </div>
                    )}

                    {/* Voice toggle */}
                    <button
                        onClick={handleVoiceToggle}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-md border text-[11px] font-medium transition-colors ${isActive
                            ? "border-[#ef4444]/30 bg-[#ef4444]/10 text-[#ef4444] hover:bg-[#ef4444]/20"
                            : "border-white/[0.06] bg-[#111113] text-[#a1a1aa] hover:border-[#6366f1]/30 hover:text-[#fafafa]"
                        }`}
                    >
                        {isActive ? (
                            <><Square size={11} className="fill-current" /> End Coach</>
                        ) : (
                            <><Mic size={11} /> Start Coach</>
                        )}
                    </button>

                    {/* Exercise picker */}
                    <select
                        value={selectedExercise}
                        onChange={(e) => handleExerciseChange(e.target.value as ExerciseId)}
                        className="bg-[#111113] border border-white/[0.06] text-[#a1a1aa] text-[12px] rounded-md px-2.5 py-1.5 outline-none focus:border-[#6366f1]/30 transition-colors"
                    >
                        {EXERCISE_LIST.map((ex) => (
                            <option key={ex.id} value={ex.id}>{ex.name}</option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 flex items-center justify-center gap-5 p-5 overflow-hidden">
                <div className="shrink-0">
                    <LivePTCamera
                        exercise={selectedExercise}
                        showLabels={true}
                        onBreach={handleBreach}
                        onRepComplete={handleRepComplete}
                    />
                </div>

                <div className="w-[240px] shrink-0 space-y-3 self-start">
                    {/* Voice coach card */}
                    <div className={`rounded-lg border p-4 transition-colors ${isConnected
                        ? "border-[#6366f1]/30 bg-[#6366f1]/5"
                        : "border-white/[0.06] bg-[#111113]"
                    }`}>
                        <div className="flex items-center gap-2 mb-2">
                            <div className={`relative w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${isConnected ? "bg-[#6366f1]/20" : "bg-white/5"}`}>
                                {isConnected && conversation.isSpeaking && (
                                    <div className="absolute inset-0 rounded-full animate-ping bg-[#6366f1] opacity-20" />
                                )}
                                <Mic size={10} className={isConnected ? "text-[#818cf8]" : "text-[#52525b]"} />
                            </div>
                            <p className={`text-[11px] font-medium ${isConnected ? "text-[#818cf8]" : "text-[#52525b]"}`}>
                                {isConnecting ? "Connecting…" : isConnected ? "PT Coach" : "PT Coach"}
                            </p>
                        </div>
                        <p className="text-[10px] text-[#3f3f46] leading-relaxed mb-3">
                            {isConnected
                                ? "Your coach is listening. Complete reps and ask questions aloud."
                                : "Start your AI coach for real-time guidance, form corrections, and encouragement."}
                        </p>
                        <button
                            onClick={handleVoiceToggle}
                            className={`w-full py-1.5 rounded-md text-[11px] font-medium transition-colors ${isActive
                                ? "bg-[#ef4444]/10 text-[#ef4444] border border-[#ef4444]/20 hover:bg-[#ef4444]/20"
                                : "bg-[#6366f1]/10 text-[#818cf8] border border-[#6366f1]/20 hover:bg-[#6366f1]/20"
                            }`}
                        >
                            {isActive ? "End Session" : "Start Coach"}
                        </button>
                    </div>

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
