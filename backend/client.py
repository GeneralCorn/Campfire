import os
import re
import httpx
from dotenv import load_dotenv
from openai import OpenAI

load_dotenv(os.path.join(os.path.dirname(__file__), ".env.local"))

MODAL_URL = os.getenv("MODAL_URL", "")
MODAL_URL_FALLBACK = os.getenv("MODAL_URL_FALLBACK", "https://saibilla21--agentfm-brain-serve-dev.modal.run")
MODEL_NAME = os.getenv("MODEL_NAME", "deepseek-ai/DeepSeek-R1-Distill-Qwen-7B")
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")


def parse_deepseek_output(raw_text: str) -> dict:
    if '</think>' in raw_text:
        parts = raw_text.split('</think>')
        reasoning = parts[0].replace('<think>', '').strip()
        message = parts[1].strip()
    else:
        reasoning = "Internal reasoning skipped."
        message = raw_text.strip()

    return {
        "reasoning": reasoning,
        "message": message
    }


def run(prompt: str) -> dict:
    # Build list of Modal URLs to try
    modal_urls = []
    if MODAL_URL:
        modal_urls.append(MODAL_URL)
    if MODAL_URL_FALLBACK and MODAL_URL_FALLBACK != MODAL_URL:
        modal_urls.append(MODAL_URL_FALLBACK)

    # Try each Modal endpoint
    for base_url in modal_urls:
        try:
            client = OpenAI(base_url=f"{base_url}/v1", api_key="unused")
            response = client.chat.completions.create(
                model=MODEL_NAME,
                messages=[{"role": "user", "content": prompt}],
                temperature=0.7,
                max_tokens=2048,
            )
            raw_text = response.choices[0].message.content
            print(f"[LLM] Success via Modal: {base_url}")
            parsed = parse_deepseek_output(raw_text)
            _print_parsed(parsed)
            return parsed
        except Exception as e:
            print(f"[LLM] Modal failed ({base_url}): {e}")
            continue

    # Fallback: Anthropic API
    if ANTHROPIC_API_KEY:
        print("[LLM] Falling back to Anthropic API...")
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
                    "messages": [{"role": "user", "content": prompt}],
                },
                timeout=120.0,
            )
            resp.raise_for_status()
            raw_text = resp.json()["content"][0]["text"]
            print("[LLM] Success via Anthropic API")
            parsed = parse_deepseek_output(raw_text)
            _print_parsed(parsed)
            return parsed
        except Exception as e:
            print(f"[LLM] Anthropic API also failed: {e}")

    raise RuntimeError("All LLM backends failed (Modal + Anthropic)")


def _print_parsed(parsed: dict):
    print("\n" + "=" * 50)
    print("=== INTERNAL REASONING (Goes to Supermemory) ===")
    print("=" * 50)
    print(parsed["reasoning"])
    print("\n" + "=" * 50)
    print("=== SPOKEN MESSAGE (Goes to UI / ElevenLabs) ===")
    print("=" * 50)
    print(parsed["message"])


if __name__ == "__main__":
    run(
        "Explain the difference between a process and a thread. "
        "You must wrap your internal thought process in <think> tags before answering."
    )
