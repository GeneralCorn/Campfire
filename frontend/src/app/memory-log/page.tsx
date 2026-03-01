"use client";

import { useAppStore } from "@/stores/useAppStore";
import { teammates } from "@/lib/teammates";

export default function MemoryLogPage() {
  const memories = useAppStore((s) => s.memories);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0a0a0f",
        color: "#e0e0e0",
        fontFamily: "monospace",
        padding: "2rem",
      }}
    >
      <h1 style={{ fontSize: "1.25rem", marginBottom: "0.25rem" }}>
        Memory Log
      </h1>
      <p style={{ fontSize: "0.75rem", color: "#666", marginBottom: "1.5rem" }}>
        {memories.length} entries
      </p>

      {memories.length === 0 && (
        <p style={{ color: "#555" }}>
          No memories yet. Run a session in Team Room to populate.
        </p>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        {memories.map((m) => {
          const t = teammates[m.teammateId];
          const color = t?.colorHex ?? "#888";
          const time = new Date(m.timestamp).toLocaleTimeString();

          return (
            <div
              key={m.id}
              style={{
                borderLeft: `3px solid ${color}`,
                padding: "0.5rem 0.75rem",
                background: `${color}08`,
                borderRadius: "0 4px 4px 0",
              }}
            >
              <div
                style={{
                  display: "flex",
                  gap: "0.75rem",
                  fontSize: "0.7rem",
                  color: "#666",
                  marginBottom: "0.25rem",
                }}
              >
                <span style={{ color }}>{t?.name ?? m.teammateId}</span>
                <span>{time}</span>
                {m.crossSession && <span style={{ color: "#FFE66D" }}>cross-session</span>}
              </div>
              <div style={{ fontSize: "0.8rem", whiteSpace: "pre-wrap" }}>
                {m.content}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
