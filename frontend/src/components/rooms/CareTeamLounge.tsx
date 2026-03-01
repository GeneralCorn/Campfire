"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Send, Users } from "lucide-react";
import { useAppStore } from "@/stores/useAppStore";

/* ── Agent defs ────────────────────────────────────────────────────────── */

const AGENTS = [
  { id: "medication", label: "Medication", initial: "M" },
  { id: "recovery", label: "Recovery", initial: "R" },
  { id: "emergency", label: "Emergency", initial: "E" },
] as const;

interface DiscussionEntry {
  agentId: string;
  label: string;
  text: string;
}

/* ── Component ─────────────────────────────────────────────────────────── */

export function CareTeamLounge() {
  const discharge = useAppStore((s) => s.discharge);
  const [topic, setTopic] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [activeAgent, setActiveAgent] = useState<string | null>(null);
  const [discussion, setDiscussion] = useState<DiscussionEntry[]>([]);
  const feedRef = useRef<HTMLDivElement>(null);

  const scroll = useCallback(() =>
    feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight, behavior: "smooth" }), []);

  useEffect(() => { scroll(); }, [discussion, scroll]);

  async function handleStart() {
    const t = topic.trim();
    if (!t || isRunning) return;
    setIsRunning(true);
    setDiscussion([]);

    for (const agent of AGENTS) {
      setActiveAgent(agent.id);
      try {
        const res = await fetch("/api/orchestrate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            user_message: `As the ${agent.label} agent, share your perspective on: ${t}`,
            history: [],
            discharge_context: discharge,
            active_agent: agent.id,
          }),
        });
        const data = await res.json();
        setDiscussion((prev) => [...prev, {
          agentId: agent.id,
          label: agent.label,
          text: data.response || "No response.",
        }]);
      } catch {
        setDiscussion((prev) => [...prev, {
          agentId: agent.id,
          label: agent.label,
          text: "Unable to connect.",
        }]);
      }
    }
    setActiveAgent(null);
    setIsRunning(false);
  }

  return (
    <div className="flex flex-col h-full bg-[#09090b]">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 h-[52px] border-b border-white/[0.06] bg-[#111113] shrink-0">
        <Users size={16} className="text-[#6366f1]" />
        <div>
          <h2 className="text-[13px] font-semibold text-[#fafafa] tracking-[-0.01em]">Care Team Lounge</h2>
          <p className="text-[10px] text-[#52525b]">Submit a topic for multi-agent discussion</p>
        </div>
      </div>

      {/* Agent row */}
      <div className="flex items-center gap-5 px-5 py-3 border-b border-white/[0.04] bg-white/[0.01] shrink-0">
        {AGENTS.map((a) => (
          <div key={a.id} className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-semibold transition-all duration-300 ${activeAgent === a.id
                ? "bg-[#6366f1]/15 text-[#818cf8] ring-1 ring-[#6366f1]/30"
                : "bg-white/[0.04] text-[#52525b]"
              }`}>
              {a.initial}
            </div>
            <div>
              <span className="text-[11px] text-[#a1a1aa] block leading-none">{a.label}</span>
              <span className={`text-[9px] ${activeAgent === a.id ? "text-[#6366f1]" : "text-[#3f3f46]"}`}>
                {activeAgent === a.id ? "Thinking…" : "Online"}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Discussion feed */}
      <div ref={feedRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
        {discussion.length === 0 && !isRunning && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center max-w-[280px]">
              <div className="w-10 h-10 rounded-full bg-white/[0.03] flex items-center justify-center mx-auto mb-3">
                <Users size={16} className="text-[#3f3f46]" />
              </div>
              <p className="text-[12px] text-[#52525b] leading-relaxed">
                Enter a topic below to start a roundtable discussion with all three care agents.
              </p>
            </div>
          </div>
        )}

        {discussion.map((entry, i) => (
          <div
            key={i}
            className="rounded-lg border border-white/[0.06] bg-[#111113] p-3.5"
            style={{ animation: "fade-in 0.25s ease" }}
          >
            <div className="flex items-center gap-2 mb-2">
              <div className="w-5 h-5 rounded-full bg-[#6366f1]/10 flex items-center justify-center">
                <span className="text-[8px] font-bold text-[#818cf8]">
                  {entry.label.charAt(0)}
                </span>
              </div>
              <span className="text-[11px] font-medium text-[#a1a1aa]">{entry.label} Agent</span>
            </div>
            <p className="text-[12px] text-[#71717a] leading-[1.7] whitespace-pre-wrap">{entry.text}</p>
          </div>
        ))}

        {isRunning && activeAgent && (
          <div className="rounded-lg border border-white/[0.06] bg-[#111113] p-3.5 opacity-60">
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 rounded-full bg-[#6366f1]/10 flex items-center justify-center">
                <span className="text-[8px] font-bold text-[#818cf8]">
                  {AGENTS.find((a) => a.id === activeAgent)?.initial}
                </span>
              </div>
              <span className="text-[11px] text-[#52525b]">
                {AGENTS.find((a) => a.id === activeAgent)?.label} is thinking…
              </span>
              <span className="flex gap-0.5 ml-1">
                {[0, 150, 300].map((d) => (
                  <span key={d} className="w-1 h-1 rounded-full bg-[#6366f1]/40 typing-pulse" style={{ animationDelay: `${d}ms` }} />
                ))}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Topic input */}
      <div className="px-4 pb-3 pt-2 bg-[#09090b] border-t border-white/[0.04] shrink-0">
        <div className="flex items-center gap-2 rounded-lg bg-[#111113] border border-white/[0.06] focus-within:border-[#6366f1]/25 transition-colors p-1">
          <input
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleStart()}
            placeholder="Enter a topic for the care team…"
            disabled={isRunning}
            className="flex-1 bg-transparent text-[13px] text-[#fafafa] placeholder:text-[#3f3f46] outline-none px-3 py-2"
          />
          <button
            onClick={handleStart}
            disabled={!topic.trim() || isRunning}
            className="flex items-center justify-center w-8 h-8 rounded-md bg-[#6366f1] hover:bg-[#818cf8] text-white disabled:opacity-20 transition-all duration-150 shrink-0"
          >
            <Send size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}
