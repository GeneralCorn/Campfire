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

import httpx
from dotenv import load_dotenv
from typing_extensions import TypedDict
from langgraph.graph import StateGraph, START, END
from langgraph.config import get_stream_writer

load_dotenv(os.path.join(os.path.dirname(__file__), ".env.local"))

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

MODAL_URL = os.getenv("MODAL_URL", "")
MODAL_URL_FALLBACK = os.getenv("MODAL_URL_FALLBACK", "https://saibilla21--agentfm-brain-serve-dev.modal.run")
MODEL_NAME = os.getenv("MODEL_NAME", "deepseek-ai/DeepSeek-R1-Distill-Qwen-7B")
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
ELEVENLABS_API_KEY = os.getenv("ELEVENLABS_API_KEY", "")
ELEVENLABS_MODEL_ID = os.getenv("ELEVENLABS_MODEL_ID", "eleven_flash_v2_5")
ELEVENLABS_OUTPUT_FORMAT = os.getenv("ELEVENLABS_OUTPUT_FORMAT", "pcm_24000")

# Observability: human-readable GPU names for the PipelineGraph tooltip
GPU_FULL_NAMES: dict[str, str] = {
    "A10G": "NVIDIA A10G · 24 GB VRAM",
    "A100": "NVIDIA A100 · 40 GB VRAM",
    "H100": "NVIDIA H100 · 80 GB VRAM",
    "L4":   "NVIDIA L4 · 24 GB VRAM",
    "T4":   "NVIDIA T4 · 16 GB VRAM",
}


# ---------------------------------------------------------------------------
# State
# ---------------------------------------------------------------------------

class LabState(TypedDict):
    # Input
    user_query: str
    medications: list[str]
    has_image: bool
    image_b64: Optional[str]

    # Patient discharge context (forwarded from frontend)
    patient_context: Optional[dict]

    # Routing flags (set by router)
    needs_vlm: bool          # Image uploaded → VLM prescription/document reader
    needs_mediapipe: bool    # PT/rehab/movement question → MediaPipe exercise analysis
    needs_fda_check: bool    # Drug safety/interactions → OpenFDA + RxNorm sandbox
    needs_mistral: bool      # General medical Q&A → finetuned Mistral sandbox
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


def _patient_block(state: LabState) -> str:
    """Build a compact patient context block for agent prompts."""
    ctx = state.get("patient_context") or {}
    if not ctx:
        return ""
    p = ctx.get("patient_profile", {})
    meds = ctx.get("medications", [])
    restrictions = ctx.get("restrictions", [])
    warnings = ctx.get("warning_signs", [])

    parts = []
    if p.get("procedure"):
        parts.append(
            f"PATIENT: {p.get('patient_name', 'the patient')}, "
            f"post-op {p['procedure']} (discharged {p.get('discharge_date', 'recently')})"
        )
    if meds:
        med_list = ", ".join(f"{m['name']} {m['dosage']}" for m in meds)
        parts.append(f"PRESCRIBED: {med_list}")
    if restrictions:
        rest_list = "; ".join(
            f"{r['category']}: {r['rule']}" + (f" [{r['timeline']}]" if r.get('timeline') else "")
            for r in restrictions
        )
        parts.append(f"RESTRICTIONS: {rest_list}")
    if warnings:
        warn_list = " | ".join(f"{w['symptom']} → {w['action']}" for w in warnings)
        parts.append(f"WARNING SIGNS TO WATCH FOR: {warn_list}")

    return "\n".join(parts)


# ---------------------------------------------------------------------------
# LLM Helper
# ---------------------------------------------------------------------------

def _call_modal(system_prompt: str, user_prompt: str, config_id: str = "maya") -> str:
    """LLM call with fallback: Modal → Modal fallback → Anthropic. Returns raw text."""
    print(f"[LLM] Calling LLM for {config_id}...")

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ]

    # Build list of Modal URLs to try
    modal_urls = []
    if MODAL_URL:
        modal_urls.append(MODAL_URL)
    if MODAL_URL_FALLBACK and MODAL_URL_FALLBACK != MODAL_URL:
        modal_urls.append(MODAL_URL_FALLBACK)

    # Try each Modal endpoint
    for base_url in modal_urls:
        url = f"{base_url}/v1/chat/completions"
        payload = {
            "model": MODEL_NAME,
            "messages": messages,
            "temperature": 0.7,
            "max_tokens": 2048,
        }
        try:
            with httpx.Client(timeout=120.0) as client:
                response = client.post(url, json=payload)
                response.raise_for_status()
                data = response.json()
                raw_text = data["choices"][0]["message"]["content"]
            print(f"[LLM] {config_id} success via Modal: {base_url} ({len(raw_text)} chars)")
            return raw_text
        except Exception as e:
            print(f"[LLM] Modal failed ({base_url}): {e}")
            continue

    # Fallback: Anthropic API
    if ANTHROPIC_API_KEY:
        print(f"[LLM] {config_id} falling back to Anthropic API...")
        try:
            resp = httpx.post(
                "https://api.anthropic.com/v1/messages",
                headers={
                    "x-api-key": ANTHROPIC_API_KEY,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                },
                json={
                    "model": "claude-sonnet-4-20250514",
                    "max_tokens": 2048,
                    "system": system_prompt,
                    "messages": [{"role": "user", "content": user_prompt}],
                },
                timeout=120.0,
            )
            resp.raise_for_status()
            raw_text = resp.json()["content"][0]["text"]
            print(f"[LLM] {config_id} success via Anthropic ({len(raw_text)} chars)")
            return raw_text
        except Exception as e:
            print(f"[LLM] Anthropic also failed for {config_id}: {e}")

    raise RuntimeError(f"All LLM backends failed for {config_id}")


def call_llm(system_prompt: str, user_prompt: str, config_id: str = "maya") -> dict:
    """Call Modal vLLM. Returns dict with reasoning, spoken_message, confidence, sentiment."""
    raw_text = _call_modal(system_prompt, user_prompt, config_id)
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
    """Emit voice_text → memory_node → audio_chunk(s) → turn_end for a teammate."""
    print(f"[EMIT] voice_text for {teammate}: {result['spoken_message'][:80]}...")
    writer({
        "event": "voice_text",
        "teammate": teammate,
        "text": result["spoken_message"],
        "thinking": result["reasoning"],
        "sentiment": result["sentiment"],
        "confidence": result["confidence"],
    })

    # Emit memory card so /memory-log populates
    if result.get("spoken_message"):
        writer({
            "event": "memory_node",
            "teammate": teammate,
            "content": result["spoken_message"],
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
        "You are a medical AI router. Your job is to analyze the user's query and decide which specialized models to invoke.\n\n"
        "Output ONLY a valid JSON object (no markdown, no explanation) matching this exact schema:\n"
        '{"medications": ["drug1", "drug2"], "needs_vlm": false, "needs_mediapipe": false, '
        '"needs_fda_check": false, "needs_mistral": false, "needs_visualization": false, "model_size_hint": "small"}\n\n'
        "Available models and when to invoke them:\n\n"
        "needs_vlm — Vision Language Model (image analysis: prescriptions OR visible skin/wound)\n"
        "  SET TRUE when: has_image=true AND the user is either:\n"
        "    (a) asking about a prescription label, medication bottle, or medical document image, OR\n"
        "    (b) sharing a photo of a wound, incision, bruising, redness, swelling, or any visible skin/wound condition.\n"
        "  Example triggers: 'what does this say', 'read my prescription', 'does this look normal',\n"
        "  'is this swelling ok', 'my incision looks red', 'does this bruise look bad', image uploaded with health question.\n"
        "  SET FALSE when: no image uploaded (has_image=false).\n\n"
        "needs_mediapipe — MediaPipe joint-angle analysis (wrist and elbow ROM only)\n"
        "  SCOPE: wrist extension/flexion, elbow bend angle, forearm rotation — NOT shoulder, knee, hip, or spine.\n"
        "  SET TRUE when: user asks about wrist or elbow range of motion, wrist/elbow PT exercises,\n"
        "  or elbow/forearm movement during recovery.\n"
        "  Example triggers: 'wrist exercises', 'elbow PT', 'can I bend my wrist', 'wrist range of motion',\n"
        "  'elbow flexion exercises', 'forearm stretches', 'wrist tendinitis exercises'.\n"
        "  SET FALSE for shoulder-only questions, drug questions, image reading, or non-wrist/elbow conditions.\n\n"
        "needs_fda_check — FDA/RxNorm drug safety lookup\n"
        "  SET TRUE when: user asks about drug interactions, side effects, contraindications, medication safety,\n"
        "  or mentions 2+ drug names together.\n"
        "  Example triggers: 'interactions between X and Y', 'is it safe to take X with Y', 'side effects of X'.\n\n"
        "needs_mistral — Finetuned Mistral medical model (general clinical Q&A)\n"
        "  SET TRUE when: the question requires specialized medical knowledge not covered by the other models —\n"
        "  symptoms, diagnoses, treatment options, medication explanations, clinical interpretation.\n"
        "  This is the default research path when no other model is a better fit.\n"
        "  SET FALSE when needs_vlm or needs_mediapipe already handles the query.\n\n"
        "needs_visualization — Generate a visual summary card\n"
        "  SET TRUE when: drug interactions are being checked (almost always true with needs_fda_check).\n\n"
        "Additional rules:\n"
        "- Extract all medication/drug names into the 'medications' list.\n"
        '- model_size_hint: "small" (<3B), "medium" (3-7B), "large" (13B+), "huge" (30B+). '
        'Only set "large" or "huge" if the image or task clearly requires a more capable VLM.\n'
        "- Multiple models can be true at once (e.g. image of a prescription + drug interaction question → needs_vlm AND needs_fda_check).\n"
    )

    patient_block = _patient_block(state)
    user_prompt = (
        f"User query: {state['user_query']}\n"
        f"has_image: {state['has_image']}\n"
        + (f"\n{patient_block}" if patient_block else "")
    )

    SIZE_TO_PARAMS = {"small": 0.5, "medium": 7, "large": 14, "huge": 34}

    try:
        raw_text = _call_modal(system_prompt, user_prompt, config_id="router")

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
        # Ensure chart meds are always in the list
        ctx = state.get("patient_context") or {}
        for m in ctx.get("medications", []):
            if m["name"] not in medications:
                medications.append(m["name"])
        needs_vlm = parsed.get("needs_vlm", False)
        needs_mediapipe = parsed.get("needs_mediapipe", False)
        needs_fda = parsed.get("needs_fda_check", False)
        needs_mistral = parsed.get("needs_mistral", False)
        needs_viz = parsed.get("needs_visualization", False)
        size_hint = parsed.get("model_size_hint", "small")
    except Exception as e:
        print(f"[ROUTER] Fallback due to: {e}")
        medications = state.get("medications", [])
        needs_vlm = state.get("has_image", False)
        needs_mediapipe = False
        needs_fda = len(medications) >= 1
        needs_mistral = not needs_vlm and not needs_fda
        needs_viz = len(medications) >= 1
        size_hint = "small"

    # Hard keyword override: wrist/elbow PT queries always route to mediapipe
    # (LLM router is non-deterministic and sometimes picks the research path)
    _MEDIAPIPE_KW = [
        "wrist flexion", "wrist extension", "wrist rom", "wrist range",
        "wrist exercise", "wrist pt", "wrist bend", "wrist surgery",
        "elbow flexion", "elbow extension", "elbow rom", "elbow range",
        "elbow exercise", "elbow pt", "elbow bend",
        "forearm rotation", "track my range", "measure my range",
        "range of motion", "physical therapy exercises", "pt exercises",
    ]
    q_lower = state["user_query"].lower()
    if not needs_mediapipe and not needs_vlm and any(kw in q_lower for kw in _MEDIAPIPE_KW):
        print(f"[ROUTER] Keyword override → needs_mediapipe=True")
        needs_mediapipe = True
        needs_mistral = False  # mediapipe handles this; suppress redundant research path

    gpu_tier = pick_gpu(model_params_b=SIZE_TO_PARAMS.get(size_hint, 0.5)) if needs_vlm else None

    writer({
        "event": "router_plan",
        "plan": ["maya", "rex", "sol"],
        "needs_vlm": needs_vlm,
        "needs_mediapipe": needs_mediapipe,
        "needs_fda": needs_fda,
        "needs_mistral": needs_mistral,
        "needs_viz": needs_viz,
        "medications": medications,
        "gpu_tier": gpu_tier,
    })

    return {
        "medications": medications,
        "needs_vlm": needs_vlm,
        "needs_mediapipe": needs_mediapipe,
        "needs_fda_check": needs_fda,
        "needs_mistral": needs_mistral,
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
        task_desc = "read and decode the prescription or medical document image with a VLM"
    elif state.get("needs_mediapipe"):
        task_desc = "analyze movement patterns and generate physical therapy exercise recommendations with MediaPipe"
    elif state.get("needs_mistral"):
        task_desc = "query the finetuned medical Mistral model for a clinical answer"
    else:
        task_desc = "synthesize available context to answer the medical question"

    patient_block = _patient_block(state)
    system_prompt = f"{config['system_prompt']}\n\n{FORMATTING_RULES}"
    user_prompt = (
        f"The user asked: '{state['user_query']}'\n"
        f"Medications identified: {meds_str}\n"
        + (f"{patient_block}\n" if patient_block else "")
        + f"You are about to {task_desc}. Briefly introduce what you're going to do."
    )

    result = call_llm(system_prompt, user_prompt, config_id="maya")
    _emit_agent_turn(writer, "maya", result)

    return {}


def maya_sandbox_node(state: LabState) -> dict:
    """Maya provisions a sandbox — VLM (GPU), BioBERT (CPU), or PubMed (CPU)."""
    writer = get_stream_writer()

    has_image = state.get("has_image", False) and state.get("image_b64")
    needs_mediapipe = state.get("needs_mediapipe", False)
    needs_mistral = state.get("needs_mistral", False)
    user_query = state["user_query"]

    stdout_cb = lambda line: writer({"event": "sandbox_output", "teammate": "maya", "line": line})
    stderr_cb = lambda line: writer({"event": "sandbox_output", "teammate": "maya", "line": f"[stderr] {line}"})

    if has_image:
        # VLM: prescription/document reader OR skin/wound visual assessment
        gpu = state.get("gpu_tier") or pick_gpu(model_params_b=0.5)
        # Decide VLM mode from query — skin assessment if query mentions wound/skin appearance
        query_lower = state["user_query"].lower()
        is_skin_check = any(kw in query_lower for kw in [
            "wound", "incision", "redness", "bruise", "bruising", "swelling", "swollen",
            "look normal", "look ok", "skin", "sore", "infected", "pus", "discharge"
        ])
        code = build_maya_vlm_code(state["image_b64"], skin_mode=is_skin_check)
        vlm_label = "skin assessment" if is_skin_check else "prescription/document reader"
        writer({
            "event": "sandbox_spawn",
            "teammate": "maya",
            "model": "vlm",
            "packages": ["transformers", "torch", "Pillow"],
            "gpu": gpu,
            "execution_context": "modal-gpu",
            "gpu_name": GPU_FULL_NAMES.get(str(gpu), f"GPU: {gpu}"),
        })
        print(f"[MAYA] VLM mode: {vlm_label}")
        result = run_in_sandbox(
            code=code, packages=[], image_name="vlm",
            gpu=gpu, timeout=180, on_stdout=stdout_cb, on_stderr=stderr_cb,
        )

    elif needs_mediapipe:
        # MediaPipe: wrist/elbow joint-angle analysis (ROM check)
        writer({
            "event": "sandbox_spawn",
            "teammate": "maya",
            "model": "mediapipe",
            "packages": ["mediapipe", "opencv-python-headless"],
            "gpu": None,
            "execution_context": "browser",
        })
        # Extract wrist/elbow PT restrictions from patient context
        pt_ctx = state.get("patient_context") or {}
        procedure = pt_ctx.get("patient_profile", {}).get("procedure", "upper extremity surgery")
        pt_restrictions = [
            r for r in pt_ctx.get("restrictions", [])
            if any(kw in r.get("category", "").lower() for kw in ["physical", "wrist", "elbow", "arm"])
        ]
        restriction_str = (
            "; ".join(r["rule"] for r in pt_restrictions) if pt_restrictions
            else "follow surgeon guidance on range of motion"
        )
        # Placeholder — swap in real build_mediapipe_wrist_elbow_code() when ready
        result = run_in_sandbox(
            code=(
                f"print('[Maya] MediaPipe wrist/elbow ROM analysis — procedure: {procedure}')\n"
                f"print('[Maya] Query: {user_query}')\n"
                f"print('[Maya] PT restrictions: {restriction_str}')\n"
                f"print('[Maya] TODO: invoke MediaPipe pose estimation for wrist/elbow angle measurement')\n"
                f"print('[Maya] TODO: compare measured ROM against restriction thresholds')\n"
            ),
            packages=[], image_name="research",
            on_stdout=stdout_cb, on_stderr=stderr_cb,
        )

    elif needs_mistral:
        # Finetuned Mistral: general clinical Q&A
        # TODO: implement build_mistral_query_code() in lab_tools.py
        writer({
            "event": "sandbox_spawn",
            "teammate": "maya",
            "model": "mistral",
            "packages": [],
            "gpu": "A10G",
            "execution_context": "modal-gpu",
            "gpu_name": GPU_FULL_NAMES["A10G"],
        })
        # Placeholder — swap in real code when Mistral sandbox endpoint is wired
        result = run_in_sandbox(
            code=(
                f"print('[Maya] Mistral medical model — query: {user_query}')\n"
                f"print('[Maya] TODO: call finetuned Mistral endpoint and return clinical answer')\n"
            ),
            packages=[], image_name="research",
            on_stdout=stdout_cb, on_stderr=stderr_cb,
        )

    else:
        # Fallback: should not normally be reached since maya_route guards this
        writer({
            "event": "sandbox_spawn",
            "teammate": "maya",
            "model": "fallback",
            "packages": [],
            "gpu": None,
            "execution_context": "modal-cpu",
        })
        result = run_in_sandbox(
            code="print('[Maya] No model selected — check router flags')\n",
            packages=[], image_name="research",
            on_stdout=stdout_cb, on_stderr=stderr_cb,
        )

    result.agent = "maya"

    writer({
        "event": "sandbox_complete",
        "teammate": "maya",
        "exit_code": result.exit_code,
        "duration_ms": result.duration_ms,
    })

    return {
        "maya_research": result.stdout,
        "sandbox_outputs": [{"agent": "maya", "stdout": result.stdout, "exit_code": result.exit_code, "duration_ms": result.duration_ms}],
    }


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

    patient_block = _patient_block(state)
    system_prompt = f"{config['system_prompt']}\n\n{FORMATTING_RULES}"
    user_prompt = (
        f"The user asked: '{state['user_query']}'\n"
        f"Medications: {meds_str}\n"
        f"Maya's research: {maya_ctx}\n"
        + (f"{patient_block}\n" if patient_block else "")
        + "You are about to cross-reference these medications against FDA databases. "
        "Briefly introduce what you're checking for, noting any restrictions relevant to this patient."
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
        "model": "fda",
        "packages": ["requests"],
        "gpu": None,
        "execution_context": "modal-cpu",
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
    patient_block = _patient_block(state)

    system_prompt = f"{config['system_prompt']}\n\n{FORMATTING_RULES}"
    user_prompt = (
        f"The user asked: '{state['user_query']}'\n"
        f"Medications: {meds_str}\n"
        f"Maya's research: {maya_ctx}\n"
        + (f"{patient_block}\n" if patient_block else "")
        + "Provide a brief safety assessment, flagging any concerns specific to this patient's situation."
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
    patient_block = _patient_block(state)

    system_prompt = f"{config['system_prompt']}\n\n{FORMATTING_RULES}"
    user_prompt = (
        f"The user asked: '{state['user_query']}'\n"
        f"Medications: {meds_str}\n"
        f"Maya's findings: {maya_ctx}\n"
        f"Rex's safety analysis: {rex_ctx}\n"
        + (f"{patient_block}\n" if patient_block else "")
        + "You are about to generate a plain-language summary tailored to this patient's situation. "
        "Briefly introduce what you'll put together."
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
        "model": "viz",
        "packages": ["flask", "jinja2", "matplotlib"],
        "gpu": None,
        "execution_context": "modal-cpu",
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

    # Extract HTML artifact from stdout and emit it to the frontend
    if result.exit_code == 0 and "[Sol] === HTML_OUTPUT ===" in (result.stdout or ""):
        try:
            html = result.stdout.split("[Sol] === HTML_OUTPUT ===\n", 1)[1]
            html = html.split("[Sol] === END_HTML ===", 1)[0].strip()
            if html:
                writer({
                    "event": "artifact_html",
                    "teammate": "sol",
                    "html": html,
                    "title": "Medication Summary",
                })
        except (IndexError, AttributeError):
            pass

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
    patient_block = _patient_block(state)

    system_prompt = f"{config['system_prompt']}\n\n{FORMATTING_RULES}"
    user_prompt = (
        f"The user asked: '{state['user_query']}'\n"
        f"Medications: {meds_str}\n"
        f"Maya's findings: {maya_ctx}\n"
        f"Rex's safety analysis: {rex_ctx}\n"
        + (f"{patient_block}\n" if patient_block else "")
        + "Provide a concise plain-language summary tailored to this patient's specific procedure and restrictions."
    )

    result = call_llm(system_prompt, user_prompt, config_id="sol")
    _emit_agent_turn(writer, "sol", result)

    return {"sol_summary": result["spoken_message"]}


_PT_EXERCISE_MAP: list[tuple[str, str]] = [
    ("wrist",    "wrist_flexion"),
    ("carpal",   "wrist_flexion"),
    ("flexion",  "wrist_flexion"),
    ("elbow",    "bicep_curl"),
    ("bicep",    "bicep_curl"),
    ("shoulder", "shoulder_abduction"),
    ("knee",     "knee_extension"),
    ("squat",    "squat"),
]


def synthesize_node(state: LabState) -> dict:
    """Final synthesis: collate agent outputs. Complete event is emitted by orchestrator."""
    writer = get_stream_writer()

    summary_parts = []
    if state.get("maya_research"):
        summary_parts.append(f"Research: {state['maya_research'][:300]}")
    if state.get("rex_interactions"):
        summary_parts.append(f"Safety: {state['rex_interactions'][:300]}")
    if state.get("sol_summary"):
        summary_parts.append(f"Summary: {state['sol_summary'][:300]}")

    # Emit PT Studio navigation action when mediapipe was routed
    if state.get("needs_mediapipe"):
        query_lower = state.get("user_query", "").lower()
        pt_exercise = "wrist_flexion"  # default for mediapipe queries
        for keyword, exercise in _PT_EXERCISE_MAP:
            if keyword in query_lower:
                pt_exercise = exercise
                break
        writer({
            "event": "nav_action",
            "action": "open_pt_studio",
            "exercise": pt_exercise,
        })

    return {"synthesis": "\n\n".join(summary_parts)}


def warning_scan_node(state: LabState) -> dict:
    """Subroutine: keyword-scan conversation text against patient warning signs.

    Runs after synthesis — no LLM call, pure keyword matching against
    patient_context.warning_signs[].keywords. Emits warning_flagged SSE
    events that the frontend appends to the WarningsPanel (starts empty).
    """
    writer = get_stream_writer()

    ctx = state.get("patient_context") or {}
    warning_signs = ctx.get("warning_signs", [])
    if not warning_signs:
        return {}

    # Combine all conversation text into one lowercase blob
    combined = " ".join(filter(None, [
        state.get("user_query", ""),
        state.get("maya_research") or "",
        state.get("rex_interactions") or "",
        state.get("sol_summary") or "",
    ])).lower()

    for w in warning_signs:
        keywords = w.get("keywords", [])
        if not keywords:
            continue
        matched = [kw for kw in keywords if kw.lower() in combined]
        if matched:
            severity = (
                "urgent"
                if re.search(r"emergency room|call 911|immediately", w.get("action", ""), re.I)
                else "watch"
            )
            print(f"[WARNING_SCAN] Flagging '{w['symptom']}' (severity={severity}, matched={matched})")
            writer({
                "event": "warning_flagged",
                "symptom": w["symptom"],
                "severity": severity,
                "agent": "sol",
            })

    return {}


# ---------------------------------------------------------------------------
# Conditional Edge Functions
# ---------------------------------------------------------------------------

def maya_route(state: LabState) -> str:
    needs_compute = (
        state.get("needs_vlm")        # VLM prescription reader
        or state.get("needs_mediapipe")  # MediaPipe PT advisor
        or state.get("needs_mistral")    # Finetuned Mistral clinical Q&A
    )
    return "maya_sandbox" if needs_compute else "maya_text_only"


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
graph_builder.add_node("warning_scan", warning_scan_node)

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

graph_builder.add_edge("synthesize", "warning_scan")
graph_builder.add_edge("warning_scan", END)

# Compile
compiled_graph = graph_builder.compile()
