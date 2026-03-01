"""backend/tts.py — ElevenLabs text-to-speech integration for agent audio responses."""

import os
import base64
from elevenlabs.client import ElevenLabs

_client = ElevenLabs(api_key=os.environ.get("ELEVENLABS_API_KEY"))

# ElevenLabs preset voice IDs
_RACHEL = "21m00Tcm4TlvDq8ikWAM"  # Rachel
_DREW   = "29vD33N1CtxCmqQRPOHJ"  # Drew
_FIN    = "D38z5RcWu1voky8WS1ja"  # Fin

VOICE_MAP = {
    "medication":  _RACHEL,
    "medications": _RACHEL,
    "recovery":    _DREW,
    "emergency":   _FIN,
    "confer":      _RACHEL,
}


def generate_agent_audio(text: str, agent_route: str) -> str | None:
    """Generate TTS audio via ElevenLabs and return base64-encoded MP3 string."""
    try:
        voice_name = VOICE_MAP.get(agent_route, "Rachel")
        audio_iterator = _client.text_to_speech.convert(
            text=text,
            voice_id=voice_name,
            model_id="eleven_turbo_v2",
        )
        # Consume the iterator into bytes
        audio_bytes = b"".join(audio_iterator)
        return base64.b64encode(audio_bytes).decode("utf-8")
    except Exception as e:
        print(f"[TTS] ElevenLabs error for route '{agent_route}': {e}")
        return None
