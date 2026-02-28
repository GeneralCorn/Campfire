"use client"

import { useRef, useCallback } from "react"
import { useAppStore } from "@/stores/useAppStore"
import { playChunk } from "./useAudio"
import type { AgentId } from "@/types"

const WS_URL = "ws://localhost:8001/ws/debate"
const AGENT_IDS: AgentId[] = ["scout", "critic", "synthesizer"]

export function useDebateWS() {
  const wsRef = useRef<WebSocket | null>(null)

  const connect = useCallback((topic: string) => {
    if (wsRef.current) wsRef.current.close()

    const {
      setDebateStatus,
      setSessionId,
      setAgentState,
      addDebateMessage,
      clearDebateTranscript,
    } = useAppStore.getState()

    clearDebateTranscript()
    // Reset all agent states
    for (const id of AGENT_IDS) {
      setAgentState(id, { confidence: 0, sentiment: "neutral", speaking: false, thinking: false, spokenMessage: "" })
    }

    const ws = new WebSocket(WS_URL)
    wsRef.current = ws

    ws.onopen = () => {
      setDebateStatus("running")
      ws.send(JSON.stringify({ topic }))
    }

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data as string)

      switch (data.type) {
        case "system":
          if (data.session_id) setSessionId(data.session_id)
          if (data.message === "Debate concluded.") {
            setDebateStatus("complete")
            for (const id of AGENT_IDS) {
              setAgentState(id, { speaking: false, thinking: false })
            }
          }
          addDebateMessage({
            id: crypto.randomUUID(),
            agentId: "system",
            content: data.message,
            timestamp: Date.now(),
          })
          break

        case "agent_thinking":
          // Clear all other agents' active states
          for (const id of AGENT_IDS) {
            if (id !== data.agent_id) {
              setAgentState(id, { speaking: false, thinking: false })
            }
          }
          setAgentState(data.agent_id as AgentId, { thinking: true, speaking: false })
          break

        case "agent_metadata":
          setAgentState(data.agent_id as AgentId, {
            thinking: false,
            confidence: data.confidence,
            sentiment: data.sentiment,
            spokenMessage: data.spoken_message,
          })
          addDebateMessage({
            id: crypto.randomUUID(),
            agentId: data.agent_id as AgentId,
            content: data.spoken_message,
            timestamp: Date.now(),
          })
          break

        case "audio_chunk":
          setAgentState(data.agent_id as AgentId, { speaking: true, thinking: false })
          playChunk(data.agent_id as string, data.audio_b64 as string)
          break

        case "error":
          console.error("[Debate WS]", data.message)
          break
      }
    }

    ws.onerror = () => {
      setDebateStatus("idle")
    }

    ws.onclose = () => {
      // status managed by message handlers
    }
  }, [])

  const disconnect = useCallback(() => {
    wsRef.current?.close()
    wsRef.current = null
  }, [])

  return { connect, disconnect }
}
