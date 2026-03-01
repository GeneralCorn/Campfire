import requests
import json

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
    with requests.post(url, json=payload, stream=True) as response:
        print(f"Status Code: {response.status_code}")
        print(f"Headers: {response.headers}")
        print("Response Stream:")
        for line in response.iter_lines():
            if line:
                print(line.decode('utf-8'))
except Exception as e:
    print(f"Error: {e}")
