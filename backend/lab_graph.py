"""
LangGraph state machine for the Medical Lab.

Graph: router → maya_think → [maya_sandbox | maya_text] → rex_think → [rex_sandbox | rex_text]
       → sol_think → [sol_sandbox | sol_text] → synthesize → END

Emits SSE events matching the frontend's existing schema:
  thinking, voice_text, audio_chunk, sandbox_spawn, sandbox_output,
  sandbox_complete, turn_end, complete
"""

import os
import re
import json
import time
import uuid
import base64
from typing import Optional, Annotated
from operator import add

import anthropic
from typing_extensions import TypedDict
from langgraph.graph import StateGraph, START, END
from langgraph.config import get_stream_writer

from lab_config import LAB_AGENTS
from lab_sandbox import run_in_sandbox, pick_gpu
from lab_tools import (
    build_rex_fda_code,
    build_maya_pubmed_code,
    build_sol_visualization_code,
    build_maya_vlm_code,
    build_biobert_ner_code,
)

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
ANTHROPIC_MODEL = os.getenv("ANTHROPIC_MODEL", "claude-sonnet-4-20250514")
ELEVENLABS_API_KEY = os.getenv("ELEVENLABS_API_KEY", "")
ELEVENLABS_MODEL_ID = os.getenv("ELEVENLABS_MODEL_ID", "eleven_flash_v2_5")
ELEVENLABS_OUTPUT_FORMAT = os.getenv("ELEVENLABS_OUTPUT_FORMAT", "pcm_24000")


# ---------------------------------------------------------------------------
# State
# ---------------------------------------------------------------------------

class LabState(TypedDict):
    # Input
    user_query: str
    medications: list[str]
    has_image: bool
    image_b64: Optional[str]

    # Routing flags (set by router)
    needs_vlm: bool
    needs_ner: bool             # BioBERT NER on discharge/clinical text
    needs_fda_check: bool
    needs_visualization: bool
    gpu_tier: Optional[str]  # e.g. "T4", "A10G", "H100" — picked by router

    # Agent outputs
    maya_research: Optional[str]
    rex_interactions: Optional[str]
    sol_summary: Optional[str]

    # Accumulated sandbox outputs (append-only via Annotated reducer)
    sandbox_outputs: Annotated[list[dict], add]

    # Final synthesis
    synthesis: Optional[str]


# ---------------------------------------------------------------------------
# LLM Helper
# ---------------------------------------------------------------------------

def _call_anthropic(system_prompt: str, user_prompt: str, config_id: str = "maya") -> str:
    """Low-level Anthropic call. Returns raw response text."""
    print(f"[LLM] Calling {ANTHROPIC_MODEL} for {config_id}...")
    client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
    try:
        response = client.messages.create(
            model=ANTHROPIC_MODEL,
            max_tokens=2048,
            system=system_prompt,
            messages=[{"role": "user", "content": user_prompt}],
        )
        raw_text = response.content[0].text
        print(f"[LLM] {config_id} responded ({len(raw_text)} chars)")
        return raw_text
    except Exception as e:
        print(f"[LLM] ERROR for {config_id}: {e}")
        raise


def call_llm(system_prompt: str, user_prompt: str, config_id: str = "maya") -> dict:
    """Call Anthropic API. Returns dict with reasoning, spoken_message, confidence, sentiment."""
    raw_text = _call_anthropic(system_prompt, user_prompt, config_id)
    return _parse_llm_response(raw_text)


def _parse_llm_response(raw_text: str) -> dict:
    """Extract <think> reasoning + JSON from LLM output."""
    reasoning = ""
    message_text = raw_text

    think_match = re.search(r"<think>(.*?)</think>", raw_text, flags=re.DOTALL)
    if think_match:
        reasoning = think_match.group(1).strip()
        message_text = raw_text.replace(think_match.group(0), "").strip()
    elif "</think>" in raw_text:
        parts = raw_text.split("</think>")
        reasoning = parts[0].replace("<think>", "").strip()
        message_text = parts[1].strip()

    json_match = re.search(r"```json\s*(.*?)\s*```", message_text, flags=re.DOTALL | re.IGNORECASE)
    if json_match:
        message_text = json_match.group(1).strip()
    message_text = message_text.strip("`").strip()

    spoken_message = ""
    confidence = 0.5
    sentiment = "neutral"

    try:
        parsed = json.loads(message_text)
        spoken_message = parsed.get("spoken_message", "")
        confidence = float(parsed.get("confidence", 0.5))
        sentiment = parsed.get("sentiment", "neutral")
        spoken_message = re.sub(r"[*_#`~]", "", spoken_message)
    except json.JSONDecodeError:
        spoken_message = re.sub(r"[*_#`~]", "", message_text)

    return {
        "reasoning": reasoning,
        "spoken_message": spoken_message,
        "confidence": confidence,
        "sentiment": sentiment,
    }


# ---------------------------------------------------------------------------
# TTS Helper — streams ElevenLabs audio via SSE
# ---------------------------------------------------------------------------

def _stream_tts(writer, teammate: str, text: str):
    """Stream TTS audio for a teammate's message via ElevenLabs WebSocket."""
    if not ELEVENLABS_API_KEY or not text:
        return

    voice_id = LAB_AGENTS.get(teammate, {}).get("voice_id", "")
    if not voice_id:
        return

    try:
        import websockets.sync.client as ws_sync

        ws_url = (
            f"wss://api.elevenlabs.io/v1/text-to-speech/{voice_id}/stream-input"
            f"?model_id={ELEVENLABS_MODEL_ID}&output_format={ELEVENLABS_OUTPUT_FORMAT}"
        )

        with ws_sync.connect(ws_url) as ws:
            # BOS
            ws.send(json.dumps({
                "text": " ",
                "voice_settings": {"stability": 0.5, "similarity_boost": 0.8},
                "xi_api_key": ELEVENLABS_API_KEY,
            }))

            # Send text
            ws.send(json.dumps({
                "text": text,
                "try_trigger_generation": True,
            }))

            # EOS
            ws.send(json.dumps({"text": ""}))

            # Receive audio chunks
            while True:
                try:
                    msg = ws.recv(timeout=10)
                    data = json.loads(msg)
                    audio_b64 = data.get("audio")
                    if audio_b64:
                        writer({
                            "event": "audio_chunk",
                            "teammate": teammate,
                            "audio": audio_b64,
                        })
                    if data.get("isFinal"):
                        break
                except Exception:
                    break

    except Exception as e:
        print(f"[TTS] Error for {teammate}: {e}")


# ---------------------------------------------------------------------------
# Formatting rules for agent LLM calls
# ---------------------------------------------------------------------------

FORMATTING_RULES = (
    "CRITICAL RULES:\n"
    "1. You MUST wrap your entire internal reasoning process in <think>...</think> tags FIRST.\n"
    "2. Immediately after the closing </think> tag, you MUST output a valid JSON object matching this exact schema: "
    '{"spoken_message": "2-3 sentences max", "confidence": 0.9, "sentiment": "analytical"}\n'
    "3. The 'spoken_message' MUST NOT contain any markdown, asterisks, or bullet points. Output raw spoken English only."
)


# ---------------------------------------------------------------------------
# Helper: emit agent message + TTS + turn_end
# ---------------------------------------------------------------------------

def _emit_agent_turn(writer, teammate: str, result: dict, include_tts: bool = True):
    """Emit voice_text → audio_chunk(s) → turn_end for a teammate."""
    print(f"[EMIT] voice_text for {teammate}: {result['spoken_message'][:80]}...")
    writer({
        "event": "voice_text",
        "teammate": teammate,
        "text": result["spoken_message"],
        "thinking": result["reasoning"],
        "sentiment": result["sentiment"],
        "confidence": result["confidence"],
    })

    if include_tts:
        _stream_tts(writer, teammate, result["spoken_message"])

    writer({"event": "turn_end", "teammate": teammate})


# ---------------------------------------------------------------------------
# Graph Nodes
# ---------------------------------------------------------------------------

def router_node(state: LabState) -> dict:
    """Analyze user query and decide what compute is needed."""
    writer = get_stream_writer()

    system_prompt = (
        "You are a medical query router. Analyze the user's query and determine what tools are needed.\n\n"
        "Output ONLY a valid JSON object (no markdown, no explanation) matching this schema:\n"
        '{"medications": ["drug1", "drug2"], "needs_vlm": false, "needs_ner": false, '
        '"needs_fda_check": true, "needs_visualization": true, "model_size_hint": "small"}\n\n'
        "Rules:\n"
        "- Extract all medication/drug names mentioned into the 'medications' list\n"
        "- Set needs_vlm=true ONLY if the user uploaded an image (has_image=true)\n"
        "- Set needs_ner=true if the user provides free-text clinical content (discharge instructions, "
        "doctor's notes, clinical summaries) that needs entity extraction via BioBERT. "
        "This is for extracting medications, dosages, conditions, and procedures from unstructured text.\n"
        "- Set needs_fda_check=true if the user asks about drug interactions, side effects, safety, or mentions 2+ medications\n"
        "- Set needs_visualization=true if a summary or visual would be helpful (usually true for drug interactions)\n"
        '- model_size_hint: "small" for simple OCR/captioning or BioBERT NER (<1B), '
        '"medium" for standard VLMs (3-7B), "large" for complex analysis needing big models (13B+), '
        '"huge" for cutting-edge models (30B+). Default to "small" unless the task clearly needs more.\n'
    )

    user_prompt = f"User query: {state['user_query']}\nhas_image: {state['has_image']}"

    SIZE_TO_PARAMS = {"small": 0.5, "medium": 7, "large": 14, "huge": 34}

    try:
        raw_text = _call_anthropic(system_prompt, user_prompt, config_id="router")

        # Strip <think> tags and markdown code fences if present
        text = raw_text
        if "</think>" in text:
            text = text.split("</think>")[-1].strip()
        json_match = re.search(r"```json\s*(.*?)\s*```", text, flags=re.DOTALL | re.IGNORECASE)
        if json_match:
            text = json_match.group(1).strip()
        text = text.strip("`").strip()

        parsed = json.loads(text)
        print(f"[ROUTER] Parsed routing JSON: {parsed}")
        medications = parsed.get("medications", state.get("medications", []))
        needs_vlm = parsed.get("needs_vlm", False)
        needs_ner = parsed.get("needs_ner", False)
        needs_fda = parsed.get("needs_fda_check", False)
        needs_viz = parsed.get("needs_visualization", False)
        size_hint = parsed.get("model_size_hint", "small")
    except Exception as e:
        print(f"[ROUTER] Fallback due to: {e}")
        medications = state.get("medications", [])
        needs_vlm = state.get("has_image", False)
        needs_ner = False
        needs_fda = len(medications) >= 1
        needs_viz = len(medications) >= 1
        size_hint = "small"

    gpu_tier = pick_gpu(model_params_b=SIZE_TO_PARAMS.get(size_hint, 0.5)) if needs_vlm else None

    writer({
        "event": "router_plan",
        "plan": ["maya", "rex", "sol"],
        "needs_vlm": needs_vlm,
        "needs_ner": needs_ner,
        "needs_fda": needs_fda,
        "needs_viz": needs_viz,
        "medications": medications,
        "gpu_tier": gpu_tier,
    })

    return {
        "medications": medications,
        "needs_vlm": needs_vlm,
        "needs_ner": needs_ner,
        "needs_fda_check": needs_fda,
        "needs_visualization": needs_viz,
        "gpu_tier": gpu_tier,
    }


def maya_think_node(state: LabState) -> dict:
    """Maya reasons about the query and what she needs to do."""
    writer = get_stream_writer()
    config = LAB_AGENTS["maya"]

    writer({"event": "thinking", "teammate": "maya"})

    meds_str = ", ".join(state["medications"]) if state["medications"] else "unknown"

    if state.get("needs_vlm"):
        task_desc = "analyze the prescription image with Florence-2 VLM"
    elif state.get("needs_ner"):
        task_desc = "run BioBERT biomedical NER on the discharge text"
    else:
        task_desc = "search PubMed for relevant clinical literature"

    system_prompt = f"{config['system_prompt']}\n\n{FORMATTING_RULES}"
    user_prompt = (
        f"The user asked: '{state['user_query']}'\n"
        f"Medications identified: {meds_str}\n"
        f"You are about to {task_desc}. Briefly introduce what you're going to do."
    )

    result = call_llm(system_prompt, user_prompt, config_id="maya")
    _emit_agent_turn(writer, "maya", result)

    return {}


def maya_sandbox_node(state: LabState) -> dict:
    """Maya provisions a sandbox — VLM (GPU), BioBERT (CPU), or PubMed (CPU)."""
    writer = get_stream_writer()

    has_image = state.get("has_image", False) and state.get("image_b64")
    needs_ner = state.get("needs_ner", False)

    stdout_cb = lambda line: writer({"event": "sandbox_output", "teammate": "maya", "line": line})
    stderr_cb = lambda line: writer({"event": "sandbox_output", "teammate": "maya", "line": f"[stderr] {line}"})

    if has_image:
        gpu = state.get("gpu_tier") or pick_gpu(model_params_b=0.5)
        code = build_maya_vlm_code(state["image_b64"])
        writer({
            "event": "sandbox_spawn",
            "teammate": "maya",
            "packages": ["transformers", "torch", "Pillow"],
            "gpu": gpu,
        })
        result = run_in_sandbox(
            code=code, packages=[], image_name="vlm",
            gpu=gpu, timeout=180, on_stdout=stdout_cb, on_stderr=stderr_cb,
        )

    elif needs_ner:
        code = build_biobert_ner_code(state["user_query"])
        writer({
            "event": "sandbox_spawn",
            "teammate": "maya",
            "packages": ["transformers", "torch"],
            "gpu": None,
        })
        result = run_in_sandbox(
            code=code, packages=[], image_name="biobert",
            timeout=120, on_stdout=stdout_cb, on_stderr=stderr_cb,
        )

        # Extract medications from BioBERT output for Rex
        try:
            ner_json_text = result.stdout.split("[Maya] === RESULTS ===\n")[-1]
            ner_json_text = ner_json_text.split("[Maya] === END_NER ===")[0].strip()
            ner_data = json.loads(ner_json_text)
            extracted_meds = ner_data.get("medications", [])
            if extracted_meds:
                existing = set(m.lower() for m in state.get("medications", []))
                new_meds = state.get("medications", [])[:]
                for m in extracted_meds:
                    if m.lower() not in existing:
                        new_meds.append(m)
                        existing.add(m.lower())
                state["_ner_medications"] = new_meds
        except (json.JSONDecodeError, IndexError):
            pass

    else:
        meds_str = " ".join(state["medications"]) if state["medications"] else state["user_query"]
        query = f"{meds_str} drug interaction clinical"
        code = build_maya_pubmed_code(query)
        writer({
            "event": "sandbox_spawn",
            "teammate": "maya",
            "packages": ["requests"],
            "gpu": None,
        })
        result = run_in_sandbox(
            code=code, packages=[], image_name="research",
            on_stdout=stdout_cb, on_stderr=stderr_cb,
        )

    result.agent = "maya"

    writer({
        "event": "sandbox_complete",
        "teammate": "maya",
        "exit_code": result.exit_code,
        "duration_ms": result.duration_ms,
    })

    updates = {
        "maya_research": result.stdout,
        "sandbox_outputs": [{"agent": "maya", "stdout": result.stdout, "exit_code": result.exit_code, "duration_ms": result.duration_ms}],
    }

    if "_ner_medications" in state:
        updates["medications"] = state["_ner_medications"]

    return updates


def maya_text_only_node(state: LabState) -> dict:
    """Maya responds with LLM only (no sandbox)."""
    writer = get_stream_writer()
    config = LAB_AGENTS["maya"]

    meds_str = ", ".join(state["medications"]) if state["medications"] else "unknown"
    system_prompt = f"{config['system_prompt']}\n\n{FORMATTING_RULES}"
    user_prompt = (
        f"The user asked: '{state['user_query']}'\n"
        f"Medications: {meds_str}\n"
        f"Provide a brief research summary based on your knowledge."
    )

    result = call_llm(system_prompt, user_prompt, config_id="maya")
    _emit_agent_turn(writer, "maya", result)

    return {"maya_research": result["spoken_message"]}


def rex_think_node(state: LabState) -> dict:
    """Rex reasons about what safety checks are needed."""
    writer = get_stream_writer()
    config = LAB_AGENTS["rex"]

    writer({"event": "thinking", "teammate": "rex"})

    meds_str = ", ".join(state["medications"]) if state["medications"] else "unknown"
    maya_ctx = (state.get("maya_research") or "")[:500]

    system_prompt = f"{config['system_prompt']}\n\n{FORMATTING_RULES}"
    user_prompt = (
        f"The user asked: '{state['user_query']}'\n"
        f"Medications: {meds_str}\n"
        f"Maya's research: {maya_ctx}\n"
        f"You are about to cross-reference these medications against FDA databases. "
        f"Briefly introduce what you're checking for."
    )

    result = call_llm(system_prompt, user_prompt, config_id="rex")
    _emit_agent_turn(writer, "rex", result)

    return {}


def rex_sandbox_node(state: LabState) -> dict:
    """Rex provisions a sandbox to query OpenFDA + RxNorm."""
    writer = get_stream_writer()

    medications = state["medications"]
    code = build_rex_fda_code(medications)

    writer({
        "event": "sandbox_spawn",
        "teammate": "rex",
        "packages": ["requests"],
        "gpu": None,
    })

    result = run_in_sandbox(
        code=code,
        packages=[],
        image_name="research",
        on_stdout=lambda line: writer({"event": "sandbox_output", "teammate": "rex", "line": line}),
        on_stderr=lambda line: writer({"event": "sandbox_output", "teammate": "rex", "line": f"[stderr] {line}"}),
    )
    result.agent = "rex"

    writer({
        "event": "sandbox_complete",
        "teammate": "rex",
        "exit_code": result.exit_code,
        "duration_ms": result.duration_ms,
    })

    # Rex follows up with an LLM interpretation of the sandbox results
    config = LAB_AGENTS["rex"]
    system_prompt = f"{config['system_prompt']}\n\n{FORMATTING_RULES}"
    user_prompt = (
        f"You just ran FDA and RxNorm queries for: {', '.join(medications)}\n"
        f"Here are the raw results:\n{result.stdout[:2000]}\n\n"
        f"Summarize the key findings concisely. Highlight any interactions or warnings."
    )

    llm_result = call_llm(system_prompt, user_prompt, config_id="rex")
    _emit_agent_turn(writer, "rex", llm_result)

    return {
        "rex_interactions": result.stdout,
        "sandbox_outputs": [{"agent": "rex", "stdout": result.stdout, "exit_code": result.exit_code, "duration_ms": result.duration_ms}],
    }


def rex_text_only_node(state: LabState) -> dict:
    """Rex responds with LLM only (no sandbox)."""
    writer = get_stream_writer()
    config = LAB_AGENTS["rex"]

    meds_str = ", ".join(state["medications"]) if state["medications"] else "unknown"
    maya_ctx = (state.get("maya_research") or "")[:500]

    system_prompt = f"{config['system_prompt']}\n\n{FORMATTING_RULES}"
    user_prompt = (
        f"The user asked: '{state['user_query']}'\n"
        f"Medications: {meds_str}\n"
        f"Maya's research: {maya_ctx}\n"
        f"Provide a brief safety assessment based on your knowledge."
    )

    result = call_llm(system_prompt, user_prompt, config_id="rex")
    _emit_agent_turn(writer, "rex", result)

    return {"rex_interactions": result["spoken_message"]}


def sol_think_node(state: LabState) -> dict:
    """Sol reasons about what synthesis to produce."""
    writer = get_stream_writer()
    config = LAB_AGENTS["sol"]

    writer({"event": "thinking", "teammate": "sol"})

    meds_str = ", ".join(state["medications"]) if state["medications"] else "unknown"
    maya_ctx = (state.get("maya_research") or "")[:300]
    rex_ctx = (state.get("rex_interactions") or "")[:300]

    system_prompt = f"{config['system_prompt']}\n\n{FORMATTING_RULES}"
    user_prompt = (
        f"The user asked: '{state['user_query']}'\n"
        f"Medications: {meds_str}\n"
        f"Maya's findings: {maya_ctx}\n"
        f"Rex's safety analysis: {rex_ctx}\n"
        f"You are about to generate a plain-language summary. "
        f"Briefly introduce what you'll put together."
    )

    result = call_llm(system_prompt, user_prompt, config_id="sol")
    _emit_agent_turn(writer, "sol", result)

    return {}


def sol_sandbox_node(state: LabState) -> dict:
    """Sol provisions a sandbox to generate a medication summary visualization."""
    writer = get_stream_writer()

    code = build_sol_visualization_code(
        state.get("maya_research") or "",
        state.get("rex_interactions") or "",
        state["medications"],
    )

    writer({
        "event": "sandbox_spawn",
        "teammate": "sol",
        "packages": ["flask", "jinja2", "matplotlib"],
        "gpu": None,
    })

    result = run_in_sandbox(
        code=code,
        packages=[],
        image_name="viz",
        on_stdout=lambda line: writer({"event": "sandbox_output", "teammate": "sol", "line": line}),
        on_stderr=lambda line: writer({"event": "sandbox_output", "teammate": "sol", "line": f"[stderr] {line}"}),
    )
    result.agent = "sol"

    writer({
        "event": "sandbox_complete",
        "teammate": "sol",
        "exit_code": result.exit_code,
        "duration_ms": result.duration_ms,
    })

    # Sol follows up with a plain-language summary + TTS
    config = LAB_AGENTS["sol"]
    system_prompt = f"{config['system_prompt']}\n\n{FORMATTING_RULES}"
    user_prompt = (
        f"You just generated a medication summary for: {', '.join(state['medications'])}\n"
        f"Maya's research: {(state.get('maya_research') or '')[:500]}\n"
        f"Rex's analysis: {(state.get('rex_interactions') or '')[:500]}\n\n"
        f"Provide a final plain-language summary that ties everything together. "
        f"This should be understandable by someone with no medical background."
    )

    llm_result = call_llm(system_prompt, user_prompt, config_id="sol")
    _emit_agent_turn(writer, "sol", llm_result)

    return {
        "sol_summary": result.stdout,
        "sandbox_outputs": [{"agent": "sol", "stdout": result.stdout, "exit_code": result.exit_code, "duration_ms": result.duration_ms}],
    }


def sol_text_only_node(state: LabState) -> dict:
    """Sol responds with LLM only (no sandbox)."""
    writer = get_stream_writer()
    config = LAB_AGENTS["sol"]

    meds_str = ", ".join(state["medications"]) if state["medications"] else "unknown"
    maya_ctx = (state.get("maya_research") or "")[:500]
    rex_ctx = (state.get("rex_interactions") or "")[:500]

    system_prompt = f"{config['system_prompt']}\n\n{FORMATTING_RULES}"
    user_prompt = (
        f"The user asked: '{state['user_query']}'\n"
        f"Medications: {meds_str}\n"
        f"Maya's findings: {maya_ctx}\n"
        f"Rex's safety analysis: {rex_ctx}\n"
        f"Provide a concise plain-language summary."
    )

    result = call_llm(system_prompt, user_prompt, config_id="sol")
    _emit_agent_turn(writer, "sol", result)

    return {"sol_summary": result["spoken_message"]}


def synthesize_node(state: LabState) -> dict:
    """Final synthesis: collate agent outputs. Complete event is emitted by orchestrator."""

    summary_parts = []
    if state.get("maya_research"):
        summary_parts.append(f"Research: {state['maya_research'][:300]}")
    if state.get("rex_interactions"):
        summary_parts.append(f"Safety: {state['rex_interactions'][:300]}")
    if state.get("sol_summary"):
        summary_parts.append(f"Summary: {state['sol_summary'][:300]}")

    return {"synthesis": "\n\n".join(summary_parts)}


# ---------------------------------------------------------------------------
# Conditional Edge Functions
# ---------------------------------------------------------------------------

def maya_route(state: LabState) -> str:
    return "maya_sandbox" if state.get("needs_vlm") or state.get("needs_ner") or state.get("needs_fda_check") else "maya_text_only"


def rex_route(state: LabState) -> str:
    return "rex_sandbox" if state.get("needs_fda_check") else "rex_text_only"


def sol_route(state: LabState) -> str:
    return "sol_sandbox" if state.get("needs_visualization") else "sol_text_only"


# ---------------------------------------------------------------------------
# Build Graph
# ---------------------------------------------------------------------------

graph_builder = StateGraph(LabState)

# Add nodes
graph_builder.add_node("router", router_node)
graph_builder.add_node("maya_think", maya_think_node)
graph_builder.add_node("maya_sandbox", maya_sandbox_node)
graph_builder.add_node("maya_text_only", maya_text_only_node)
graph_builder.add_node("rex_think", rex_think_node)
graph_builder.add_node("rex_sandbox", rex_sandbox_node)
graph_builder.add_node("rex_text_only", rex_text_only_node)
graph_builder.add_node("sol_think", sol_think_node)
graph_builder.add_node("sol_sandbox", sol_sandbox_node)
graph_builder.add_node("sol_text_only", sol_text_only_node)
graph_builder.add_node("synthesize", synthesize_node)

# Edges
graph_builder.add_edge(START, "router")
graph_builder.add_edge("router", "maya_think")

graph_builder.add_conditional_edges("maya_think", maya_route)
graph_builder.add_edge("maya_sandbox", "rex_think")
graph_builder.add_edge("maya_text_only", "rex_think")

graph_builder.add_conditional_edges("rex_think", rex_route)
graph_builder.add_edge("rex_sandbox", "sol_think")
graph_builder.add_edge("rex_text_only", "sol_think")

graph_builder.add_conditional_edges("sol_think", sol_route)
graph_builder.add_edge("sol_sandbox", "synthesize")
graph_builder.add_edge("sol_text_only", "synthesize")

graph_builder.add_edge("synthesize", END)

# Compile
compiled_graph = graph_builder.compile()
