"use client";

import { useEffect, useRef } from "react";
import { useAppStore } from "@/stores/useAppStore";
import { demoSequence } from "@/lib/demo-sequence";
import type { TeammateId } from "@/types";

export function useDemo() {
  const messages = useAppStore((s) => s.messages);
  const demoPlaying = useAppStore((s) => s.demoPlaying);
  const setDemoPlaying = useAppStore((s) => s.setDemoPlaying);
  const addMessage = useAppStore((s) => s.addMessage);
  const appendToMessage = useAppStore((s) => s.appendToMessage);
  const setTeammateState = useAppStore((s) => s.setTeammateState);
  const setMessageStreaming = useAppStore((s) => s.setMessageStreaming);
  const addSandboxEntry = useAppStore((s) => s.addSandboxEntry);
  const setArtifactSection = useAppStore((s) => s.setArtifactSection);
  const addMemory = useAppStore((s) => s.addMemory);
  const setIsLive = useAppStore((s) => s.setIsLive);
  const setElapsedTime = useAppStore((s) => s.setElapsedTime);
  const timeoutRefs = useRef<ReturnType<typeof setTimeout>[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedRef = useRef(false);

  // Track current streaming message ID per teammate
  const currentMsgId = useRef<Record<string, string>>({});
  const memoryCounter = useRef(0);

  useEffect(() => {
    // Only auto-play once on fresh load
    if (startedRef.current || messages.length > 0) return;
    startedRef.current = true;

    setDemoPlaying(true);
    setIsLive(true);

    // Start elapsed timer
    let elapsed = 0;
    timerRef.current = setInterval(() => {
      elapsed++;
      setElapsedTime(elapsed);
    }, 1000);

    let cumulativeDelay = 0;

    for (const step of demoSequence) {
      cumulativeDelay += step.delay;

      const timeout = setTimeout(() => {
        switch (step.action) {
          case "user-message": {
            addMessage({
              id: `demo-user-${Date.now()}`,
              sender: "user",
              content: step.content!,
              timestamp: Date.now(),
              channel: "team-room",
            });
            break;
          }

          case "thinking": {
            setTeammateState(step.teammate!, "thinking");
            break;
          }

          case "start-response": {
            const msgId = `demo-${step.teammate}-${Date.now()}`;
            currentMsgId.current[step.teammate!] = msgId;
            setTeammateState(step.teammate!, "talking");
            addMessage({
              id: msgId,
              sender: step.teammate!,
              content: "",
              thinking: step.thinking,
              timestamp: Date.now(),
              channel: "team-room",
              isStreaming: true,
            });
            break;
          }

          case "stream-delta": {
            const id = currentMsgId.current[step.teammate!];
            if (id) {
              appendToMessage(id, step.content!);
            }
            break;
          }

          case "end-response": {
            const id = currentMsgId.current[step.teammate!];
            if (id) {
              setMessageStreaming(id, false);
            }
            setTeammateState(step.teammate!, "idle");
            break;
          }

          case "sandbox-log": {
            addSandboxEntry({
              id: `sandbox-${Date.now()}-${Math.random()}`,
              teammateId: step.teammate!,
              type: (step.sandboxType as "log" | "write" | "flag") || "log",
              text: step.sandboxText || step.content || "",
              timestamp: Date.now(),
            });
            break;
          }

          case "sandbox-write": {
            if (step.artifactHeading && step.artifactContent) {
              setArtifactSection({
                id: `artifact-${step.artifactHeading}`,
                heading: step.artifactHeading,
                content: step.artifactContent,
                authorId: step.teammate! as TeammateId,
                timestamp: Date.now(),
              });
            }
            break;
          }

          case "memory-node": {
            memoryCounter.current++;
            addMemory({
              id: `m${memoryCounter.current}`,
              content: step.memoryContent || step.content || "",
              teammateId: step.teammate!,
              timestamp: Date.now(),
            });
            break;
          }

          case "done": {
            setDemoPlaying(false);
            if (timerRef.current) clearInterval(timerRef.current);
            break;
          }
        }
      }, cumulativeDelay);

      timeoutRefs.current.push(timeout);
    }

    return () => {
      timeoutRefs.current.forEach(clearTimeout);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}
