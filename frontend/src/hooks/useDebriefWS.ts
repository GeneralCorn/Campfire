"use client"

import { useRef, useCallback } from "react"
import { useAppStore } from "@/stores/useAppStore"
import { playChunk } from "./useAudio"
import type { AgentId } from "@/types"

export function useDebriefWS() {
  const wsRef = useRef<WebSocket | null>(null)

  const connect = useCallback((sessionId: string) => {
    if (wsRef.current) wsRef.current.close()

    const { setAgentState, addDebriefMessage, clearDebriefLog } = useAppStore.getState()

    clearDebriefLog()

    const ws = new WebSocket(`ws://localhost:8001/ws/debrief/${sessionId}`)
    wsRef.current = ws

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data as string)

      switch (data.type) {
        case "ready":
          // Connected and ready
          break

        case "agent_thinking":
          setAgentState(data.agent_id as AgentId, { thinking: true, speaking: false })
          break

        case "agent_metadata":
          setAgentState(data.agent_id as AgentId, {
            thinking: false,
            confidence: data.confidence,
            sentiment: data.sentiment,
            spokenMessage: data.spoken_message,
          })
          break

        case "audio_chunk":
          setAgentState(data.agent_id as AgentId, { speaking: true, thinking: false })
          playChunk(data.agent_id as string, data.audio_b64 as string)
          break

        case "debrief_complete":
          setAgentState(useAppStore.getState().selectedDebriefAgent, { speaking: false, thinking: false })
          addDebriefMessage({
            id: crypto.randomUUID(),
            role: useAppStore.getState().selectedDebriefAgent,
            content: data.transcript as string,
            timestamp: Date.now(),
          })
          break

        case "error":
          console.error("[Debrief WS]", data.message)
          break
      }
    }

    ws.onerror = (e) => console.error("[Debrief WS error]", e)
    ws.onclose = () => { /* let component handle UI */ }
  }, [])

  const send = useCallback((question: string, targetAgent: AgentId) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return
    wsRef.current.send(JSON.stringify({ question, target_agent: targetAgent }))
  }, [])

  const disconnect = useCallback(() => {
    wsRef.current?.close()
    wsRef.current = null
  }, [])

  const isConnected = useCallback(() =>
    wsRef.current?.readyState === WebSocket.OPEN, [])

  return { connect, send, disconnect, isConnected }
}
