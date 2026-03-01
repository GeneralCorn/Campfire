"""Quick smoke-test for the Modal medication visualizer endpoint.

Usage:
  python test_visualizer.py

Saves the generated image to test_schedule.png so you can inspect it visually.
"""
import requests
import base64
import json

# ── Config ────────────────────────────────────────────────────────────────────
# Paste your Modal URL here or read from .env
import os
from dotenv import load_dotenv
load_dotenv()

URL = os.getenv("MODAL_VISUALIZER_URL", "").rstrip("/") + "/visualize"

# Same medications as the mock discharge data
MEDICATIONS = [
    {
        "name": "Oxycodone",
        "dosage": "5mg",
        "frequency": "Every 4-6 hours as needed for severe pain",
        "instructions": "Take with food to prevent nausea. Do not drive while taking.",
    },
    {
        "name": "Ibuprofen",
        "dosage": "600mg",
        "frequency": "Every 8 hours",
        "instructions": "Take scheduled around the clock for the first 3 days.",
    },
]

# ── Call ──────────────────────────────────────────────────────────────────────
print(f"POST {URL}")
print(f"Payload: {len(MEDICATIONS)} medications\n")

try:
    resp = requests.post(URL, json={"medications": MEDICATIONS, "patient_name": "Test Patient"}, timeout=60)
    resp.raise_for_status()
    data = resp.json()
except Exception as e:
    print(f"❌ Request failed: {e}")
    raise SystemExit(1)

# ── Inspect response ──────────────────────────────────────────────────────────
print("✅ Status:", resp.status_code)
print(f"   medication_count: {data.get('medication_count')}")
print(f"   image_base64 length: {len(data.get('image_base64', ''))} chars")
print(f"   schedule slots: {[s['slot_id'] for s in data.get('schedule', [])]}")

print("\nSchedule breakdown:")
for slot in data.get("schedule", []):
    meds = [m["name"] for m in slot["medications"]]
    print(f"  {slot['label']:12s} ({slot['hours']:10s})  →  {', '.join(meds)}")

# ── Save image ────────────────────────────────────────────────────────────────
img_b64 = data.get("image_base64", "")
if img_b64:
    with open("test_schedule.png", "wb") as f:
        f.write(base64.b64decode(img_b64))
    print("\n📸 Saved image → test_schedule.png")
else:
    print("\n⚠  No image data in response")
