"use client";

import dynamic from "next/dynamic";

const LivePTCamera = dynamic(() => import("@/components/LivePTCamera"), {
    ssr: false,
    loading: () => (
        <div className="flex h-[480px] w-[640px] items-center justify-center rounded-2xl border border-white/10 bg-black">
            <p className="animate-pulse text-sm text-neutral-500">Loading camera…</p>
        </div>
    ),
});

export default function PTTestPage() {
    return (
        <div className="flex min-h-screen items-center justify-center bg-neutral-950">
            <div className="flex flex-col items-center gap-6">
                <h1 className="text-2xl font-bold tracking-tight text-white">
                    PT Camera Test
                </h1>
                <LivePTCamera
                    onBreach={(angle) => console.log(`⚠️ Breach detected: ${angle}°`)}
                />
                <p className="max-w-md text-center text-sm text-neutral-500">
                    Hold your right arm in front of the camera. Flex your wrist below 140° to trigger a breach.
                </p>
            </div>
        </div>
    );
}
