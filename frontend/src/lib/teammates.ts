import type { Teammate, TeammateId } from "@/types";

export const teammates: Record<string, Teammate> = {
  maya: {
    id: "maya",
    name: "Maya",
    role: "The Researcher",
    badge: "MAY",
    colorHex: "#4ECDC4",
    personality: "Methodical, thorough, detail-oriented. Reads prescriptions and searches PubMed.",
    voiceId: "21m00Tcm4TlvDq8ikWAM",
    profile: "woman",
    profileVariant: 1,
  },
  rex: {
    id: "rex",
    name: "Rex",
    role: "The Safety Checker",
    badge: "REX",
    colorHex: "#FF6B6B",
    personality: "Careful, authoritative, never hand-waves safety concerns. Cross-references FDA databases.",
    voiceId: "29vD33N1CtxCmqQRPOHJ",
    profile: "man",
    profileVariant: 1,
  },
  sol: {
    id: "sol",
    name: "Sol",
    role: "The Synthesizer",
    badge: "SOL",
    colorHex: "#FFE66D",
    personality: "Warm, clear, makes complex medical information accessible.",
    voiceId: "EXAVITQu4vr4xnSDxMaL",
    profile: "man",
    profileVariant: 2,
  },
};

export const teammateList = Object.values(teammates);
export const teammateIds = Object.keys(teammates) as Array<keyof typeof teammates>;

/** Map backend agent_id (orchestrator.py) → frontend TeammateId */
export const AGENT_TO_TEAMMATE: Record<string, TeammateId> = {
  maya: "maya",
  rex: "rex",
  sol: "sol",
};

/** Map frontend TeammateId → backend agent_id */
export const TEAMMATE_TO_AGENT: Record<TeammateId, string> = {
  maya: "maya",
  rex: "rex",
  sol: "sol",
};
