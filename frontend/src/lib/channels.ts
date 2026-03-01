import type { PanelId } from "@/types";

export interface Channel {
  id: PanelId;
  name: string;
  type: "text" | "voice";
  section: string;
  description: string;
}

export const channels: Channel[] = [
  {
    id: "overview",
    name: "overview",
    type: "text",
    section: "PATIENT",
    description: "Procedure summary and discharge details",
  },
  {
    id: "medications",
    name: "medications",
    type: "text",
    section: "PATIENT",
    description: "Medication schedule and instructions",
  },
  {
    id: "restrictions",
    name: "restrictions",
    type: "text",
    section: "PATIENT",
    description: "Activity restrictions and wound care",
  },
  {
    id: "warnings",
    name: "warning signs",
    type: "text",
    section: "PATIENT",
    description: "Symptoms requiring immediate action",
  },
  {
    id: "ask",
    name: "ask copilot",
    type: "voice",
    section: "COPILOT",
    description: "Voice Q&A — ask anything about your care plan",
  },
];
