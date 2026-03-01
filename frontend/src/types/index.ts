export type TeammateId = "maya" | "rex" | "sol";
export type TeammateState = "idle" | "thinking" | "talking" | "interrupted" | "reacting" | "agreeing";
export type ChannelId =
  | "team-room"
  | "sandbox"
  | "memories"
  | "debate";

export type AgentId = "scout" | "critic" | "synthesizer";

export interface AgentState {
  confidence: number;
  sentiment: string;
  speaking: boolean;
  thinking: boolean;
  spokenMessage: string;
}

export interface DebateMessage {
  id: string;
  agentId: AgentId | "system";
  content: string;
  timestamp: number;
}

export interface DebriefMessage {
  id: string;
  role: "user" | AgentId;
  content: string;
  timestamp: number;
  confidence?: number;
  sentiment?: string;
}

export interface Teammate {
  id: TeammateId;
  name: string;
  role: string;
  badge: string;
  colorHex: string;
  personality: string;
  voiceId: string;
}

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

export interface SandboxEntry {
  id: string;
  teammateId: TeammateId;
  type: "log" | "write" | "flag";
  text: string;
  timestamp: number;
}

export interface ArtifactSection {
  id: string;
  heading: string;
  content: string;
  authorId: TeammateId;
  timestamp: number;
}

// Pipeline visualization
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
