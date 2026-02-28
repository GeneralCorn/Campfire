import asyncio
import httpx
import json
import os
import uuid
import re
from dotenv import load_dotenv

# Load environment variables from backend/.env.local
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env.local"))

SUPERMEMORY_API_KEY = os.getenv("SUPERMEMORY_API_KEY", "your_supermemory_api_key_here")
MODAL_URL = os.getenv("MODAL_URL", "https://saibilla21--agentfm-brain-serve-dev.modal.run")
MODEL_NAME = os.getenv("MODEL_NAME", "deepseek-ai/DeepSeek-R1-Distill-Qwen-7B")

async def call_llm(prompt: str) -> str:
    """
    Step 1: The LLM Call
    Makes an async POST request to the custom LLM API running on Modal.
    Note: Since the Modal endpoint is running `vllm serve`, we use the 
    OpenAI-compatible /v1/chat/completions endpoint.
    """
    print(f"\n[Step 1] Sending prompt to LLM...")
    print(f"Prompt: {prompt}")
    
    # We use the /v1/chat/completions endpoint for vLLM as seen in client.py
    url = f"{MODAL_URL}/v1/chat/completions"
    payload = {
        "model": MODEL_NAME,
        "messages": [
            {"role": "user", "content": prompt}
        ],
        "temperature": 0.7,
        "max_tokens": 2048,
    }
    
    async with httpx.AsyncClient(timeout=120.0) as client:
        try:
            response = await client.post(url, json=payload)
            response.raise_for_status()
            data = response.json()
            raw_text = data["choices"][0]["message"]["content"]
            print("[Step 1] Received response from LLM.")
            return raw_text
        except Exception as e:
            # Fallback for the explicit payload requested in case it's a custom endpoint
            print(f"[Step 1] Attempting fallback to custom endpoint due to: {e}")
            fallback_payload = {"prompt": prompt}
            response = await client.post(MODAL_URL, json=fallback_payload)
            response.raise_for_status()
            
            # Using custom endpoint from the previous version of modal_poc.py
            if "reasoning" in response.json(): 
                # Already parsed dictionary
                return json.dumps(response.json())
            return response.text

def parse_llm_response(raw_text: str) -> dict:
    """
    Step 2: The Parser
    Extracts text inside <think> tags. Parses the remaining text as JSON.
    """
    print("\n[Step 2] Parsing LLM response...")
    
    reasoning = ""
    message_json_text = raw_text
    
    # Extract reasoning inside <think>...</think>
    think_match = re.search(r'<think>(.*?)</think>', raw_text, flags=re.DOTALL)
    if think_match:
        reasoning = think_match.group(1).strip()
        # Remove the <think> block from the raw text to parse the JSON
        message_json_text = raw_text.replace(think_match.group(0), "").strip()
    elif '</think>' in raw_text:
        # Fallback if opening tag is missing
        parts = raw_text.split('</think>')
        reasoning = parts[0].replace('<think>', '').strip()
        message_json_text = parts[1].strip()
    
    # Attempt to parse the remaining text as JSON
    spoken_message = ""
    confidence = 0.0
    
    # Often LLMs wrap JSON in markdown code blocks
    json_match = re.search(r'```json\s*(.*?)\s*```', message_json_text, flags=re.DOTALL)
    if json_match:
        message_json_text = json_match.group(1)
        
    try:
        parsed_json = json.loads(message_json_text)
        spoken_message = parsed_json.get("spoken_message", "")
        confidence = parsed_json.get("confidence", 0.0)
    except json.JSONDecodeError:
        print(f"[Warning] Failed to parse JSON. Raw remaining text: {message_json_text}")
        spoken_message = message_json_text
        
    print(f"-> Parsed Reasoning Length: {len(reasoning)} chars")
    print(f"-> Parsed Spoken Message: {spoken_message}")
        
    return {
        "reasoning": reasoning,
        "spoken_message": spoken_message,
        "confidence": confidence,
        "raw_text": raw_text
    }

async def write_to_supermemory(reasoning: str, spoken_message: str, session_id: str) -> dict:
    """
    Step 3: Write to Supermemory
    """
    print(f"\n[Step 3] Writing to Supermemory... (Session: {session_id})")
    
    url = "https://api.supermemory.ai/v3/documents"
    headers = {
        "Authorization": f"Bearer {SUPERMEMORY_API_KEY}",
        "Content-Type": "application/json"
    }
    
    # Combined content
    content = f"REASONING:\n{reasoning}\n\nSPOKEN MESSAGE:\n{spoken_message}"
    
    # CRITICAL RULE: containerTags is a single flat string formatted as a list with the session_id
    payload = {
        "content": content,
        "containerTags": [f"session_{session_id}"],
        "metadata": {
            "agent_id": "scout"
        }
    }
    
    async with httpx.AsyncClient() as client:
        response = await client.post(url, headers=headers, json=payload)
        response.raise_for_status()
        data = response.json()
        print(f"-> Successfully written. Document Response: {data}")
        return data

async def query_supermemory(query: str, session_id: str) -> dict:
    """
    Step 4: Query Supermemory (The Interrogation)
    """
    print(f"\n[Step 4] Querying Supermemory with question: '{query}'")
    
    url = "https://api.supermemory.ai/v4/search"
    headers = {
        "Authorization": f"Bearer {SUPERMEMORY_API_KEY}",
        "Content-Type": "application/json"
    }
    
    payload = {
        "q": query,
        "containerTags": [f"session_{session_id}"],
        "filters": {
            "AND": [
                {"key": "agent_id", "value": "scout"}
            ]
        }
    }
    
    async with httpx.AsyncClient() as client:
        response = await client.post(url, headers=headers, json=payload)
        response.raise_for_status()
        data = response.json()
        print(f"-> Search completed.")
        return data

async def main():
    print("="*60)
    print("AgentFM - Supermemory Integration Sandbox")
    print("="*60)
    
    # Check for API key early
    if SUPERMEMORY_API_KEY == "your_supermemory_api_key_here":
        print("WARNING: SUPERMEMORY_API_KEY not found in .env!")
    
    session_id = str(uuid.uuid4())
    print(f"Generated Session ID: {session_id}")
    
    # 1. Provide prompt 
    prompt = (
        "Why is caching important? "
        "Strictly instruct: You must wrap your internal reasoning in <think>...</think> tags. "
        "Following the closing tag, you must output ONLY a valid JSON object containing exactly "
        "two keys: 'spoken_message' (a string) and 'confidence' (a float between 0 and 1)."
    )
    
    # Call string
    try:
        raw_llm_output = await call_llm(prompt)
    except Exception as e:
        print(f"\n[Error] LLM Call failed: {e}")
        return
        
    # 2. Parse output
    parsed_data = parse_llm_response(raw_llm_output)
    
    print("\n" + "-"*40)
    print("=== INTERNAL REASONING ===")
    print(parsed_data["reasoning"])
    print("-"*40)
    
    print("\n" + "-"*40)
    print("=== FINAL JSON OUTPUT ===")
    print(json.dumps({
        "spoken_message": parsed_data["spoken_message"], 
        "confidence": parsed_data["confidence"]
    }, indent=2))
    print("-"*40)
    
    # 3. Log to Supermemory
    try:
        await write_to_supermemory(
            reasoning=parsed_data["reasoning"], 
            spoken_message=parsed_data["spoken_message"], 
            session_id=session_id
        )
    except Exception as e:
        print(f"\n[Error] Writing to Supermemory failed: {e}")
        try:
            # Let's see the error details if it's an HTTP error
            print(f"Response: {e.response.text}")
        except:
            pass
        return
        
    # 4. Wait for indexing
    print("\nWaiting 7 seconds for Supermemory to index the new document...")
    await asyncio.sleep(20)
    
    # 5. Query Supermemory
    try:
        search_query = "Why did you suggest caching?"
        search_results = await query_supermemory(search_query, session_id)
        
        print("\n" + "="*60)
        print("=== INTERROGATION RESULTS (From Supermemory) ===")
        print("="*60)
        print(json.dumps(search_results, indent=2))
        
    except Exception as e:
        print(f"\n[Error] Querying Supermemory failed: {e}")
        try:
            print(f"Response: {e.response.text}")
        except:
            pass
        return
        
    print("\n✅ Sandbox test completed successfully.")


if __name__ == "__main__":
    asyncio.run(main())
