import asyncio
import httpx
import os
import uuid
from dotenv import load_dotenv

load_dotenv()
SUPERMEMORY_API_KEY = os.getenv("SUPERMEMORY_API_KEY")

async def test():
    session_id = str(uuid.uuid4())
    print(f"Session: {session_id}")
    
    # Write
    write_url = "https://api.supermemory.ai/v3/documents"
    write_payload = {
        "content": "AGENT: SCOUT\nREASONING: thought\nSPOKEN MESSAGE: hello",
        "containerTags": [f"{session_id}"],
        "metadata": {"agent_id": "scout", "turn_number": 1}
    }
    async with httpx.AsyncClient() as client:
        r = await client.post(write_url, headers={"Authorization": f"Bearer {SUPERMEMORY_API_KEY}"}, json=write_payload)
        print("Write status:", r.status_code)
    
    await asyncio.sleep(6)
    
    # Search WITHOUT limit and rerank
    search_url = "https://api.supermemory.ai/v4/search"
    search_payload = {
        "q": "hello",
        "containerTags": [f"{session_id}"],
        "filters": {"AND": [{"key": "agent_id", "value": "scout"}]},
    }
    async with httpx.AsyncClient() as client:
        r = await client.post(search_url, headers={"Authorization": f"Bearer {SUPERMEMORY_API_KEY}"}, json=search_payload)
        print("Search status:", r.status_code)
        if r.status_code != 200:
            print(r.text)
        else:
            print(r.json())

if __name__ == "__main__":
    asyncio.run(test())
