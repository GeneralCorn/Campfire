/**
 * API client helpers for AgentFM.
 */

export async function fetchMemories(teammateId?: string) {
  const params = teammateId ? `?teammate=${teammateId}` : "";
  const res = await fetch(`/api/memories${params}`);
  return res.json();
}
