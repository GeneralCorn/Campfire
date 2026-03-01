"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";
import Webcam from "react-webcam";

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  CONSTANTS                                                                */
/* ═══════════════════════════════════════════════════════════════════════════ */

const VIDEO_W = 640;
const VIDEO_H = 480;

const CYAN = "#00FFFF";
const GREEN = "#00FF88";
const YELLOW = "#FFD600";
const RED = "#FF4444";
const GLOW_BLUR = 10;
const LINE_WIDTH = 2.5;
const DOT_RADIUS = 4;

const BREACH_COOLDOWN_MS = 4000;

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  MEDIAPIPE POSE LANDMARKS (0–32)                                          */
/* ═══════════════════════════════════════════════════════════════════════════ */

const LEFT_SHOULDER = 11; const RIGHT_SHOULDER = 12;
const LEFT_HIP = 23; const RIGHT_HIP = 24;
const LEFT_ELBOW = 13; const RIGHT_ELBOW = 14;
const LEFT_WRIST = 15; const RIGHT_WRIST = 16;
const LEFT_INDEX = 19; const RIGHT_INDEX = 20;
const LEFT_PINKY = 17; const RIGHT_PINKY = 18;
const LEFT_THUMB = 21; const RIGHT_THUMB = 22;
const LEFT_KNEE = 25; const RIGHT_KNEE = 26;
const LEFT_ANKLE = 27; const RIGHT_ANKLE = 28;
const LEFT_HEEL = 29; const RIGHT_HEEL = 30;
const LEFT_FOOT = 31; const RIGHT_FOOT = 32;

/* ── Skeleton connections ──────────────────────────────────────────────── */
const SKELETON_CONNECTIONS: [number, number][] = [
  [LEFT_SHOULDER, RIGHT_SHOULDER],
  [LEFT_SHOULDER, LEFT_HIP],
  [RIGHT_SHOULDER, RIGHT_HIP],
  [LEFT_HIP, RIGHT_HIP],
  [LEFT_SHOULDER, LEFT_ELBOW],
  [LEFT_ELBOW, LEFT_WRIST],
  [LEFT_WRIST, LEFT_INDEX],
  [LEFT_WRIST, LEFT_PINKY],
  [LEFT_WRIST, LEFT_THUMB],
  [RIGHT_SHOULDER, RIGHT_ELBOW],
  [RIGHT_ELBOW, RIGHT_WRIST],
  [RIGHT_WRIST, RIGHT_INDEX],
  [RIGHT_WRIST, RIGHT_PINKY],
  [RIGHT_WRIST, RIGHT_THUMB],
  [LEFT_HIP, LEFT_KNEE],
  [LEFT_KNEE, LEFT_ANKLE],
  [LEFT_ANKLE, LEFT_HEEL],
  [LEFT_ANKLE, LEFT_FOOT],
  [RIGHT_HIP, RIGHT_KNEE],
  [RIGHT_KNEE, RIGHT_ANKLE],
  [RIGHT_ANKLE, RIGHT_HEEL],
  [RIGHT_ANKLE, RIGHT_FOOT],
];

/* ── Medical terminology labels ────────────────────────────────────────── */
interface MedLabel {
  idx: number;
  label: string;
  medical: string;
  offsetX?: number;
  offsetY?: number;
}

const MEDICAL_LABELS: MedLabel[] = [
  { idx: RIGHT_SHOULDER, label: "R. Shoulder", medical: "Glenohumeral Jt.", offsetX: 8, offsetY: -12 },
  { idx: LEFT_SHOULDER, label: "L. Shoulder", medical: "Glenohumeral Jt.", offsetX: -120, offsetY: -12 },
  { idx: RIGHT_ELBOW, label: "R. Elbow", medical: "Olecranon", offsetX: 8, offsetY: -8 },
  { idx: LEFT_ELBOW, label: "L. Elbow", medical: "Olecranon", offsetX: -90, offsetY: -8 },
  { idx: RIGHT_WRIST, label: "R. Wrist", medical: "Radiocarpal Jt.", offsetX: 8, offsetY: -8 },
  { idx: LEFT_WRIST, label: "L. Wrist", medical: "Radiocarpal Jt.", offsetX: -100, offsetY: -8 },
  { idx: RIGHT_HIP, label: "R. Hip", medical: "Acetabulofemoral", offsetX: 8, offsetY: 4 },
  { idx: LEFT_HIP, label: "L. Hip", medical: "Acetabulofemoral", offsetX: -110, offsetY: 4 },
  { idx: RIGHT_KNEE, label: "R. Knee", medical: "Patellofemoral Jt.", offsetX: 8, offsetY: -8 },
  { idx: LEFT_KNEE, label: "L. Knee", medical: "Patellofemoral Jt.", offsetX: -120, offsetY: -8 },
  { idx: RIGHT_ANKLE, label: "R. Ankle", medical: "Talocrural Jt.", offsetX: 8, offsetY: -8 },
  { idx: LEFT_ANKLE, label: "L. Ankle", medical: "Talocrural Jt.", offsetX: -100, offsetY: -8 },
];

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  EXERCISE DEFINITIONS                                                     */
/* ═══════════════════════════════════════════════════════════════════════════ */

export type ExerciseId = "bicep_curl" | "squat" | "shoulder_abduction" | "knee_extension" | "wrist_flexion";

export interface ExerciseConfig {
  id: ExerciseId;
  name: string;
  muscle: string;
  instruction: string;
  landmarks: [number, number, number];
  contractedAngle: number;
  extendedAngle: number;
  breachBelow: number;
  highlightChain: number[];
}

export const EXERCISES: Record<ExerciseId, ExerciseConfig> = {
  bicep_curl: {
    id: "bicep_curl",
    name: "Bicep Curl",
    muscle: "Biceps Brachii",
    instruction: "Stand with arm at side. Curl forearm up by bending at the elbow, then lower slowly.",
    landmarks: [RIGHT_SHOULDER, RIGHT_ELBOW, RIGHT_WRIST],
    contractedAngle: 40,
    extendedAngle: 160,
    breachBelow: 30,
    highlightChain: [RIGHT_SHOULDER, RIGHT_ELBOW, RIGHT_WRIST, RIGHT_INDEX],
  },
  squat: {
    id: "squat",
    name: "Squat",
    muscle: "Quadriceps / Gluteus",
    instruction: "Stand with feet shoulder-width apart. Lower hips by bending knees, then return to standing.",
    landmarks: [RIGHT_HIP, RIGHT_KNEE, RIGHT_ANKLE],
    contractedAngle: 70,
    extendedAngle: 170,
    breachBelow: 60,
    highlightChain: [RIGHT_HIP, RIGHT_KNEE, RIGHT_ANKLE, RIGHT_FOOT],
  },
  shoulder_abduction: {
    id: "shoulder_abduction",
    name: "Shoulder Abduction",
    muscle: "Deltoid / Supraspinatus",
    instruction: "Stand straight. Raise arm out to the side until parallel with ground, then lower.",
    landmarks: [RIGHT_HIP, RIGHT_SHOULDER, RIGHT_ELBOW],
    contractedAngle: 20,
    extendedAngle: 170,
    breachBelow: 15,
    highlightChain: [RIGHT_HIP, RIGHT_SHOULDER, RIGHT_ELBOW, RIGHT_WRIST],
  },
  knee_extension: {
    id: "knee_extension",
    name: "Knee Extension",
    muscle: "Quadriceps Femoris",
    instruction: "Sit on a chair. Extend lower leg until straight, hold, then lower slowly.",
    landmarks: [RIGHT_HIP, RIGHT_KNEE, RIGHT_ANKLE],
    contractedAngle: 90,
    extendedAngle: 175,
    breachBelow: 80,
    highlightChain: [RIGHT_HIP, RIGHT_KNEE, RIGHT_ANKLE],
  },
  wrist_flexion: {
    id: "wrist_flexion",
    name: "Wrist Flexion",
    muscle: "Flexor Carpi Radialis",
    instruction: "Extend arm forward. Flex wrist downward, then return to neutral.",
    landmarks: [RIGHT_ELBOW, RIGHT_WRIST, RIGHT_INDEX],
    contractedAngle: 100,
    extendedAngle: 175,
    breachBelow: 90,
    highlightChain: [RIGHT_ELBOW, RIGHT_WRIST, RIGHT_INDEX],
  },
};

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  MEDIAPIPE TYPES (CDN-loaded, no npm types available)                     */
/* ═══════════════════════════════════════════════════════════════════════════ */

interface PoseLandmark {
  x: number;
  y: number;
  z: number;
  visibility?: number;
}

interface PoseResults {
  poseLandmarks?: PoseLandmark[];
}

interface PoseInstance {
  setOptions: (opts: Record<string, unknown>) => void;
  onResults: (cb: (results: PoseResults) => void) => void;
  send: (data: { image: HTMLVideoElement }) => Promise<void>;
}

interface CameraInstance {
  start: () => void;
  stop: () => void;
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  HELPERS                                                                  */
/* ═══════════════════════════════════════════════════════════════════════════ */

const POSE_CDN = "https://cdn.jsdelivr.net/npm/@mediapipe/pose";
const POSE_JS  = `${POSE_CDN}/pose.js`;
const CAM_JS   = "https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js";

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`) as HTMLScriptElement | null;
    if (existing) {
      if (existing.dataset.loaded === "1") { resolve(); return; }
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error(`Failed: ${src}`)));
      return;
    }
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.onload = () => { s.dataset.loaded = "1"; resolve(); };
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(s);
  });
}

function waitForGlobal(name: string, timeoutMs = 5000): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      const ctor = (window as unknown as Record<string, unknown>)[name];
      if (ctor) return resolve(ctor);
      if (Date.now() - start > timeoutMs) return reject(new Error(`Global ${name} not found`));
      requestAnimationFrame(check);
    };
    check();
  });
}

const calcAngle = (a: PoseLandmark, b: PoseLandmark, c: PoseLandmark): number => {
  const rad = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x);
  let deg = Math.abs((rad * 180) / Math.PI);
  if (deg > 180) deg = 360 - deg;
  return Math.round(deg);
};

function angleColor(angle: number, ex: ExerciseConfig): string {
  if (angle < ex.breachBelow) return RED;
  const mid = (ex.contractedAngle + ex.extendedAngle) / 2;
  if (angle < mid) return YELLOW;
  return GREEN;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  PROPS                                                                    */
/* ═══════════════════════════════════════════════════════════════════════════ */

interface LivePTCameraProps {
  exercise?: ExerciseId;
  onBreach?: (angle: number) => void;
  onRepComplete?: (totalReps: number) => void;
  showLabels?: boolean;
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  COMPONENT                                                                */
/* ═══════════════════════════════════════════════════════════════════════════ */

const LivePTCamera: React.FC<LivePTCameraProps> = ({
  exercise = "bicep_curl",
  onBreach,
  onRepComplete,
  showLabels = true,
}) => {
  const ex = EXERCISES[exercise];
  const webcamRef = useRef<Webcam>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lastBreachRef = useRef<number>(0);

  const repCountRef = useRef(0);
  const phaseRef = useRef<"extending" | "contracting">("extending");
  const bestRomRef = useRef(0);

  const [angle, setAngle] = useState<number | null>(null);
  const [isBreach, setIsBreach] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Batch resetable metrics into a single reducer to avoid cascading renders
  // when the exercise changes (satisfies react-hooks/set-state-in-effect).
  const [metrics, dispatchMetrics] = React.useReducer(
    (
      state: { reps: number; bestRom: number; sessionTime: number },
      action:
        | { type: "reset" }
        | { type: "reps"; value: number }
        | { type: "bestRom"; value: number }
        | { type: "tick" }
    ) => {
      switch (action.type) {
        case "reset":       return { reps: 0, bestRom: 0, sessionTime: 0 };
        case "reps":        return { ...state, reps: action.value };
        case "bestRom":     return { ...state, bestRom: action.value };
        case "tick":        return { ...state, sessionTime: state.sessionTime + 1 };
      }
    },
    { reps: 0, bestRom: 0, sessionTime: 0 }
  );

  useEffect(() => {
    repCountRef.current = 0;
    phaseRef.current = "extending";
    bestRomRef.current = 0;
    dispatchMetrics({ type: "reset" });
  }, [exercise]);

  useEffect(() => {
    if (isLoading) return;
    const interval = setInterval(() => dispatchMetrics({ type: "tick" }), 1000);
    return () => clearInterval(interval);
  }, [isLoading]);

  const drawLine = useCallback(
    (ctx: CanvasRenderingContext2D, a: PoseLandmark, b: PoseLandmark, color: string, width = LINE_WIDTH) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.shadowColor = color;
      ctx.shadowBlur = GLOW_BLUR;
      ctx.beginPath();
      ctx.moveTo(a.x * VIDEO_W, a.y * VIDEO_H);
      ctx.lineTo(b.x * VIDEO_W, b.y * VIDEO_H);
      ctx.stroke();
      ctx.shadowBlur = 0;
    }, []
  );

  const drawDot = useCallback(
    (ctx: CanvasRenderingContext2D, lm: PoseLandmark, color: string, r = DOT_RADIUS) => {
      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = GLOW_BLUR;
      ctx.beginPath();
      ctx.arc(lm.x * VIDEO_W, lm.y * VIDEO_H, r, 0, 2 * Math.PI);
      ctx.fill();
      ctx.shadowBlur = 0;
    }, []
  );

  const drawLabel = useCallback(
    (ctx: CanvasRenderingContext2D, lm: PoseLandmark, label: MedLabel) => {
      const x = lm.x * VIDEO_W + (label.offsetX ?? 8);
      const y = lm.y * VIDEO_H + (label.offsetY ?? -8);
      ctx.font = "bold 8px Inter, sans-serif";
      const lineW = ctx.measureText(label.medical).width;
      ctx.font = "7px Inter, sans-serif";
      const w = Math.max(lineW, ctx.measureText(label.label).width) + 8;
      ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
      ctx.beginPath();
      ctx.roundRect(x - 2, y - 12, w + 4, 24, 4);
      ctx.fill();
      ctx.fillStyle = CYAN;
      ctx.font = "bold 8px Inter, sans-serif";
      ctx.fillText(label.medical, x, y);
      ctx.fillStyle = "#a1a1aa";
      ctx.font = "7px Inter, sans-serif";
      ctx.fillText(label.label, x, y + 10);
    }, []
  );

  const drawRomGauge = useCallback(
    (ctx: CanvasRenderingContext2D, jointLm: PoseLandmark, currentAngle: number, config: ExerciseConfig) => {
      const cx = jointLm.x * VIDEO_W;
      const cy = jointLm.y * VIDEO_H;
      const radius = 28;

      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
      ctx.lineWidth = 4;
      ctx.stroke();

      const range = config.extendedAngle - config.contractedAngle;
      const progress = Math.min(1, Math.max(0, (currentAngle - config.contractedAngle) / range));
      const startAngle = -Math.PI / 2;
      const endAngle = startAngle + progress * Math.PI * 2;
      const color = angleColor(currentAngle, config);

      ctx.beginPath();
      ctx.arc(cx, cy, radius, startAngle, endAngle);
      ctx.strokeStyle = color;
      ctx.lineWidth = 4;
      ctx.shadowColor = color;
      ctx.shadowBlur = 8;
      ctx.stroke();
      ctx.shadowBlur = 0;

      ctx.fillStyle = color;
      ctx.font = "bold 11px monospace";
      ctx.textAlign = "center";
      ctx.fillText(`${currentAngle}°`, cx, cy + 4);
      ctx.textAlign = "start";
    }, []
  );

  useEffect(() => {
    let cancelled = false;
    let cameraInstance: CameraInstance | null = null;

    async function init() {
      if (cancelled) return;
      await loadScript(POSE_JS);
      await loadScript(CAM_JS);
      if (cancelled) return;

      const PoseCtor = await waitForGlobal("Pose") as new (opts: { locateFile: (f: string) => string }) => PoseInstance;
      if (cancelled) return;

      const pose = new PoseCtor({
        locateFile: (file: string) => `${POSE_CDN}/${file}`,
      });

      pose.setOptions({
        modelComplexity: 1,
        smoothLandmarks: true,
        enableSegmentation: false,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });

      pose.onResults((results: PoseResults) => {
        if (cancelled) return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.clearRect(0, 0, VIDEO_W, VIDEO_H);

        const lms = results.poseLandmarks;
        if (!lms) return;

        const isVisible = (idx: number) => lms[idx] && (lms[idx].visibility ?? 0) > 0.4;

        for (const [a, b] of SKELETON_CONNECTIONS) {
          if (isVisible(a) && isVisible(b)) {
            drawLine(ctx, lms[a], lms[b], "rgba(0, 255, 255, 0.25)");
          }
        }

        for (let i = 0; i < 33; i++) {
          if (isVisible(i)) {
            drawDot(ctx, lms[i], "rgba(0, 255, 255, 0.4)", 3);
          }
        }

        const chain = ex.highlightChain;
        const chainVisible = chain.every(isVisible);

        if (chainVisible) {
          for (let i = 0; i < chain.length - 1; i++) {
            drawLine(ctx, lms[chain[i]], lms[chain[i + 1]], GREEN, 3.5);
          }
          for (const idx of chain) {
            drawDot(ctx, lms[idx], GREEN, 5);
          }
        }

        if (showLabels) {
          for (const label of MEDICAL_LABELS) {
            if (isVisible(label.idx)) {
              drawLabel(ctx, lms[label.idx], label);
            }
          }
        }

        const [aIdx, bIdx, cIdx] = ex.landmarks;
        if (isVisible(aIdx) && isVisible(bIdx) && isVisible(cIdx)) {
          const currentAngle = calcAngle(lms[aIdx], lms[bIdx], lms[cIdx]);
          setAngle(currentAngle);

          drawRomGauge(ctx, lms[bIdx], currentAngle, ex);

          const rom = Math.abs(currentAngle - ex.contractedAngle);
          if (rom > bestRomRef.current) {
            bestRomRef.current = rom;
            dispatchMetrics({ type: "bestRom", value: rom });
          }

          const threshold = (ex.contractedAngle + ex.extendedAngle) / 2;
          if (phaseRef.current === "extending" && currentAngle < threshold) {
            phaseRef.current = "contracting";
          } else if (phaseRef.current === "contracting" && currentAngle > threshold) {
            phaseRef.current = "extending";
            repCountRef.current += 1;
            dispatchMetrics({ type: "reps", value: repCountRef.current });
            onRepComplete?.(repCountRef.current);
          }

          if (currentAngle < ex.breachBelow) {
            setIsBreach(true);
            if (chainVisible) {
              for (let i = 0; i < chain.length - 1; i++) {
                drawLine(ctx, lms[chain[i]], lms[chain[i + 1]], RED, 3.5);
              }
              for (const idx of chain) {
                drawDot(ctx, lms[idx], RED, 6);
              }
            }
            const now = Date.now();
            if (onBreach && now - lastBreachRef.current >= BREACH_COOLDOWN_MS) {
              lastBreachRef.current = now;
              onBreach(currentAngle);
            }
          } else {
            setIsBreach(false);
          }
        } else {
          setAngle(null);
          setIsBreach(false);
        }
      });

      const video = webcamRef.current?.video;
      if (!video || cancelled) return;
      await new Promise<void>((r) => {
        if (video.readyState >= 2) r();
        else video.onloadeddata = () => r();
      });
      if (cancelled) return;
      setIsLoading(false);

      const CamCtor = await waitForGlobal("Camera") as new (
        video: HTMLVideoElement,
        opts: { onFrame: () => Promise<void>; width: number; height: number }
      ) => CameraInstance;
      if (cancelled) return;

      cameraInstance = new CamCtor(video, {
        onFrame: async () => { if (!cancelled) await pose.send({ image: video }); },
        width: VIDEO_W, height: VIDEO_H,
      });
      cameraInstance.start();
    }

    init();
    return () => { cancelled = true; cameraInstance?.stop(); };
  }, [exercise, showLabels, onBreach, onRepComplete, drawLine, drawDot, drawLabel, drawRomGauge, ex]);

  return (
    <div
      className="relative overflow-hidden rounded-2xl border border-white/10 bg-black shadow-2xl"
      style={{ width: VIDEO_W, height: VIDEO_H }}
    >
      <Webcam
        ref={webcamRef}
        audio={false}
        width={VIDEO_W}
        height={VIDEO_H}
        screenshotFormat="image/jpeg"
        videoConstraints={{ width: VIDEO_W, height: VIDEO_H, facingMode: "user" }}
        className="absolute inset-0 h-full w-full object-cover"
        mirrored
      />

      <canvas
        ref={canvasRef}
        width={VIDEO_W}
        height={VIDEO_H}
        className="absolute inset-0 h-full w-full"
        style={{ transform: "scaleX(-1)" }}
      />

      {isLoading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/80">
          <p className="animate-pulse text-sm text-neutral-400">Loading pose model…</p>
        </div>
      )}

      <div className="absolute top-3 left-3 z-20 rounded-lg border border-white/10 bg-black/70 px-3 py-2 backdrop-blur-md">
        <div className="text-[9px] font-bold uppercase tracking-widest text-cyan-400 mb-1">
          {ex.name}
        </div>
        <div className="text-[8px] text-zinc-500 mb-2">{ex.muscle}</div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[10px] font-mono">
          <span className="text-zinc-500">Reps</span>
          <span className="text-emerald-400 font-bold text-right">{metrics.reps}</span>
          <span className="text-zinc-500">Best ROM</span>
          <span className="text-cyan-400 text-right">{metrics.bestRom}°</span>
          <span className="text-zinc-500">Time</span>
          <span className="text-zinc-400 text-right">{formatTime(metrics.sessionTime)}</span>
        </div>
      </div>

      <div
        className={`absolute top-3 right-3 z-20 rounded-lg px-4 py-2 font-mono text-sm tracking-widest backdrop-blur-md transition-colors duration-200 ${isBreach
          ? "border border-red-500/40 bg-red-950/60 text-red-500"
          : "border border-cyan-500/20 bg-black/60 text-cyan-400"
          }`}
      >
        {angle !== null ? (
          <>
            <span className="text-[9px] uppercase opacity-60">Joint Angle</span>
            <br />
            <span className="text-xl font-bold">{angle}°</span>
          </>
        ) : (
          <span className="text-xs opacity-50">Detecting…</span>
        )}
      </div>

      {isBreach && (
        <div className="absolute bottom-4 left-1/2 z-20 -translate-x-1/2 animate-pulse rounded-full border border-red-500/40 bg-red-950/70 px-6 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-red-400 backdrop-blur-md">
          ⚠ ROM Breach — Correct Form
        </div>
      )}

      <div className="absolute bottom-3 left-3 z-20 max-w-[240px] rounded-lg border border-white/5 bg-black/60 px-3 py-1.5 backdrop-blur-md">
        <p className="text-[9px] text-zinc-500 leading-relaxed">{ex.instruction}</p>
      </div>
    </div>
  );
};

export default LivePTCamera;
