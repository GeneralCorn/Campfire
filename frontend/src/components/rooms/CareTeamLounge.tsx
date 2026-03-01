"use client";

import { useState, useRef, useEffect } from "react";
import { Send, Volume2, VolumeX, Pill, HeartPulse, ShieldAlert, User, Mic } from "lucide-react";
import { useAppStore } from "@/stores/useAppStore";
import { apiFetch } from "@/lib/api";
import { formatTimestamp } from "@/lib/lounge";
import { useMicrophone } from "@/hooks/useMicrophone";
import type { AgentName, LoungeMessage, ActivityRoute, RoomId } from "@/types";

// ── Agent display config ──────────────────────────────────────────────────────

const AGENT_CONFIG: Record<AgentName, { Icon: React.ElementType; color: string }> = {
  "Medication Agent": { Icon: Pill, color: "#0891B2" },
  "Recovery Agent": { Icon: HeartPulse, color: "#059669" },
  "Emergency Agent": { Icon: ShieldAlert, color: "#DC2626" },
};

const ROUTE_TO_AGENT: Record<string, AgentName> = {
  medications: "Medication Agent",
  recovery: "Recovery Agent",
  emergency: "Emergency Agent",
  confer: "Medication Agent",
  blocked: "Medication Agent",
};

const BACKEND_URL = "http://localhost:8000";

// ── Message row (Slack-style) ─────────────────────────────────────────────────

function MessageRow({ msg }: { msg: LoungeMessage }) {
  if (msg.agent === "user") {
    return (
      <div className="flex items-start gap-3 px-4 py-3 hover:bg-[#F8FAFC]">
        <div className="w-9 h-9 rounded-full bg-[#64748B] flex items-center justify-center shrink-0">
          <User size={16} className="text-white" />
        </div>
        <div>
          <div className="flex items-baseline gap-2 mb-0.5">
            <span className="text-sm font-semibold text-[#64748B]">You</span>
            <span className="text-xs text-[#94A3B8]">{formatTimestamp(msg.timestamp)}</span>
          </div>
          <p className="text-sm text-[#1E293B] leading-relaxed">{msg.text}</p>
        </div>
      </div>
    );
  }

  const cfg = AGENT_CONFIG[msg.agent as AgentName];
  if (!cfg) return null;
  const { Icon, color } = cfg;

  return (
    <div className="flex items-start gap-3 px-4 py-3 hover:bg-[#F8FAFC]">
      <div
        className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
        style={{ backgroundColor: color }}
      >
        <Icon size={16} className="text-white" />
      </div>
      <div>
        <div className="flex items-baseline gap-2 mb-0.5">
          <span className="text-sm font-semibold" style={{ color }}>
            {msg.agent}
          </span>
          <span className="text-xs text-[#94A3B8]">{formatTimestamp(msg.timestamp)}</span>
        </div>
        <p className="text-sm text-[#1E293B] leading-relaxed">{msg.text}</p>
      </div>
    </div>
  );
}

// ── CareTeamLounge ────────────────────────────────────────────────────────────

export function CareTeamLounge() {
  const loungeMessages = useAppStore((s) => s.loungeMessages);
  const addLoungeMessage = useAppStore((s) => s.addLoungeMessage);
  const isStreaming = useAppStore((s) => s.isStreaming);
  const setIsStreaming = useAppStore((s) => s.setIsStreaming);
  const addActivity = useAppStore((s) => s.addActivity);
  const setPulse = useAppStore((s) => s.setPulse);
  const [input, setInput] = useState("");
  const [muted, setMuted] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const { isRecording, startRecording, stopRecording } = useMicrophone();

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [loungeMessages, isStreaming]);

  async function submitQuery(query: string) {
    if (!query || isStreaming) return;

    setInput("");
    addLoungeMessage({ id: crypto.randomUUID(), agent: "user", text: query, timestamp: Date.now() });
    setIsStreaming(true);

    try {
      const data = await apiFetch<{
        audio_text: string;
        audio_base64: string | null;
        route: string;
        off_topic: boolean;
        ui_trigger: string;
      }>("/api/orchestrate", {
        method: "POST",
        body: JSON.stringify({ query }),
      });

      const agentName = ROUTE_TO_AGENT[data.route] ?? "Medication Agent";
      const turnId = crypto.randomUUID();

      addLoungeMessage({ id: turnId, agent: agentName, text: data.audio_text, timestamp: Date.now() });
      addActivity({
        id: turnId,
        timestamp: Date.now(),
        route: data.route as ActivityRoute,
        audio_text: data.audio_text,
        off_topic: data.off_topic,
      });

      // Play TTS audio if available and not muted
      if (data.audio_base64 && !muted) {
        try {
          const audioBytes = Uint8Array.from(atob(data.audio_base64), (c) => c.charCodeAt(0));
          const blob = new Blob([audioBytes], { type: "audio/mpeg" });
          const url = URL.createObjectURL(blob);
          const audio = new Audio(url);
          audio.onended = () => URL.revokeObjectURL(url);
          audio.play();
        } catch (err) {
          console.error("[TTS] Audio playback failed:", err);
        }
      }

      // Pulse the relevant sidebar room
      const TRIGGER_PULSE: Record<string, RoomId[]> = {
        highlight_medications: ["medication-room"],
        highlight_restrictions: ["recovery-room"],
        highlight_warnings: ["emergency-room"],
        highlight_both: ["medication-room", "recovery-room"],
      };
      for (const roomId of TRIGGER_PULSE[data.ui_trigger] ?? []) {
        setPulse(roomId, true);
        setTimeout(() => setPulse(roomId, false), 3200);
      }
    } catch {
      addLoungeMessage({
        id: crypto.randomUUID(),
        agent: "Medication Agent",
        text: "Sorry, I couldn't reach the care team right now. Please try again.",
        timestamp: Date.now(),
      });
    } finally {
      setIsStreaming(false);
    }
  }

  function submit() {
    submitQuery(input.trim());
  }

  async function toggleMic() {
    if (isRecording) {
      // Stop recording → transcribe → submit
      const blob = await stopRecording();
      setIsTranscribing(true);

      try {
        const formData = new FormData();
        formData.append("file", blob, "recording.webm");

        const res = await fetch(`${BACKEND_URL}/api/transcribe`, {
          method: "POST",
          body: formData,
        });
        const data = await res.json();

        if (data.status === "success" && data.text) {
          submitQuery(data.text);
        }
      } catch (err) {
        console.error("[Mic] Transcription failed:", err);
      } finally {
        setIsTranscribing(false);
      }
    } else {
      // Start recording
      startRecording();
    }
  }

  if (loungeMessages.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-[#0891B2] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-[#64748B]">Connecting to care team…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-[#E2E8F0] shrink-0">
        <div>
          <h2 className="text-xl font-semibold text-[#1E293B]">Care Team Lounge</h2>
          <p className="text-sm text-[#64748B]">Your care team discusses your plan here</p>
        </div>
        <button
          onClick={() => setMuted((m) => !m)}
          className="p-2 rounded-lg text-[#64748B] hover:text-[#0891B2] hover:bg-[#F0FDFA] transition-colors"
          title={muted ? "Unmute" : "Mute"}
        >
          {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
        </button>
      </div>

      {/* Feed */}
      <div className="flex-1 overflow-y-auto py-2">
        {loungeMessages.map((msg) => (
          <MessageRow key={msg.id} msg={msg} />
        ))}

        {isStreaming && (
          <div className="flex items-start gap-3 px-4 py-3">
            <div className="w-9 h-9 rounded-full bg-[#0891B2] flex items-center justify-center shrink-0 typing-pulse">
              <Pill size={16} className="text-white" />
            </div>
            <div className="flex gap-1 items-center h-9">
              <span className="w-1.5 h-1.5 rounded-full bg-[#94A3B8] typing-pulse" style={{ animationDelay: "0ms" }} />
              <span className="w-1.5 h-1.5 rounded-full bg-[#94A3B8] typing-pulse" style={{ animationDelay: "300ms" }} />
              <span className="w-1.5 h-1.5 rounded-full bg-[#94A3B8] typing-pulse" style={{ animationDelay: "600ms" }} />
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Recording status banner */}
      {(isRecording || isTranscribing) && (
        <div className={`px-6 py-2 text-center text-xs font-medium tracking-wide ${isRecording
          ? "bg-red-50 text-red-600 border-t border-red-100"
          : "bg-amber-50 text-amber-600 border-t border-amber-100"
          }`}>
          {isRecording ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              Recording — click 🎤 again to stop
            </span>
          ) : (
            <span className="flex items-center justify-center gap-2">
              <span className="w-3 h-3 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
              Transcribing your voice…
            </span>
          )}
        </div>
      )}

      {/* Input */}
      <div className="px-6 py-4 border-t border-[#E2E8F0] shrink-0">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder="Ask the care team..."
            className="flex-1 px-4 py-2.5 rounded-lg border border-[#E2E8F0] text-sm text-[#1E293B] placeholder:text-[#94A3B8] outline-none focus:ring-2 focus:ring-[#0891B2]/30 focus:border-[#0891B2] transition-all duration-200 bg-white"
          />
          {/* Toggle mic button */}
          <button
            onClick={toggleMic}
            disabled={isStreaming || isTranscribing}
            className={`px-4 py-2.5 rounded-lg transition-all duration-200 flex items-center gap-1.5 ${isRecording
              ? "bg-red-500 hover:bg-red-600 text-white animate-pulse shadow-lg shadow-red-500/30"
              : "bg-[#F1F5F9] hover:bg-[#E2E8F0] text-[#64748B] hover:text-[#0891B2]"
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            title={isRecording ? "Stop recording" : "Start recording"}
          >
            <Mic size={16} />
          </button>
          <button
            onClick={submit}
            disabled={isStreaming}
            className="px-4 py-2.5 bg-[#0891B2] hover:bg-[#0E7490] disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors duration-200 flex items-center gap-1.5"
          >
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
