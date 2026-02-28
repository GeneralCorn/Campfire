"""
Supermemory client wrapper for AgentFM.
Each teammate has their own container_tag for isolated memory.
A shared tag captures cross-teammate context.
"""

import os


class MemoryManager:
    def __init__(self):
        from supermemory import Supermemory

        self.client = Supermemory(api_key=os.environ.get("SUPERMEMORY_API_KEY", ""))

    def get_context(self, teammate_tag: str, query: str) -> dict:
        """Pull teammate's own memories + shared team state."""
        try:
            own = self.client.profile(container_tag=teammate_tag, q=query)
            shared = self.client.profile(container_tag="shared", q=query)
            return {
                "own_static": getattr(own.profile, "static", []),
                "own_dynamic": getattr(own.profile, "dynamic", []),
                "own_memories": [
                    r.get("memory", "")
                    for r in getattr(own.search_results, "results", [])
                ],
                "shared": [
                    r.get("memory", "")
                    for r in getattr(shared.search_results, "results", [])
                ],
            }
        except Exception:
            return {
                "own_static": [],
                "own_dynamic": [],
                "own_memories": [],
                "shared": [],
            }

    def add_memory(self, teammate_tag: str, content: str):
        """Store a memory for a teammate."""
        try:
            self.client.memories.add(
                content=f"[{teammate_tag}] {content}",
                metadata={"teammate": teammate_tag},
            )
        except Exception:
            pass

    def add_shared(self, content: str):
        """Store a shared team memory."""
        try:
            self.client.memories.add(
                content=content,
                metadata={"shared": True},
            )
        except Exception:
            pass

    def search(self, query: str, teammate_tag: str = None, limit: int = 10):
        """Search memories."""
        try:
            tags = [teammate_tag] if teammate_tag else None
            results = self.client.search.execute(q=query, container_tags=tags)
            return [
                {
                    "id": r.get("id", ""),
                    "content": r.get("memory", r.get("chunk", "")),
                    "teammate": teammate_tag,
                }
                for r in results.results[:limit]
            ]
        except Exception:
            return []

    def search_session(self, session_id: str, agent_tag: str, query: str, limit: int = 5) -> str:
        """
        Search memories scoped to a specific session for debrief mode.
        Uses containerTags to filter by session and metadata to filter by agent.
        Pattern from orchestrator.py query_debrief_memory().
        """
        import httpx

        url = "https://api.supermemory.ai/v4/search"
        api_key = os.environ.get("SUPERMEMORY_API_KEY", "")
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }

        payload: dict = {
            "q": query,
            "containerTags": [session_id],
            "limit": limit,
            "rerank": True,
        }

        if agent_tag and agent_tag != "all":
            payload["filters"] = {
                "AND": [{"key": "agent_id", "value": agent_tag}]
            }

        try:
            with httpx.Client(timeout=30.0) as client:
                resp = client.post(url, headers=headers, json=payload)
                resp.raise_for_status()
                data = resp.json()

                results = data.get("results", [])
                if not results:
                    return ""

                blocks = []
                for r in results:
                    metadata = r.get("metadata", {})
                    turn_num = metadata.get("turn_number", "?")
                    ag_id = metadata.get("agent_id", "unknown")
                    content = r.get("content", "")
                    blocks.append(f"[Turn {turn_num} - {ag_id.upper()}]\n{content}")

                return "\n\n".join(blocks)
        except Exception:
            return ""
