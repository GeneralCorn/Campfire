"use client"

import { useRef, useEffect, useState, useCallback } from "react"
import { useAppStore } from "@/stores/useAppStore"
import { agentList, agents } from "@/lib/agents"
import { AgentCard } from "./AgentCard"
import { useDebriefWS } from "@/hooks/useDebriefWS"
import { Mic, Send, Headphones } from "lucide-react"
import type { AgentId } from "@/types"

export function DebriefRoom() {
  const sessionId = useAppStore((s) => s.sessionId)
  const debateStatus = useAppStore((s) => s.debateStatus)
  const agentStates = useAppStore((s) => s.agentStates)
  const debriefLog = useAppStore((s) => s.debriefLog)
  const selectedDebriefAgent = useAppStore((s) => s.selectedDebriefAgent)
  const setSelectedDebriefAgent = useAppStore((s) => s.setSelectedDebriefAgent)
  const addDebriefMessage = useAppStore((s) => s.addDebriefMessage)

  const [question, setQuestion] = useState("")
  const [connected, setConnected] = useState(false)
  const [isRecording, setIsRecording] = useState(false)

  const bottomRef = useRef<HTMLDivElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])

  const { connect, send, disconnect, isConnected } = useDebriefWS()

  // Auto-scroll log
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [debriefLog])

  function handleConnect() {
    if (!sessionId) return
    connect(sessionId)
    setConnected(true)
  }

  function handleDisconnect() {
    disconnect()
    setConnected(false)
  }

  function sendQuestion(q: string) {
    if (!q.trim() || !isConnected()) return
    addDebriefMessage({
      id: crypto.randomUUID(),
      role: "user",
      content: q.trim(),
      timestamp: Date.now(),
    })
    send(q.trim(), selectedDebriefAgent)
    setQuestion("")
  }

  const recordingStartRef = useRef<number>(0)

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" })
      chunksRef.current = []
      recordingStartRef.current = Date.now()

      // timeslice=250ms ensures data arrives in chunks rather than one burst at stop
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop())
        const duration = Date.now() - recordingStartRef.current

        // Drop clips under 500ms — Deepgram will return empty on silence blips
        if (duration < 500 || chunksRef.current.length === 0) {
          console.warn("[Recording] Too short, discarding.")
          return
        }

        const blob = new Blob(chunksRef.current, { type: "audio/webm" })
        const formData = new FormData()
        formData.append("file", blob, "recording.webm")
        try {
          const res = await fetch("http://localhost:8001/api/transcribe", {
            method: "POST",
            body: formData,
          })
          const data = await res.json() as { transcript?: string; error?: string }
          if (data.transcript) {
            sendQuestion(data.transcript)
          } else {
            console.warn("[Transcribe] No speech detected:", data.error)
          }
        } catch (e) {
          console.error("Transcription failed", e)
        }
      }

      recorder.start(250) // collect data every 250ms
      mediaRecorderRef.current = recorder
      setIsRecording(true)
    } catch (e) {
      console.error("Microphone access denied", e)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDebriefAgent, isConnected])

  function stopRecording() {
    mediaRecorderRef.current?.stop()
    mediaRecorderRef.current = null
    setIsRecording(false)
  }

  if (debateStatus !== "complete") {
    return (
      <div className="flex flex-col h-full items-center justify-center text-center p-8">
        <div className="text-4xl mb-4 opacity-20">🔒</div>
        <p className="text-sm text-text-secondary">Debrief room unlocks after a debate completes</p>
        <p className="text-xs text-text-dim mt-1">Go to # debate-room and start a debate first</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 h-12 border-b border-white/[0.06] border-t-2 border-t-mika shrink-0">
        <div className="flex items-center gap-2">
          <Headphones size={16} className="text-text-dim" />
          <span className="font-bold text-sm">debrief-room</span>
          {connected && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-live/15 text-live border border-live/25">
              <span className="h-1.5 w-1.5 rounded-full bg-live animate-live-dot" />
              CONNECTED
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {sessionId && (
            <span className="text-[10px] font-mono text-text-dim">{sessionId.slice(0, 8)}…</span>
          )}
          {!connected ? (
            <button
              onClick={handleConnect}
              className="text-[11px] font-mono px-2 py-1 rounded bg-live/15 text-live border border-live/25 hover:bg-live/25 transition-colors"
            >
              Connect
            </button>
          ) : (
            <button
              onClick={handleDisconnect}
              className="text-[11px] font-mono px-2 py-1 rounded bg-white/[0.04] text-text-dim border border-white/[0.06] hover:bg-white/[0.07] transition-colors"
            >
              Disconnect
            </button>
          )}
        </div>
      </div>

      {/* Agent selector */}
      <div className="grid grid-cols-3 gap-3 p-3 border-b border-white/[0.06] shrink-0">
        {agentList.map((agent) => (
          <AgentCard
            key={agent.id}
            id={agent.id}
            state={agentStates[agent.id]}
            onClick={() => setSelectedDebriefAgent(agent.id)}
            selected={selectedDebriefAgent === agent.id}
            compact
          />
        ))}
      </div>

      {/* Debrief Q&A log */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {!connected && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="text-4xl mb-3 opacity-20">💬</div>
            <p className="text-sm text-text-secondary">Connect to start interrogating the agents</p>
            <p className="text-xs text-text-dim mt-1">
              Session <span className="font-mono">{sessionId?.slice(0, 8)}…</span> is ready
            </p>
          </div>
        )}

        {debriefLog.map((msg) => {
          const isUser = msg.role === "user"
          if (isUser) {
            return (
              <div key={msg.id} className="flex justify-end animate-slide-up">
                <div className="max-w-[70%] px-3 py-2 rounded-lg bg-broadcast/15 border border-broadcast/20">
                  <p className="text-sm text-text-primary">{msg.content}</p>
                  <div className="text-[9px] font-mono text-text-dim mt-1 text-right">
                    asking {selectedDebriefAgent} ·{" "}
                    {new Date(msg.timestamp).toLocaleTimeString([], {
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </div>
                </div>
              </div>
            )
          }
          const agent = agents[msg.role as AgentId]
          return (
            <div key={msg.id} className="flex items-start gap-3 animate-slide-up">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`https://api.dicebear.com/7.x/personas/svg?seed=${agent.name}&backgroundColor=171717`}
                alt={agent.name}
                className="w-8 h-8 rounded-full shrink-0 mt-0.5"
                style={{ border: `1px solid ${agent.colorHex}30` }}
              />
              <div className="flex-1">
                <div className="flex items-baseline gap-2 mb-0.5">
                  <span className="text-sm font-bold" style={{ color: agent.colorHex }}>
                    {agent.name}
                  </span>
                  {msg.sentiment && (
                    <span className="text-[9px] font-mono text-text-dim">{msg.sentiment}</span>
                  )}
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

      {/* Input bar */}
      <div className="shrink-0 p-3 border-t border-white/[0.06] bg-surface-1/50">
        <div className="flex items-center gap-1 mb-2">
          <span className="text-[10px] font-mono text-text-dim">Asking</span>
          <span
            className="text-[10px] font-mono font-bold"
            style={{ color: agents[selectedDebriefAgent].colorHex }}
          >
            {selectedDebriefAgent}
          </span>
        </div>
        <div className="flex gap-2">
          {/* Mic button */}
          <button
            onMouseDown={startRecording}
            onMouseUp={stopRecording}
            onTouchStart={startRecording}
            onTouchEnd={stopRecording}
            disabled={!connected}
            className={`flex items-center justify-center w-9 h-9 rounded shrink-0 border transition-all ${
              isRecording
                ? "bg-danger/30 border-danger/50 text-danger animate-talk-pulse"
                : "bg-white/[0.04] border-white/[0.06] text-text-dim hover:text-text-primary hover:bg-white/[0.07]"
            } disabled:opacity-40 disabled:cursor-not-allowed`}
          >
            <Mic size={14} />
          </button>

          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendQuestion(question)}
            disabled={!connected}
            placeholder={connected ? `Ask ${selectedDebriefAgent}…` : "Connect first"}
            className="flex-1 px-3 py-2 rounded bg-surface-3 border border-white/[0.06] text-sm text-text-primary placeholder:text-text-dim focus:outline-none focus:border-broadcast/40 disabled:opacity-50 transition-colors"
          />

          <button
            onClick={() => sendQuestion(question)}
            disabled={!question.trim() || !connected}
            className="flex items-center gap-1.5 px-3 py-2 rounded text-sm font-medium bg-broadcast/20 text-broadcast border border-broadcast/30 hover:bg-broadcast/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Send size={14} />
          </button>
        </div>

        {isRecording && (
          <div className="mt-1.5 text-[10px] font-mono text-danger animate-pulse">
            ● Recording… release to send
          </div>
        )}
      </div>
    </div>
  )
}
