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
  sm: { container: "h-7 w-7", border: "2px", px: 28 },
  md: { container: "h-16 w-16", border: "3px", px: 64 },
  lg: { container: "h-24 w-24", border: "3px", px: 96 },
};

/** Map TeammateState → profile emotion label */
function stateToEmotion(state: TeammateState): "listening" | "thinking" | "talking" {
  if (state === "thinking") return "thinking";
  if (state === "talking") return "talking";
  return "listening";
}

export function Avatar({
  teammateId,
  state = "idle",
  size = "md",
  onClick,
}: AvatarProps) {
  const t = teammates[teammateId];
  const s = sizes[size];

  const emotion = stateToEmotion(state);
  const src = `/profiles/${t.profile}-${emotion}-${t.profileVariant}.png`;

  const borderOpacity =
    state === "idle" ? "60" : state === "thinking" ? "90" : "ff";

  const glowStyle =
    state === "talking"
      ? `0 0 30px ${t.colorHex}35, 0 0 12px ${t.colorHex}25, 0 0 4px ${t.colorHex}15`
      : state === "thinking"
        ? `inset 0 0 20px ${t.colorHex}15`
        : `0 0 8px ${t.colorHex}08`;

  const animationClass =
    state === "idle"
      ? "animate-idle-bob"
      : state === "thinking"
        ? "animate-think-pulse"
        : "animate-talk-pulse";

  return (
    <div
      onClick={onClick}
      className={`${s.container} ${animationClass} flex items-center justify-center rounded-lg cursor-pointer transition-shadow duration-300 select-none overflow-hidden`}
      style={{
        backgroundColor: t.colorHex + "12",
        border: `${s.border} solid ${t.colorHex}${borderOpacity}`,
        boxShadow: glowStyle,
        backdropFilter: "blur(6px)",
      }}
    >
      <img
        src={src}
        alt={`${t.name} ${emotion}`}
        width={s.px}
        height={s.px}
        className="w-full h-full object-cover object-top"
        draggable={false}
      />
    </div>
  );
}
