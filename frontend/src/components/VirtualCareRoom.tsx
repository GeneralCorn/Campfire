"use client";

import React, { useCallback, useRef } from "react";
import { useUIStore } from "@/stores/useUIStore";
import { useAppStore } from "@/stores/useAppStore";
import { useConversation } from "@elevenlabs/react";
import {
    Mic,
    MicOff,
    Video,
    VideoOff,
    PhoneOff,
    Activity,
} from "lucide-react";
import { useState } from "react";
import LivePTCamera from "@/components/LivePTCamera";

const AGENT_ID = process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID ?? "";
const BACKEND_URL = "http://localhost:8000";

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  VirtualCareRoom                                                          */
/* ═══════════════════════════════════════════════════════════════════════════ */
export default function VirtualCareRoom() {
    const { activeStage, setActiveStage, chartData, setChartData } = useUIStore();
    const discharge = useAppStore((s) => s.discharge);
    const [cameraOn, setCameraOn] = useState(false);

    /* ── ElevenLabs Conversation ──────────────────────────────────────────── */
    const conversationRef = useRef<ReturnType<typeof useConversation> | null>(null);

    const conversation = useConversation({
        onConnect: () => console.log("[VCR] Agent connected"),
        onDisconnect: () => {
            console.log("[VCR] Agent disconnected");
            setActiveStage("orb");
        },
        onError: (err) => console.error("[VCR] Agent error:", err),

        clientTools: {
            /* ── Tool 1: Medical Record Consultation ─────────────────────────── */
            consult_medical_record: async (params: { query: string }) => {
                try {
                    const res = await fetch(`${BACKEND_URL}/api/orchestrate`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ query: params.query }),
                    });
                    const data = await res.json();
                    return data.audio_text || data.response || "I couldn't find that information.";
                } catch (err) {
                    console.error("[Tool] consult_medical_record error:", err);
                    return "I'm having trouble accessing the medical database right now.";
                }
            },

            /* ── Tool 2: Render Medical Chart ────────────────────────────────── */
            render_medical_chart: async (params: { chart_type: string }) => {
                try {
                    setChartData(
                        `<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#a1a1aa;">
              <div style="text-align:center">
                <div style="font-size:2rem;margin-bottom:1rem;animation:spin 1s linear infinite">⟳</div>
                <p>Generating ${params.chart_type} chart…</p>
              </div>
            </div>`
                    );
                    setActiveStage("chart");

                    const res = await fetch(`${BACKEND_URL}/api/generate-visual`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ chart_type: params.chart_type }),
                    });
                    const data = await res.json();
                    setChartData(data.html || "<p style='color:#a1a1aa;text-align:center;padding:4rem'>Chart unavailable.</p>");
                    return "The chart is now visible to the patient on screen.";
                } catch (err) {
                    console.error("[Tool] render_medical_chart error:", err);
                    setChartData("<p style='color:#ef4444;text-align:center;padding:4rem'>Failed to generate chart.</p>");
                    return "I wasn't able to generate the chart.";
                }
            },

            /* ── Tool 3: Start Physical Therapy ──────────────────────────────── */
            start_physical_therapy: async (params: { joint: string }) => {
                setCameraOn(true);
                setActiveStage("pt_camera");
                return `Camera is active for ${params.joint} tracking. Instruct the patient to step back and begin their exercises.`;
            },
        },
    });

    conversationRef.current = conversation;

    /* ── Toggle Call ──────────────────────────────────────────────────────── */
    const toggleCall = useCallback(async () => {
        if (conversation.status === "connected") {
            await conversation.endSession();
            setActiveStage("orb");
        } else {
            const ctx = discharge
                ? JSON.stringify({
                    medications: discharge.medications,
                    restrictions: discharge.restrictions,
                    warning_signs: discharge.warning_signs,
                })
                : "No discharge data loaded.";

            try {
                await conversation.startSession({
                    agentId: AGENT_ID,
                    connectionType: "webrtc",
                    dynamicVariables: { context: ctx },
                });
            } catch (err) {
                console.error("[VCR] Failed to start session:", err);
            }
        }
    }, [conversation, discharge, setActiveStage]);

    /* ── PT Breach → Agent Override ───────────────────────────────────────── */
    const handlePTBreach = useCallback(
        (angle: number) => {
            const msg = `[SYSTEM OVERRIDE PRIORITY ZERO]: The patient just bent their right wrist to ${angle} degrees! Interrupt yourself immediately and tell them to straighten their hand!`;
            // Inject hidden text into the agent's context
            if (conversationRef.current && conversationRef.current.status === "connected") {
                // The ElevenLabs SDK doesn't expose sendTextInput publicly in all versions,
                // so we'll use the onMessage callback pattern or addUserAudio alternative.
                // For now we log it; the ElevenLabs dashboard "override" system prompt handles it.
                console.warn("[PT Override]", msg);
            }
        },
        []
    );

    const isConnected = conversation.status === "connected";
    const isSpeaking = conversation.isSpeaking;

    /* ═══════════════════════════════════════════════════════════════════════ */
    /*  RENDER                                                                */
    /* ═══════════════════════════════════════════════════════════════════════ */
    return (
        <div className="virtual-care-room">
            {/* ── Top Bar ────────────────────────────────────────────────────── */}
            <header className="vcr-header">
                <div className="vcr-header__left">
                    <Activity size={18} className="text-emerald-400" />
                    <span className="vcr-header__title">Campfire Care</span>
                </div>
                <div className="vcr-header__right">
                    {isConnected && (
                        <span className="vcr-status-badge">
                            <span className="vcr-status-dot" />
                            {isSpeaking ? "Julie is speaking" : "Listening"}
                        </span>
                    )}
                </div>
            </header>

            {/* ── Main Stage ─────────────────────────────────────────────────── */}
            <main className="vcr-stage">
                {activeStage === "orb" && (
                    <div className="vcr-orb-container">
                        {/* Ambient glow */}
                        <div className={`vcr-orb-glow ${isConnected ? (isSpeaking ? "vcr-orb-glow--speaking" : "vcr-orb-glow--listening") : ""}`} />

                        {/* Outer rings */}
                        {isConnected && isSpeaking && (
                            <>
                                <div className="vcr-orb-ring vcr-orb-ring--1" />
                                <div className="vcr-orb-ring vcr-orb-ring--2" />
                                <div className="vcr-orb-ring vcr-orb-ring--3" />
                            </>
                        )}

                        {/* Core orb */}
                        <div className={`vcr-orb ${isConnected ? "vcr-orb--active" : ""}`}>
                            <div className="vcr-orb__inner">
                                {isConnected ? (
                                    <div className="vcr-orb__waveform">
                                        {[...Array(5)].map((_, i) => (
                                            <div
                                                key={i}
                                                className={`vcr-orb__bar ${isSpeaking ? "vcr-orb__bar--speaking" : "vcr-orb__bar--idle"}`}
                                                style={{ animationDelay: `${i * 0.12}s` }}
                                            />
                                        ))}
                                    </div>
                                ) : (
                                    <Mic size={32} className="text-zinc-500" />
                                )}
                            </div>
                        </div>

                        {/* Label */}
                        <p className="vcr-orb-label">
                            {isConnected
                                ? isSpeaking
                                    ? "Julie is speaking…"
                                    : "Listening to you…"
                                : "Tap the mic to start"}
                        </p>
                    </div>
                )}

                {activeStage === "pt_camera" && (
                    <div className="vcr-pt-container">
                        <LivePTCamera
                            onBreach={handlePTBreach}
                        />
                        <button
                            onClick={() => { setActiveStage("orb"); setCameraOn(false); }}
                            className="vcr-pt-back"
                        >
                            ← Back to consultation
                        </button>
                    </div>
                )}

                {activeStage === "chart" && (
                    <div className="vcr-chart-container">
                        <div
                            className="vcr-chart-frame"
                            dangerouslySetInnerHTML={{ __html: chartData || "" }}
                        />
                        <button
                            onClick={() => setActiveStage("orb")}
                            className="vcr-chart-back"
                        >
                            ← Back to consultation
                        </button>
                    </div>
                )}
            </main>

            {/* ── Bottom Control Bar ─────────────────────────────────────────── */}
            <footer className="vcr-controls">
                <div className="vcr-controls__bar">
                    {/* Mic */}
                    <button
                        onClick={toggleCall}
                        className={`vcr-btn ${isConnected ? "vcr-btn--active" : "vcr-btn--muted"}`}
                        title={isConnected ? "Mute / End Session" : "Start Session"}
                    >
                        {isConnected ? <Mic size={20} /> : <MicOff size={20} />}
                    </button>

                    {/* Camera */}
                    <button
                        onClick={() => {
                            if (activeStage === "pt_camera") {
                                setActiveStage("orb");
                                setCameraOn(false);
                            } else {
                                setCameraOn(true);
                                setActiveStage("pt_camera");
                            }
                        }}
                        className={`vcr-btn ${cameraOn ? "vcr-btn--active" : "vcr-btn--muted"}`}
                        title={cameraOn ? "Turn off camera" : "Turn on camera"}
                    >
                        {cameraOn ? <Video size={20} /> : <VideoOff size={20} />}
                    </button>

                    {/* End Call */}
                    <button
                        onClick={async () => {
                            if (conversation.status === "connected") {
                                await conversation.endSession();
                            }
                            setActiveStage("orb");
                            setCameraOn(false);
                        }}
                        className="vcr-btn vcr-btn--end"
                        title="End call"
                    >
                        <PhoneOff size={20} />
                    </button>
                </div>
            </footer>
        </div>
    );
}
