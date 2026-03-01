// ── Campfire Lab agent types (SSE / PipelineGraph) ───────────────────────────

export type TeammateId = "maya" | "rex" | "sol";
export type TeammateState = "idle" | "thinking" | "talking" | "interrupted" | "reacting" | "agreeing";
export type ChannelId =
  | "team-room"
  | "sandbox"
  | "memories"
  | "debate"
  | "hangout";

export type AgentId = "scout" | "critic" | "synthesizer";

export interface Teammate {
  id: string;
  name: string;
  role: string;
  badge: string;
  colorHex: string;
  personality: string;
  voiceId: string;
  profile: "man" | "woman";
  profileVariant: 1 | 2;
}

// ── Discharge data — mirrors backend/mock_data/discharge_state.json exactly ──

export interface PatientProfile {
  patient_name?: string;
  procedure: string;
  discharge_date: string;
  attending_physician: string;
}

export interface Medication {
  name: string;
  dosage: string;
  frequency: string;
  instructions: string;
  domain_flags: string[];
}

export interface Restriction {
  category: string;
  rule: string;
  timeline?: string;
  strict_prohibitions?: string[];
  sandbox_trigger?: string;
}

export interface WarnSign {
  symptom: string;
  implication: string;
  action: string;
  keywords?: string[];
}

export interface DischargeState {
  patient_profile: PatientProfile;
  medications: Medication[];
  restrictions: Restriction[];
  warning_signs: WarnSign[];
}

// ── Discovered warning signs (populated by agents through chat, not pre-loaded) ──

export interface DiscoveredWarning {
  id: string;
  symptom: string;
  severity: "urgent" | "watch";
  agent: string;
  timestamp: number;
}

// ── Navigation ──

export type PanelId =
  | "overview"
  | "medications"
  | "restrictions"
  | "warnings"
  | "ask";

// ── Room-based navigation ──

export type RoomId =
  | "lounge"
  | "medication-room"
  | "recovery-room"
  | "emergency-room"
  | "pt-studio"
  | "overview"
  | "medications"
  | "restrictions"
  | "warning-signs";

export type AgentRoomId = "medication-room" | "recovery-room" | "emergency-room";

export type AgentName = "Medication Agent" | "Recovery Agent" | "Emergency Agent";

// ── Lounge messages (Slack-style group feed, patient UI) ──

export interface LoungeMessage {
  id: string;
  agent: AgentName | "user";
  text: string;
  timestamp: number;
}

// ── Agent room messages (bubble-style 1-on-1) ──

export interface RoomMessage {
  id: string;
  role: "user" | "agent";
  text: string;
  timestamp: number;
}

// ── Conversation (Ask panel) ──

export interface ConversationTurn {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  /** Which domain the router classified this under */
  domain?: string;
}

// ── Care Team Activity (RightPanel) ──

export type ActivityRoute =
  | "medications"
  | "recovery"
  | "emergency"
  | "confer"
  | "blocked";

export interface ActivityEntry {
  id: string;
  timestamp: number;
  route: ActivityRoute;
  audio_text: string;
  off_topic: boolean;
}

// ── Lab / Debate messages (for SSE streaming and TeamRoom) ───────────────────

export interface Message {
  id: string;
  sender: TeammateId | "user" | "system";
  content: string;
  thinking?: string;
  action?: { type: string; detail: string };
  artifactUpdate?: string;
  confidence?: number;
  sentiment?: string;
  timestamp: number;
  channel: ChannelId;
  isStreaming?: boolean;
}

export interface Memory {
  id: string;
  content: string;
  teammateId: TeammateId;
  timestamp: number;
  crossSession?: boolean;
  referencedBy?: string[];
}

export interface SSEEvent {
  event: string;
  teammate?: TeammateId;
  [key: string]: unknown;
}

// ── Medication visualizer types (from Modal medication_visualizer.py) ──────────

export interface ScheduledMedication {
  name: string;
  dosage: string;
  frequency: string;
  instructions: string;
  color: string;
}

export type SlotId = "morning" | "afternoon" | "evening" | "night";

export interface ScheduleSlot {
  slot_id: SlotId;
  label: string;
  hours: string;
  color: string;
  medications: ScheduledMedication[];
}

export interface VisualData {
  image_base64: string;
  schedule: ScheduleSlot[];
  medication_count: number;
}

export interface SandboxEntry {
  id: string;
  teammateId: TeammateId;
  type: "log" | "write" | "flag";
  text: string;
  timestamp: number;
  model?: string;           // "vlm" | "mediapipe" | "mistral" | "research" | "biobert" | "viz" | "fda"
  gpuTier?: string;         // "T4" | "A10G" | "H100" etc.
  packages?: string[];      // pip packages installed in the sandbox
  executionContext?: "modal-gpu" | "modal-cpu" | "browser";
  gpuName?: string;         // e.g. "NVIDIA A10G · 24 GB VRAM"
}

export interface ArtifactSection {
  id?: string;
  heading: string;
  content: string;
  type?: string;
  authorId?: string;
}

// ── Pipeline visualization ──

export type PipelineNodeId = "router" | "maya" | "rex" | "sol" | "synthesize";
export type PipelineNodeStatus = "pending" | "running" | "sandbox" | "done";
export interface PipelineNode {
  id: PipelineNodeId;
  status: PipelineNodeStatus;
  label: string;
  detail?: string;
  gpu?: string | null;
  startedAt?: number;
  completedAt?: number;
}

// ── Agent states (for debate room) ──

export interface AgentState {
  confidence: number;
  sentiment: string;
  speaking: boolean;
  thinking: boolean;
  spokenMessage: string;
}

export interface DebateMessage {
  id: string;
  agentId: AgentId;
  content: string;
  confidence: number;
  sentiment: string;
  timestamp: number;
}

export interface DebriefMessage {
  id: string;
  role: "user" | "agent";
  agentId?: AgentId;
  content: string;
  timestamp: number;
}
