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
    name: "rounds",
    type: "voice",
    section: "VOICE CHANNELS",
    description: "Medical team rounds — Maya, Rex, and Sol working together",
  },
  {
    id: "hangout",
    name: "consult",
    type: "voice",
    section: "VOICE CHANNELS",
    description: "Voice chat — ask any agent about its reasoning",
  },
  {
    id: "debate",
    name: "lab",
    type: "voice",
    section: "WORKSPACE",
    description: "Full medical pipeline with live container graph",
  },
  {
    id: "debrief",
    name: "debrief-room",
    type: "voice",
    section: "DEBATE",
    description: "Interrogate any agent after the debate",
  },
  {
    id: "sandbox",
    name: "artifacts",
    type: "text",
    section: "WORKSPACE",
    description: "Documents and image upload for VLM analysis",
  },
  {
    id: "memories",
    name: "history",
    type: "text",
    section: "INSIGHTS",
    description: "Session memory and medication history",
  },
];
