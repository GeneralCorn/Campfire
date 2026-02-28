"use client"

import { useRef, useEffect, useState } from "react"
import { useAppStore } from "@/stores/useAppStore"
import { agentList, agents } from "@/lib/agents"
import { AgentCard } from "./AgentCard"
import { useDebateWS } from "@/hooks/useDebateWS"
import { initAudio } from "@/hooks/useAudio"
import { Radio, Send } from "lucide-react"
import type { AgentId } from "@/types"

export function DebateRoom() {
  const [topic, setTopic] = useState("")
  const debateStatus = useAppStore((s) => s.debateStatus)
  const sessionId = useAppStore((s) => s.sessionId)
  const agentStates = useAppStore((s) => s.agentStates)
  const transcript = useAppStore((s) => s.debateTranscript)
  const bottomRef = useRef<HTMLDivElement>(null)
  const { connect } = useDebateWS()

  // Auto-scroll transcript
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [transcript])

  function handleStart() {
    if (!topic.trim() || debateStatus === "running") return
    initAudio() // must be inside user gesture
    connect(topic.trim())
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 h-12 border-b border-white/[0.06] border-t-2 border-t-broadcast shrink-0">
        <div className="flex items-center gap-2">
          <Radio size={16} className="text-text-dim" />
          <span className="font-bold text-sm">debate-room</span>
          {debateStatus === "running" && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-danger/20 text-danger border border-danger/30">
              <span className="h-1.5 w-1.5 rounded-full bg-danger animate-live-dot" />
              LIVE
            </span>
          )}
          {debateStatus === "complete" && (
            <span className="text-[9px] font-mono text-text-dim border border-white/[0.06] px-1.5 py-0.5 rounded">
              CONCLUDED
            </span>
          )}
        </div>
        {sessionId && (
          <span className="text-[10px] font-mono text-text-dim">
            {sessionId.slice(0, 8)}…
          </span>
        )}
      </div>

      {/* Agent cards */}
      <div className="grid grid-cols-3 gap-3 p-3 border-b border-white/[0.06] shrink-0">
        {agentList.map((agent) => (
          <AgentCard key={agent.id} id={agent.id} state={agentStates[agent.id]} />
        ))}
      </div>

      {/* Transcript */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {transcript.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="text-4xl mb-3 opacity-20">🎙️</div>
            <p className="text-sm text-text-secondary">Enter a topic and start the debate</p>
            <p className="text-xs text-text-dim mt-1">
              Scout, Critic, and Synthesizer will argue it out in real time
            </p>
          </div>
        )}

        {transcript.map((msg) => {
          if (msg.agentId === "system") {
            return (
              <div key={msg.id} className="text-center text-[11px] font-mono text-text-dim py-1">
                — {msg.content} —
              </div>
            )
          }
          const agent = agents[msg.agentId as AgentId]
          return (
            <div key={msg.id} className="flex items-start gap-3 animate-slide-up">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`https://api.dicebear.com/7.x/personas/svg?seed=${agent.name}&backgroundColor=171717`}
                alt={agent.name}
                className="w-8 h-8 rounded-full shrink-0 mt-0.5"
                style={{ border: `1px solid ${agent.colorHex}30` }}
              />
              <div>
                <div className="flex items-baseline gap-2 mb-0.5">
                  <span className="text-sm font-bold" style={{ color: agent.colorHex }}>
                    {agent.name}
                  </span>
                  <span className="text-[10px] font-mono text-text-dim">
                    {new Date(msg.timestamp).toLocaleTimeString([], {
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
                <p className="text-sm text-text-secondary leading-relaxed">{msg.content}</p>
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {/* Topic input bar */}
      <div className="shrink-0 p-3 border-t border-white/[0.06] bg-surface-1/50">
        <div className="flex gap-2">
          <input
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleStart()}
            disabled={debateStatus === "running"}
            placeholder={
              debateStatus === "running"
                ? "Debate in progress…"
                : debateStatus === "complete"
                ? "Start a new debate…"
                : "Enter a debate topic…"
            }
            className="flex-1 px-3 py-2 rounded bg-surface-3 border border-white/[0.06] text-sm text-text-primary placeholder:text-text-dim focus:outline-none focus:border-broadcast/40 disabled:opacity-50 transition-colors"
          />
          <button
            onClick={handleStart}
            disabled={!topic.trim() || debateStatus === "running"}
            className="flex items-center gap-2 px-4 py-2 rounded text-sm font-medium bg-broadcast/20 text-broadcast border border-broadcast/30 hover:bg-broadcast/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Send size={14} />
            {debateStatus === "running" ? "Live" : "Start"}
          </button>
        </div>
      </div>
    </div>
  )
}
