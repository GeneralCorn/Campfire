"""modal_app/medication_visualizer.py — Medication Schedule Visual Generator

Spins up a CPU-only Modal sandbox that:
  1. Renders a beautiful dark-themed medication schedule PNG using Pillow
  2. Returns structured JSON (schedule slots) for interactive frontend rendering

The medication_agent in backend/main.py calls this as a tool in parallel with
the LLM inference, so no latency is added to the voice response.
"""
from __future__ import annotations

import io
import base64
import modal

app = modal.App("medication-visualizer")

image = (
    modal.Image.debian_slim()
    .apt_install(["fonts-dejavu-core"])
    .pip_install(["Pillow", "fastapi[standard]", "uvicorn"])
)

# ── Palette ───────────────────────────────────────────────────────────────────

MED_COLORS: list[tuple[int, int, int]] = [
    (20, 184, 166),   # teal
    (139, 92, 246),   # violet
    (245, 158, 11),   # amber
    (16, 185, 129),   # emerald
    (239, 68, 68),    # rose
    (59, 130, 246),   # blue
]

TIME_SLOTS: list[dict] = [
    {"id": "morning",   "label": "Morning",   "hours": "6 – 11 AM", "rgb": (20, 184, 166)},
    {"id": "afternoon", "label": "Afternoon", "hours": "12 – 5 PM", "rgb": (245, 158, 11)},
    {"id": "evening",   "label": "Evening",   "hours": "6 – 9 PM",  "rgb": (139, 92, 246)},
    {"id": "night",     "label": "Night",     "hours": "10 PM+",    "rgb": (59, 130, 246)},
]


# ── Helpers ───────────────────────────────────────────────────────────────────

def _parse_slots(frequency: str) -> list[str]:
    """Map a frequency string to time-of-day slot IDs."""
    f = frequency.lower()
    if any(x in f for x in ["every 4", "every 3", "4-6 hour", "q4h", "q6h"]):
        return ["morning", "afternoon", "evening", "night"]
    if any(x in f for x in ["every 8", "q8h", "three times", "tid"]):
        return ["morning", "afternoon", "evening"]
    if any(x in f for x in ["every 12", "twice", "bid", "two times"]):
        return ["morning", "evening"]
    if any(x in f for x in ["bedtime", "at night", "qhs", "nightly"]):
        return ["night"]
    if "morning" in f:
        return ["morning"]
    if any(x in f for x in ["once", "daily", "qd", "every 24"]):
        return ["morning"]
    if any(x in f for x in ["with meal", "with food", "with each meal"]):
        return ["morning", "afternoon", "evening"]
    return ["morning"]


def _rr(draw, xy: tuple, r: int = 6, fill=None, outline=None, width: int = 1):
    """Draw a rounded rectangle (Pillow >= 8.2 has draw.rounded_rectangle)."""
    x0, y0, x1, y1 = xy
    try:
        draw.rounded_rectangle([x0, y0, x1, y1], radius=r, fill=fill, outline=outline, width=width)
    except AttributeError:
        # Fallback for older Pillow
        draw.rectangle([x0, y0, x1, y1], fill=fill, outline=outline, width=width)


def _generate(medications: list, patient_name: str = "") -> dict:
    """Core rendering — runs inside the Modal container."""
    from PIL import Image, ImageDraw, ImageFont
    import os

    W, H = 960, 540
    PAD = 28
    GAP = 10

    img = Image.new("RGB", (W, H), (8, 8, 14))
    draw = ImageDraw.Draw(img, "RGBA")

    # ── Background gradient ────────────────────────────────────────────────────
    for y in range(H):
        t = y / H
        r = int(8 + t * 5)
        g = int(8 + t * 4)
        b = int(14 + t * 20)
        draw.line([(0, y), (W, y)], fill=(r, g, b))

    # Subtle dot grid
    for gx in range(0, W, 48):
        for gy in range(0, H, 48):
            draw.ellipse([(gx - 1, gy - 1), (gx + 1, gy + 1)], fill=(255, 255, 255, 8))

    # Top accent bar with glow fade
    for i in range(5):
        alpha = max(0, 255 - i * 55)
        draw.line([(0, i), (W, i)], fill=(20, 184, 166, alpha))

    # ── Fonts ─────────────────────────────────────────────────────────────────
    BOLD_CANDIDATES = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
        "/usr/share/fonts/truetype/freefont/FreeSansBold.ttf",
    ]
    REG_CANDIDATES = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
        "/usr/share/fonts/truetype/freefont/FreeSans.ttf",
    ]
    bold_path = next((p for p in BOLD_CANDIDATES if os.path.exists(p)), None)
    reg_path  = next((p for p in REG_CANDIDATES  if os.path.exists(p)), None)

    def _font(path, size):
        try:
            return ImageFont.truetype(path, size) if path else ImageFont.load_default()
        except Exception:
            return ImageFont.load_default()

    f_title = _font(bold_path, 20)
    f_col   = _font(bold_path, 15)
    f_med   = _font(bold_path, 13)
    f_sub   = _font(reg_path,  12)
    f_small = _font(reg_path,  10)

    # ── Header ────────────────────────────────────────────────────────────────
    draw.text((PAD, 16), "MEDICATION SCHEDULE", fill=(20, 184, 166), font=f_title)
    sub = f"Patient: {patient_name}  ·  " if patient_name else ""
    draw.text((PAD, 42), f"{sub}AI-generated visual guide", fill=(82, 82, 91), font=f_small)

    # Decorative pill shape (top-right)
    px, py = W - 72, 18
    _rr(draw, (px, py, px + 48, py + 22), r=11, fill=(20, 184, 166, 22))
    draw.line([(px + 24, py + 3), (px + 24, py + 19)], fill=(20, 184, 166, 90), width=1)
    draw.ellipse([(px, py, px + 48, py + 22)], outline=(20, 184, 166, 70), width=1)

    # ── Assign medications to slots ────────────────────────────────────────────
    slot_meds: dict[str, list] = {s["id"]: [] for s in TIME_SLOTS}
    for i, med in enumerate(medications):
        for sid in _parse_slots(med.get("frequency", "")):
            slot_meds[sid].append((i, med))

    # ── Column layout ──────────────────────────────────────────────────────────
    n_cols  = len(TIME_SLOTS)
    col_w   = (W - 2 * PAD - GAP * (n_cols - 1)) // n_cols
    hdr_y   = 74
    card_y0 = 136

    for ci, slot in enumerate(TIME_SLOTS):
        x = PAD + ci * (col_w + GAP)
        sr, sg, sb = slot["rgb"]

        # Column header card
        _rr(draw, (x, hdr_y, x + col_w, hdr_y + 52), r=8,
            fill=(max(0, sr // 9), max(0, sg // 9), max(0, sb // 9)))
        # Colored top stripe
        _rr(draw, (x, hdr_y, x + col_w, hdr_y + 4), r=4, fill=(sr, sg, sb))

        draw.text((x + 10, hdr_y + 8),  slot["label"], fill=(sr, sg, sb), font=f_col)
        draw.text((x + 10, hdr_y + 30), slot["hours"],  fill=(110, 110, 122), font=f_small)

        # Medication cards
        cy = card_y0
        meds = slot_meds[slot["id"]]

        if not meds:
            draw.text((x + 10, cy + 12), "— None scheduled", fill=(63, 63, 70), font=f_small)
            continue

        for med_i, med in meds:
            mr, mg, mb = MED_COLORS[med_i % len(MED_COLORS)]
            ch = 86

            # Card shadow
            _rr(draw, (x + 2, cy + 3, x + col_w + 2, cy + ch + 3), r=7,
                fill=(0, 0, 0, 70))
            # Card body
            _rr(draw, (x, cy, x + col_w, cy + ch), r=7,
                fill=(max(0, mr // 14), max(0, mg // 14), max(0, mb // 14)))
            # Left accent bar
            draw.rectangle([(x, cy + 8), (x + 3, cy + ch - 8)], fill=(mr, mg, mb))

            # Pill icon (top-right of card)
            icx, icy = x + col_w - 22, cy + 16
            draw.ellipse([(icx - 10, icy - 8), (icx + 10, icy + 8)],
                         outline=(mr, mg, mb, 100), width=1)
            draw.line([(icx - 10, icy), (icx + 10, icy)], fill=(mr, mg, mb, 100), width=1)

            # Med name
            name = med.get("name", "Unknown")
            if len(name) > 17:
                name = name[:16] + "…"
            draw.text((x + 10, cy + 7),  name,               fill=(228, 228, 231), font=f_med)

            # Dosage
            dosage = med.get("dosage", "")
            draw.text((x + 10, cy + 27), dosage,             fill=(mr, mg, mb),    font=f_sub)

            # Instructions (truncated)
            instr = med.get("instructions", "")
            max_ch = max(22, (col_w - 22) // 6)
            if len(instr) > max_ch:
                instr = instr[:max_ch - 1] + "…"
            draw.text((x + 10, cy + 47), instr,             fill=(110, 110, 122),  font=f_small)

            # Frequency hint
            freq = med.get("frequency", "")
            if len(freq) > max_ch:
                freq = freq[:max_ch - 1] + "…"
            draw.text((x + 10, cy + 63), freq,              fill=(63, 63, 70),     font=f_small)

            cy += ch + 8

    # ── Footer bar ─────────────────────────────────────────────────────────────
    fy = H - 28
    draw.rectangle([(0, fy), (W, H)], fill=(5, 5, 10))
    draw.line([(0, fy), (W, fy)], fill=(39, 39, 42), width=1)
    draw.text(
        (PAD, fy + 8),
        "Generated by Medication Agent  ·  Campfire Care Copilot  ·  Always follow your doctor's instructions",
        fill=(55, 55, 62),
        font=f_small,
    )

    # ── Encode ────────────────────────────────────────────────────────────────
    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    buf.seek(0)
    img_b64 = base64.b64encode(buf.read()).decode("utf-8")

    # ── Build structured schedule for frontend interactivity ──────────────────
    schedule = []
    for slot in TIME_SLOTS:
        meds = slot_meds[slot["id"]]
        if meds:
            schedule.append({
                "slot_id": slot["id"],
                "label":   slot["label"],
                "hours":   slot["hours"],
                "color":   "#{:02x}{:02x}{:02x}".format(*slot["rgb"]),
                "medications": [
                    {
                        "name":         med.get("name"),
                        "dosage":       med.get("dosage"),
                        "frequency":    med.get("frequency"),
                        "instructions": med.get("instructions"),
                        "color":        "#{:02x}{:02x}{:02x}".format(*MED_COLORS[i % len(MED_COLORS)]),
                    }
                    for i, med in meds
                ],
            })

    return {
        "image_base64":     img_b64,
        "schedule":         schedule,
        "medication_count": len(medications),
    }


# ── Modal ASGI endpoint ───────────────────────────────────────────────────────

@app.function(image=image, gpu=None, keep_warm=0, timeout=60)
@modal.asgi_app()
def asgi_app():
    from fastapi import FastAPI
    from pydantic import BaseModel

    api = FastAPI(title="Medication Visualizer")

    class VisualRequest(BaseModel):
        medications: list
        patient_name: str = ""

    @api.post("/visualize")
    async def visualize(req: VisualRequest) -> dict:
        return _generate(req.medications, req.patient_name)

    @api.get("/health")
    async def health():
        return {"status": "ok"}

    return api
