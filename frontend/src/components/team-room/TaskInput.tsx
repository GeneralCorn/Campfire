"use client";

import { useState, useRef, useCallback } from "react";
import { Send, Square, Mic, MicOff } from "lucide-react";
import { useAppStore } from "@/stores/useAppStore";
import { useTeamChat } from "@/hooks/useSSE";

export function TaskInput() {
  const [input, setInput] = useState("");
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const isStreaming = useAppStore((s) => s.isStreaming);
  const demoPlaying = useAppStore((s) => s.demoPlaying);
  const { sendTask, interrupt } = useTeamChat();

  const handleSubmit = useCallback(() => {
    const text = input.trim();
    if (!text || isStreaming) return;

    setInput("");

    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }

    // Add user message to whichever channel is active
    useAppStore.getState().addMessage({
      id: `user-${Date.now()}`,
      sender: "user",
      content: text,
      timestamp: Date.now(),
      channel: useAppStore.getState().activeChannel,
    });

    sendTask(text, []);
  }, [input, isStreaming, sendTask]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const toggleRecording = useCallback(async () => {
    if (recording && mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      setRecording(false);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      chunksRef.current = [];

      recorder.ondataavailable = (e) => chunksRef.current.push(e.data);

      recorder.onstop = async () => {
        // Stop all tracks to release mic
        stream.getTracks().forEach((t) => t.stop());

        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        setTranscribing(true);

        try {
          const form = new FormData();
          form.append("file", blob, "voice.webm");
          const res = await fetch("/api/transcribe", { method: "POST", body: form });
          const data = await res.json();

          if (data.transcript) {
            setInput((prev) => (prev ? prev + " " + data.transcript : data.transcript));
          }
        } catch (err) {
          console.error("Transcription failed:", err);
        } finally {
          setTranscribing(false);
        }
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setRecording(true);
    } catch (err) {
      console.error("Mic access denied:", err);
    }
  }, [recording]);

  return (
    <div className="shrink-0 px-4 pb-4 pt-2">
      {/* Task bar when streaming */}
      {(isStreaming || demoPlaying) && (
        <div className="flex items-center gap-2 mb-2 px-3 py-1.5 rounded bg-[#F1F5F9] text-[11px] font-mono text-[#64748B]">
          <span className="h-1.5 w-1.5 rounded-full bg-[#0891B2] animate-live-dot" />
          <span className="flex-1 truncate">Team is working...</span>
          <button
            onClick={interrupt}
            className="flex items-center gap-1 px-2 py-0.5 rounded bg-[#FEF2F2] text-[#DC2626] hover:bg-[#FEE2E2] transition-colors cursor-pointer text-[10px] font-bold"
          >
            <Square size={8} />
            STOP
          </button>
        </div>
      )}

      {/* Input bar */}
      <div className="flex items-end gap-2 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] px-3 py-2 focus-within:border-[#CBD5E1] transition-colors">
        <button
          onClick={toggleRecording}
          disabled={isStreaming || transcribing}
          className={`flex h-8 w-8 items-center justify-center rounded-md transition-colors cursor-pointer shrink-0 ${
            recording
              ? "bg-[#FEF2F2] text-[#DC2626] animate-pulse"
              : "bg-[#F1F5F9] text-[#94A3B8] hover:text-[#64748B] hover:bg-[#E2E8F0]"
          } disabled:opacity-30 disabled:cursor-not-allowed`}
          title={recording ? "Stop recording" : "Voice input"}
        >
          {recording ? <MicOff size={16} /> : <Mic size={16} />}
        </button>
        <textarea
          ref={textareaRef}
          value={transcribing ? "Transcribing..." : input}
          onChange={(e) => {
            setInput(e.target.value);
            e.target.style.height = "auto";
            e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
          }}
          onKeyDown={handleKeyDown}
          placeholder="Ask about meds, warning signs, recovery steps, or discharge instructions…"
          rows={1}
          className="flex-1 resize-none bg-transparent text-sm text-[#1E293B] placeholder:text-[#94A3B8] outline-none min-h-[20px] max-h-[120px]"
          disabled={isStreaming || transcribing}
        />
        <button
          onClick={handleSubmit}
          disabled={!input.trim() || isStreaming || transcribing}
          className="flex h-8 w-8 items-center justify-center rounded-md bg-[#0891B2] text-white hover:bg-[#0E7490] disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer shrink-0"
        >
          <Send size={16} />
        </button>
      </div>
    </div>
  );
}
