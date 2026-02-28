export type TeammateId = "mika" | "rune" | "sage";
export type TeammateState = "idle" | "thinking" | "talking";
export type ChannelId =
  | "team-room"
  | "hangout"
  | "sandbox"
  | "memories";

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
