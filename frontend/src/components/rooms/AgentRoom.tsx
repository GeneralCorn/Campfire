"use client";

import { useState, useRef, useEffect } from "react";
import { Send, Volume2, VolumeX, Pill, HeartPulse, ShieldAlert } from "lucide-react";
import { useAppStore } from "@/stores/useAppStore";
import { apiFetch } from "@/lib/api";
import { formatTimestamp } from "@/lib/lounge";
import type { RoomMessage, ActivityRoute } from "@/types";

// ── Room config ───────────────────────────────────────────────────────────────

type AgentRoomId = "medication-room" | "recovery-room" | "emergency-room";

interface RoomConfig {
  label: string;
  subtitle: string;
  placeholder: string;
  Icon: React.ElementType;
  color: string;
  seedText: string;
}

const ROOM_CONFIG: Record<AgentRoomId, RoomConfig> = {
  "medication-room": {
    label: "Medication Room",
    subtitle: "Private conversation with your medication specialist",
    placeholder: "Ask about your medications…",
    Icon: Pill,
    color: "#0891B2",
    seedText:
      "Hi! I'm your medication specialist. I have your full prescription list from your discharge. Ask me anything about dosages, timing, interactions, or side effects.",
  },
  "recovery-room": {
    label: "Recovery Room",
    subtitle: "Private conversation with your recovery specialist",
    placeholder: "Ask about your recovery…",
    Icon: HeartPulse,
    color: "#059669",
    seedText:
      "Hello! I'm here to help with your recovery plan. I know your activity restrictions and physical therapy guidelines. Ask me about what you can and can't do.",
  },
  "emergency-room": {
    label: "Emergency Room",
    subtitle: "Monitor your warning signs with our emergency specialist",
    placeholder: "Ask about warning signs…",
    Icon: ShieldAlert,
    color: "#DC2626",
    seedText:
      "I'm monitoring your warning signs. If you're experiencing any unusual symptoms, describe them and I'll help you assess whether you need to contact your doctor immediately.",
  },
};

// ── Message bubbles ───────────────────────────────────────────────────────────

function UserBubble({ msg }: { msg: RoomMessage }) {
  return (
    <div className="flex justify-end mb-3">
      <div className="max-w-[72%]">
        <div className="px-4 py-2.5 rounded-2xl rounded-tr-sm bg-[#F0FDFA] border border-[#0891B2] text-sm text-[#1E293B] leading-relaxed">
          {msg.text}
        </div>
        <p className="text-[10px] text-[#94A3B8] mt-1 text-right">{formatTimestamp(msg.timestamp)}</p>
      </div>
    </div>
  );
}

function AgentBubble({
  msg,
  Icon,
  color,
}: {
  msg: RoomMessage;
  Icon: React.ElementType;
  color: string;
}) {
  return (
    <div className="flex items-end gap-2 mb-3">
      <div
        className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 mb-5"
        style={{ backgroundColor: color }}
      >
        <Icon size={14} className="text-white" />
      </div>
      <div className="max-w-[72%]">
        <div className="px-4 py-2.5 rounded-2xl rounded-tl-sm bg-white border border-[#E2E8F0] text-sm text-[#1E293B] leading-relaxed">
          {msg.text}
        </div>
        <p className="text-[10px] text-[#94A3B8] mt-1">{formatTimestamp(msg.timestamp)}</p>
      </div>
    </div>
  );
}

// ── AgentRoom ─────────────────────────────────────────────────────────────────

export function AgentRoom({ roomId }: { roomId: AgentRoomId }) {
  const config = ROOM_CONFIG[roomId];

  const history = useAppStore((s) =>
    roomId === "medication-room"
      ? s.medicationRoomHistory
      : roomId === "recovery-room"
      ? s.recoveryRoomHistory
      : s.emergencyRoomHistory
  );

  const addMessage = useAppStore((s) =>
    roomId === "medication-room"
      ? s.addMedicationRoomMessage
      : roomId === "recovery-room"
      ? s.addRecoveryRoomMessage
      : s.addEmergencyRoomMessage
  );

  const isStreaming     = useAppStore((s) => s.isStreaming);
  const setIsStreaming  = useAppStore((s) => s.setIsStreaming);
  const addActivity     = useAppStore((s) => s.addActivity);
  const setLoungeUnread = useAppStore((s) => s.setLoungeUnread);
  const activeRoom      = useAppStore((s) => s.activeRoom);

  const [input, setInput]   = useState("");
  const [muted, setMuted]   = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [history, isStreaming]);

  const { Icon, color, label, subtitle, placeholder, seedText } = config;

  const SEED: RoomMessage = {
    id: "seed",
    role: "agent",
    text: seedText,
    timestamp: Date.now() - 5 * 60 * 1000,
  };

  // Always prepend seed as first message; history holds user/agent turns after that
  const displayMessages: RoomMessage[] = [SEED, ...history];

  async function submit() {
    const query = input.trim();
    if (!query || isStreaming) return;

    setInput("");
    addMessage({ id: crypto.randomUUID(), role: "user", text: query, timestamp: Date.now() });
    setIsStreaming(true);

    try {
      const data = await apiFetch<{
        audio_text: string;
        route: string;
        off_topic: boolean;
        ui_trigger: string;
      }>("/api/orchestrate", {
        method: "POST",
        body: JSON.stringify({ query }),
      });

      const turnId = crypto.randomUUID();
      addMessage({ id: turnId, role: "agent", text: data.audio_text, timestamp: Date.now() });
      addActivity({
        id: turnId,
        timestamp: Date.now(),
        route: data.route as ActivityRoute,
        audio_text: data.audio_text,
        off_topic: data.off_topic,
      });

      // If user is not in the lounge, mark it as having unread activity
      if (activeRoom !== "lounge") {
        setLoungeUnread(true);
      }
    } catch {
      addMessage({
        id: crypto.randomUUID(),
        role: "agent",
        text: "Sorry, I couldn't respond right now. Please try again.",
        timestamp: Date.now(),
      });
    } finally {
      setIsStreaming(false);
    }
  }

  return (
    <div className="flex flex-col h-full bg-[#F8FAFC]">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-[#E2E8F0] bg-white shrink-0">
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
            style={{ backgroundColor: color }}
          >
            <Icon size={16} className="text-white" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-[#1E293B]" style={{ color }}>
              {label}
            </h2>
            <p className="text-xs text-[#64748B]">{subtitle}</p>
          </div>
        </div>
        <button
          onClick={() => setMuted((m) => !m)}
          className="p-2 rounded-lg text-[#64748B] hover:text-[#0891B2] hover:bg-[#F0FDFA] transition-colors"
          title={muted ? "Unmute" : "Mute"}
        >
          {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
        </button>
      </div>

      {/* Chat area */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {displayMessages.map((msg) =>
          msg.role === "user" ? (
            <UserBubble key={msg.id} msg={msg} />
          ) : (
            <AgentBubble key={msg.id} msg={msg} Icon={Icon} color={color} />
          )
        )}

        {/* Typing indicator */}
        {isStreaming && (
          <div className="flex items-end gap-2 mb-3">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 mb-5 typing-pulse"
              style={{ backgroundColor: color }}
            >
              <Icon size={14} className="text-white" />
            </div>
            <div className="px-4 py-3 rounded-2xl rounded-tl-sm bg-white border border-[#E2E8F0]">
              <div className="flex gap-1 items-center h-4">
                <span className="w-1.5 h-1.5 rounded-full bg-[#94A3B8] typing-pulse" style={{ animationDelay: "0ms" }} />
                <span className="w-1.5 h-1.5 rounded-full bg-[#94A3B8] typing-pulse" style={{ animationDelay: "300ms" }} />
                <span className="w-1.5 h-1.5 rounded-full bg-[#94A3B8] typing-pulse" style={{ animationDelay: "600ms" }} />
              </div>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-6 py-4 border-t border-[#E2E8F0] bg-white shrink-0">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder={placeholder}
            className="flex-1 px-4 py-2.5 rounded-lg border border-[#E2E8F0] text-sm text-[#1E293B] placeholder:text-[#94A3B8] outline-none focus:ring-2 focus:ring-[#0891B2]/30 focus:border-[#0891B2] transition-all duration-200 bg-white"
          />
          <button
            onClick={submit}
            disabled={isStreaming}
            className="px-4 py-2.5 bg-[#0891B2] hover:bg-[#0E7490] disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors duration-200 flex items-center gap-1.5"
            style={{ backgroundColor: isStreaming ? undefined : color }}
          >
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
