"use client";

import { useCallback, useRef } from "react";
import { useAppStore } from "@/stores/useAppStore";
import { initAudio, playChunk, stopAll } from "@/lib/audio-player";
import type { TeammateId, TeammateState } from "@/types";

/** Map sentiment string from LLM → sprite state for richer animations. */
function sentimentToState(sentiment: string | undefined): TeammateState {
  if (!sentiment) return "talking";
  const s = sentiment.toLowerCase();
  if (s === "skeptical" || s === "critical" || s === "analytical") return "reacting";
  if (s === "enthusiastic" || s === "supportive" || s === "excited") return "agreeing";
  if (s === "surprised" || s === "confused") return "interrupted";
  return "talking";
}

export function useTeamChat() {
  const abortRef = useRef<AbortController | null>(null);
  const audioInitialized = useRef(false);

  const addMessage = useAppStore((s) => s.addMessage);
  const appendToMessage = useAppStore((s) => s.appendToMessage);
  const setTeammateState = useAppStore((s) => s.setTeammateState);
  const setMessageStreaming = useAppStore((s) => s.setMessageStreaming);
  const resetAllTeammateStates = useAppStore((s) => s.resetAllTeammateStates);
  const setIsStreaming = useAppStore((s) => s.setIsStreaming);
  const setIsLive = useAppStore((s) => s.setIsLive);
  const addSandboxEntry = useAppStore((s) => s.addSandboxEntry);
  const addMemory = useAppStore((s) => s.addMemory);
  const setCurrentSessionId = useAppStore((s) => s.setCurrentSessionId);

  // Track current streaming message per teammate
  const currentMsgIds = useRef<Record<string, string>>({});
  // Track sentiment per teammate for sprite state selection
  const currentSentiment = useRef<Record<string, string>>({});
  const memCounter = useRef(0);

  const sendTask = useCallback(
    async (task: string, history: Array<{ role: string; content: string }>) => {
      // Abort any existing stream
      abortRef.current?.abort();
      abortRef.current = new AbortController();

      setIsStreaming(true);
      setIsLive(true);

      // Generate session ID for debrief memory queries
      const sessionId = `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setCurrentSessionId(sessionId);

      try {
        const response = await fetch("/api/team-chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ task, history, mode: "auto" }),
          signal: abortRef.current.signal,
        });

        if (!response.ok || !response.body) {
          setIsStreaming(false);
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            try {
              const data = JSON.parse(line.slice(6));
              handleEvent(data);
            } catch {
              // Skip malformed events
            }
          }
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          console.error("SSE error:", err);
        }
      } finally {
        setIsStreaming(false);
        resetAllTeammateStates();
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  function handleEvent(data: Record<string, unknown>) {
    const teammate = data.teammate as TeammateId | undefined;

    switch (data.event) {
      case "thinking": {
        if (teammate) setTeammateState(teammate, "thinking");
        break;
      }

      case "task_result": {
        // Store sentiment for sprite state selection during talking
        if (teammate && data.sentiment) {
          currentSentiment.current[teammate] = data.sentiment as string;
        }

        // Add thinking behind toggle, sandbox action
        if (data.action && typeof data.action === "object") {
          const action = data.action as { type: string; detail: string };
          if (action.type !== "none" && teammate) {
            addSandboxEntry({
              id: `sb-${Date.now()}-${Math.random()}`,
              teammateId: teammate,
              type: action.type as "log" | "write" | "flag",
              text: action.detail,
              timestamp: Date.now(),
            });
          }
        }
        break;
      }

      case "voice_text": {
        // Full subtitle text emitted once — create the chat message
        if (!teammate) break;

        const text = (data.text as string) || "";
        const msgId = `live-${teammate}-${Date.now()}`;
        currentMsgIds.current[teammate] = msgId;

        // Use sentiment to pick a richer sprite state
        const sentiment = currentSentiment.current[teammate];
        const spriteState = sentimentToState(sentiment);
        setTeammateState(teammate, spriteState);

        addMessage({
          id: msgId,
          sender: teammate,
          content: text,
          confidence: data.confidence as number | undefined,
          sentiment: sentiment,
          timestamp: Date.now(),
          channel: "team-room",
          isStreaming: true,
        });
        break;
      }

      // Legacy: still handle voice_chunk for backwards compat
      case "voice_chunk": {
        if (!teammate) break;

        const existingId = currentMsgIds.current[teammate];
        const text = (data.text as string) || "";

        if (!existingId || !useAppStore.getState().messages.find((m) => m.id === existingId)) {
          const msgId = `live-${teammate}-${Date.now()}`;
          currentMsgIds.current[teammate] = msgId;
          setTeammateState(teammate, "talking");
          addMessage({
            id: msgId,
            sender: teammate,
            content: text + " ",
            timestamp: Date.now(),
            channel: "team-room",
            isStreaming: true,
          });
        } else {
          appendToMessage(existingId, text + " ");
        }
        break;
      }

      case "audio_chunk": {
        // Initialize audio context on first chunk (needs user gesture context)
        if (!audioInitialized.current) {
          initAudio();
          audioInitialized.current = true;
        }

        const audio = data.audio as string | undefined;
        if (audio) {
          playChunk(audio);
        }
        break;
      }

      case "memory_node": {
        if (teammate && data.content) {
          memCounter.current++;
          addMemory({
            id: `live-m${memCounter.current}`,
            content: data.content as string,
            teammateId: teammate,
            timestamp: Date.now(),
          });
        }
        break;
      }

      case "turn_end": {
        if (teammate) {
          const id = currentMsgIds.current[teammate];
          if (id) {
            setMessageStreaming(id, false);
            delete currentMsgIds.current[teammate];
          }
          delete currentSentiment.current[teammate];
          setTeammateState(teammate, "idle");
        }
        break;
      }

      case "complete": {
        resetAllTeammateStates();
        setIsStreaming(false);
        break;
      }
    }
  }

  const interrupt = useCallback(() => {
    abortRef.current?.abort();
    stopAll(); // Stop audio playback
    audioInitialized.current = false;
    resetAllTeammateStates();
    setIsStreaming(false);
    currentMsgIds.current = {};
    currentSentiment.current = {};
  }, [resetAllTeammateStates, setIsStreaming]);

  return { sendTask, interrupt };
}
