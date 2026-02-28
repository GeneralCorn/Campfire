"use client";

import type { TeammateId, TeammateState } from "@/types";
import { teammates } from "@/lib/teammates";

interface AvatarProps {
  teammateId: TeammateId;
  state?: TeammateState;
  size?: "sm" | "md" | "lg";
  onClick?: () => void;
}

const sizes = {
  sm: { container: "h-7 w-7", text: "text-[8px]", border: "2px" },
  md: { container: "h-16 w-16", text: "text-base", border: "3px" },
  lg: { container: "h-24 w-24", text: "text-2xl", border: "3px" },
};

export function Avatar({ teammateId, state = "idle", size = "md", onClick }: AvatarProps) {
  const t = teammates[teammateId];
  const s = sizes[size];

  const animationClass =
    state === "idle"
      ? "animate-idle-bob"
      : state === "thinking"
      ? "animate-think-pulse"
      : "animate-talk-pulse";

  const borderOpacity =
    state === "idle" ? "60" : state === "thinking" ? "90" : "ff";

  const glowStyle =
    state === "talking"
      ? `0 0 30px ${t.colorHex}35, 0 0 12px ${t.colorHex}25, 0 0 4px ${t.colorHex}15`
      : state === "thinking"
      ? `inset 0 0 20px ${t.colorHex}15`
      : `0 0 8px ${t.colorHex}08`;

  return (
    <div
      onClick={onClick}
      className={`${s.container} ${animationClass} flex items-center justify-center rounded-lg font-mono font-bold pixelated cursor-pointer transition-shadow duration-300 select-none`}
      style={{
        backgroundColor: t.colorHex + "12",
        border: `${s.border} solid ${t.colorHex}${borderOpacity}`,
        color: t.colorHex,
        boxShadow: glowStyle,
        backdropFilter: "blur(6px)",
        fontSize: undefined,
      }}
    >
      <span className={s.text}>{t.badge}</span>
    </div>
  );
}
