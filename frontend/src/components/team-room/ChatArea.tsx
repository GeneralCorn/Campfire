"use client";

import { useEffect, useRef } from "react";
import { useAppStore } from "@/stores/useAppStore";
import { ChatMessage } from "./ChatMessage";
import { MessageSquare } from "lucide-react";

export function ChatArea() {
  const messages = useAppStore((s) => s.messages);
  const activeChannel = useAppStore((s) => s.activeChannel);
  const scrollRef = useRef<HTMLDivElement>(null);

  const channelMessages = messages.filter((m) => m.channel === activeChannel);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [channelMessages.length, channelMessages[channelMessages.length - 1]?.content]);

  if (channelMessages.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
        <MessageSquare size={40} className="text-text-dim/30 mb-3" />
        <h3 className="text-sm font-medium text-text-secondary">Welcome to the team room</h3>
        <p className="text-xs text-text-dim mt-1 max-w-[280px]">
          Give your team a task or just say hi. They&apos;ll collaborate in real-time and you can watch them work.
        </p>
      </div>
    );
  }

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto py-2">
      {channelMessages.map((msg) => (
        <ChatMessage key={msg.id} message={msg} />
      ))}
    </div>
  );
}
