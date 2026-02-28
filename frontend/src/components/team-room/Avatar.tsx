"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { TeammateId, TeammateState } from "@/types";
import { teammates } from "@/lib/teammates";
import {
  agentSprites,
  spritePath,
  SPRITE_RESOLUTION,
} from "@/lib/sprite-config";

interface AvatarProps {
  teammateId: TeammateId;
  state?: TeammateState;
  size?: "sm" | "md" | "lg";
  onClick?: () => void;
}

const sizes = {
  sm: { container: "h-7 w-7", text: "text-[8px]", border: "2px", px: 28 },
  md: { container: "h-16 w-16", text: "text-base", border: "3px", px: 64 },
  lg: { container: "h-24 w-24", text: "text-2xl", border: "3px", px: 96 },
};

export function Avatar({
  teammateId,
  state = "idle",
  size = "md",
  onClick,
}: AvatarProps) {
  const t = teammates[teammateId];
  const s = sizes[size];
  const spriteConfig = agentSprites[teammateId];

  const [frame, setFrame] = useState(0);
  const [spritesAvailable, setSpritesAvailable] = useState<boolean | null>(
    null
  );
  const directionRef = useRef(1); // for pingpong: 1 = forward, -1 = backward
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Check if sprites exist on mount
  useEffect(() => {
    if (!spriteConfig) {
      setSpritesAvailable(false);
      return;
    }
    const img = new Image();
    img.onload = () => setSpritesAvailable(true);
    img.onerror = () => setSpritesAvailable(false);
    img.src = spritePath(teammateId, "idle", 0);
  }, [teammateId, spriteConfig]);

  // Reset frame when state changes
  useEffect(() => {
    setFrame(0);
    directionRef.current = 1;
  }, [state]);

  // Animate frames
  const tick = useCallback(() => {
    if (!spriteConfig) return;
    const anim = spriteConfig.states[state];
    if (!anim || anim.frames <= 1) return;

    setFrame((prev) => {
      if (anim.loop === "pingpong") {
        const next = prev + directionRef.current;
        if (next >= anim.frames - 1) directionRef.current = -1;
        if (next <= 0) directionRef.current = 1;
        return Math.max(0, Math.min(anim.frames - 1, next));
      }
      // loop
      return (prev + 1) % anim.frames;
    });
  }, [spriteConfig, state]);

  useEffect(() => {
    if (!spritesAvailable || !spriteConfig) return;
    const anim = spriteConfig.states[state];
    if (!anim || anim.frames <= 1) return;

    intervalRef.current = setInterval(tick, anim.frameDuration);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [spritesAvailable, spriteConfig, state, tick]);

  // ── Style computation ───────────────────────────────────────────
  const borderOpacity =
    state === "idle" ? "60" : state === "thinking" ? "90" : "ff";

  const glowStyle =
    state === "talking"
      ? `0 0 30px ${t.colorHex}35, 0 0 12px ${t.colorHex}25, 0 0 4px ${t.colorHex}15`
      : state === "thinking"
        ? `inset 0 0 20px ${t.colorHex}15`
        : `0 0 8px ${t.colorHex}08`;

  // Keep CSS animation for the container (bob/pulse) even with sprites
  const animationClass =
    state === "idle"
      ? "animate-idle-bob"
      : state === "thinking"
        ? "animate-think-pulse"
        : "animate-talk-pulse";

  // ── Render ──────────────────────────────────────────────────────
  const renderContent = () => {
    if (spritesAvailable && spriteConfig) {
      const src = spritePath(teammateId, state, frame);
      return (
        <img
          src={src}
          alt={`${t.name} ${state}`}
          width={s.px}
          height={s.px}
          className="pixelated w-full h-full object-contain"
          draggable={false}
        />
      );
    }
    // Fallback: text badge
    return <span className={s.text}>{t.badge}</span>;
  };

  return (
    <div
      onClick={onClick}
      className={`${s.container} ${animationClass} flex items-center justify-center rounded-lg font-mono font-bold pixelated cursor-pointer transition-shadow duration-300 select-none overflow-hidden`}
      style={{
        backgroundColor: t.colorHex + "12",
        border: `${s.border} solid ${t.colorHex}${borderOpacity}`,
        color: t.colorHex,
        boxShadow: glowStyle,
        backdropFilter: "blur(6px)",
      }}
    >
      {renderContent()}
    </div>
  );
}
