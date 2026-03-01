"use client";

import { useCallback, useRef } from "react";
import { useAppStore } from "@/stores/useAppStore";
import { initAudio, playChunk, stopAll } from "@/lib/audio-player";
import type { TeammateId, TeammateState, PipelineNodeId, ChannelId } from "@/types";

// ── Generic SSE hook ──────────────────────────────────────────────────────────
// Lightweight hook for flexible SSE/streaming fetch use cases.

export function useSSE<T = Record<string, unknown>>(
  onEvent: (data: T) => void
) {
  const abortRef = useRef<AbortController | null>(null);

  const connect = useCallback(
    async (url: string, body?: Record<string, unknown>) => {
      abortRef.current?.abort();
      abortRef.current = new AbortController();

      try {
        const res = await fetch(url, {
          method: body ? "POST" : "GET",
          headers: { "Content-Type": "application/json" },
          body: body ? JSON.stringify(body) : undefined,
          signal: abortRef.current.signal,
        });

        if (!res.ok || !res.body) return;

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            try {
              onEvent(JSON.parse(line.slice(6)) as T);
            } catch {
              // skip malformed events
            }
          }
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          console.error("[useSSE] stream error:", err);
        }
      }
    },
    [onEvent]
  );

  const abort = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return { connect, abort };
}

// ── sentimentToState helper ───────────────────────────────────────────────────

function sentimentToState(sentiment: string | undefined): TeammateState {
  if (!sentiment) return "talking";
  const s = sentiment.toLowerCase();
  if (s === "skeptical" || s === "critical" || s === "analytical") return "reacting";
  if (s === "enthusiastic" || s === "supportive" || s === "excited") return "agreeing";
  if (s === "surprised" || s === "confused") return "interrupted";
  return "talking";
}

// ── useTeamChat — full pipeline SSE hook (drives PipelineGraph + TTS) ────────

export function useTeamChat() {
  const abortRef = useRef<AbortController | null>(null);
  const audioInitialized = useRef(false);

  const addMessage           = useAppStore((s) => s.addMessage);
  const appendToMessage      = useAppStore((s) => s.appendToMessage);
  const setTeammateState     = useAppStore((s) => s.setTeammateState);
  const setMessageStreaming   = useAppStore((s) => s.setMessageStreaming);
  const resetAllTeammateStates = useAppStore((s) => s.resetAllTeammateStates);
  const setIsStreaming        = useAppStore((s) => s.setIsStreaming);
  const setIsLive             = useAppStore((s) => s.setIsLive);
  const addSandboxEntry        = useAppStore((s) => s.addSandboxEntry);
  const addMemory              = useAppStore((s) => s.addMemory);
  const addDiscoveredWarning   = useAppStore((s) => s.addDiscoveredWarning);
  const setCurrentSessionId    = useAppStore((s) => s.setCurrentSessionId);
  const setPipelineNodeStatus = useAppStore((s) => s.setPipelineNodeStatus);
  const resetPipeline         = useAppStore((s) => s.resetPipeline);

  // Track current streaming message per teammate
  const currentMsgIds = useRef<Record<string, string>>({});
  // Track sentiment per teammate for sprite state selection
  const currentSentiment = useRef<Record<string, string>>({});
  // Which channel initiated the current task (so messages go to the right place)
  const activeChannelRef = useRef<ChannelId>("team-room");
  const memCounter = useRef(0);

  const sendTask = useCallback(
    async (task: string, history: Array<{ role: string; content: string }>) => {
      abortRef.current?.abort();
      abortRef.current = new AbortController();

      setIsStreaming(true);
      setIsLive(true);
      resetPipeline();

      // Capture which channel the user is on so messages go there
      activeChannelRef.current = useAppStore.getState().activeChannel;

      // Generate session ID for debrief memory queries
      const sessionId = `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setCurrentSessionId(sessionId);

      // Grab and clear any pending image
      const image = useAppStore.getState().pendingImage;
      if (image) useAppStore.getState().setPendingImage(null);

      try {
        const discharge = useAppStore.getState().discharge;
        const res = await fetch("/api/team-chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            task,
            history,
            mode: "auto",
            ...(image ? { image } : {}),
            ...(discharge ? { patient_context: discharge } : {}),
          }),
          signal: abortRef.current.signal,
        });

        if (!res.ok || !res.body) {
          console.error("[SSE] Backend returned", res.status);
          addMessage({
            id: `err-${Date.now()}`,
            sender: "system",
            content: `Backend error (${res.status}): Could not reach the pipeline. Is the backend running on port 8001?`,
            timestamp: Date.now(),
            channel: activeChannelRef.current,
          });
          setIsStreaming(false);
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            try {
              const data = JSON.parse(line.slice(6));
              console.log("[SSE]", data.event, data.teammate || "", data);
              handleEvent(data);
            } catch (parseErr) {
              console.warn("[SSE] Malformed event:", line.slice(0, 200), parseErr);
            }
          }
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          console.error("SSE error:", err);
          addMessage({
            id: `err-${Date.now()}`,
            sender: "system",
            content: `Connection error: ${(err as Error).message}`,
            timestamp: Date.now(),
            channel: activeChannelRef.current,
          });
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [addMessage, appendToMessage, setTeammateState, setMessageStreaming,
     resetAllTeammateStates, setIsStreaming, setIsLive, addSandboxEntry,
     addMemory, addDiscoveredWarning, setCurrentSessionId, setPipelineNodeStatus, resetPipeline]
  );

  function handleEvent(data: Record<string, unknown>) {
    const teammate = data.teammate as TeammateId | undefined;

    switch (data.event) {
      case "router_plan": {
        setPipelineNodeStatus("router", "done", data.plan as string | undefined);
        break;
      }

      case "thinking": {
        if (teammate) {
          setTeammateState(teammate, "thinking");
          const nodeId = teammate as PipelineNodeId;
          if (nodeId === "maya" || nodeId === "rex" || nodeId === "sol") {
            setPipelineNodeStatus(nodeId, "running");
          }
        }
        break;
      }

      case "task_result": {
        if (teammate && data.sentiment) {
          currentSentiment.current[teammate] = data.sentiment as string;
        }

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
        if (!teammate) break;

        const text = (data.text as string) || "";
        const msgId = `live-${teammate}-${Date.now()}`;
        currentMsgIds.current[teammate] = msgId;

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
          channel: activeChannelRef.current,
          isStreaming: true,
        });
        break;
      }

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
            channel: activeChannelRef.current,
            isStreaming: true,
          });
        } else {
          appendToMessage(existingId, text + " ");
        }
        break;
      }

      case "audio_chunk": {
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

      case "sandbox_spawn": {
        if (teammate) {
          const nodeId = teammate as PipelineNodeId;
          if (nodeId === "maya" || nodeId === "rex" || nodeId === "sol") {
            const detail = [
              data.packages ? (data.packages as string[]).join(", ") : "",
              data.gpu ? `GPU: ${data.gpu}` : "",
            ].filter(Boolean).join(" · ");
            setPipelineNodeStatus(nodeId, "sandbox", detail || undefined);
          }

          // Execution context — use value from backend, with client-side fallback
          const rawCtx = data.execution_context as string | undefined;
          const executionContext =
            rawCtx === "modal-gpu" || rawCtx === "modal-cpu" || rawCtx === "browser"
              ? rawCtx
              : (data.model as string) === "mediapipe" ? "browser"
              : data.gpu ? "modal-gpu"
              : "modal-cpu";

          addSandboxEntry({
            id: `sb-spawn-${Date.now()}-${Math.random()}`,
            teammateId: teammate,
            type: "log",
            text: `[${teammate}] Sandbox provisioning...${data.packages ? ` (${(data.packages as string[]).join(", ")})` : ""}${data.gpu ? ` [GPU: ${data.gpu}]` : ""}`,
            timestamp: Date.now(),
            model: (data.model as string) ?? undefined,
            gpuTier: data.gpu ? (data.gpu as string) : undefined,
            packages: data.packages ? (data.packages as string[]) : undefined,
            executionContext,
            gpuName: data.gpu_name ? (data.gpu_name as string) : undefined,
          });
        }
        break;
      }

      case "sandbox_output": {
        if (teammate) {
          addSandboxEntry({
            id: `sb-out-${Date.now()}-${Math.random()}`,
            teammateId: teammate,
            type: "log",
            text: data.line as string,
            timestamp: Date.now(),
          });
        }
        break;
      }

      case "sandbox_complete": {
        if (teammate) {
          addSandboxEntry({
            id: `sb-done-${Date.now()}-${Math.random()}`,
            teammateId: teammate,
            type: "flag",
            text: `[${teammate}] Sandbox done (exit ${data.exit_code}, ${((data.duration_ms as number) / 1000).toFixed(1)}s)`,
            timestamp: Date.now(),
          });
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
          const nodeId = teammate as PipelineNodeId;
          if (nodeId === "maya" || nodeId === "rex" || nodeId === "sol") {
            setPipelineNodeStatus(nodeId, "done");
          }
        }
        break;
      }

      case "error": {
        console.error("[Pipeline error]", data.message);
        addMessage({
          id: `err-${Date.now()}`,
          sender: "system",
          content: `Pipeline error: ${data.message}`,
          timestamp: Date.now(),
          channel: activeChannelRef.current,
        });
        addSandboxEntry({
          id: `sb-err-${Date.now()}-${Math.random()}`,
          teammateId: "system" as TeammateId,
          type: "flag",
          text: `ERROR: ${data.message}`,
          timestamp: Date.now(),
        });
        break;
      }

      case "warning_flagged": {
        addDiscoveredWarning({
          id: `warn-${Date.now()}-${Math.random()}`,
          symptom: data.symptom as string,
          severity: (data.severity as "urgent" | "watch") ?? "watch",
          agent: (data.agent as string) ?? "system",
          timestamp: Date.now(),
        });
        break;
      }

      case "complete": {
        setPipelineNodeStatus("synthesize", "done");
        resetAllTeammateStates();
        setIsStreaming(false);
        break;
      }
    }
  }

  const interrupt = useCallback(() => {
    abortRef.current?.abort();
    stopAll();
    audioInitialized.current = false;
    resetAllTeammateStates();
    setIsStreaming(false);
    currentMsgIds.current = {};
    currentSentiment.current = {};
  }, [resetAllTeammateStates, setIsStreaming]);

  return { sendTask, interrupt };
}
