import type { Teammate } from "@/types";

export const teammates: Record<string, Teammate> = {
  mika: {
    id: "mika",
    name: "Mika",
    role: "The Finder",
    badge: "MIK",
    colorHex: "#4ECDC4",
    personality: "Curious, energetic, thorough. Gets excited about rabbit holes.",
    voiceId: "21m00Tcm4TlvDq8ikWAM",
  },
  rune: {
    id: "rune",
    name: "Rune",
    role: "The Skeptic",
    badge: "RUN",
    colorHex: "#FF6B6B",
    personality: "Sharp, dry humor, cuts through BS. Not mean — just precise.",
    voiceId: "29vD33N1CtxCmqQRPOHJ",
  },
  sage: {
    id: "sage",
    name: "Sage",
    role: "The Builder",
    badge: "SAG",
    colorHex: "#FFE66D",
    personality: "Calm, decisive, sees the big picture. Pulls threads together.",
    voiceId: "EXAVITQu4vr4xnSDxMaL",
  },
};

export const teammateList = Object.values(teammates);
export const teammateIds = Object.keys(teammates) as Array<keyof typeof teammates>;
