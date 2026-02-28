"use client";

import { useState, useRef, useCallback } from "react";
import { Send, Square } from "lucide-react";
import { useAppStore } from "@/stores/useAppStore";
import { useTeamChat } from "@/hooks/useSSE";

export function TaskInput() {
  const [input, setInput] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isStreaming = useAppStore((s) => s.isStreaming);
  const addMessage = useAppStore((s) => s.addMessage);
  const demoPlaying = useAppStore((s) => s.demoPlaying);
  const messages = useAppStore((s) => s.messages);
  const { sendTask, interrupt } = useTeamChat();

  const handleSubmit = useCallback(() => {
    const text = input.trim();
    if (!text || isStreaming) return;

    addMessage({
      id: `user-${Date.now()}`,
      sender: "user",
      content: text,
      timestamp: Date.now(),
      channel: "team-room",
    });

    setInput("");

    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }

    // Build conversation history from existing messages
    const history = messages
      .filter((m) => m.channel === "team-room" && m.sender !== "system")
      .map((m) => ({
        role: m.sender === "user" ? ("user" as const) : ("assistant" as const),
        content: m.sender === "user" ? m.content : `[${m.sender}]: ${m.content}`,
      }));

    sendTask(text, history);
  }, [input, isStreaming, addMessage, messages, sendTask]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="shrink-0 px-4 pb-4 pt-2">
      {/* Task bar when streaming */}
      {(isStreaming || demoPlaying) && (
        <div className="flex items-center gap-2 mb-2 px-3 py-1.5 rounded bg-surface-3/50 text-[11px] font-mono text-text-dim">
          <span className="h-1.5 w-1.5 rounded-full bg-broadcast animate-live-dot" />
          <span className="flex-1 truncate">Team is working...</span>
          <button
            onClick={interrupt}
            className="flex items-center gap-1 px-2 py-0.5 rounded bg-danger/15 text-danger hover:bg-danger/25 transition-colors cursor-pointer text-[10px] font-bold"
          >
            <Square size={8} />
            STOP
          </button>
        </div>
      )}

      {/* Input bar */}
      <div className="flex items-end gap-2 rounded-lg bg-white/[0.04] border border-white/[0.06] px-3 py-2 focus-within:border-white/[0.12] transition-colors">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            e.target.style.height = "auto";
            e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
          }}
          onKeyDown={handleKeyDown}
          placeholder="Give your team a task..."
          rows={1}
          className="flex-1 resize-none bg-transparent text-sm text-text-primary placeholder:text-text-dim outline-none min-h-[20px] max-h-[120px]"
          disabled={isStreaming}
        />
        <button
          onClick={handleSubmit}
          disabled={!input.trim() || isStreaming}
          className="flex h-8 w-8 items-center justify-center rounded-md bg-broadcast/20 text-broadcast hover:bg-broadcast/30 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer shrink-0"
        >
          <Send size={16} />
        </button>
      </div>
    </div>
  );
}
