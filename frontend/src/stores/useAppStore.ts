import { create } from "zustand";
import type {
  DischargeState, PanelId, ConversationTurn, ActivityEntry,
  RoomId, LoungeMessage, RoomMessage,
} from "@/types";

interface AppState {
  // ── Navigation ──
  activePanel: PanelId;
  setActivePanel: (panel: PanelId) => void;

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

  // ── Care Team Activity (RightPanel) ──
  activities: ActivityEntry[];
  addActivity: (entry: ActivityEntry) => void;

  // ── Right panel ──
  rightPanelOpen: boolean;
  toggleRightPanel: () => void;

  // ── Room navigation ──
  activeRoom: RoomId;
  setActiveRoom: (room: RoomId) => void;

  // ── Care Team Lounge ──
  loungeMessages: LoungeMessage[];
  setLoungeMessages: (msgs: LoungeMessage[]) => void;
  addLoungeMessage: (msg: LoungeMessage) => void;
  loungeUnread: boolean;
  setLoungeUnread: (v: boolean) => void;

  // ── Agent room histories ──
  medicationRoomHistory: RoomMessage[];
  addMedicationRoomMessage: (msg: RoomMessage) => void;
  recoveryRoomHistory: RoomMessage[];
  addRecoveryRoomMessage: (msg: RoomMessage) => void;
  emergencyRoomHistory: RoomMessage[];
  addEmergencyRoomMessage: (msg: RoomMessage) => void;

  // ── Sidebar pulse animations ──
  pulsedRooms: Partial<Record<RoomId, boolean>>;
  setPulse: (room: RoomId, v: boolean) => void;
}

export const useAppStore = create<AppState>((set) => ({
  // Navigation
  activePanel: "overview",
  setActivePanel: (panel) => set({ activePanel: panel }),

  // Discharge data
  discharge: null,
  setDischarge: (data) => set({ discharge: data }),

  // Conversation
  conversation: [],
  addTurn: (turn) => set((s) => ({ conversation: [...s.conversation, turn] })),
  clearConversation: () => set({ conversation: [] }),

  // Streaming
  isStreaming: false,
  setIsStreaming: (v) => set({ isStreaming: v }),

  // Activities
  activities: [],
  addActivity: (entry) => set((s) => ({ activities: [...s.activities, entry] })),

  // Right panel
  rightPanelOpen: false,
  toggleRightPanel: () => set((s) => ({ rightPanelOpen: !s.rightPanelOpen })),

  // Room navigation
  activeRoom: "lounge",
  setActiveRoom: (room) => set({ activeRoom: room }),

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
}));
