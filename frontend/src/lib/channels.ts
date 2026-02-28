import type { ChannelId } from "@/types";

export interface Channel {
  id: ChannelId;
  name: string;
  type: "voice" | "text";
  section: string;
  description?: string;
}

export const channels: Channel[] = [
  {
    id: "team-room",
    name: "team-room",
    type: "voice",
    section: "VOICE CHANNELS",
    description: "Your AI team, working together",
  },
  {
    id: "hangout",
    name: "hangout",
    type: "voice",
    section: "VOICE CHANNELS",
    description: "Voice chat — interrogate any agent about its decisions",
  },
  {
    id: "sandbox",
    name: "sandbox",
    type: "text",
    section: "WORKSPACE",
    description: "Live view of task being executed",
  },
  {
    id: "memories",
    name: "memories",
    type: "text",
    section: "INSIGHTS",
    description: "Visual graph of team memories",
  },
];
