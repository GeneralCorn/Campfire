"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";
import Webcam from "react-webcam";

/* ─── Constants ───────────────────────────────────────────────────────────── */
const VIDEO_W = 640;
const VIDEO_H = 480;

const CYAN = "#00FFFF";
const RED = "#FF4444";
const GLOW_BLUR = 12;
const LINE_WIDTH = 3;
const DOT_RADIUS = 5;

// Right-arm landmark indices
const RIGHT_SHOULDER = 12;
const RIGHT_ELBOW = 14;
const RIGHT_WRIST = 16;
const RIGHT_INDEX = 20;

// Landmarks to draw (shoulder → elbow → wrist → index finger)
const ARM_CHAIN = [RIGHT_SHOULDER, RIGHT_ELBOW, RIGHT_WRIST, RIGHT_INDEX];

const BREACH_COOLDOWN_MS = 3000;

/* ─── CDN loader ──────────────────────────────────────────────────────────── */
function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(s);
  });
}

/* ─── Math ────────────────────────────────────────────────────────────────── */
const calculateAngle = (a: any, b: any, c: any): number => {
  const radians =
    Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x);
  let angle = Math.abs((radians * 180.0) / Math.PI);
  if (angle > 180.0) angle = 360 - angle;
  return Math.round(angle);
};

/* ─── Props ───────────────────────────────────────────────────────────────── */
interface LivePTCameraProps {
  minAngle?: number;
  onBreach?: (angle: number) => void;
}

/* ─── Component ───────────────────────────────────────────────────────────── */
const LivePTCamera: React.FC<LivePTCameraProps> = ({
  minAngle = 140,
  onBreach,
}) => {
  const webcamRef = useRef<Webcam>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lastBreachRef = useRef<number>(0);

  const [angle, setAngle] = useState<number | null>(null);
  const [isBreach, setIsBreach] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  /* ── Drawing helpers ───────────────────────────────────────────────────── */
  const drawSegment = useCallback(
    (ctx: CanvasRenderingContext2D, a: any, b: any, color: string) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = LINE_WIDTH;
      ctx.shadowColor = color;
      ctx.shadowBlur = GLOW_BLUR;
      ctx.beginPath();
      ctx.moveTo(a.x * VIDEO_W, a.y * VIDEO_H);
      ctx.lineTo(b.x * VIDEO_W, b.y * VIDEO_H);
      ctx.stroke();
      ctx.shadowBlur = 0;
    },
    []
  );

  const drawDot = useCallback(
    (ctx: CanvasRenderingContext2D, lm: any, color: string) => {
      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = GLOW_BLUR;
      ctx.beginPath();
      ctx.arc(lm.x * VIDEO_W, lm.y * VIDEO_H, DOT_RADIUS, 0, 2 * Math.PI);
      ctx.fill();
      ctx.shadowBlur = 0;
    },
    []
  );

  /* ── MediaPipe initialization via CDN ──────────────────────────────────── */
  useEffect(() => {
    let cancelled = false;
    let cameraInstance: any = null;

    async function init() {
      // Load MediaPipe scripts from CDN
      await loadScript(
        "https://cdn.jsdelivr.net/npm/@mediapipe/pose/pose.js"
      );
      await loadScript(
        "https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js"
      );

      if (cancelled) return;

      const win = window as any;

      const pose = new win.Pose({
        locateFile: (file: string) =>
          `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`,
      });

      pose.setOptions({
        modelComplexity: 1,
        smoothLandmarks: true,
        enableSegmentation: false,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });

      pose.onResults((results: any) => {
        if (cancelled) return;

        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        ctx.clearRect(0, 0, VIDEO_W, VIDEO_H);

        const lms = results.poseLandmarks;
        if (!lms) return;

        // Verify all required landmarks are visible
        const armLandmarks = ARM_CHAIN.map((i) => lms[i]);
        const allVisible = armLandmarks.every(
          (lm: any) => lm && (lm.visibility ?? 0) > 0.5
        );

        if (!allVisible) {
          setAngle(null);
          setIsBreach(false);
          return;
        }

        // Draw the right arm chain
        for (let i = 0; i < ARM_CHAIN.length - 1; i++) {
          drawSegment(ctx, lms[ARM_CHAIN[i]], lms[ARM_CHAIN[i + 1]], CYAN);
        }
        for (const idx of ARM_CHAIN) {
          drawDot(ctx, lms[idx], CYAN);
        }

        // Calculate wrist flexion angle: elbow → wrist → index
        const elbow = lms[RIGHT_ELBOW];
        const wrist = lms[RIGHT_WRIST];
        const index = lms[RIGHT_INDEX];
        const currentAngle = calculateAngle(elbow, wrist, index);
        setAngle(currentAngle);

        // Breach detection with throttle
        if (currentAngle < minAngle) {
          setIsBreach(true);

          // Redraw arm in red when breaching
          for (let i = 0; i < ARM_CHAIN.length - 1; i++) {
            drawSegment(ctx, lms[ARM_CHAIN[i]], lms[ARM_CHAIN[i + 1]], RED);
          }
          for (const idx of ARM_CHAIN) {
            drawDot(ctx, lms[idx], RED);
          }

          const now = Date.now();
          if (onBreach && now - lastBreachRef.current >= BREACH_COOLDOWN_MS) {
            lastBreachRef.current = now;
            onBreach(currentAngle);
          }
        } else {
          setIsBreach(false);
        }
      });

      // Wait for webcam to be ready
      const video = webcamRef.current?.video;
      if (!video || cancelled) return;

      await new Promise<void>((resolve) => {
        if (video.readyState >= 2) {
          resolve();
        } else {
          video.onloadeddata = () => resolve();
        }
      });

      if (cancelled) return;
      setIsLoading(false);

      cameraInstance = new win.Camera(video, {
        onFrame: async () => {
          if (!cancelled) await pose.send({ image: video });
        },
        width: VIDEO_W,
        height: VIDEO_H,
      });
      cameraInstance.start();
    }

    init();

    return () => {
      cancelled = true;
      cameraInstance?.stop();
    };
  }, [minAngle, onBreach, drawSegment, drawDot]);

  /* ── Render ─────────────────────────────────────────────────────────────── */
  return (
    <div
      className="relative overflow-hidden rounded-2xl border border-white/10 bg-black shadow-2xl"
      style={{ width: VIDEO_W, height: VIDEO_H }}
    >
      {/* Webcam feed */}
      <Webcam
        ref={webcamRef}
        audio={false}
        width={VIDEO_W}
        height={VIDEO_H}
        screenshotFormat="image/jpeg"
        videoConstraints={{
          width: VIDEO_W,
          height: VIDEO_H,
          facingMode: "user",
        }}
        className="absolute inset-0 h-full w-full object-cover"
        mirrored
      />

      {/* Pose overlay canvas */}
      <canvas
        ref={canvasRef}
        width={VIDEO_W}
        height={VIDEO_H}
        className="absolute inset-0 h-full w-full"
        style={{ transform: "scaleX(-1)" }}
      />

      {/* Loading state */}
      {isLoading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/80">
          <p className="animate-pulse text-sm text-neutral-400">
            Loading pose model…
          </p>
        </div>
      )}

      {/* Angle HUD */}
      <div
        className={`absolute top-4 right-4 z-20 rounded-lg px-4 py-2 font-mono text-sm tracking-widest backdrop-blur-md transition-colors duration-200 ${isBreach
            ? "border border-red-500/40 bg-red-950/60 text-red-500"
            : "border border-cyan-500/20 bg-black/60 text-cyan-400"
          }`}
      >
        {angle !== null ? (
          <>
            <span className="text-[10px] uppercase opacity-60">Angle</span>
            <br />
            <span className="text-xl font-bold">{angle}°</span>
          </>
        ) : (
          <span className="text-xs opacity-50">Detecting…</span>
        )}
      </div>

      {/* Breach warning banner */}
      {isBreach && (
        <div className="absolute bottom-4 left-1/2 z-20 -translate-x-1/2 animate-pulse rounded-full border border-red-500/40 bg-red-950/70 px-6 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-red-400 backdrop-blur-md">
          ⚠ Flexion Breach
        </div>
      )}
    </div>
  );
};

export default LivePTCamera;
