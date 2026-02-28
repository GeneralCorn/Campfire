"use client"

import { agents } from "@/lib/agents"
import { getAnalyser } from "@/hooks/useAudio"
import { Waveform } from "./Waveform"
import type { AgentId, AgentState } from "@/types"

const SENTIMENT_COLORS: Record<string, string> = {
  analytical:   "#5865f2",
  confident:    "#57f287",
  skeptical:    "#fee75c",
  negative:     "#ed4245",
  disagreement: "#ed4245",
  neutral:      "#4f545c",
}

interface AgentCardProps {
  id: AgentId
  state: AgentState
  onClick?: () => void
  selected?: boolean
  compact?: boolean
}

export function AgentCard({ id, state, onClick, selected, compact }: AgentCardProps) {
  const agent = agents[id]
  const sentimentColor = SENTIMENT_COLORS[state.sentiment] ?? "#4f545c"
  const ringColor = state.speaking ? sentimentColor : agent.colorHex

  const avatarUrl = `https://api.dicebear.com/7.x/personas/svg?seed=${agent.name}&backgroundColor=171717`

  return (
    <div
      onClick={onClick}
      className={`relative flex flex-col items-center gap-2 p-3 rounded-lg transition-all duration-300 ${
        onClick ? "cursor-pointer hover:bg-white/[0.03]" : ""
      }`}
      style={{
        background: `linear-gradient(to bottom, ${agent.colorHex}08, rgba(255,255,255,0.015))`,
        border: selected
          ? `1px solid ${agent.colorHex}60`
          : "1px solid rgba(255,255,255,0.06)",
        boxShadow: selected ? `0 0 16px ${agent.colorHex}20` : "none",
      }}
    >
      {/* Avatar with glow ring */}
      <div className="relative">
        {/* Outer pulsing ring */}
        {state.speaking && (
          <div
            className="absolute -inset-2 rounded-full animate-talk-pulse"
            style={{ border: `2px solid ${sentimentColor}40` }}
          />
        )}
        {state.thinking && (
          <div
            className="absolute -inset-2 rounded-full animate-think-pulse"
            style={{ border: `1px solid ${agent.colorHex}30` }}
          />
        )}

        <div
          className="w-14 h-14 rounded-full overflow-hidden"
          style={{
            border: `2px solid ${ringColor}50`,
            boxShadow: state.speaking
              ? `0 0 20px ${sentimentColor}50, 0 0 8px ${sentimentColor}25`
              : state.thinking
              ? `0 0 12px ${agent.colorHex}25`
              : "none",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={avatarUrl} alt={agent.name} className="w-full h-full" />
        </div>
      </div>

      {/* Name + role */}
      <div className="text-center">
        <div className="text-sm font-bold" style={{ color: agent.colorHex }}>
          {agent.name}
        </div>
        <div className="text-[10px] font-mono text-text-dim uppercase tracking-wider">
          {agent.role}
        </div>
      </div>

      {/* State indicator */}
      <div className="text-[10px] font-mono text-text-dim">
        {state.thinking ? "◌ thinking..." : state.speaking ? "● speaking" : "○ idle"}
      </div>

      {!compact && (
        <>
          {/* Confidence bar */}
          <div className="w-full">
            <div className="flex justify-between text-[9px] font-mono text-text-dim mb-1">
              <span>confidence</span>
              <span>{Math.round(state.confidence * 100)}%</span>
            </div>
            <div className="h-1 rounded-full bg-white/[0.06]">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{
                  width: `${state.confidence * 100}%`,
                  backgroundColor: sentimentColor,
                  boxShadow: `0 0 6px ${sentimentColor}50`,
                }}
              />
            </div>
          </div>

          {/* Sentiment badge */}
          {state.sentiment && state.sentiment !== "neutral" && (
            <span
              className="text-[9px] font-mono px-1.5 py-0.5 rounded border"
              style={{
                color: sentimentColor,
                borderColor: sentimentColor + "40",
                backgroundColor: sentimentColor + "12",
              }}
            >
              {state.sentiment}
            </span>
          )}

          {/* Waveform */}
          <div className="w-full">
            <Waveform
              analyser={getAnalyser(id)}
              color={sentimentColor}
              active={state.speaking}
            />
          </div>
        </>
      )}
    </div>
  )
}
