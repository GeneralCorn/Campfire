"""
AgentFM Modal Backend — Single agent_respond function.

One function, any teammate. Pass a config dict, get a response.
Modal auto-scales containers: 3 agents = 3 containers, 10 = 10.
"""

import json
import re
import os
import modal

app = modal.App("agentfm")

image = modal.Image.debian_slim(python_version="3.11").pip_install(
    "anthropic",
    "supermemory",
    "httpx",
)


def parse_json_response(text: str) -> dict:
    """Parse JSON from LLM response, handling markdown fences."""
    text = re.sub(r"```json\s*", "", text)
    text = re.sub(r"```\s*$", "", text)
    try:
        return json.loads(text.strip())
    except json.JSONDecodeError:
        return {
            "thinking": "",
            "result": text.strip(),
            "action": {"type": "none", "detail": ""},
            "artifact_update": None,
            "memory": None,
            "voice_text": text.strip()[:200],
        }


@app.function(
    image=image,
    secrets=[modal.Secret.from_name("agentfm-secrets")],
    timeout=120,
)
async def agent_respond(
    config: dict,
    conversation_history: list,
    current_input: str,
    mode: str = "task",
    task: str = "",
) -> dict:
    """
    Combined Task Agent + Voice Agent in one container call.

    1. Task Agent (Sonnet) — does the actual work
    2. Voice Agent (Haiku) — distills to 2-3 spoken sentences
    3. Stores memory if result has one
    4. Returns { thinking, result, action, artifact_update, memory, voice_text }
    """
    from anthropic import Anthropic
    from memory import MemoryManager

    llm = Anthropic()
    mem = MemoryManager()

    # --- Get memory context ---
    context = mem.get_context(config["supermemory_tag"], current_input)

    memory_block = ""
    if any(context.values()):
        parts = []
        if context["own_memories"]:
            parts.append(
                "YOUR MEMORIES:\n" + "\n".join(f"- {m}" for m in context["own_memories"] if m)
            )
        if context["shared"]:
            parts.append(
                "TEAM CONTEXT:\n" + "\n".join(f"- {m}" for m in context["shared"] if m)
            )
        memory_block = "\n\n".join(parts)

    # --- Build task agent prompt ---
    task_block = f"\nCURRENT TASK: {task}" if task else ""
    mode_instruction = {
        "task": "You're working on a task with your team. Stay focused, be collaborative.",
        "chat": "You're hanging out. Be yourself. Reference past work if relevant.",
    }.get(mode, "")

    system = f"""{config['system_prompt']}

{mode_instruction}
{task_block}

{memory_block}

Respond with JSON (no markdown fences):
{{
  "thinking": "Your internal thought process (1-2 sentences)",
  "result": "Your main finding or response content",
  "action": {{ "type": "search|review|flag|write|none", "detail": "what you did" }},
  "artifact_update": "If you're writing/updating a document section, put it here. Otherwise null.",
  "memory": "Key fact to remember for later (or null if nothing worth storing)"
}}"""

    # --- Task Agent call (Sonnet — the heavy lift) ---
    task_response = llm.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=1024,
        system=system,
        messages=[
            *conversation_history,
            {"role": "user", "content": current_input},
        ],
    )

    task_result = parse_json_response(task_response.content[0].text)

    # --- Voice Agent call (Haiku — lightweight distillation) ---
    voice_prompt = f"""{config.get('voice_personality', 'Summarize in 2-3 casual spoken sentences.')}

Finding to rephrase:
{task_result.get('result', '')}"""

    voice_response = llm.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=150,
        messages=[{"role": "user", "content": voice_prompt}],
    )

    voice_text = voice_response.content[0].text.strip()

    # --- Store memory if present ---
    memory_content = task_result.get("memory")
    if memory_content:
        mem.add_memory(config["supermemory_tag"], memory_content)

    # Log to shared context
    mem.add_shared(
        f"[{config['name']}] said: {voice_text[:200]}"
    )

    return {
        "thinking": task_result.get("thinking", ""),
        "result": task_result.get("result", ""),
        "action": task_result.get("action", {"type": "none", "detail": ""}),
        "artifact_update": task_result.get("artifact_update"),
        "memory": memory_content,
        "voice_text": voice_text,
    }


@app.function(
    image=image,
    secrets=[modal.Secret.from_name("agentfm-secrets")],
)
async def get_memories(teammate_tag: str = None) -> list:
    """Fetch memories for the memories view."""
    from memory import MemoryManager

    mem = MemoryManager()
    tags = ["mika", "rune", "sage"] if not teammate_tag else [teammate_tag]
    all_memories = []
    for tag in tags:
        results = mem.search("*", teammate_tag=tag, limit=20)
        all_memories.extend(results)
    return all_memories
