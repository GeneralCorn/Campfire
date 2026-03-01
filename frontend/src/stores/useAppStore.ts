import { create } from "zustand";
import type {
  ChannelId,
  TeammateId,
  TeammateState,
  Message,
  Memory,
  SandboxEntry,
  ArtifactSection,
  AgentId,
  AgentState,
  DebateMessage,
  DebriefMessage,
  PipelineNodeId,
  PipelineNode,
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

  // Session
  currentSessionId: string;
  setCurrentSessionId: (id: string) => void;

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

  // Pipeline
  pipelineNodes: Record<PipelineNodeId, PipelineNode>;
  setPipelineNodeStatus: (id: PipelineNodeId, status: PipelineNode["status"], detail?: string) => void;
  resetPipeline: () => void;

  // Image upload
  pendingImage: string | null;
  setPendingImage: (img: string | null) => void;

  // Debate / Debrief
  debateStatus: "idle" | "running" | "complete";
  setDebateStatus: (s: "idle" | "running" | "complete") => void;
  sessionId: string | null;
  setSessionId: (id: string | null) => void;
  agentStates: Record<AgentId, AgentState>;
  setAgentState: (id: AgentId, patch: Partial<AgentState>) => void;
  debateTranscript: DebateMessage[];
  addDebateMessage: (msg: DebateMessage) => void;
  clearDebateTranscript: () => void;
  debriefLog: DebriefMessage[];
  addDebriefMessage: (msg: DebriefMessage) => void;
  clearDebriefLog: () => void;
  selectedDebriefAgent: AgentId;
  setSelectedDebriefAgent: (id: AgentId) => void;
}

export const useAppStore = create<AppState>((set) => ({
  // Navigation
  activeChannel: "team-room",
  setActiveChannel: (channel) => set({ activeChannel: channel }),

  // Teammates
  teammateStates: { maya: "idle", rex: "idle", sol: "idle" },
  setTeammateState: (id, state) =>
    set((s) => ({
      teammateStates: { ...s.teammateStates, [id]: state },
    })),
  resetAllTeammateStates: () =>
    set({ teammateStates: { maya: "idle", rex: "idle", sol: "idle" } }),
  focusedTeammate: null,
  setFocusedTeammate: (id) => set({ focusedTeammate: id }),
  hangoutTeammate: "maya",
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

  // Session
  currentSessionId: "",
  setCurrentSessionId: (id) => set({ currentSessionId: id }),

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

  // Pipeline
  pipelineNodes: {
    router:     { id: "router",     status: "pending", label: "Router" },
    maya:       { id: "maya",       status: "pending", label: "Maya — BioBERT" },
    rex:        { id: "rex",        status: "pending", label: "Rex — FDA" },
    sol:        { id: "sol",        status: "pending", label: "Sol — Viz" },
    synthesize: { id: "synthesize", status: "pending", label: "Synthesize" },
  },
  setPipelineNodeStatus: (id, status, detail) =>
    set((s) => ({
      pipelineNodes: {
        ...s.pipelineNodes,
        [id]: {
          ...s.pipelineNodes[id],
          status,
          ...(detail !== undefined ? { detail } : {}),
          ...(status === "running" ? { startedAt: Date.now() } : {}),
          ...(status === "done" ? { completedAt: Date.now() } : {}),
        },
      },
    })),
  resetPipeline: () =>
    set({
      pipelineNodes: {
        router:     { id: "router",     status: "pending", label: "Router" },
        maya:       { id: "maya",       status: "pending", label: "Maya — BioBERT" },
        rex:        { id: "rex",        status: "pending", label: "Rex — FDA" },
        sol:        { id: "sol",        status: "pending", label: "Sol — Viz" },
        synthesize: { id: "synthesize", status: "pending", label: "Synthesize" },
      },
    }),

  // Image upload
  pendingImage: null,
  setPendingImage: (img) => set({ pendingImage: img }),

  // Debate / Debrief
  debateStatus: "idle",
  setDebateStatus: (s) => set({ debateStatus: s }),
  sessionId: null,
  setSessionId: (id) => set({ sessionId: id }),
  agentStates: {
    scout:       { confidence: 0, sentiment: "neutral", speaking: false, thinking: false, spokenMessage: "" },
    critic:      { confidence: 0, sentiment: "neutral", speaking: false, thinking: false, spokenMessage: "" },
    synthesizer: { confidence: 0, sentiment: "neutral", speaking: false, thinking: false, spokenMessage: "" },
  },
  setAgentState: (id, patch) =>
    set((s) => ({
      agentStates: {
        ...s.agentStates,
        [id]: { ...s.agentStates[id], ...patch },
      },
    })),
  debateTranscript: [],
  addDebateMessage: (msg) =>
    set((s) => ({ debateTranscript: [...s.debateTranscript, msg] })),
  clearDebateTranscript: () => set({ debateTranscript: [] }),
  debriefLog: [],
  addDebriefMessage: (msg) =>
    set((s) => ({ debriefLog: [...s.debriefLog, msg] })),
  clearDebriefLog: () => set({ debriefLog: [] }),
  selectedDebriefAgent: "scout",
  setSelectedDebriefAgent: (id) => set({ selectedDebriefAgent: id }),
}));
