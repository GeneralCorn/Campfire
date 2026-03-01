"use client";

/**
 * VoiceAvatar — animated speaking avatar for voice call sessions.
 * Shows pulsing waveform rings and a status label.
 */

interface Props {
    /** Label text (agent name) */
    label: string;
    /** Single initial letter shown inside the core circle */
    initial: string;
    /** Accent color for this room (hex) */
    color: string;
    /** Whether the agent is currently speaking */
    isSpeaking: boolean;
    /** Whether the session is connecting */
    isConnecting: boolean;
    /** Whether the session is connected (listening) */
    isConnected: boolean;
}

export function VoiceAvatar({ label, initial, color, isSpeaking, isConnecting, isConnected }: Props) {
    const ringCount = 3;

    const status = isConnecting
        ? "Connecting…"
        : isSpeaking
            ? "Speaking"
            : isConnected
                ? "Listening"
                : "Idle";

    const statusColor = isConnecting
        ? "#818cf8"
        : isSpeaking
            ? "#22c55e"
            : isConnected
                ? "#60a5fa"
                : "#52525b";

    return (
        <div className="flex flex-col items-center gap-4 py-6 select-none">
            {/* Rings + core */}
            <div className="relative flex items-center justify-center" style={{ width: 140, height: 140 }}>
                {/* Expanding ring layers — only render when active */}
                {(isConnected || isConnecting) &&
                    Array.from({ length: ringCount }).map((_, i) => (
                        <span
                            key={i}
                            className="absolute rounded-full"
                            style={{
                                width: "100%",
                                height: "100%",
                                border: `1px solid ${color}`,
                                opacity: 0,
                                animation: `va-ring-expand 2.4s ease-out infinite`,
                                animationDelay: `${i * 0.8}s`,
                            }}
                        />
                    ))}

                {/* Core circle */}
                <div
                    className="relative z-10 flex items-center justify-center rounded-full transition-all duration-500"
                    style={{
                        width: 84,
                        height: 84,
                        background: isConnected
                            ? `radial-gradient(circle at 35% 35%, ${color}22, ${color}08)`
                            : "rgba(255,255,255,0.03)",
                        border: `1.5px solid ${isConnected ? color + "40" : "rgba(255,255,255,0.08)"}`,
                        boxShadow: isConnected
                            ? `0 0 0 4px ${color}10, 0 0 32px ${color}12`
                            : "none",
                    }}
                >
                    {/* Speaking waveform bars */}
                    {isSpeaking ? (
                        <div className="flex items-end gap-[3px] h-6">
                            {[0.6, 1, 0.7, 1, 0.5].map((h, i) => (
                                <div
                                    key={i}
                                    className="w-[3px] rounded-full"
                                    style={{
                                        height: `${h * 100}%`,
                                        backgroundColor: color,
                                        animation: "va-bar 0.6s ease-in-out infinite alternate",
                                        animationDelay: `${i * 0.1}s`,
                                    }}
                                />
                            ))}
                        </div>
                    ) : (
                        <span
                            className="font-semibold text-2xl leading-none"
                            style={{ color: isConnected ? color : "#52525b" }}
                        >
                            {initial}
                        </span>
                    )}
                </div>
            </div>

            {/* Label & status */}
            <div className="text-center">
                <p className="text-[15px] font-semibold text-[#f0f9ff] tracking-tight leading-tight">
                    {label}
                </p>
                <div className="flex items-center justify-center gap-1.5 mt-1.5">
                    <span
                        className="w-1.5 h-1.5 rounded-full"
                        style={{
                            backgroundColor: statusColor,
                            boxShadow: isConnected ? `0 0 6px ${statusColor}` : "none",
                        }}
                    />
                    <span className="text-[11px] font-medium" style={{ color: statusColor }}>
                        {status}
                    </span>
                </div>
            </div>

            <style jsx>{`
        @keyframes va-ring-expand {
          0%   { transform: scale(0.6); opacity: 0.7; }
          100% { transform: scale(1.6); opacity: 0;   }
        }
        @keyframes va-bar {
          from { transform: scaleY(0.3); }
          to   { transform: scaleY(1);   }
        }
      `}</style>
        </div>
    );
}
