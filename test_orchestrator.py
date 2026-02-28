import asyncio
import json
import websockets

async def test_orchestrator():
    uri = "ws://localhost:8001/ws/debate"
    print(f"Connecting to {uri}...")
    
    try:
        async with websockets.connect(uri) as websocket:
            print("Connected! Sending topic...")
            
            # Send the topic
            await websocket.send(json.dumps({
                "topic": "Should we aggressively expand into the European market this quarter?"
            }))
            
            # Listen to messages
            while True:
                response = await websocket.recv()
                data = json.loads(response)
                
                msg_type = data.get("type")
                
                if msg_type == "system":
                    print(f"\n[SYSTEM] {data.get('message')}")
                    if data.get('message') == "Debate concluded.":
                        break
                        
                elif msg_type == "agent_thinking":
                    print(f"\n[{data.get('agent_id').upper()}] is thinking (Turn {data.get('turn')})...")
                    
                elif msg_type == "agent_metadata":
                    print(f"\n[{data.get('agent_id').upper()}] READY TO SPEAK!")
                    print(f"  Confidence: {data.get('confidence')}")
                    print(f"  Sentiment:  {data.get('sentiment')}")
                    print(f"  Message:    {data.get('spoken_message')}")
                    print(f"  (Audio stream incoming...)")
                    
                elif msg_type == "audio_chunk":
                    # We just print a dot for every chunk of audio we receive
                    print(".", end="", flush=True)
                    
                elif msg_type == "error":
                    print(f"\n[ERROR] {data.get('message')}")
                    break
                    
                else:
                    print(f"\n[UNKNOWN MESSAGE] {data}")

    except websockets.exceptions.ConnectionClosed:
        print("\nConnection closed by server.")
    except Exception as e:
        print(f"\nConnection failed: {e}")

if __name__ == "__main__":
    asyncio.run(test_orchestrator())
