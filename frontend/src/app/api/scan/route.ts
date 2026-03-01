import { NextRequest, NextResponse } from "next/server";

const VLM_URL =
  "https://saibilla21--carelounge-vlm-parser-parse-discharge.modal.run";

export async function POST(req: NextRequest) {
  const body = await req.json();
  // body: { pages: [base64_string] }

  const res = await fetch(VLM_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    return NextResponse.json(
      { error: `VLM error ${res.status}: ${text}` },
      { status: res.status },
    );
  }

  const data = await res.json();
  return NextResponse.json(data);
}
