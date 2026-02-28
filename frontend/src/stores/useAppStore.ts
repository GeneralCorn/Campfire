import { create } from "zustand";
import type {
  ChannelId,
  TeammateId,
  TeammateState,
  Message,
  Memory,
  SandboxEntry,
  ArtifactSection,
} from "@/types";

interface AppState {
  // Navigation
  activeChannel: ChannelId;
  setActiveChannel: (channel: ChannelId) => void;

  // Teammates
  teammateStates: Record<TeammateId, TeammateState>;
  setTeammateState: (id: TeammateId, state: TeammateState) => void;
  resetAllTeammateStates: () => void;
  focusedTeammate: TeammateId | null;
  setFocusedTeammate: (id: TeammateId | null) => void;
  hangoutTeammate: TeammateId;
  setHangoutTeammate: (id: TeammateId) => void;

  // Messages
  messages: Message[];
  addMessage: (message: Message) => void;
  appendToMessage: (id: string, delta: string) => void;
  setMessageStreaming: (id: string, streaming: boolean) => void;

  // Sandbox
  sandboxEntries: SandboxEntry[];
  addSandboxEntry: (entry: SandboxEntry) => void;
  artifactSections: ArtifactSection[];
  setArtifactSection: (section: ArtifactSection) => void;

  // Memories
  memories: Memory[];
  addMemory: (memory: Memory) => void;

  // UI state
  rightPanelOpen: boolean;
  toggleRightPanel: () => void;
  isStreaming: boolean;
  setIsStreaming: (streaming: boolean) => void;
  demoPlaying: boolean;
  setDemoPlaying: (playing: boolean) => void;
  isLive: boolean;
  setIsLive: (live: boolean) => void;
  elapsedTime: number;
  setElapsedTime: (time: number) => void;
}

export const useAppStore = create<AppState>((set) => ({
  // Navigation
  activeChannel: "team-room",
  setActiveChannel: (channel) => set({ activeChannel: channel }),

  // Teammates
  teammateStates: { mika: "idle", rune: "idle", sage: "idle" },
  setTeammateState: (id, state) =>
    set((s) => ({
      teammateStates: { ...s.teammateStates, [id]: state },
    })),
  resetAllTeammateStates: () =>
    set({ teammateStates: { mika: "idle", rune: "idle", sage: "idle" } }),
  focusedTeammate: null,
  setFocusedTeammate: (id) => set({ focusedTeammate: id }),
  hangoutTeammate: "mika",
  setHangoutTeammate: (id) => set({ hangoutTeammate: id }),

  // Messages
  messages: [],
  addMessage: (message) =>
    set((s) => ({ messages: [...s.messages, message] })),
  appendToMessage: (id, delta) =>
    set((s) => ({
      messages: s.messages.map((m) =>
        m.id === id ? { ...m, content: m.content + delta } : m
      ),
    })),
  setMessageStreaming: (id, streaming) =>
    set((s) => ({
      messages: s.messages.map((m) =>
        m.id === id ? { ...m, isStreaming: streaming } : m
      ),
    })),

  // Sandbox
  sandboxEntries: [],
  addSandboxEntry: (entry) =>
    set((s) => ({ sandboxEntries: [...s.sandboxEntries, entry] })),
  artifactSections: [],
  setArtifactSection: (section) =>
    set((s) => {
      const existing = s.artifactSections.findIndex(
        (a) => a.heading === section.heading
      );
      if (existing >= 0) {
        const updated = [...s.artifactSections];
        updated[existing] = section;
        return { artifactSections: updated };
      }
      return { artifactSections: [...s.artifactSections, section] };
    }),

  // Memories
  memories: [],
  addMemory: (memory) =>
    set((s) => ({ memories: [...s.memories, memory] })),

  // UI state
  rightPanelOpen: true,
  toggleRightPanel: () =>
    set((s) => ({ rightPanelOpen: !s.rightPanelOpen })),
  isStreaming: false,
  setIsStreaming: (streaming) => set({ isStreaming: streaming }),
  demoPlaying: false,
  setDemoPlaying: (playing) => set({ demoPlaying: playing }),
  isLive: false,
  setIsLive: (live) => set({ isLive: live }),
  elapsedTime: 0,
  setElapsedTime: (time) => set({ elapsedTime: time }),
}));
