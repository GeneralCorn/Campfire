import { create } from "zustand";
import type {
  // Patient UI types
  DischargeState, PanelId, ConversationTurn, ActivityEntry,
  RoomId, LoungeMessage, RoomMessage,
  // Lab / SSE types
  ChannelId, TeammateId, TeammateState,
  Message, Memory, SandboxEntry, ArtifactSection,
  AgentId, AgentState, DebateMessage, DebriefMessage,
  PipelineNodeId, PipelineNode, DiscoveredWarning,
  ExerciseId,
} from "@/types";

export interface VLMScanResult {
  patient_info?: { name?: string; discharge_date?: string; procedure?: string; doctor?: string };
  medications: { name: string; dosage: string; frequency: string; instructions: string; warnings?: string }[];
  restrictions: { activity: string; duration: string; details: string }[];
  warning_signs: { symptom: string; severity: string; action: string }[];
}

interface AppState {
  // ── Navigation (patient UI) ──
  activePanel: PanelId;
  setActivePanel: (panel: PanelId) => void;

  // ── Room navigation (patient UI) ──
  activeRoom: RoomId;
  setActiveRoom: (room: RoomId) => void;

  // ── Active channel (lab pipeline) ──
  activeChannel: ChannelId;
  setActiveChannel: (ch: ChannelId) => void;

  // ── Discharge data (loaded once from API / mock) ──
  discharge: DischargeState | null;
  setDischarge: (data: DischargeState) => void;

  // ── Conversation (Ask panel) ──
  conversation: ConversationTurn[];
  addTurn: (turn: ConversationTurn) => void;
  clearConversation: () => void;

  // ── Streaming state ──
  isStreaming: boolean;
  setIsStreaming: (v: boolean) => void;

  isLive: boolean;
  setIsLive: (v: boolean) => void;

  demoPlaying: boolean;
  setDemoPlaying: (v: boolean) => void;

  elapsedTime: number;
  setElapsedTime: (t: number) => void;

  // ── Care Team Activity (RightPanel) ──
  activities: ActivityEntry[];
  addActivity: (entry: ActivityEntry) => void;

  // ── Right panel ──
  rightPanelOpen: boolean;
  toggleRightPanel: () => void;

  // ── Care Team Lounge (patient UI) ──
  loungeMessages: LoungeMessage[];
  setLoungeMessages: (msgs: LoungeMessage[]) => void;
  addLoungeMessage: (msg: LoungeMessage) => void;
  loungeUnread: boolean;
  setLoungeUnread: (v: boolean) => void;

  // ── Agent room histories (patient UI) ──
  medicationRoomHistory: RoomMessage[];
  addMedicationRoomMessage: (msg: RoomMessage) => void;
  recoveryRoomHistory: RoomMessage[];
  addRecoveryRoomMessage: (msg: RoomMessage) => void;
  emergencyRoomHistory: RoomMessage[];
  addEmergencyRoomMessage: (msg: RoomMessage) => void;

  // ── Sidebar pulse animations ──
  pulsedRooms: Partial<Record<RoomId, boolean>>;
  setPulse: (room: RoomId, v: boolean) => void;

  // ── Lab messages (SSE streaming / TeamRoom) ──
  messages: Message[];
  addMessage: (msg: Message) => void;
  appendToMessage: (id: string, text: string) => void;
  setMessageStreaming: (id: string, v: boolean) => void;

  // ── Teammate states (lab / debate) ──
  teammateStates: Record<TeammateId, TeammateState>;
  setTeammateState: (id: TeammateId, state: TeammateState) => void;
  resetAllTeammateStates: () => void;
  focusedTeammate: TeammateId | null;
  setFocusedTeammate: (id: TeammateId | null) => void;
  hangoutTeammate: TeammateId;
  setHangoutTeammate: (id: TeammateId) => void;

  // ── Sandbox entries (PipelineGraph log) ──
  sandboxEntries: SandboxEntry[];
  addSandboxEntry: (entry: SandboxEntry) => void;

  // ── Memories ──
  memories: Memory[];
  addMemory: (memory: Memory) => void;

  // ── Artifacts ──
  artifactSections: ArtifactSection[];
  setArtifactSection: (section: ArtifactSection) => void;

  // ── Session ──
  currentSessionId: string;
  setCurrentSessionId: (id: string) => void;

  // ── Discovered warning signs (populated through chat, starts empty) ──
  discoveredWarnings: DiscoveredWarning[];
  addDiscoveredWarning: (w: DiscoveredWarning) => void;

  // ── PT Studio exercise routing ──
  ptExercise: ExerciseId | null;
  setPtExercise: (ex: ExerciseId | null) => void;

  // ── Captions (accessibility overlay for TTS audio) ──
  captionText: string;
  setCaptionText: (text: string) => void;

  // ── VLM scan state (persists across tab switches) ──
  scanPreview: string | null;
  setScanPreview: (img: string | null) => void;
  scanResult: VLMScanResult | null;
  setScanResult: (r: VLMScanResult | null) => void;
  scanMerged: boolean;
  setScanMerged: (v: boolean) => void;
  mergeVLMScan: (vlm: VLMScanResult) => void;

  // ── Image upload ──
  pendingImage: string | null;
  setPendingImage: (img: string | null) => void;

  // ── Pipeline ──
  pipelineNodes: Record<PipelineNodeId, PipelineNode>;
  setPipelineNodeStatus: (id: PipelineNodeId, status: PipelineNode["status"], detail?: string) => void;
  resetPipeline: () => void;

  // ── Debate / Debrief ──
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

const DEFAULT_PIPELINE_NODES: Record<PipelineNodeId, PipelineNode> = {
  router:     { id: "router",     status: "pending", label: "Router" },
  maya:       { id: "maya",       status: "pending", label: "Maya — BioBERT" },
  rex:        { id: "rex",        status: "pending", label: "Rex — FDA" },
  sol:        { id: "sol",        status: "pending", label: "Sol — Viz" },
  synthesize: { id: "synthesize", status: "pending", label: "Synthesize" },
};

export const useAppStore = create<AppState>((set) => ({
  // Navigation
  activePanel: "overview",
  setActivePanel: (panel) => set({ activePanel: panel }),

  // Room navigation
  activeRoom: "lounge",
  setActiveRoom: (room) => set({ activeRoom: room }),

  // Active channel (lab)
  activeChannel: "team-room",
  setActiveChannel: (ch) => set({ activeChannel: ch }),

  // Discharge data
  discharge: null,
  setDischarge: (data) => set({ discharge: data }),

  // VLM scan state (persists across tab switches)
  scanPreview: null,
  setScanPreview: (img) => set({ scanPreview: img }),
  scanResult: null,
  setScanResult: (r) => set({ scanResult: r }),
  scanMerged: false,
  setScanMerged: (v) => set({ scanMerged: v }),

  // VLM scan merge — map VLM schema → discharge schema, deduplicate, append
  mergeVLMScan: (vlm) =>
    set((s) => {
      if (!s.discharge) return {};
      const d = s.discharge;

      // Deduplicate medications by lowercase name
      const existingMedNames = new Set(d.medications.map((m) => m.name.toLowerCase()));
      const newMeds = vlm.medications
        .filter((m) => m.name && !existingMedNames.has(m.name.toLowerCase()))
        .map((m) => ({
          name: m.name,
          dosage: m.dosage || "",
          frequency: m.frequency || "",
          instructions: m.instructions || "",
          domain_flags: ["rx-scan"] as string[],
        }));

      // Deduplicate restrictions by lowercase category
      const existingCats = new Set(d.restrictions.map((r) => r.category.toLowerCase()));
      const newRestrictions = vlm.restrictions
        .filter((r) => r.activity && !existingCats.has(r.activity.toLowerCase()))
        .map((r) => ({
          category: r.activity,
          rule: r.details || "",
          timeline: r.duration || undefined,
        }));

      // Deduplicate warning signs by lowercase symptom
      const existingSymptoms = new Set(d.warning_signs.map((w) => w.symptom.toLowerCase()));
      const newWarnings = vlm.warning_signs
        .filter((w) => w.symptom && !existingSymptoms.has(w.symptom.toLowerCase()))
        .map((w) => ({
          symptom: w.symptom,
          implication: w.severity || "",
          action: w.action || "",
        }));

      return {
        discharge: {
          ...d,
          medications: [...d.medications, ...newMeds],
          restrictions: [...d.restrictions, ...newRestrictions],
          warning_signs: [...d.warning_signs, ...newWarnings],
        },
      };
    }),

  // Conversation
  conversation: [],
  addTurn: (turn) => set((s) => ({ conversation: [...s.conversation, turn] })),
  clearConversation: () => set({ conversation: [] }),

  // Streaming
  isStreaming: false,
  setIsStreaming: (v) => set({ isStreaming: v }),

  isLive: false,
  setIsLive: (v) => set({ isLive: v }),

  demoPlaying: false,
  setDemoPlaying: (v) => set({ demoPlaying: v }),

  elapsedTime: 0,
  setElapsedTime: (t) => set({ elapsedTime: t }),

  // Activities
  activities: [],
  addActivity: (entry) => set((s) => ({ activities: [...s.activities, entry] })),

  // Right panel
  rightPanelOpen: false,
  toggleRightPanel: () => set((s) => ({ rightPanelOpen: !s.rightPanelOpen })),

  // Care Team Lounge
  loungeMessages: [],
  setLoungeMessages: (msgs) => set({ loungeMessages: msgs }),
  addLoungeMessage: (msg) => set((s) => ({ loungeMessages: [...s.loungeMessages, msg] })),
  loungeUnread: false,
  setLoungeUnread: (v) => set({ loungeUnread: v }),

  // Agent room histories
  medicationRoomHistory: [],
  addMedicationRoomMessage: (msg) => set((s) => ({ medicationRoomHistory: [...s.medicationRoomHistory, msg] })),
  recoveryRoomHistory: [],
  addRecoveryRoomMessage: (msg) => set((s) => ({ recoveryRoomHistory: [...s.recoveryRoomHistory, msg] })),
  emergencyRoomHistory: [],
  addEmergencyRoomMessage: (msg) => set((s) => ({ emergencyRoomHistory: [...s.emergencyRoomHistory, msg] })),

  // Sidebar pulse animations
  pulsedRooms: {},
  setPulse: (room, v) => set((s) => ({ pulsedRooms: { ...s.pulsedRooms, [room]: v } })),

  // Lab messages
  messages: [],
  addMessage: (msg) => set((s) => ({ messages: [...s.messages, msg] })),
  appendToMessage: (id, text) =>
    set((s) => ({
      messages: s.messages.map((m) =>
        m.id === id ? { ...m, content: m.content + text } : m
      ),
    })),
  setMessageStreaming: (id, v) =>
    set((s) => ({
      messages: s.messages.map((m) =>
        m.id === id ? { ...m, isStreaming: v } : m
      ),
    })),

  // Teammate states
  teammateStates: { maya: "idle", rex: "idle", sol: "idle" },
  setTeammateState: (id, state) =>
    set((s) => ({ teammateStates: { ...s.teammateStates, [id]: state } })),
  resetAllTeammateStates: () =>
    set({ teammateStates: { maya: "idle", rex: "idle", sol: "idle" } }),
  focusedTeammate: null,
  setFocusedTeammate: (id) => set({ focusedTeammate: id }),
  hangoutTeammate: "maya",
  setHangoutTeammate: (id) => set({ hangoutTeammate: id }),

  // Sandbox entries
  sandboxEntries: [],
  addSandboxEntry: (entry) =>
    set((s) => ({ sandboxEntries: [...s.sandboxEntries, entry] })),

  // Memories
  memories: [],
  addMemory: (memory) =>
    set((s) => ({ memories: [...s.memories, memory] })),

  // Artifacts
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

  // Session
  currentSessionId: "",
  setCurrentSessionId: (id) => set({ currentSessionId: id }),

  // Discovered warning signs
  discoveredWarnings: [],
  addDiscoveredWarning: (w) =>
    set((s) => ({ discoveredWarnings: [...s.discoveredWarnings, w] })),

  // PT Studio exercise routing
  ptExercise: null,
  setPtExercise: (ex) => set({ ptExercise: ex }),

  // Captions
  captionText: "",
  setCaptionText: (text) => set({ captionText: text }),

  // Image upload
  pendingImage: null,
  setPendingImage: (img) => set({ pendingImage: img }),

  // Pipeline
  pipelineNodes: { ...DEFAULT_PIPELINE_NODES },
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
  resetPipeline: () => set({ pipelineNodes: { ...DEFAULT_PIPELINE_NODES } }),

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
