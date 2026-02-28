"use client";

import { useCallback, useRef } from "react";
import { useAppStore } from "@/stores/useAppStore";
import type { TeammateId } from "@/types";

export function useTeamChat() {
  const abortRef = useRef<AbortController | null>(null);

  const addMessage = useAppStore((s) => s.addMessage);
  const appendToMessage = useAppStore((s) => s.appendToMessage);
  const setTeammateState = useAppStore((s) => s.setTeammateState);
  const setMessageStreaming = useAppStore((s) => s.setMessageStreaming);
  const resetAllTeammateStates = useAppStore((s) => s.resetAllTeammateStates);
  const setIsStreaming = useAppStore((s) => s.setIsStreaming);
  const setIsLive = useAppStore((s) => s.setIsLive);
  const addSandboxEntry = useAppStore((s) => s.addSandboxEntry);
  const addMemory = useAppStore((s) => s.addMemory);

  // Track current streaming message per teammate
  const currentMsgIds = useRef<Record<string, string>>({});
  const memCounter = useRef(0);

  const sendTask = useCallback(
    async (task: string, history: Array<{ role: string; content: string }>) => {
      // Abort any existing stream
      abortRef.current?.abort();
      abortRef.current = new AbortController();

      setIsStreaming(true);
      setIsLive(true);

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

      case "voice_chunk": {
        if (!teammate) break;

        // Create message on first chunk, append on subsequent
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
            thinking: (data.thinking as string) || undefined,
            timestamp: Date.now(),
            channel: "team-room",
            isStreaming: true,
          });
        } else {
          appendToMessage(existingId, text + " ");
        }

        // TODO: Queue audio for playback if data.audio exists
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
    resetAllTeammateStates();
    setIsStreaming(false);
    currentMsgIds.current = {};
  }, [resetAllTeammateStates, setIsStreaming]);

  return { sendTask, interrupt };
}
