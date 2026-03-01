/**
 * Generic API client helpers.
 * Replace these with domain-specific calls as the new product takes shape.
 */

const BACKEND_URL = "http://localhost:8000";

export async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BACKEND_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) throw new Error(`API error ${res.status}: ${res.statusText}`);
  return res.json() as Promise<T>;
}

export function buildWsUrl(path: string): string {
  return `ws://localhost:8001${path}`;
}
