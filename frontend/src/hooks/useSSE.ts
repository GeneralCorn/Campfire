"use client";

import { useCallback, useRef } from "react";

/**
 * Generic SSE / streaming fetch hook.
 * Pass a URL and an onEvent callback; get back connect + abort controls.
 */
export function useSSE<T = Record<string, unknown>>(
  onEvent: (data: T) => void
) {
  const abortRef = useRef<AbortController | null>(null);

  const connect = useCallback(
    async (url: string, body?: Record<string, unknown>) => {
      abortRef.current?.abort();
      abortRef.current = new AbortController();

      try {
        const res = await fetch(url, {
          method: body ? "POST" : "GET",
          headers: { "Content-Type": "application/json" },
          body: body ? JSON.stringify(body) : undefined,
          signal: abortRef.current.signal,
        });

        if (!res.ok || !res.body) return;

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            try {
              onEvent(JSON.parse(line.slice(6)) as T);
            } catch {
              // skip malformed events
            }
          }
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          console.error("[useSSE] stream error:", err);
        }
      }
    },
    [onEvent]
  );

  const abort = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return { connect, abort };
}
