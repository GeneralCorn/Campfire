/**
 * Transcribe API route — proxy to OpenAI Whisper for voice input.
 * Accepts audio file upload, returns transcript text.
 *
 * Ported from backend/orchestrator.py /api/transcribe endpoint.
 */

import { NextRequest, NextResponse } from "next/server";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";

export async function POST(request: NextRequest) {
  if (!OPENAI_API_KEY) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY is not configured" },
      { status: 500 }
    );
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { error: "No audio file provided" },
        { status: 400 }
      );
    }

    // Forward to OpenAI Whisper API
    const whisperForm = new FormData();
    whisperForm.append("file", file, file.name || "audio.webm");
    whisperForm.append("model", "whisper-1");

    const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: whisperForm,
    });

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json(
        { error: `Transcription failed: ${text}` },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json({ transcript: data.text || "" });
  } catch (err) {
    return NextResponse.json(
      { error: `Transcription error: ${(err as Error).message}` },
      { status: 500 }
    );
  }
}
