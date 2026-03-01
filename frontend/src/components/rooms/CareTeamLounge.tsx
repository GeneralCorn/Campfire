"use client";

import { useRef, useEffect } from "react";
import { User, AlertCircle } from "lucide-react";
import { useAppStore } from "@/stores/useAppStore";
import { useTeamChat } from "@/hooks/useSSE";
import { TaskInput } from "@/components/team-room/TaskInput";
import { PipelineGraph } from "@/components/debate/PipelineGraph";
import { ArtifactPanel } from "@/components/debate/ArtifactPanel";
import { Avatar } from "@/components/team-room/Avatar";
import type { Message, TeammateId } from "@/types";

const SUGGESTION_CHIPS = [
  "Can I take ibuprofen for shoulder pain?",
  "When can I lift my arm above my head again?",
  "What signs of infection should I watch for?",
  "Is it normal to have numbness near the incision?",
];

// ── Agent display config ──────────────────────────────────────────────────────

const AGENT_COLOR: Record<TeammateId, string> = {
  maya: "#4ECDC4",
  rex:  "#FF6B6B",
  sol:  "#FFE66D",
};

const AGENT_LABEL: Record<TeammateId, string> = {
  maya: "Maya · Researcher",
  rex:  "Rex · Safety Checker",
  sol:  "Sol · Synthesizer",
};

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// ── Message rows ──────────────────────────────────────────────────────────────

function AgentRow({ msg }: { msg: Message }) {
  const sender = msg.sender as TeammateId;
  const color = AGENT_COLOR[sender] ?? "#888";
  const label = AGENT_LABEL[sender] ?? sender;

  return (
    <div className="flex items-start gap-3 px-5 py-3 hover:bg-[#F8FAFC]">
      <div className="shrink-0 mt-0.5">
        <Avatar
          teammateId={sender}
          state={msg.isStreaming ? "talking" : "idle"}
          size="sm"
        />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 mb-0.5">
          <span className="text-sm font-semibold" style={{ color }}>{label}</span>
          <span className="text-[10px] text-[#94A3B8]">{formatTime(msg.timestamp)}</span>
          {msg.isStreaming && (
            <span className="text-[10px] text-[#94A3B8] animate-pulse">●</span>
          )}
        </div>
        <p className="text-sm text-[#1E293B] leading-relaxed whitespace-pre-wrap">{msg.content}</p>
      </div>
    </div>
  );
}

function UserRow({ msg }: { msg: Message }) {
  return (
    <div className="flex items-start gap-3 px-5 py-3 hover:bg-[#F8FAFC]">
      <div className="w-7 h-7 rounded-full bg-[#64748B] flex items-center justify-center shrink-0 mt-0.5">
        <User size={14} className="text-white" />
      </div>
      <div>
        <div className="flex items-baseline gap-2 mb-0.5">
          <span className="text-sm font-semibold text-[#64748B]">You</span>
          <span className="text-[10px] text-[#94A3B8]">{formatTime(msg.timestamp)}</span>
        </div>
        <p className="text-sm text-[#1E293B] leading-relaxed">{msg.content}</p>
      </div>
    </div>
  );
}

function SystemRow({ msg }: { msg: Message }) {
  return (
    <div className="flex items-start gap-3 px-5 py-2">
      <AlertCircle size={14} className="text-[#DC2626] shrink-0 mt-0.5" />
      <p className="text-xs text-[#DC2626]">{msg.content}</p>
    </div>
  );
}

function MessageRow({ msg }: { msg: Message }) {
  if (msg.sender === "user") return <UserRow msg={msg} />;
  if (msg.sender === "system") return <SystemRow msg={msg} />;
  return <AgentRow msg={msg} />;
}

// ── CareTeamLounge ────────────────────────────────────────────────────────────

export function CareTeamLounge() {
  const messages = useAppStore((s) => s.messages);
  const isStreaming = useAppStore((s) => s.isStreaming);
  const discharge = useAppStore((s) => s.discharge);
  const loungeMessages = messages.filter(
    (m) => m.channel === "team-room" || m.channel === "debate"
  );

  const bottomRef = useRef<HTMLDivElement>(null);
  const { sendTask } = useTeamChat();

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [loungeMessages.length, isStreaming]);

  function sendChip(text: string) {
    if (isStreaming) return;
    useAppStore.getState().addMessage({
      id: `user-${Date.now()}`,
      sender: "user",
      content: text,
      timestamp: Date.now(),
      channel: useAppStore.getState().activeChannel,
    });
    sendTask(text, []);
  }

  // Personalized subtitle from procedure
  const procedure = discharge?.patient_profile.procedure;
  const procShort = procedure
    ? procedure.split(" ").slice(0, 3).join(" ")
    : null;
  const idleSubtitle = procShort
    ? `Helping with ${procShort} — Maya, Rex & Sol are standing by`
    : "Ask anything — Maya, Rex & Sol will investigate";

  return (
    <div className="flex h-full bg-white">
      {/* ── Left: chat feed ── */}
      <div className="flex-1 flex flex-col min-w-0 border-r border-[#E2E8F0]">
        {/* Header */}
        <div className="flex items-center gap-3 px-5 h-14 border-b border-[#E2E8F0] shrink-0">
          <div className="flex -space-x-1">
            {(["maya", "rex", "sol"] as TeammateId[]).map((id) => (
              <Avatar key={id} teammateId={id} size="sm" state="idle" />
            ))}
          </div>
          <div>
            <div className="text-sm font-semibold text-[#1E293B]">Care Team Lounge</div>
            <div className="text-[11px] text-[#64748B]">
              {isStreaming ? "Team is analyzing…" : idleSubtitle}
            </div>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto py-2">
          {loungeMessages.length === 0 && !isStreaming ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-8">
              <div className="flex -space-x-2 mb-4">
                {(["maya", "rex", "sol"] as TeammateId[]).map((id) => (
                  <Avatar key={id} teammateId={id} size="md" state="idle" />
                ))}
              </div>
              <p className="text-sm font-medium text-[#1E293B] mb-1">Your research team is ready</p>
              <p className="text-xs text-[#64748B] mb-4">Try asking:</p>
              <div className="grid grid-cols-2 gap-2 max-w-[320px]">
                {SUGGESTION_CHIPS.map((chip) => (
                  <button
                    key={chip}
                    onClick={() => sendChip(chip)}
                    className="px-3 py-2 rounded-full border border-[#CBD5E1] bg-white text-xs text-[#1E293B] text-left hover:border-[#0891B2] hover:text-[#0891B2] hover:bg-[#F0FDFA] transition-colors leading-snug"
                  >
                    {chip}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            loungeMessages.map((msg) => <MessageRow key={msg.id} msg={msg} />)
          )}

          {isStreaming && loungeMessages[loungeMessages.length - 1]?.sender !== "system" && (
            <div className="flex items-center gap-3 px-5 py-3">
              <div className="flex gap-1 items-center">
                <span className="w-1.5 h-1.5 rounded-full bg-[#94A3B8] animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="w-1.5 h-1.5 rounded-full bg-[#94A3B8] animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="w-1.5 h-1.5 rounded-full bg-[#94A3B8] animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
              <span className="text-xs text-[#94A3B8]">Team is working…</span>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Input — reuse TaskInput which handles voice, streaming state, interrupt */}
        <div className="border-t border-[#E2E8F0] shrink-0">
          <TaskInput />
        </div>
      </div>

      {/* ── Right: PipelineGraph + artifacts ── */}
      <div className="w-[340px] shrink-0 bg-[#F8FAFC] border-l border-[#E2E8F0] flex flex-col">
        <div className="flex-1 min-h-0">
          <PipelineGraph />
        </div>
        <ArtifactPanel />
      </div>
    </div>
  );
}
