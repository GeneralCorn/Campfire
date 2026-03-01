"""backend/main.py — Post-Acute Care Copilot orchestrator

Graph topology
──────────────
                      ┌─ medication_agent ─┐
START → supervisor ───┤ (parallel/confer)   ├─ join_node → END
                      └─ recovery_agent  ───┘
                      └─ emergency_agent ──────────────── END

FAISS gate traps off-topic queries before they reach the graph.
"""
from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Optional

import os
import time
import httpx
import faiss
from dotenv import load_dotenv
load_dotenv()
import base64
from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sentence_transformers import SentenceTransformer
from langgraph.graph import StateGraph, START, END
from typing import TypedDict

from .prompts import (
    MEDICATION_SYSTEM_PROMPT,
    RECOVERY_SYSTEM_PROMPT,
    EMERGENCY_SYSTEM_PROMPT,
)
from .tts import generate_agent_audio
from .memory import MemoryManager

memory_manager = MemoryManager()

MODAL_MEDICAL_LLM_URL = os.environ.get("MODAL_MEDICAL_LLM_URL", "")
MODAL_VLM_URL = os.environ.get("MODAL_VLM_URL", "")

async def call_medical_llm(agent_type: str, query: str, context: str) -> str:
    if not MODAL_MEDICAL_LLM_URL:
        return ""
    start_time = time.time()
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                MODAL_MEDICAL_LLM_URL,
                json={
                    "agent_type": agent_type,
                    "query": query,
                    "context": context,
                    "system_prompt": context,
                }
            )
            response.raise_for_status()
            latency = time.time() - start_time
            print(f"[{agent_type.capitalize()} Agent] Modal inference responded in {latency:.2f}s")
            return response.json()["response"]
    except Exception as e:
        print(f"Modal LLM error ({agent_type}): {e}")
        return ""

from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sentence_transformers import SentenceTransformer
from langgraph.graph import StateGraph, START, END
from typing import TypedDict

# ── 1. Load discharge data ────────────────────────────────────────────────────

BASE_DIR = Path(__file__).parent

with open(BASE_DIR / "mock_data" / "discharge_state.json") as _f:
    DISCHARGE: dict = json.load(_f)

# ── 2. FAISS semantic cache ───────────────────────────────────────────────────
# Model is downloaded once from HuggingFace on first startup (~80 MB).

_EMBED = SentenceTransformer("all-MiniLM-L6-v2")


def _build_corpus(d: dict) -> list[str]:
    """Flatten all discharge text into individually embeddable chunks."""
    p = d["patient_profile"]
    chunks: list[str] = [
        f"procedure {p['procedure']} physician {p['attending_physician']} "
        f"discharge {p['discharge_date']}"
    ]
    for m in d["medications"]:
        chunks.append(
            f"{m['name']} {m['dosage']} {m['frequency']} {m['instructions']} "
            + " ".join(m.get("domain_flags", []))
        )
    for r in d["restrictions"]:
        chunk = f"{r['category']} {r['rule']}"
        if r.get("strict_prohibitions"):
            chunk += " " + " ".join(r["strict_prohibitions"])
        if r.get("timeline"):
            chunk += f" {r['timeline']}"
        chunks.append(chunk)
    for w in d["warning_signs"]:
        chunks.append(f"{w['symptom']} {w['implication']} {w['action']}")
    return chunks


_corpus_vecs = _EMBED.encode(
    _build_corpus(DISCHARGE), normalize_embeddings=True
).astype("float32")

_INDEX = faiss.IndexFlatIP(_corpus_vecs.shape[1])   # cosine via inner product on L2-normalised vecs
_INDEX.add(_corpus_vecs)

def rebuild_faiss_index(d: dict):
    global _INDEX, DISCHARGE, _corpus_vecs
    DISCHARGE = d
    _corpus_vecs = _EMBED.encode(
        _build_corpus(DISCHARGE), normalize_embeddings=True
    ).astype("float32")
    new_index = faiss.IndexFlatIP(_corpus_vecs.shape[1])
    new_index.add(_corpus_vecs)
    _INDEX = new_index

RELEVANCE_THRESHOLD = 0.25   # cosine similarity; below this → off-topic
OFF_TOPIC_REPLY = (
    "I can only answer questions about your discharge instructions, "
    "medications, restrictions, or warning signs."
)


def is_relevant(query: str) -> bool:
    """Return False if query has no semantic overlap with the discharge corpus."""
    vec = _EMBED.encode([query], normalize_embeddings=True).astype("float32")
    scores, _ = _INDEX.search(vec, 1)
    return float(scores[0][0]) >= RELEVANCE_THRESHOLD


# ── 3. LangGraph state ────────────────────────────────────────────────────────

class GraphState(TypedDict):
    query: str
    route: str
    session_id: str
    # Parallel agents write to distinct keys — avoids merge conflicts
    medication_result: Optional[dict]
    recovery_result: Optional[dict]
    emergency_result: Optional[dict]
    # Assembled by join_node (or directly by emergency_agent)
    audio_text: str
    ui_trigger: str


# ── 4. Deterministic keyword router ──────────────────────────────────────────

_MED_RE = re.compile(
    r"\b(medication|medicine|drug|pill|dose|dosage|oxycodone|ibuprofen|"
    r"prescription|take|taking|frequency|refill|painkiller|pain\s+killer)\b",
    re.IGNORECASE,
)
_REC_RE = re.compile(
    r"\b(restrict|activity|wound|dressing|crutch|crutches|weight[\s\-]?bearing|"
    r"shower|bath|physical[\s\-]?therapy|exercise|flex|bend|knee|swim|walk|brace)\b",
    re.IGNORECASE,
)
_EMG_RE = re.compile(
    r"\b(emergency|warning|danger|fever|swelling|clot|blood|dvt|urgent|"
    r"immediate|e\.?r\b|hospital|symptom|sign|serious|worried|concern|"
    r"calf[\s\-]?pain|infection)\b",
    re.IGNORECASE,
)


def _determine_route(query: str) -> str:
    has_med = bool(_MED_RE.search(query))
    has_rec = bool(_REC_RE.search(query))
    has_emg = bool(_EMG_RE.search(query))

    if has_emg:
        return "emergency"
    if has_med and has_rec:
        return "confer"
    if has_med:
        return "medications"
    if has_rec:
        return "recovery"
    return "confer"  # general care question → run both agents


# ── 5. Graph nodes ────────────────────────────────────────────────────────────

def supervisor_node(state: GraphState) -> dict:
    return {"route": _determine_route(state["query"])}


async def medication_agent(state: GraphState) -> dict:
    sid = state.get("session_id", "demo_session_1")
    history_str = memory_manager.get_history_string(sid, limit=4)

    med_json = json.dumps(DISCHARGE.get("medications", []), indent=2)
    system_prompt = MEDICATION_SYSTEM_PROMPT.format(
        json_medication_chunk=med_json, chat_history=history_str
    )

    llm_response = await call_medical_llm("medication", state["query"], system_prompt)
    
    # Fallback to static if LLM fails
    if not llm_response:
        parts = [f"{m['name']} {m['dosage']}: {m['frequency']}. {m['instructions']}" for m in DISCHARGE["medications"]]
        llm_response = " Next, ".join(parts)

    memory_manager.add_interaction(
        session_id=sid, user_query=state["query"],
        agent_response=llm_response, agent_type="medication",
    )

    return {
        "medication_result": {
            "audio_text": llm_response,
            "ui_trigger": "highlight_medications",
        }
    }


async def recovery_agent(state: GraphState) -> dict:
    sid = state.get("session_id", "demo_session_1")
    history_str = memory_manager.get_history_string(sid, limit=4)

    restrictions_json = json.dumps(DISCHARGE.get("restrictions", []), indent=2)
    system_prompt = RECOVERY_SYSTEM_PROMPT.format(
        json_recovery_chunk=restrictions_json, chat_history=history_str
    )

    llm_response = await call_medical_llm("recovery", state["query"], system_prompt)
    
    if not llm_response:
        parts: list[str] = []
        for r in DISCHARGE["restrictions"]:
            chunk = f"{r['category']}: {r['rule']}"
            if r.get("strict_prohibitions"):
                chunk += " Not allowed: " + ", ".join(r["strict_prohibitions"]) + "."
            if r.get("timeline"):
                chunk += f" Timeline: {r['timeline']}."
            parts.append(chunk)
        llm_response = " Also, ".join(parts)

    memory_manager.add_interaction(
        session_id=sid, user_query=state["query"],
        agent_response=llm_response, agent_type="recovery",
    )

    return {
        "recovery_result": {
            "audio_text": llm_response,
            "ui_trigger": "highlight_restrictions",
        }
    }


async def emergency_agent(state: GraphState) -> dict:
    sid = state.get("session_id", "demo_session_1")
    history_str = memory_manager.get_history_string(sid, limit=4)

    warnings_json = json.dumps(DISCHARGE.get("warning_signs", []), indent=2)
    system_prompt = EMERGENCY_SYSTEM_PROMPT.format(
        json_emergency_chunk=warnings_json, chat_history=history_str
    )

    llm_response = await call_medical_llm("emergency", state["query"], system_prompt)
    
    if not llm_response:
        parts_fb = [f"If you experience {w['symptom']}, this may indicate {w['implication']}. {w['action']}." for w in DISCHARGE["warning_signs"]]
        llm_response = " ".join(parts_fb)

    memory_manager.add_interaction(
        session_id=sid, user_query=state["query"],
        agent_response=llm_response, agent_type="emergency",
    )

    return {
        "emergency_result": {"audio_text": llm_response, "ui_trigger": "highlight_warnings"},
        "audio_text": llm_response,
        "ui_trigger": "highlight_warnings",
    }


def join_node(state: GraphState) -> dict:
    """Assembles parallel medication + recovery results into a single response."""
    parts: list[str] = []
    trigger = "highlight_medications"

    if state.get("medication_result"):
        parts.append(state["medication_result"]["audio_text"])
    if state.get("recovery_result"):
        parts.append(state["recovery_result"]["audio_text"])
        trigger = "highlight_both" if state.get("medication_result") else "highlight_restrictions"

    return {
        "audio_text": " Additionally, ".join(parts),
        "ui_trigger": trigger,
    }


# ── 6. Conditional routing edge ───────────────────────────────────────────────

def _route_edge(state: GraphState) -> list[str] | str:
    """
    Returns a list of node names for parallel (confer) execution,
    or a single node name for direct routing.
    """
    r = state["route"]
    if r == "confer":
        return ["medication_agent", "recovery_agent"]    # ← parallel fan-out
    elif r == "medications":
        return "medication_agent"
    elif r == "recovery":
        return "recovery_agent"
    else:
        return "emergency_agent"


# ── 7. Build & compile the graph ──────────────────────────────────────────────

_b = StateGraph(GraphState)

_b.add_node("supervisor",        supervisor_node)
_b.add_node("medication_agent",  medication_agent)
_b.add_node("recovery_agent",    recovery_agent)
_b.add_node("emergency_agent",   emergency_agent)
_b.add_node("join_node",         join_node)

_b.add_edge(START, "supervisor")

_b.add_conditional_edges(
    "supervisor",
    _route_edge,
    # path_map as list = identity allowlist of reachable nodes
    ["medication_agent", "recovery_agent", "emergency_agent"],
)

# Both parallel branches converge here; solo branches use only one of them
_b.add_edge("medication_agent", "join_node")
_b.add_edge("recovery_agent",   "join_node")

# Emergency exits directly — does not pass through join_node
_b.add_edge("emergency_agent", END)
_b.add_edge("join_node",       END)

GRAPH = _b.compile()

# ── 8. FastAPI app ────────────────────────────────────────────────────────────

app = FastAPI(title="Care Copilot Orchestrator", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class OrchestrateRequest(BaseModel):
    query: str


class OrchestrateResponse(BaseModel):
    audio_text: str
    audio_base64: str | None = None
    ui_trigger: str
    route: str
    off_topic: bool


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/api/orchestrate", response_model=OrchestrateResponse)
async def orchestrate(req: OrchestrateRequest):
    query = req.query.strip()

    # FAISS gate — bypass the graph entirely for off-topic queries
    if not is_relevant(query):
        return OrchestrateResponse(
            audio_text=OFF_TOPIC_REPLY,
            ui_trigger="none",
            route="blocked",
            off_topic=True,
        )

    initial: GraphState = {
        "query": query,
        "route": "",
        "session_id": "demo_session_1",
        "medication_result": None,
        "recovery_result": None,
        "emergency_result": None,
        "audio_text": "",
        "ui_trigger": "",
    }

    result = await GRAPH.ainvoke(initial)

    final_audio_text = result["audio_text"]
    route = result["route"]

    # Generate TTS audio via ElevenLabs
    audio_b64 = generate_agent_audio(final_audio_text, route)

    return OrchestrateResponse(
        audio_text=final_audio_text,
        audio_base64=audio_b64,
        ui_trigger=result["ui_trigger"],
        route=route,
        off_topic=False,
    )

@app.post("/api/upload-discharge")
async def upload_discharge(file: UploadFile = File(...)):
    contents = await file.read()
    
    if file.content_type == "application/pdf":
        payload = {
            "document": base64.b64encode(contents).decode("utf-8"),
            "doc_type": "application/pdf"
        }
    else:
        payload = {
            "pages": [base64.b64encode(contents).decode("utf-8")]
        }
    
    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.post(
                MODAL_VLM_URL,
                json=payload
            )
            parsed = response.json()
            
            # Modal might return JSON inside "data" if parsing is slow, 
            # let's just make sure we grab the root structure directly unless it indicates nested.
            # But based on our Modal code, the response structure looks like:
            # {"patient_info": {...}, "medications": [...], ...}
        
        # Update in-memory discharge state & vector index
        rebuild_faiss_index(parsed)
        
        return {"status": "success", "data": parsed}
    
    except Exception as e:
        return {"status": "error", "message": str(e)}

# ── 10. Deepgram STT endpoint ────────────────────────────────────────────────

from deepgram import DeepgramClient, PrerecordedOptions

_deepgram = DeepgramClient(os.environ.get("DEEPGRAM_API_KEY"))


@app.post("/api/transcribe")
async def transcribe_audio(file: UploadFile = File(...)):
    """Accept an audio file upload and return the transcript via Deepgram Nova-2."""
    try:
        file_bytes = await file.read()
        payload = {"buffer": file_bytes}
        options = PrerecordedOptions(model="nova-2", smart_format=True)

        response = _deepgram.listen.rest.v("1").transcribe_file(payload, options)
        transcript = (
            response.results.channels[0].alternatives[0].transcript
        )
        return {"status": "success", "text": transcript}
    except Exception as e:
        print(f"[Deepgram] Transcription error: {e}")
        return {"status": "error", "text": "", "message": str(e)}

