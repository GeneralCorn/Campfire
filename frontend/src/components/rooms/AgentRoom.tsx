"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { Send } from "lucide-react";
import { useAppStore } from "@/stores/useAppStore";
import type { AgentRoomId, VisualData } from "@/types";
import { MedicationVisualizer, ToolCallBubble } from "@/components/MedicationVisualizer";
import type { ToolCallState } from "@/components/MedicationVisualizer";

/* ── Room config ───────────────────────────────────────────────────────── */

const ROOM_CONFIG: Record<AgentRoomId, {
  label: string;
  subtitle: string;
  placeholder: string;
  seedText: string;
  color: string;
}> = {
  "medication-room": {
    label: "Medication Agent",
    subtitle: "Manages prescriptions, dosages & interactions",
    placeholder: "Ask about medications…",
    seedText: "Hi! I'm your Medication Agent. Ask me about your prescriptions, dosages, interactions, or refill schedules.",
    color: "#14b8a6",
  },
  "recovery-room": {
    label: "Recovery Agent",
    subtitle: "Guides exercise, diet & recovery milestones",
    placeholder: "Ask about recovery…",
    seedText: "Hello! I'm your Recovery Agent. I can help with physical therapy exercises, diet guidelines, and tracking your recovery milestones.",
    color: "#10b981",
  },
  "emergency-room": {
    label: "Emergency Agent",
    subtitle: "Triages urgent symptoms & escalation protocols",
    placeholder: "Describe symptoms…",
    seedText: "I'm your Emergency Agent. If you're experiencing concerning symptoms, describe them and I'll help you determine the urgency and next steps.",
    color: "#ef4444",
  },
};

/* ── Types ──────────────────────────────────────────────────────────────── */

interface Message {
  id: string;
  role: "user" | "agent";
  text: string;
  streaming?: boolean;
}

/* ── Component ─────────────────────────────────────────────────────────── */

export function AgentRoom({ roomId }: { roomId: AgentRoomId }) {
  const cfg = ROOM_CONFIG[roomId];
  const discharge = useAppStore((s) => s.discharge);

  const [messages, setMessages] = useState<Message[]>([
    { id: "seed", role: "agent", text: cfg.seedText },
  ]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);

  // ── Visual schedule state ─────────────────────────────────────────────────
  const [toolCallState, setToolCallState] = useState<ToolCallState>("idle");
  const [visualData, setVisualData] = useState<VisualData | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const scroll = useCallback(() =>
    bottomRef.current?.scrollIntoView({ behavior: "smooth" }), []);

  useEffect(() => { scroll(); }, [messages, toolCallState, visualData, scroll]);

  async function handleSend() {
    const text = input.trim();
    if (!text || isTyping) return;

    const userMsg: Message = { id: `u-${Date.now()}`, role: "user", text };
    setMessages((m) => [...m, userMsg]);
    setInput("");
    setIsTyping(true);

    // Show tool-call indicator only in the medication room
    if (roomId === "medication-room") {
      setToolCallState("calling");
      setVisualData(null);
    }

    const agentId = `a-${Date.now()}`;
    setMessages((m) => [...m, { id: agentId, role: "agent", text: "", streaming: true }]);

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
      const responseText = data.response || data.audio_text || "No response received.";

      setMessages((m) =>
        m.map((msg) =>
          msg.id === agentId
            ? { ...msg, text: responseText, streaming: false }
            : msg
        )
      );

      // Animate visual data in: tool call "done" → 1.1s delay → show visual
      if (roomId === "medication-room" && data.visual_data) {
        setToolCallState("done");
        setTimeout(() => {
          setToolCallState("idle");
          setVisualData(data.visual_data as VisualData);
        }, 1100);
      } else if (roomId === "medication-room") {
        setToolCallState("idle");
      }
    } catch {
      setMessages((m) =>
        m.map((msg) =>
          msg.id === agentId
            ? { ...msg, text: "Sorry, I couldn't connect right now.", streaming: false }
            : msg
        )
      );
      setToolCallState("idle");
    } finally {
      setIsTyping(false);
    }
  }

  return (
    <div className="flex flex-col h-full bg-[#09090b]">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-5 h-[52px] border-b border-white/[0.06] bg-[#111113] shrink-0">
        <div
          className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
          style={{ background: `${cfg.color}18`, border: `1px solid ${cfg.color}30` }}
        >
          <span className="text-[9px] font-bold" style={{ color: cfg.color }}>
            {cfg.label.charAt(0)}
          </span>
        </div>
        <div>
          <h2 className="text-[13px] font-semibold text-[#fafafa] tracking-[-0.01em]">
            {cfg.label}
          </h2>
          <p className="text-[10px] text-[#52525b]">{cfg.subtitle}</p>
        </div>
      </div>

      {/* ── Messages ────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 min-h-0">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            style={{ animation: "fade-in 0.2s ease" }}
          >
            <div
              className={`max-w-[70%] rounded-lg px-3.5 py-2.5 text-[13px] leading-[1.6] ${
                msg.role === "user"
                  ? "text-[#e4e4e7]"
                  : "bg-[#111113] text-[#a1a1aa] border border-white/[0.06]"
              } ${msg.streaming ? "streaming-cursor" : ""}`}
              style={
                msg.role === "user"
                  ? {
                      background: `${cfg.color}12`,
                      border: `1px solid ${cfg.color}20`,
                    }
                  : undefined
              }
            >
              {msg.text || (
                <span className="flex items-center gap-1.5 text-[#52525b]">
                  <span
                    className="typing-pulse inline-block w-1 h-1 rounded-full bg-[#52525b]"
                    style={{ animationDelay: "0s" }}
                  />
                  <span
                    className="typing-pulse inline-block w-1 h-1 rounded-full bg-[#52525b]"
                    style={{ animationDelay: "0.2s" }}
                  />
                  <span
                    className="typing-pulse inline-block w-1 h-1 rounded-full bg-[#52525b]"
                    style={{ animationDelay: "0.4s" }}
                  />
                </span>
              )}
            </div>
          </div>
        ))}

        {/* ── Tool call indicator ── */}
        {toolCallState !== "idle" && (
          <div style={{ animation: "fade-in 0.2s ease-out" }}>
            <ToolCallBubble state={toolCallState} color={cfg.color} />
          </div>
        )}

        {/* ── Medication visual (from Modal tool call) ── */}
        {visualData && (
          <MedicationVisualizer
            data={visualData}
            color={cfg.color}
            onDismiss={() => setVisualData(null)}
          />
        )}

        <div ref={bottomRef} />
      </div>

      {/* ── Input ───────────────────────────────────────────────────────────── */}
      <div className="px-4 pb-3 pt-2 bg-[#09090b] border-t border-white/[0.04] shrink-0">
        <div
          className="flex items-center gap-2 rounded-lg bg-[#111113] border border-white/[0.06] transition-colors p-1"
          style={{
            borderColor: input ? `${cfg.color}25` : undefined,
          }}
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder={cfg.placeholder}
            disabled={isTyping}
            className="flex-1 bg-transparent text-[13px] text-[#fafafa] placeholder:text-[#3f3f46] outline-none px-3 py-2"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isTyping}
            className="flex items-center justify-center w-8 h-8 rounded-md text-white disabled:opacity-20 transition-all duration-150 shrink-0"
            style={{ backgroundColor: cfg.color }}
          >
            <Send size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}
