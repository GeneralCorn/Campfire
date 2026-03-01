"""
Campfire Modal Backend — vLLM-powered agent responses.

Follows orchestrator.py: httpx POST to Modal-hosted vLLM, parse <think> + JSON.
One function, any teammate. Modal auto-scales containers.
"""

import json
import re
import os
import modal

app = modal.App("agentfm")

image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install("httpx", "supermemory", "fastapi[standard]")
    .add_local_python_source("config", "memory")
)


# Formatting rules — ported from orchestrator.py
FORMATTING_RULES = (
    "CRITICAL RULES:\n"
    "1. You MUST wrap your entire internal reasoning process in <think>...</think> tags FIRST.\n"
    "2. Immediately after the closing </think> tag, you MUST output a valid JSON object matching this exact schema: "
    '{"spoken_message": "2-3 sentences max", "confidence": 0.9, "sentiment": "analytical"}\n'
    "3. The 'spoken_message' MUST NOT contain any markdown, asterisks, or bullet points. Output raw spoken English only."
)


def parse_llm_response(raw_text: str) -> dict:
    """
    Extracts reasoning from <think> tags and parses remaining text as JSON.
    Ported from orchestrator.py parse_llm_response().
    """
    reasoning = ""
    message_json_text = raw_text

    # 1. Extract <think> reasoning
    think_match = re.search(r'<think>(.*?)</think>', raw_text, flags=re.DOTALL)
    if think_match:
        reasoning = think_match.group(1).strip()
        message_json_text = raw_text.replace(think_match.group(0), "").strip()
    elif '</think>' in raw_text:
        parts = raw_text.split('</think>')
        reasoning = parts[0].replace('<think>', '').strip()
        message_json_text = parts[1].strip()

    # 2. Extract JSON (remove markdown codeblocks)
    json_match = re.search(
        r'```json\s*(.*?)\s*```', message_json_text,
        flags=re.DOTALL | re.IGNORECASE,
    )
    if json_match:
        message_json_text = json_match.group(1).strip()
    message_json_text = message_json_text.strip('`').strip()

    # 3. Parse JSON
    spoken_message = ""
    confidence = 0.5
    sentiment = "neutral"

    try:
        parsed = json.loads(message_json_text)
        spoken_message = parsed.get("spoken_message", "")
        confidence = float(parsed.get("confidence", 0.5))
        sentiment = parsed.get("sentiment", "neutral")

        # Clean up markdown artifacts
        spoken_message = re.sub(r'[*_#`~]', '', spoken_message)
        spoken_message = re.sub(r'^\s*[-*]\s+', '', spoken_message, flags=re.MULTILINE)

    except json.JSONDecodeError:
        print(f"[Warning] Failed to parse JSON. Falling back to raw text. Text: {message_json_text}")
        spoken_message = message_json_text
        spoken_message = re.sub(r'[*_#`~]', '', spoken_message)

    return {
        "reasoning": reasoning,
        "spoken_message": spoken_message,
        "confidence": confidence,
        "sentiment": sentiment,
    }


@app.function(
    image=image,
    secrets=[modal.Secret.from_name("campfire-secrets")],
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
    Single LLM call per turn via Modal-hosted vLLM.
    Pattern from orchestrator.py: httpx POST -> vLLM -> parse <think> + JSON.
    """
    import httpx
    from memory import MemoryManager

    modal_url = os.environ.get("MODAL_URL", "")
    model_name = os.environ.get("MODEL_NAME", "")

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

    # --- Build system prompt ---
    task_block = f"\nCURRENT TASK: {task}" if task else ""
    mode_instruction = {
        "task": "You're working on a task with your team. Stay focused, be collaborative.",
        "chat": "You're hanging out. Be yourself. Reference past work if relevant.",
    }.get(mode, "")

    system_prompt = f"""{config['system_prompt']}

{mode_instruction}
{task_block}

{memory_block}

{FORMATTING_RULES}"""

    # --- Call vLLM on Modal (OpenAI-compatible endpoint) ---
    url = f"{modal_url}/v1/chat/completions"
    payload = {
        "model": model_name,
        "messages": [
            {"role": "system", "content": system_prompt},
            *conversation_history,
            {"role": "user", "content": current_input},
        ],
        "temperature": 0.7,
        "max_tokens": 2048,
    }

    async with httpx.AsyncClient(timeout=120.0) as client:
        response = await client.post(url, json=payload)
        response.raise_for_status()
        data = response.json()
        raw_text = data["choices"][0]["message"]["content"]

    parsed = parse_llm_response(raw_text)

    # --- Store shared context ---
    mem.add_shared(
        f"[{config['name']}] said: {parsed['spoken_message'][:200]}"
    )

    return {
        "thinking": parsed["reasoning"],
        "result": parsed["spoken_message"],
        "action": {"type": "none", "detail": ""},
        "artifact_update": None,
        "memory": None,
        "voice_text": parsed["spoken_message"],
        "confidence": parsed["confidence"],
        "sentiment": parsed["sentiment"],
    }


@app.function(
    image=image,
    secrets=[modal.Secret.from_name("campfire-secrets")],
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


@app.function(
    image=image,
    secrets=[modal.Secret.from_name("campfire-secrets")],
    timeout=120,
)
@modal.fastapi_endpoint(method="POST")
async def serve(body: dict):
    """Web endpoint called by the Next.js frontend API routes."""
    from config import TEAMMATE_CONFIGS

    config_id = body.get("config_id", "mika")
    config = TEAMMATE_CONFIGS.get(config_id)
    if not config:
        return {"error": f"Unknown config_id: {config_id}"}

    return await agent_respond.local(
        config=config,
        conversation_history=body.get("conversation_history", []),
        current_input=body.get("current_input", ""),
        mode=body.get("mode", "task"),
        task=body.get("task", ""),
    )
