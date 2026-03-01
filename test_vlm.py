import base64
import httpx
import sys
import asyncio

MODAL_VLM_URL = "https://saibilla21--carelounge-vlm-parser-parse-discharge.modal.run"

async def test_vlm(image_path: str):
    print(f"Reading file from {image_path}...")
    
    try:
        with open(image_path, "rb") as f:
            encoded_bytes = base64.b64encode(f.read()).decode("utf-8")
            
        if image_path.lower().endswith('.pdf'):
            payload = {
                "document": encoded_bytes,
                "doc_type": "application/pdf"
            }
        else:
            payload = {
                "pages": [encoded_bytes]
            }
    except Exception as e:
        print(f"Error reading file: {e}")
        return

    print(f"Sending request to {MODAL_VLM_URL}...")
    
    async with httpx.AsyncClient(timeout=120.0) as client:
        try:
            response = await client.post(MODAL_VLM_URL, json=payload)
            response.raise_for_status()
            
            print("\n✅ Success! Response:")
            import json
            print(json.dumps(response.json(), indent=2))
        except httpx.HTTPError as e:
            print(f"\n❌ HTTP Error: {e}")
            if hasattr(e, 'response') and e.response is not None:
                print(e.response.text)
        except Exception as e:
            print(f"\n❌ Error: {e}")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python test_vlm.py <path_to_image_or_pdf>")
        sys.exit(1)
        
    asyncio.run(test_vlm(sys.argv[1]))
