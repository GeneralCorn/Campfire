"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { Send, PhoneCall, PhoneOff, MessageCircle, Phone } from "lucide-react";
import { useAppStore } from "@/stores/useAppStore";
import { useConversation } from "@elevenlabs/react";
import type { AgentRoomId, VisualData } from "@/types";
import { VoiceAvatar } from "@/components/VoiceAvatar";
import { MedicationVisualizer, ToolCallBubble } from "@/components/MedicationVisualizer";
import type { ToolCallState } from "@/components/MedicationVisualizer";

/* ── Room config ────────────────────────────────────────────────────────── */

const ROOM_CONFIG: Record<AgentRoomId, {
  label: string;
  subtitle: string;
  placeholder: string;
  seedText: string;
  /** Brand color for this room — medical industry hues */
  color: string;
  /** Lighter variant for text-on-dark */
  colorLight: string;
}> = {
  "medication-room": {
    label: "Medication Specialist",
    subtitle: "Prescriptions · Dosages · Interactions",
    placeholder: "Type your medication question…",
    seedText: "Hi! I'm your Medication Specialist. I can answer questions about your prescriptions, dosages, drug interactions, and refill schedules.",
    color: "#0891b2",         // cyan-600 — medical teal, pharmacy/EHR standard
    colorLight: "#67e8f9",   // cyan-300
  },
  "recovery-room": {
    label: "Recovery Coach",
    subtitle: "Exercises · Diet · Milestones",
    placeholder: "Type your recovery question…",
    seedText: "Hello! I'm your Recovery Coach. I can help with your physical therapy exercises, dietary guidelines, and tracking your recovery milestones.",
    color: "#16a34a",         // green-600 — healing/vitality green
    colorLight: "#86efac",   // green-300
  },
  "emergency-room": {
    label: "Emergency Triage",
    subtitle: "Symptom triage · Urgency assessment",
    placeholder: "Describe your symptoms…",
    seedText: "I'm your Emergency Triage specialist. If you're experiencing concerning symptoms, please describe them in detail and I'll help assess urgency.",
    color: "#dc2626",         // red-600 — clinical emergency signal
    colorLight: "#fca5a5",   // red-300
  },
};

const AGENT_ID_MAP: Record<AgentRoomId, string | undefined> = {
  "medication-room": process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID_MEDICATION,
  "recovery-room": process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID_RECOVERY,
  "emergency-room": process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID_EMERGENCY,
};

/* ── Types ──────────────────────────────────────────────────────────────── */

interface Message {
  id: string;
  role: "user" | "agent";
  text: string;
  streaming?: boolean;
}

type ViewMode = "call" | "chat";

/* ── Component ─────────────────────────────────────────────────────────── */

export function AgentRoom({ roomId }: { roomId: AgentRoomId }) {
  const cfg = ROOM_CONFIG[roomId];
  const discharge = useAppStore((s) => s.discharge);
  const agentId = AGENT_ID_MAP[roomId] || "";

  const [mode, setMode] = useState<ViewMode>("call");
  const [messages, setMessages] = useState<Message[]>([
    { id: "seed", role: "agent", text: cfg.seedText },
  ]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [toolCallState, setToolCallState] = useState<ToolCallState>("idle");
  const [visualData, setVisualData] = useState<VisualData | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const scroll = useCallback(() =>
    bottomRef.current?.scrollIntoView({ behavior: "smooth" }), []);
  useEffect(() => { scroll(); }, [messages, toolCallState, visualData, scroll]);

  /* ── ElevenLabs ─────────────────────────────────────────────────────────── */

  const conversation = useConversation({
    onConnect: () => setMode("call"),
    onDisconnect: () => { },
    onError: (e) => console.error("ElevenLabs error:", e),
    onMessage: (msg: { source: string; message: string }) => {
      if (msg.source === "ai") {
        setMessages((m) => [
          ...m,
          { id: `voice-${Date.now()}`, role: "agent", text: msg.message },
        ]);
      }
    },
  });

  const isConnected = conversation.status === "connected";
  const isConnecting = conversation.status === "connecting";
  const isActive = isConnected || isConnecting;

  async function startCall() {
    if (!agentId) { alert(`Add NEXT_PUBLIC_ELEVENLABS_AGENT_ID_${roomId.split("-")[0].toUpperCase()} to .env.local`); return; }
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      await conversation.startSession({ agentId } as any);
    } catch (err) { console.error("Failed to start call", err); }
  }

  async function endCall() {
    await conversation.endSession();
  }

  /* ── Text chat ──────────────────────────────────────────────────────────── */

  async function handleSend() {
    const text = input.trim();
    if (!text || isTyping || isActive) return;
    const userMsg: Message = { id: `u-${Date.now()}`, role: "user", text };
    setMessages((m) => [...m, userMsg]);
    setInput("");
    setIsTyping(true);
    if (roomId === "medication-room") { setToolCallState("calling"); setVisualData(null); }
    const aiId = `a-${Date.now()}`;
    setMessages((m) => [...m, { id: aiId, role: "agent", text: "", streaming: true }]);
    try {
      const res = await fetch("/api/orchestrate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_message: text,
          history: messages.filter((m) => m.id !== "seed").map((m) => ({
            role: m.role === "user" ? "user" : "assistant",
            content: m.text,
          })),
          discharge_context: discharge,
          active_agent: roomId.replace("-room", ""),
        }),
      });
      const data = await res.json();
      const reply = data.response || data.audio_text || "No response received.";
      setMessages((m) => m.map((msg) => msg.id === aiId ? { ...msg, text: reply, streaming: false } : msg));
      if (roomId === "medication-room" && data.visual_data) {
        setToolCallState("done");
        setTimeout(() => { setToolCallState("idle"); setVisualData(data.visual_data as VisualData); }, 1100);
      } else if (roomId === "medication-room") setToolCallState("idle");
    } catch {
      setMessages((m) => m.map((msg) => msg.id === aiId ? { ...msg, text: "Sorry, I couldn't connect right now.", streaming: false } : msg));
      setToolCallState("idle");
    } finally { setIsTyping(false); }
  }

  /* ── Render ─────────────────────────────────────────────────────────────── */

  return (
    <div className="flex flex-col h-full bg-[#07080a]">
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-5 h-[56px] border-b border-white/[0.06] bg-[#0e0f12] shrink-0">
        <div className="flex items-center gap-3">
          <div
            className="relative w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: `${cfg.color}18`, border: `1px solid ${cfg.color}30` }}
          >
            {isActive && (
              <div className="absolute inset-0 rounded-xl animate-ping opacity-25"
                style={{ backgroundColor: cfg.color }} />
            )}
            <span className="text-[10px] font-bold relative z-10" style={{ color: cfg.colorLight }}>
              {cfg.label.charAt(0)}
            </span>
          </div>
          <div>
            <h2 className="text-[14px] font-semibold text-[#f0f9ff] tracking-[-0.015em] leading-tight">
              {cfg.label}
            </h2>
            <p className="text-[11px] text-[#475569] leading-tight">{cfg.subtitle}</p>
          </div>
        </div>

        {/* Mode toggle pills */}
        <div className="flex items-center gap-1 p-1 rounded-lg bg-[#0e0f12] border border-white/[0.06]">
          {(["call", "chat"] as ViewMode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-medium transition-all ${mode === m
                ? "bg-[#1e2027] text-[#f0f9ff]"
                : "text-[#475569] hover:text-[#94a3b8]"
                }`}
            >
              {m === "call" ? <Phone size={11} /> : <MessageCircle size={11} />}
              {m.charAt(0).toUpperCase() + m.slice(1)}
              {m === "call" && isActive && (
                <span className="w-1.5 h-1.5 rounded-full bg-[#22c55e] ml-0.5" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── CALL VIEW ────────────────────────────────────────────────────── */}
      {mode === "call" && (
        <div className="flex flex-col flex-1 items-center justify-center gap-6 px-5 py-8">
          {/* Avatar */}
          <VoiceAvatar
            label={cfg.label}
            initial={cfg.label.charAt(0)}
            color={cfg.color}
            isSpeaking={isConnected && conversation.isSpeaking}
            isConnecting={isConnecting}
            isConnected={isConnected}
          />

          {/* Call button */}
          {!isActive ? (
            <button
              onClick={startCall}
              className="flex items-center gap-2.5 px-8 py-3.5 rounded-2xl text-[14px] font-semibold text-white transition-all duration-200 active:scale-95"
              style={{
                background: `linear-gradient(135deg, ${cfg.color}, ${cfg.color}cc)`,
                boxShadow: `0 4px 24px ${cfg.color}30, 0 0 0 1px ${cfg.color}40`,
              }}
            >
              <PhoneCall size={16} />
              Start Voice Session
            </button>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <button
                onClick={endCall}
                className="flex items-center gap-2.5 px-8 py-3.5 rounded-2xl text-[14px] font-semibold text-white transition-all duration-200 active:scale-95 bg-[#dc2626] hover:bg-[#b91c1c]"
                style={{ boxShadow: "0 4px 24px rgba(220,38,38,0.3)" }}
              >
                <PhoneOff size={16} />
                End Session
              </button>
              <p className="text-[11px] text-[#475569]">
                {conversation.isSpeaking ? "Agent is speaking — microphone muted" : "Listening for your voice…"}
              </p>
            </div>
          )}

          {/* Recent voice transcript — last 3 messages */}
          {isActive && messages.filter(m => m.id !== "seed" && m.text).length > 0 && (
            <div className="w-full max-w-sm rounded-xl border border-white/[0.05] bg-[#0e0f12] p-3 space-y-2">
              <p className="text-[9px] font-semibold text-[#334155] uppercase tracking-[0.1em]">Voice Transcript</p>
              {messages.filter(m => m.id !== "seed" && m.text).slice(-3).map((msg) => (
                <div key={msg.id} className={`flex gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  <p
                    className="text-[11px] leading-relaxed max-w-[85%] rounded-lg px-2.5 py-1.5"
                    style={msg.role === "agent"
                      ? { background: "#1e2027", color: "#94a3b8" }
                      : { background: `${cfg.color}18`, color: cfg.colorLight }}
                  >
                    {msg.text}
                  </p>
                </div>
              ))}
            </div>
          )}

          {/* Idle prompt to switch to chat */}
          {!isActive && (
            <p className="text-[11px] text-[#334155] text-center">
              Or{" "}
              <button className="underline underline-offset-2 hover:text-[#64748b]" style={{ color: cfg.colorLight, opacity: 0.7 }}
                onClick={() => setMode("chat")}>
                open the text chat
              </button>{" "}
              if you prefer typing
            </p>
          )}
        </div>
      )}

      {/* ── CHAT VIEW ────────────────────────────────────────────────────── */}
      {mode === "chat" && (
        <>
          {/* Call badge — still accessible from chat view */}
          {isActive && (
            <div
              className="flex items-center justify-between px-4 py-2 border-b border-white/[0.04]"
              style={{ background: `${cfg.color}0a` }}
            >
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#22c55e] animate-pulse" />
                <span className="text-[11px] font-medium" style={{ color: cfg.colorLight }}>
                  Voice session active — {conversation.isSpeaking ? "Agent speaking" : "Listening"}
                </span>
              </div>
              <button onClick={endCall} className="text-[11px] text-[#ef4444] hover:text-[#f87171]">End Call</button>
            </div>
          )}

          <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4 min-h-0">
            {messages.map((msg) => (
              <div key={msg.id}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                style={{ animation: "fade-in 0.2s ease" }}
              >
                {/* Agent initial avatar dot */}
                {msg.role === "agent" && (
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0 mr-2 mt-0.5"
                    style={{ background: `${cfg.color}18`, color: cfg.colorLight, border: `1px solid ${cfg.color}30` }}
                  >
                    {cfg.label.charAt(0)}
                  </div>
                )}
                <div
                  className={`max-w-[75%] rounded-2xl px-4 py-3 text-[13.5px] leading-[1.65] ${msg.streaming ? "streaming-cursor" : ""
                    }`}
                  style={msg.role === "user"
                    ? { background: `${cfg.color}18`, border: `1px solid ${cfg.color}28`, color: "#e2e8f0" }
                    : { background: "#0e0f12", border: "1px solid rgba(255,255,255,0.05)", color: "#94a3b8" }
                  }
                >
                  {msg.text || (
                    <span className="flex items-center gap-1.5 text-[#334155]">
                      <span className="typing-pulse inline-block w-1.5 h-1.5 rounded-full bg-[#334155]" style={{ animationDelay: "0s" }} />
                      <span className="typing-pulse inline-block w-1.5 h-1.5 rounded-full bg-[#334155]" style={{ animationDelay: "0.2s" }} />
                      <span className="typing-pulse inline-block w-1.5 h-1.5 rounded-full bg-[#334155]" style={{ animationDelay: "0.4s" }} />
                    </span>
                  )}
                </div>
              </div>
            ))}
            {toolCallState !== "idle" && (
              <div style={{ animation: "fade-in 0.2s ease-out" }}>
                <ToolCallBubble state={toolCallState} color={cfg.color} />
              </div>
            )}
            {visualData && (
              <MedicationVisualizer data={visualData} color={cfg.color} onDismiss={() => setVisualData(null)} />
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="px-4 pb-4 pt-2 bg-[#07080a] border-t border-white/[0.04] shrink-0">
            {isActive && (
              <p className="text-[10px] text-[#334155] text-center mb-2">
                Text chat is paused during voice session
              </p>
            )}
            <div
              className={`flex items-center gap-2 rounded-xl bg-[#0e0f12] border transition-all p-1.5 ${isActive ? "opacity-50 pointer-events-none" : "border-white/[0.06]"
                }`}
              style={{ borderColor: input ? `${cfg.color}30` : undefined }}
            >
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSend()}
                placeholder={cfg.placeholder}
                disabled={isTyping || isActive}
                className="flex-1 bg-transparent text-[13.5px] text-[#e2e8f0] placeholder:text-[#334155] outline-none px-2 py-1.5 disabled:bg-transparent"
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || isTyping || isActive}
                className="flex items-center justify-center w-9 h-9 rounded-lg text-white disabled:opacity-20 transition-all duration-150 shrink-0"
                style={{ background: `linear-gradient(135deg, ${cfg.color}, ${cfg.color}cc)` }}
              >
                <Send size={14} />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
