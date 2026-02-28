import os
import re
from dotenv import load_dotenv
from openai import OpenAI

load_dotenv(os.path.join(os.path.dirname(__file__), ".env.local"))

MODAL_URL = os.getenv("MODAL_URL", "https://saibilla21--agentfm-brain-serve-dev.modal.run")
MODEL_NAME = os.getenv("MODEL_NAME", "deepseek-ai/DeepSeek-R1-Distill-Qwen-7B")


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
    client = OpenAI(base_url=f"{MODAL_URL}/v1", api_key="unused")

    response = client.chat.completions.create(
        model=MODEL_NAME,
        messages=[
            {"role": "user", "content": prompt}
        ],
        temperature=0.7,
        max_tokens=2048,
    )

    raw_text = response.choices[0].message.content
    parsed = parse_deepseek_output(raw_text)

    print("\n" + "=" * 50)
    print("=== INTERNAL REASONING (Goes to Supermemory) ===")
    print("=" * 50)
    print(parsed["reasoning"])

    print("\n" + "=" * 50)
    print("=== SPOKEN MESSAGE (Goes to UI / ElevenLabs) ===")
    print("=" * 50)
    print(parsed["message"])

    return parsed


if __name__ == "__main__":
    run(
        "Explain the difference between a process and a thread. "
        "You must wrap your internal thought process in <think> tags before answering."
    )
