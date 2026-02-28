import asyncio
import json
import uuid
import os
import re
import base64
from typing import Dict, Any

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
import httpx
import websockets

load_dotenv()

# ==============================================================================
# Configuration
# ==============================================================================

# LLM 
MODAL_URL = "https://saibilla21--agentfm-brain-serve-dev.modal.run"
MODEL_NAME = "deepseek-ai/DeepSeek-R1-Distill-Qwen-7B"

# APIs
ELEVENLABS_API_KEY = os.getenv("ELEVENLABS_API_KEY", "your_elevenlabs_key_here")
SUPERMEMORY_API_KEY = os.getenv("SUPERMEMORY_API_KEY", "your_supermemory_key_here")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "your_openai_key_here")

# Agent Configs
AGENTS = {
    "scout": {
        "voice_id": "21m00Tcm4TlvDq8ikWAM", # Rachel / Standard female voice
        "system_prompt": "You are the Scout. Your job is to enthusiastically propose bold new ideas and advocate for the given topic. Be persuasive and forward-looking.",
    },
    "critic": {
        "voice_id": "onwK4e9ZLuTAKqWW03F9", # Default male / British often
        "system_prompt": "You are the Critic. Your job is to poke holes in the Scout's proposal. Point out risks, downsides, and hidden costs to the topic debated. Be analytical and slightly skeptical, but not mean.",
    },
    "synthesizer": {
        "voice_id": "nPczCjzI2devNBz1zQrb", # Calm / authoritative
        "system_prompt": "You are the Synthesizer. You have heard the Scout's proposal and the Critic's concerns. Your job is to weigh both sides objectively and provide a final, balanced executive decision. Be authoritative, clear, and wise.",
    }
}

ORDER_OF_AGENTS = ["scout", "critic", "synthesizer"]

app = FastAPI(title="AgentFM Orchestrator")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ==============================================================================
# Helper Functions
# ==============================================================================

def parse_llm_response(raw_text: str) -> dict:
    """
    Extracts reasoning from <think> tags and parses the remaining text as JSON.
    Gracefully falls back to raw text if JSON parsing fails.
    """
    reasoning = "Internal reasoning skipped or unavailable."
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

    # 2. Extract JSON (remove markdown codeblocks if they exist)
    json_match = re.search(r'```json\s*(.*?)\s*```', message_json_text, flags=re.DOTALL | re.IGNORECASE)
    if json_match:
        message_json_text = json_match.group(1).strip()
    
    # Clean up any trailing backticks or formatting
    message_json_text = message_json_text.strip('`').strip()

    # 3. Parse JSON Schema
    spoken_message = ""
    confidence = 0.5
    sentiment = "neutral"
    
    try:
        parsed = json.loads(message_json_text)
        spoken_message = parsed.get("spoken_message", "")
        confidence = float(parsed.get("confidence", 0.5))
        sentiment = parsed.get("sentiment", "neutral")
        
        # Clean up any markdown, asterisks, or bullet points just in case the LLM disobeyed
        spoken_message = re.sub(r'[*_#`~]', '', spoken_message)
        spoken_message = re.sub(r'^\s*[-*]\s+', '', spoken_message, flags=re.MULTILINE)
        
    except json.JSONDecodeError:
        print(f"[Warning] Failed to parse JSON. Falling back to raw text. Text: {message_json_text}")
        spoken_message = message_json_text  # Fallback: Just read whatever it said
        
        # Clean up fallback text as well
        spoken_message = re.sub(r'[*_#`~]', '', spoken_message)

    return {
        "reasoning": reasoning,
        "spoken_message": spoken_message,
        "confidence": confidence,
        "sentiment": sentiment,
        "raw_text": raw_text
    }


async def call_modal_llm(agent_id: str, topic: str, conversation_history: str) -> dict:
    """
    Calls the vLLM engine running on Modal with the strict system prompts.
    """
    print(f"\n[LLM] Requesting turn for {agent_id.upper()}...")
    
    agent_config = AGENTS[agent_id]
    
    # Strict formatting rules
    formatting_rules = (
        "CRITICAL RULES:\n"
        "1. You MUST wrap your entire internal reasoning process in <think>...</think> tags FIRST.\n"
        "2. Immediately after the closing </think> tag, you MUST output a valid JSON object matching this exact schema: "
        '{"spoken_message": "2-3 sentences max", "confidence": 0.9, "sentiment": "analytical"}\n'
        "3. The 'spoken_message' MUST NOT contain any markdown, asterisks, or bullet points. Output raw spoken English only."
    )
    
    system_prompt = f"{agent_config['system_prompt']}\n\n{formatting_rules}"
    
    # Build prompt context
    user_prompt = f"The debate topic is: '{topic}'.\n\n"
    if conversation_history:
        user_prompt += f"Here is the conversation so far:\n{conversation_history}\n\n"
    user_prompt += f"It is your turn to speak as the {agent_id.capitalize()}."

    url = f"{MODAL_URL}/v1/chat/completions"
    payload = {
        "model": MODEL_NAME,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ],
        "temperature": 0.7,
        "max_tokens": 2048,
    }
    
    async with httpx.AsyncClient(timeout=120.0) as client:
        response = await client.post(url, json=payload)
        response.raise_for_status()
        data = response.json()
        raw_text = data["choices"][0]["message"]["content"]
        
        return parse_llm_response(raw_text)


async def call_modal_debrief_llm(agent_name: str, supermemory_context: str, user_question: str) -> dict:
    """
    Calls vLLM on Modal with the debrief system prompt.
    NOTE: set keep_warm=1 on the Modal function to avoid cold starts!
    """
    system_prompt = f"""You are {agent_name.capitalize()}, an AI analyst who just finished a live debate. You have access to your memory of what you said and thought during the debate.

Here is your memory from the debate:
{supermemory_context}

VOICE RULES (NON-NEGOTIABLE):
- Respond in exactly 2-3 sentences. Never more.
- Never use markdown, bullet points, numbered lists, asterisks, or any special characters.
- Never use headers or formatting of any kind.
- Write numbers as words: "twenty three percent" not "23%"
- Use contractions naturally: "don't", "I'd", "we're"
- Speak in first person as {agent_name.capitalize()} — you remember this debate, you own your reasoning.
- Start with "Look," or "Here's the thing," or "What I said was," — never start with "I" directly.

YOUR PERSONALITY DURING DEBRIEF:
- Scout: calm, data-driven, willing to defend your analysis but open to new evidence
- Critic: direct, stands by your skepticism, doesn't backpedal
- Synthesizer: measured, explains your reasoning process, connects dots

CRITICAL RULES:
1. You MUST wrap your entire internal reasoning process in <think>...</think> tags FIRST.
2. Immediately after the closing </think> tag, you MUST output a valid JSON object matching this exact schema:
{{"spoken_message": "The actual words you say aloud", "confidence": 0.85, "sentiment": "analytical"}}
"""

    url = f"{MODAL_URL}/v1/chat/completions"
    payload = {
        "model": MODEL_NAME,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": f"Question from the user: '{user_question}'"}
        ],
        "temperature": 0.7,
        "max_tokens": 2048,
    }
    
    async with httpx.AsyncClient(timeout=120.0) as client:
        response = await client.post(url, json=payload)
        response.raise_for_status()
        data = response.json()
        raw_text = data["choices"][0]["message"]["content"]
        
        return parse_llm_response(raw_text)


async def query_debrief_memory(session_id: str, target_agent: str, question: str) -> str:
    url = "https://api.supermemory.ai/v4/search"
    headers = {
        "Authorization": f"Bearer {SUPERMEMORY_API_KEY}",
        "Content-Type": "application/json"
    }
    
    filters = {}
    if target_agent != "all":
        filters = {
            "AND": [{"key": "agent_id", "value": target_agent}]
        }
        
    payload = {
        "q": question,
        "containerTags": [f"{session_id}"], 
        "limit": 5,
        "rerank": True
    }
    if filters:
        payload["filters"] = filters

    async with httpx.AsyncClient() as client:
        try:
            resp = await client.post(url, headers=headers, json=payload, timeout=30.0)
            resp.raise_for_status()
            data = resp.json()
            
            results = data.get("results", [])
            if not results:
                return ""
                
            context_blocks = []
            for r in results:
                metadata = r.get("metadata", {})
                turn_num = metadata.get("turn_number", "?")
                ag_id = metadata.get("agent_id", "unknown")
                content = r.get("content", "")
                context_blocks.append(f"[Turn {turn_num} - {ag_id.upper()}]\n{content}")
                
            return "\n\n".join(context_blocks)
        except Exception as e:
            print(f"[Supermemory Search Error] {e}")
            return ""


# ==============================================================================
# The "Y-Split" Background Tasks
# ==============================================================================

async def task_supermemory_logging(agent_id: str, turn_number: int, session_id: str, reasoning: str, spoken_message: str):
    """
    Task B: Fire-and-forget observability logging to Supermemory.
    """
    print(f"  [Supermemory] Background thread started for {agent_id}. Logging to memory...")
    
    url = "https://api.supermemory.ai/v3/documents"
    headers = {
        "Authorization": f"Bearer {SUPERMEMORY_API_KEY}",
        "Content-Type": "application/json"
    }
    
    # Combined content for observability
    content = f"AGENT: {agent_id.upper()}\n\nREASONING:\n{reasoning}\n\nSPOKEN MESSAGE:\n{spoken_message}"
    
    payload = {
        "content": content,
        "containerTags": [f"{session_id}"], # As requested: flat list containing the session ID
        "metadata": {
            "agent_id": agent_id,
            "turn_number": turn_number
        }
    }
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(url, headers=headers, json=payload)
            response.raise_for_status()
            print(f"  [Supermemory] Successfully queued {agent_id} memory! (Status: {response.status_code})")
    except Exception as e:
        print(f"  [Supermemory] ERROR failed to log memory: {e}")
        try:
            print(f"  [Supermemory] Response: {e.response.text}")
        except:
            pass


async def task_elevenlabs_streaming(websocket: WebSocket, agent_id: str, spoken_message: str):
    """
    Task A: Streams the synthesized speech from ElevenLabs directly down the FastAPI WebSocket.
    """
    voice_id = AGENTS[agent_id]["voice_id"]
    elevenlabs_ws_url = f"wss://api.elevenlabs.io/v1/text-to-speech/{voice_id}/stream-input?model_id=eleven_flash_v2_5&output_format=pcm_24000"
    
    print(f"  [ElevenLabs] Connecting to Voice ID: {voice_id} for {agent_id}...")
    
    try:
        # We use the websockets library to connect to ElevenLabs
        async with websockets.connect(elevenlabs_ws_url) as el_ws:
            # 1. Send BOS (Beginning of Stream) message
            bos_message = {
                "text": " ",
                "voice_settings": {"stability": 0.5, "similarity_boost": 0.8},
                "xi_api_key": ELEVENLABS_API_KEY,
            }
            await el_ws.send(json.dumps(bos_message))
            
            # 2. Send the actual spoken message chunk
            chunk_message = {
                "text": spoken_message + " ", 
                "try_trigger_generation": True
            }
            await el_ws.send(json.dumps(chunk_message))
            
            # 3. Send EOS (End of Stream) message
            eos_message = {"text": ""}
            await el_ws.send(json.dumps(eos_message))
            
            print(f"  [ElevenLabs] Sent text payload. Awaiting audio stream...")
            
            # 4. Read incoming audio packets and forward to Frontend
            while True:
                try:
                    message_str = await el_ws.recv()
                    data = json.loads(message_json_text := message_str)
                    
                    if "audio" in data and data["audio"]:
                        # ElevenLabs sends base64 encoded audio strings. 
                        # We send them via our FastAPI WebSocket directly to the frontend.
                        await websocket.send_json({
                            "type": "audio_chunk",
                            "agent_id": agent_id,
                            "audio_b64": data["audio"]
                        })
                        
                    if data.get("isFinal"):
                        print(f"  [ElevenLabs] Audio stream finished for {agent_id}.")
                        break
                        
                except websockets.exceptions.ConnectionClosed:
                    print(f"  [ElevenLabs] Connection closed by ElevenLabs.")
                    break
                    
    except Exception as e:
        print(f"  [ElevenLabs] ERROR during TTS streaming: {e}")
        # Send an error to the frontend
        await websocket.send_json({
            "type": "error",
            "message": f"TTS Failure for {agent_id}: {str(e)}"
        })


# ==============================================================================
# FastAPI Routers & Endpoints
# ==============================================================================

@app.websocket("/ws/debate")
async def websocket_debate_endpoint(websocket: WebSocket):
    await websocket.accept()
    
    session_id = str(uuid.uuid4())
    print("\n" + "="*80)
    print(f"New Debate Session Started: {session_id}")
    print("="*80)
    
    try:
        # Wait for the client to send the topic
        data = await websocket.receive_json()
        topic = data.get("topic", "No topic provided")
        
        print(f"Received Topic: '{topic}'")
        
        # Acknowledge connection
        await websocket.send_json({
            "type": "system",
            "message": f"Session {session_id} initialized. Beginning debate on: '{topic}'",
            "session_id": session_id
        })
        
        conversation_history = ""
        
        # 3-Turn Sequential Debate Loop (Scout -> Critic -> Synthesizer)
        for turn_index, agent_id in enumerate(ORDER_OF_AGENTS):
            turn_number = turn_index + 1
            print(f"\n--- Turn {turn_number}: {agent_id.upper()} ---")
            
            # Notify frontend that agent is thinking
            await websocket.send_json({
                "type": "agent_thinking",
                "agent_id": agent_id,
                "turn": turn_number
            })
            
            # 1. Call LLM (Modal API)
            try:
                parsed_response = await call_modal_llm(agent_id, topic, conversation_history)
            except Exception as e:
                error_msg = f"LLM Failure for {agent_id}: {str(e)}"
                print(f"[Error] {error_msg}")
                await websocket.send_json({"type": "error", "message": error_msg})
                break
                
            spoken_message = parsed_response["spoken_message"]
            reasoning = parsed_response["reasoning"]
            confidence = parsed_response["confidence"]
            sentiment = parsed_response["sentiment"]
            
            print(f"  Reasoning Extracted: {len(reasoning)} chars")
            print(f"  Spoken Message: '{spoken_message}'")
            print(f"  Meta: Confidence={confidence} | Sentiment={sentiment}")
            
            # Send Metadata to Frontend before Audio starts
            await websocket.send_json({
                "type": "agent_metadata",
                "agent_id": agent_id,
                "confidence": confidence,
                "sentiment": sentiment,
                "spoken_message": spoken_message  # Send text just in case frontend wants to subtitle
            })
            
            # 2. Append to history for the next agent
            conversation_history += f"\n{agent_id.capitalize()} said:\n{spoken_message}\n"
            
            # 3. THE "Y-SPLIT" CONCURRENT EXECUTION
            print("  [Orchestrator] Forking tasks: T1 (Supermemory Background) | T2 (ElevenLabs Stream)")
            
            # Task B: Background Memory Logging (Fire and forget, don't await)
            asyncio.create_task(
                task_supermemory_logging(agent_id, turn_number, session_id, reasoning, spoken_message)
            )
            
            # Task A: Await the ElevenLabs Audio Stream (Blocks until agent finishes speaking)
            await task_elevenlabs_streaming(websocket, agent_id, spoken_message)
            
            # Wait a tiny bit between agents so they don't jump on each other's toes immediately
            await asyncio.sleep(1)

        print("\n" + "="*80)
        print(f"Debate Session {session_id} Completed gracefully.")
        print("="*80)
        
        # Final message to client
        await websocket.send_json({
            "type": "system",
            "message": "Debate concluded."
        })
        
        await websocket.close()

    except WebSocketDisconnect:
        print(f"Client disconnected for session {session_id}.")
    except Exception as e:
        print(f"Unexpected Error in websocket session {session_id}: {e}")
        try:
            await websocket.close()
        except:
            pass

# ==============================================================================
# DEBRIEF ROOM (Voice Q&A)
# ==============================================================================

@app.post("/api/transcribe")
async def transcribe_audio(file: UploadFile = File(...)):
    if not OPENAI_API_KEY or OPENAI_API_KEY == "your_openai_key_here":
        raise HTTPException(status_code=500, detail="OPENAI_API_KEY is not configured.")
        
    url = "https://api.openai.com/v1/audio/transcriptions"
    headers = {"Authorization": f"Bearer {OPENAI_API_KEY}"}
    
    file_content = await file.read()
    files = {"file": (file.filename or "audio.webm", file_content, file.content_type or "audio/webm")}
    data = {"model": "whisper-1"}
    
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.post(url, headers=headers, data=data, files=files, timeout=60.0)
            resp.raise_for_status()
            return {"transcript": resp.json().get("text", "")}
        except Exception as e:
            err = str(e)
            if hasattr(e, 'response') and e.response:
                err += f" - {e.response.text}"
            return {"error": f"Transcription failed: {err}"}

@app.websocket("/ws/debrief/{session_id}")
async def websocket_debrief_endpoint(websocket: WebSocket, session_id: str):
    await websocket.accept()
    await websocket.send_json({"type": "ready", "session_id": session_id})
    print(f"\n[Debrief] User entered debrief room for session {session_id}")
    
    try:
        while True:
            data = await websocket.receive_json()
            question = data.get("question")
            target_agent = data.get("target_agent", "scout").lower()
            
            if not question:
                continue
                
            print(f"[Debrief] Received question for {target_agent}: '{question}'")
            
            # 1. Query Supermemory
            context_block = await query_debrief_memory(session_id, target_agent, question)
            
            if not context_block:
                await websocket.send_json({
                    "type": "error", 
                    "message": "No memories found for this session. Run a debate first."
                })
                continue
                
            # 2. Add system message about thinking
            await websocket.send_json({
                "type": "agent_thinking",
                "agent_id": target_agent,
                "message": "Retrieving memories and formulating answer..."
            })
            
            # 3. Call DeepSeek vLLM
            agent_name = target_agent if target_agent != "all" else "synthesizer" 
            try:
                parsed_response = await call_modal_debrief_llm(agent_name, context_block, question)
            except Exception as e:
                error_msg = f"LLM Failure during debrief: {e}"
                print(f"[Error] {error_msg}")
                await websocket.send_json({"type": "error", "message": error_msg})
                continue
                
            spoken_message = parsed_response["spoken_message"]
            
            # Post-process spoken_message to strip markdown before TTS (safeguard against wild LLM output)
            spoken_message = re.sub(r'[*_#`~-]', '', spoken_message)
            spoken_message = spoken_message.replace('\n', ' ')
            
            # Send metadata to frontend immediately
            await websocket.send_json({
                "type": "agent_metadata",
                "agent_id": target_agent,
                "confidence": parsed_response["confidence"],
                "sentiment": parsed_response["sentiment"],
                "spoken_message": spoken_message
            })
            
            # 4. Stream Audio via ElevenLabs using the exact same streaming task
            voice_agent_id = target_agent if target_agent in AGENTS else "synthesizer"
            print(f"[Debrief] Streaming audio for {voice_agent_id}...")
            await task_elevenlabs_streaming(websocket, voice_agent_id, spoken_message)
            
            # 5. Send debrief_complete trigger
            await websocket.send_json({
                "type": "debrief_complete",
                "transcript": spoken_message
            })
            
    except WebSocketDisconnect:
        print(f"[Debrief] Client disconnected from session {session_id}.")
    except Exception as e:
        print(f"[Debrief] Unexpected Error: {e}")
        try:
            await websocket.send_json({"type": "error", "message": str(e)})
            await websocket.close()
        except:
            pass


# To run this file directly for simple tests: 
# uvicorn orchestrator:app --reload --port 8001
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("orchestrator:app", host="0.0.0.0", port=8001, reload=True)
