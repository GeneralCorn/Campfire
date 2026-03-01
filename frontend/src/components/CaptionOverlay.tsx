"use client";

import { useEffect, useState } from "react";
import { useAppStore } from "@/stores/useAppStore";

export function CaptionOverlay() {
  const captionText = useAppStore((s) => s.captionText);
  const [visible, setVisible] = useState(false);
  const [displayText, setDisplayText] = useState("");

  useEffect(() => {
    if (captionText) {
      setDisplayText(captionText);
      setVisible(true);
    } else {
      // Fade out, then clear text
      setVisible(false);
      const t = setTimeout(() => setDisplayText(""), 500);
      return () => clearTimeout(t);
    }
  }, [captionText]);

  if (!displayText) return null;

  return (
    <div
      className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[9999] pointer-events-none transition-opacity duration-500 max-w-[80vw]"
      style={{ opacity: visible ? 1 : 0 }}
    >
      <div className="bg-black/85 text-white text-sm leading-relaxed px-5 py-3 rounded-lg shadow-lg backdrop-blur-sm">
        {displayText}
      </div>
    </div>
  );
}
