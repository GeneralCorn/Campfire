"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useAppStore } from "@/stores/useAppStore";
import { teammates, teammateList } from "@/lib/teammates";
import { Avatar } from "@/components/team-room/Avatar";
import { ChatMessage } from "@/components/team-room/ChatMessage";
import { useDebrief } from "@/hooks/useWebSocket";
import { Headphones, Mic } from "lucide-react";

export function HangoutView() {
  const hangoutTeammate = useAppStore((s) => s.hangoutTeammate);
  const setHangoutTeammate = useAppStore((s) => s.setHangoutTeammate);
  const currentSessionId = useAppStore((s) => s.currentSessionId);
  const messages = useAppStore((s) => s.messages);
  const addMessage = useAppStore((s) => s.addMessage);
  const t = teammates[hangoutTeammate];

  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const connectedSessionRef = useRef<string | null>(null);

  const { connectDebrief, askQuestion, disconnect, setOnComplete } =
    useDebrief();

  // Mark sending as false when debrief answer completes
  useEffect(() => {
    setOnComplete(() => setSending(false));
  }, [setOnComplete]);

  // Auto-connect to debrief WS when session ID is available
  useEffect(() => {
    if (currentSessionId && currentSessionId !== connectedSessionRef.current) {
      connectDebrief(currentSessionId);
      connectedSessionRef.current = currentSessionId;
    }
    return () => {
      disconnect();
      connectedSessionRef.current = null;
    };
  }, [currentSessionId, connectDebrief, disconnect]);

  const hangoutMessages = messages.filter((m) => m.channel === "hangout");

  const sendMessage = useCallback(() => {
    const text = input.trim();
    if (!text || sending || !currentSessionId) return;

    setInput("");
    setSending(true);

    addMessage({
      id: `hangout-user-${Date.now()}`,
      sender: "user",
      content: text,
      timestamp: Date.now(),
      channel: "hangout",
    });

    askQuestion(text, hangoutTeammate);
  }, [input, sending, currentSessionId, addMessage, askQuestion, hangoutTeammate]);

  return (
    <div className="flex h-full">
      {/* Agent selector */}
      <div className="w-[200px] border-r border-white/[0.04] p-4 shrink-0">
        <div className="text-[10px] font-mono text-text-dim uppercase tracking-[0.08em] mb-3">
          Select Agent
        </div>
        {teammateList.map((tm) => (
          <button
            key={tm.id}
            onClick={() => setHangoutTeammate(tm.id as import("@/types").TeammateId)}
            className={`flex items-center gap-3 w-full px-3 py-2 rounded-lg mb-1 transition-colors cursor-pointer ${
              hangoutTeammate === tm.id
                ? "bg-white/[0.04]"
                : "hover:bg-white/[0.03]"
            }`}
            style={{
              borderLeft: hangoutTeammate === tm.id ? `2px solid ${tm.colorHex}` : "2px solid transparent",
              border: hangoutTeammate === tm.id ? `1px solid ${tm.colorHex}20` : "1px solid transparent",
            }}
          >
            <span
              className="inline-flex items-center justify-center h-8 w-8 rounded-lg text-[10px] font-mono font-bold"
              style={{
                backgroundColor: tm.colorHex + "15",
                color: tm.colorHex,
                border: `2px solid ${tm.colorHex}40`,
                boxShadow: hangoutTeammate === tm.id ? `0 0 10px ${tm.colorHex}15` : "none",
              }}
            >
              {tm.badge}
            </span>
            <div className="text-left">
              <div className="text-sm font-medium" style={{ color: tm.colorHex }}>
                {tm.name}
              </div>
              <div className="text-[10px] font-mono text-text-dim uppercase tracking-[0.08em]">
                {tm.role}
              </div>
            </div>
          </button>
        ))}
        <div className="mt-4 text-[10px] font-mono text-text-dim leading-relaxed">
          {currentSessionId
            ? "Debrief mode — responses grounded in session memory."
            : "No active session — run a debate in Team Room first."}
        </div>
      </div>

      {/* Main chat area */}
      <div className="flex-1 flex flex-col">
        {/* Top bar */}
        <div className="flex items-center justify-between px-4 h-12 border-b border-white/[0.06] shrink-0">
          <div className="flex items-center gap-2">
            <Headphones size={18} className="text-text-dim" />
            <span className="font-bold text-sm">hangout</span>
            <span className="text-xs text-text-dim">
              {currentSessionId ? "Debrief — ask about decisions" : "Run a debate first"}
            </span>
          </div>
        </div>

        {/* Messages or empty state */}
        <div className="flex-1 overflow-y-auto">
          {hangoutMessages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full p-8">
              <div className="flex items-center gap-2 mb-4">
                <Avatar teammateId={hangoutTeammate} size="lg" />
                <div className="ml-2">
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-bold" style={{ color: t.colorHex }}>
                      {t.name}
                    </span>
                    <span className="text-xs font-mono text-text-dim">· {t.personality.split(".")[0].toLowerCase()}</span>
                  </div>
                </div>
              </div>
              <h3 className="text-sm font-medium text-text-secondary">
                {currentSessionId ? `Debrief with ${t.name}` : `Chat with ${t.name}`}
              </h3>
              <p className="text-xs text-text-dim mt-1 max-w-[300px] text-center font-mono">
                {currentSessionId
                  ? `Ask ${t.name} why it made certain decisions during the Team Room session.`
                  : "Start a debate in Team Room to enable debrief mode."}
              </p>
            </div>
          ) : (
            <div className="py-2">
              {hangoutMessages.map((m, i) => (
                <ChatMessage key={m.id} message={m} messageIndex={i} />
              ))}
            </div>
          )}
        </div>

        {/* Input */}
        <div className="shrink-0 px-4 pb-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              sendMessage();
            }}
            className="flex items-center gap-2 rounded-lg bg-white/[0.04] border border-white/[0.06] px-3 py-2 focus-within:border-white/[0.12] transition-colors"
          >
            <Mic size={16} className="text-text-dim" />
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={
                currentSessionId
                  ? `Ask ${t.name} about its decisions...`
                  : "Run a debate first to enable debrief"
              }
              className="flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-dim outline-none"
              disabled={sending || !currentSessionId}
            />
            <button
              type="submit"
              disabled={!input.trim() || sending || !currentSessionId}
              className="flex h-8 w-8 items-center justify-center rounded-md bg-broadcast/20 text-broadcast cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
            >
              ↑
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
