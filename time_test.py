import requests
import json
import time

url = "https://saibilla21--medical-llm-inference-asgi-app.modal.run/v1/chat/completions"

payload = {
    "model": "mistral-medical",
    "messages": [
        {"role": "system", "content": "You are a helpful assistant."},
        {"role": "user", "content": "What is ibuprofen?"}
    ],
    "stream": True
}

print(f"POSTing to {url}...")
try:
    start_time = time.time()
    with requests.post(url, json=payload, stream=True) as response:
        print(f"Status Code: {response.status_code}")
        
        for line in response.iter_lines():
            if line:
                first_token_time = time.time()
                print(f"Time to first token: {first_token_time - start_time:.2f} seconds")
                break
except Exception as e:
    print(f"Error: {e}")
