export type TeammateId = "mika" | "rune" | "sage";
export type TeammateState = "idle" | "thinking" | "talking" | "interrupted" | "reacting" | "agreeing";
export type ChannelId =
  | "team-room"
  | "hangout"
  | "sandbox"
  | "memories"
  | "debate"
  | "debrief";

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
