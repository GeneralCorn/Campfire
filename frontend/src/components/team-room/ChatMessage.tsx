"use client";

import { useState } from "react";
import { ChevronRight, ChevronDown } from "lucide-react";
import type { Message, TeammateId } from "@/types";
import { teammates } from "@/lib/teammates";
import { Avatar } from "./Avatar";

interface ChatMessageProps {
  message: Message;
}

export function ChatMessage({ message }: ChatMessageProps) {
  const [showThinking, setShowThinking] = useState(false);
  const isUser = message.sender === "user";
  const isSystem = message.sender === "system";
  const t = !isUser && !isSystem ? teammates[message.sender as TeammateId] : null;

  if (isSystem) {
    return (
      <div className="flex justify-center py-2 animate-fade-in">
        <span className="text-xs font-mono text-text-dim px-3 py-1 rounded-full bg-surface-3/30">
          {message.content}
        </span>
      </div>
    );
  }

  if (isUser) {
    return (
      <div className="flex justify-end px-4 py-1.5 animate-slide-up">
        <div className="max-w-[70%] px-3 py-2 rounded-lg bg-surface-3 text-sm text-text-primary">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex gap-3 px-4 py-2 animate-slide-up hover:bg-surface-hover/20 transition-colors"
      style={{
        borderLeft: message.isStreaming ? `2px solid ${t!.colorHex}30` : "2px solid transparent",
        backgroundColor: message.isStreaming ? `${t!.colorHex}03` : undefined,
      }}
    >
      <div className="shrink-0 pt-0.5">
        <Avatar teammateId={message.sender as TeammateId} state="idle" size="sm" />
      </div>

      <div className="min-w-0 flex-1">
        {/* Name + sentiment + timestamp */}
        <div className="flex items-baseline gap-2">
          <span
            className="text-sm font-mono font-bold uppercase tracking-[0.02em]"
            style={{ color: t!.colorHex }}
          >
            {t!.name}
          </span>
          {message.sentiment && message.sentiment !== "neutral" && (
            <span
              className="text-[9px] font-mono px-1.5 py-0.5 rounded-full uppercase tracking-wider"
              style={{
                color: t!.colorHex,
                backgroundColor: `${t!.colorHex}15`,
              }}
            >
              {message.sentiment}
            </span>
          )}
          <span className="text-[10px] font-mono text-text-dim">
            {formatTime(message.timestamp)}
          </span>
          {message.confidence != null && message.confidence > 0 && (
            <span
              className="inline-block h-1 rounded-full"
              style={{
                width: `${Math.round(message.confidence * 40)}px`,
                backgroundColor: t!.colorHex,
                opacity: 0.4 + message.confidence * 0.6,
              }}
              title={`Confidence: ${Math.round(message.confidence * 100)}%`}
            />
          )}
        </div>

        {/* Content */}
        <div className={`text-sm text-text-primary leading-relaxed mt-0.5 ${message.isStreaming ? "streaming-cursor" : ""}`}>
          {message.content}
        </div>

        {/* Thinking toggle */}
        {message.thinking && (
          <button
            onClick={() => setShowThinking(!showThinking)}
            className="flex items-center gap-1 mt-1.5 text-[10px] font-mono text-text-dim hover:text-text-secondary cursor-pointer transition-colors"
          >
            {showThinking ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
            {showThinking ? "Hide thinking" : "Show thinking"}
          </button>
        )}
        {showThinking && message.thinking && (
          <div
            className="mt-1 px-3 py-2 rounded text-[11px] font-mono text-text-dim leading-relaxed bg-surface-0/50"
            style={{ borderLeft: `2px solid ${t!.colorHex}30` }}
          >
            {message.thinking}
          </div>
        )}
      </div>
    </div>
  );
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}
