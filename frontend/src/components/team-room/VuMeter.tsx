"use client";

import { useEffect, useRef } from "react";
import type { TeammateId, TeammateState } from "@/types";
import { teammates } from "@/lib/teammates";

interface VuMeterProps {
  teammateId: TeammateId;
  state: TeammateState;
  barCount?: number;
}

export function VuMeter({ teammateId, state, barCount = 5 }: VuMeterProps) {
  const barsRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<number>(0);

  useEffect(() => {
    const el = barsRef.current;
    if (!el) return;

    const bars = el.children;

    function animate() {
      for (let i = 0; i < bars.length; i++) {
        const bar = bars[i] as HTMLDivElement;
        if (state === "talking") {
          const height = 30 + Math.random() * 70;
          bar.style.height = `${height}%`;
        } else if (state === "thinking") {
          const height = 15 + Math.sin(Date.now() / 300 + i) * 15;
          bar.style.height = `${height}%`;
        } else {
          bar.style.height = "15%";
        }
      }
      frameRef.current = requestAnimationFrame(animate);
    }

    if (state !== "idle") {
      animate();
    } else {
      for (let i = 0; i < bars.length; i++) {
        (bars[i] as HTMLDivElement).style.height = "15%";
      }
    }

    return () => cancelAnimationFrame(frameRef.current);
  }, [state]);

  const color = teammates[teammateId].colorHex;

  return (
    <div
      ref={barsRef}
      className="flex items-end gap-[2px] h-8 w-4"
    >
      {Array.from({ length: barCount }).map((_, i) => (
        <div
          key={i}
          className="w-[2px] rounded-full transition-[height] duration-100"
          style={{
            height: "15%",
            backgroundColor: color,
            opacity: state === "idle" ? 0.3 : 0.8,
          }}
        />
      ))}
    </div>
  );
}
