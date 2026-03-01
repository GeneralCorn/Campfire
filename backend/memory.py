"""
Generic Supermemory client wrapper.
Each agent or session gets its own namespace for isolated memory.
A shared namespace captures cross-agent context.

Also provides fast in-memory chat history per session for
contextual follow-up awareness in the LangGraph orchestrator.
"""

import os
from collections import defaultdict


class MemoryManager:
    def __init__(self):
        try:
            from supermemory import Supermemory
            self.client = Supermemory(api_key=os.environ.get("SUPERMEMORY_API_KEY", ""))
        except Exception:
            self.client = None

        # In-memory chat history store: { session_id: [ {role, text, agent_type} ] }
        self._history: dict[str, list[dict]] = defaultdict(list)

    # ── Chat history (in-memory, fast) ──────────────────────────────────────

    def get_history(self, session_id: str, limit: int = 4) -> list[dict]:
        """Return the last `limit` interactions for a session."""
        return self._history[session_id][-limit:]

    def get_history_string(self, session_id: str, limit: int = 4) -> str:
        """Return chat history formatted as a readable string for prompt injection."""
        turns = self.get_history(session_id, limit)
        if not turns:
            return "No previous conversation."
        lines: list[str] = []
        for turn in turns:
            lines.append(f"User: {turn['user_query']}")
            lines.append(f"Agent: {turn['agent_response']}")
        return "\n".join(lines)

    def add_interaction(
        self,
        session_id: str,
        user_query: str,
        agent_response: str,
        agent_type: str,
    ) -> None:
        """Save a user→agent interaction to session history."""
        self._history[session_id].append({
            "user_query": user_query,
            "agent_response": agent_response,
            "agent_type": agent_type,
        })
        # Cap per-session history at 50 turns to avoid memory bloat
        if len(self._history[session_id]) > 50:
            self._history[session_id] = self._history[session_id][-50:]

    # ── Supermemory semantic search (existing) ──────────────────────────────

    def get_context(self, namespace: str, query: str) -> dict:
        """Pull namespace-scoped memories + shared context."""
        if not self.client:
            return {"own_memories": [], "shared": []}
        try:
            own = self.client.profile(container_tag=namespace, q=query)
            shared = self.client.profile(container_tag="shared", q=query)
            return {
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
            return {"own_memories": [], "shared": []}

    def add_memory(self, namespace: str, content: str):
        """Store a memory under a namespace."""
        if not self.client:
            return
        try:
            self.client.memories.add(
                content=content,
                metadata={"namespace": namespace},
            )
        except Exception:
            pass

    def add_shared(self, content: str):
        """Store a cross-agent shared memory."""
        if not self.client:
            return
        try:
            self.client.memories.add(
                content=content,
                metadata={"shared": True},
            )
        except Exception:
            pass

    def search(self, query: str, namespace: str = None, limit: int = 10) -> list:
        """Search memories, optionally filtered by namespace."""
        if not self.client:
            return []
        try:
            tags = [namespace] if namespace else None
            results = self.client.search.execute(q=query, container_tags=tags)
            return [
                {
                    "id": r.get("id", ""),
                    "content": r.get("memory", r.get("chunk", "")),
                    "namespace": namespace,
                }
                for r in results.results[:limit]
            ]
        except Exception:
            return []

