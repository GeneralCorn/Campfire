import { NextRequest, NextResponse } from "next/server";

const AGENT_IDS: Record<string, string | undefined> = {
  "medication-room": process.env.ELEVENLABS_AGENT_ID_MEDICATION,
  "recovery-room":   process.env.ELEVENLABS_AGENT_ID_RECOVERY,
  "emergency-room":  process.env.ELEVENLABS_AGENT_ID_EMERGENCY,
};

export async function POST(req: NextRequest) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "ELEVENLABS_API_KEY not configured" }, { status: 500 });
  }

  const { role } = await req.json().catch(() => ({ role: "" }));
  const agentId = AGENT_IDS[role];

  if (!agentId) {
    return NextResponse.json(
      { error: `No agent configured for role "${role}". Set ELEVENLABS_AGENT_ID_${role.replace("-room", "").toUpperCase()} in .env.local` },
      { status: 400 }
    );
  }

  const res = await fetch(
    `https://api.elevenlabs.io/v1/convai/conversation/get_signed_url?agent_id=${agentId}`,
    { headers: { "xi-api-key": apiKey } }
  );

  if (!res.ok) {
    const body = await res.text();
    return NextResponse.json({ error: `ElevenLabs error: ${body}` }, { status: res.status });
  }

  const { signed_url } = await res.json();
  return NextResponse.json({ signedUrl: signed_url });
}
