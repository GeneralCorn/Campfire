/**
 * Memories API route — fetch memories from Supermemory.
 */

import { NextRequest, NextResponse } from "next/server";

const SUPERMEMORY_API_KEY = process.env.SUPERMEMORY_API_KEY || "";

export async function GET(request: NextRequest) {
  const teammate = request.nextUrl.searchParams.get("teammate");

  if (!SUPERMEMORY_API_KEY) {
    return NextResponse.json({ memories: [], error: "No API key configured" });
  }

  try {
    // TODO: Implement Supermemory search via their REST API
    // For now, return empty — memories are tracked client-side during demo
    return NextResponse.json({ memories: [] });
  } catch {
    return NextResponse.json({ memories: [], error: "Failed to fetch" });
  }
}
