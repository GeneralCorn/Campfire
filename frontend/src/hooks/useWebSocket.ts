"use client";

import { useCallback, useRef } from "react";
import { useAppStore } from "@/stores/useAppStore";
import { AGENT_TO_TEAMMATE, TEAMMATE_TO_AGENT } from "@/lib/teammates";
import { initAudio, playChunk, stopAll } from "@/lib/audio-player";
import type { TeammateId, TeammateState } from "@/types";

const ORCHESTRATOR_URL =
  process.env.NEXT_PUBLIC_ORCHESTRATOR_URL || "localhost:8001";

/** Map sentiment string from LLM to sprite state. Ported from useSSE.ts. */
function sentimentToState(sentiment: string | undefined): TeammateState {
  if (!sentiment) return "talking";
  const s = sentiment.toLowerCase();
  if (s === "skeptical" || s === "critical" || s === "analytical")
    return "reacting";
  if (s === "enthusiastic" || s === "supportive" || s === "excited")
    return "agreeing";
  if (s === "surprised" || s === "confused") return "interrupted";
  return "talking";
}

// ---------------------------------------------------------------------------
// useDebate — Team Room debate via /ws/debate
// ---------------------------------------------------------------------------

export function useDebate() {
  const wsRef = useRef<WebSocket | null>(null);
  const currentSpeakerRef = useRef<{
    teammateId: TeammateId;
    msgId: string;
  } | null>(null);

  const addMessage = useAppStore((s) => s.addMessage);
  const setTeammateState = useAppStore((s) => s.setTeammateState);
  const setMessageStreaming = useAppStore((s) => s.setMessageStreaming);
  const resetAllTeammateStates = useAppStore((s) => s.resetAllTeammateStates);
  const setIsStreaming = useAppStore((s) => s.setIsStreaming);
  const setIsLive = useAppStore((s) => s.setIsLive);
  const setCurrentSessionId = useAppStore((s) => s.setCurrentSessionId);
  const addSandboxEntry = useAppStore((s) => s.addSandboxEntry);
  const setCaptionText = useAppStore((s) => s.setCaptionText);

  /** Mark previous speaker's message as done and set them idle. */
  function finalizePreviousSpeaker() {
    const prev = currentSpeakerRef.current;
    if (prev) {
      setMessageStreaming(prev.msgId, false);
      setTeammateState(prev.teammateId, "idle");
      currentSpeakerRef.current = null;
    }
  }

  const startDebate = useCallback(
    (topic: string) => {
      // Close any existing connection
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }

      // Reset state
      currentSpeakerRef.current = null;
      setIsStreaming(true);
      setIsLive(true);

      // Add user message
      addMessage({
        id: `user-${Date.now()}`,
        sender: "user",
        content: topic,
        timestamp: Date.now(),
        channel: "team-room",
      });

      const ws = new WebSocket(`ws://${ORCHESTRATOR_URL}/ws/debate`);
      wsRef.current = ws;

      ws.onopen = () => {
        initAudio();
        ws.send(JSON.stringify({ topic }));
      };

      ws.onmessage = (event) => {
        let data: Record<string, unknown>;
        try {
          data = JSON.parse(event.data);
        } catch {
          return;
        }

        switch (data.type) {
          case "system": {
            if (data.session_id) {
              setCurrentSessionId(data.session_id as string);
            }
            if (
              (data.message as string)?.includes("Debate concluded")
            ) {
              finalizePreviousSpeaker();
              resetAllTeammateStates();
              setIsStreaming(false);
              setCaptionText("");
            }
            break;
          }

          case "agent_thinking": {
            const teammateId = AGENT_TO_TEAMMATE[data.agent_id as string];
            if (!teammateId) break;

            // Finalize previous speaker (turn boundary)
            finalizePreviousSpeaker();

            setTeammateState(teammateId, "thinking");

            addSandboxEntry({
              id: `sb-${Date.now()}-${Math.random()}`,
              teammateId,
              type: "log",
              text: `${teammateId} is thinking (Turn ${data.turn})...`,
              timestamp: Date.now(),
            });
            break;
          }

          case "agent_metadata": {
            const teammateId = AGENT_TO_TEAMMATE[data.agent_id as string];
            if (!teammateId) break;

            const sentiment = data.sentiment as string | undefined;
            const confidence = data.confidence as number | undefined;
            const spokenMessage = (data.spoken_message as string) || "";

            setTeammateState(teammateId, sentimentToState(sentiment));

            const msgId = `live-${teammateId}-${Date.now()}`;
            addMessage({
              id: msgId,
              sender: teammateId,
              content: spokenMessage,
              confidence,
              sentiment,
              timestamp: Date.now(),
              channel: "team-room",
              isStreaming: true,
            });

            // Show caption overlay for accessibility
            if (spokenMessage) setCaptionText(spokenMessage);

            currentSpeakerRef.current = { teammateId, msgId };
            break;
          }

          case "audio_chunk": {
            const audio = data.audio_b64 as string | undefined;
            if (audio) playChunk(audio);
            break;
          }

          case "error": {
            console.error("[Debate WS]", data.message);
            addMessage({
              id: `error-${Date.now()}`,
              sender: "system",
              content: `Error: ${data.message}`,
              timestamp: Date.now(),
              channel: "team-room",
            });
            break;
          }
        }
      };

      ws.onclose = () => {
        finalizePreviousSpeaker();
        resetAllTeammateStates();
        setIsStreaming(false);
        setCaptionText("");
        wsRef.current = null;
      };

      ws.onerror = (err) => {
        console.error("[Debate WS] Connection error", err);
      };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const interrupt = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    stopAll();
    currentSpeakerRef.current = null;
    resetAllTeammateStates();
    setIsStreaming(false);
  }, [resetAllTeammateStates, setIsStreaming]);

  return { startDebate, interrupt };
}

// ---------------------------------------------------------------------------
// useDebrief — Hangout 1:1 chat via /ws/debrief/{session_id}
// ---------------------------------------------------------------------------

export function useDebrief() {
  const wsRef = useRef<WebSocket | null>(null);
  const currentMsgRef = useRef<string | null>(null);
  const onCompleteRef = useRef<(() => void) | null>(null);

  const addMessage = useAppStore((s) => s.addMessage);
  const setTeammateState = useAppStore((s) => s.setTeammateState);
  const setMessageStreaming = useAppStore((s) => s.setMessageStreaming);
  const resetAllTeammateStates = useAppStore((s) => s.resetAllTeammateStates);
  const setCaptionText = useAppStore((s) => s.setCaptionText);

  const connectDebrief = useCallback(
    (sessionId: string) => {
      if (wsRef.current) {
        wsRef.current.close();
      }

      const ws = new WebSocket(
        `ws://${ORCHESTRATOR_URL}/ws/debrief/${sessionId}`
      );
      wsRef.current = ws;

      ws.onopen = () => {
        initAudio();
      };

      ws.onmessage = (event) => {
        let data: Record<string, unknown>;
        try {
          data = JSON.parse(event.data);
        } catch {
          return;
        }

        switch (data.type) {
          case "ready":
            // Connection confirmed
            break;

          case "agent_thinking": {
            const teammateId = AGENT_TO_TEAMMATE[data.agent_id as string];
            if (teammateId) setTeammateState(teammateId, "thinking");
            break;
          }

          case "agent_metadata": {
            const teammateId = AGENT_TO_TEAMMATE[data.agent_id as string];
            if (!teammateId) break;

            const sentiment = data.sentiment as string | undefined;
            const spokenMessage = (data.spoken_message as string) || "";

            setTeammateState(teammateId, sentimentToState(sentiment));

            const msgId = `debrief-${teammateId}-${Date.now()}`;
            currentMsgRef.current = msgId;

            addMessage({
              id: msgId,
              sender: teammateId,
              content: spokenMessage,
              confidence: data.confidence as number | undefined,
              sentiment,
              timestamp: Date.now(),
              channel: "hangout",
              isStreaming: true,
            });

            // Show caption overlay for accessibility
            if (spokenMessage) setCaptionText(spokenMessage);
            break;
          }

          case "audio_chunk": {
            const audio = data.audio_b64 as string | undefined;
            if (audio) playChunk(audio);
            break;
          }

          case "debrief_complete": {
            if (currentMsgRef.current) {
              setMessageStreaming(currentMsgRef.current, false);
              currentMsgRef.current = null;
            }
            resetAllTeammateStates();
            setCaptionText("");
            onCompleteRef.current?.();
            break;
          }

          case "error": {
            console.error("[Debrief WS]", data.message);
            resetAllTeammateStates();
            setCaptionText("");
            onCompleteRef.current?.();
            break;
          }
        }
      };

      ws.onclose = () => {
        wsRef.current = null;
      };

      ws.onerror = (err) => {
        console.error("[Debrief WS] Connection error", err);
      };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const askQuestion = useCallback(
    (question: string, teammateId: TeammateId) => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        console.error("[Debrief] WebSocket not connected");
        return;
      }

      const backendAgentId = TEAMMATE_TO_AGENT[teammateId];
      wsRef.current.send(
        JSON.stringify({ question, target_agent: backendAgentId })
      );
    },
    []
  );

  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    stopAll();
  }, []);

  const setOnComplete = useCallback((fn: (() => void) | null) => {
    onCompleteRef.current = fn;
  }, []);

  return { connectDebrief, askQuestion, disconnect, setOnComplete };
}
