import { NextRequest } from "next/server";

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        console.log("[Proxy] Received ElevenLabs request", JSON.stringify(body, null, 2));

        const response = await fetch("https://saibilla21--medical-llm-inference-asgi-app.modal.run/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            console.error("[Proxy] Modal backend error:", response.status, response.statusText);
            return new Response(`Modal backend error: ${response.statusText}`, { status: response.status });
        }

        console.log("[Proxy] Modal backend streaming response...");

        // Return the readable stream directly to ElevenLabs
        return new Response(response.body, {
            headers: {
                "Content-Type": "text/event-stream",
                "Cache-Control": "no-cache",
                "Connection": "keep-alive"
            }
        });

    } catch (error) {
        console.error("[Proxy] Critical error inside proxy route:", error);
        return new Response("Internal Server Error", { status: 500 });
    }
}
