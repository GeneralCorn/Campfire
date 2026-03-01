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
const MAGENTA = "#FF44FF";
const GLOW_BLUR = 10;
const LINE_WIDTH = 2.5;
const DOT_RADIUS = 4;

const BREACH_COOLDOWN_MS = 4000;

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  MEDIAPIPE POSE LANDMARKS (0–32)                                          */
/* ═══════════════════════════════════════════════════════════════════════════ */

// Face
const NOSE = 0;
// Torso
const LEFT_SHOULDER = 11; const RIGHT_SHOULDER = 12;
const LEFT_HIP = 23; const RIGHT_HIP = 24;
// Arms
const LEFT_ELBOW = 13; const RIGHT_ELBOW = 14;
const LEFT_WRIST = 15; const RIGHT_WRIST = 16;
const LEFT_INDEX = 19; const RIGHT_INDEX = 20;
const LEFT_PINKY = 17; const RIGHT_PINKY = 18;
const LEFT_THUMB = 21; const RIGHT_THUMB = 22;
// Legs
const LEFT_KNEE = 25; const RIGHT_KNEE = 26;
const LEFT_ANKLE = 27; const RIGHT_ANKLE = 28;
const LEFT_HEEL = 29; const RIGHT_HEEL = 30;
const LEFT_FOOT = 31; const RIGHT_FOOT = 32;

/* ── Skeleton connections ──────────────────────────────────────────────── */
const SKELETON_CONNECTIONS: [number, number][] = [
  // Torso
  [LEFT_SHOULDER, RIGHT_SHOULDER],
  [LEFT_SHOULDER, LEFT_HIP],
  [RIGHT_SHOULDER, RIGHT_HIP],
  [LEFT_HIP, RIGHT_HIP],
  // Left arm
  [LEFT_SHOULDER, LEFT_ELBOW],
  [LEFT_ELBOW, LEFT_WRIST],
  [LEFT_WRIST, LEFT_INDEX],
  [LEFT_WRIST, LEFT_PINKY],
  [LEFT_WRIST, LEFT_THUMB],
  // Right arm
  [RIGHT_SHOULDER, RIGHT_ELBOW],
  [RIGHT_ELBOW, RIGHT_WRIST],
  [RIGHT_WRIST, RIGHT_INDEX],
  [RIGHT_WRIST, RIGHT_PINKY],
  [RIGHT_WRIST, RIGHT_THUMB],
  // Left leg
  [LEFT_HIP, LEFT_KNEE],
  [LEFT_KNEE, LEFT_ANKLE],
  [LEFT_ANKLE, LEFT_HEEL],
  [LEFT_ANKLE, LEFT_FOOT],
  // Right leg
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
  // Three landmark indices for angle calculation: A → B → C  (angle at B)
  landmarks: [number, number, number];
  // Range of motion
  contractedAngle: number;  // lowest angle (peak contraction)
  extendedAngle: number;    // highest angle (full extension)
  breachBelow: number;      // warn if angle drops below this
  highlightChain: number[]; // landmarks to highlight in the exercise color
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
/*  HELPERS                                                                  */
/* ═══════════════════════════════════════════════════════════════════════════ */

const POSE_CDN = "https://cdn.jsdelivr.net/npm/@mediapipe/pose";
const POSE_JS  = `${POSE_CDN}/pose.js`;
const CAM_JS   = "https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js";

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`) as HTMLScriptElement | null;
    if (existing) {
      // Script tag exists; if already loaded resolve, otherwise wait
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

/** Poll for a global constructor after CDN script load (some scripts set globals async). */
function waitForGlobal(name: string, timeoutMs = 5000): Promise<any> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      const ctor = (window as any)[name];
      if (ctor) return resolve(ctor);
      if (Date.now() - start > timeoutMs) return reject(new Error(`Global ${name} not found`));
      requestAnimationFrame(check);
    };
    check();
  });
}

const calcAngle = (a: any, b: any, c: any): number => {
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

  // Rep counting state stored in refs to avoid re-renders in the animation loop
  const repCountRef = useRef(0);
  const phaseRef = useRef<"extending" | "contracting">("extending");
  const bestRomRef = useRef(0);

  const [angle, setAngle] = useState<number | null>(null);
  const [isBreach, setIsBreach] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [reps, setReps] = useState(0);
  const [bestRom, setBestRom] = useState(0);
  const [sessionTime, setSessionTime] = useState(0);

  // Reset state when exercise changes
  useEffect(() => {
    repCountRef.current = 0;
    phaseRef.current = "extending";
    bestRomRef.current = 0;
    setReps(0);
    setBestRom(0);
    setSessionTime(0);
  }, [exercise]);

  // Session timer
  useEffect(() => {
    if (isLoading) return;
    const interval = setInterval(() => setSessionTime((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, [isLoading]);

  /* ── Drawing ─────────────────────────────────────────────────────────── */
  const drawLine = useCallback(
    (ctx: CanvasRenderingContext2D, a: any, b: any, color: string, width = LINE_WIDTH) => {
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
    (ctx: CanvasRenderingContext2D, lm: any, color: string, r = DOT_RADIUS) => {
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
    (ctx: CanvasRenderingContext2D, lm: any, label: MedLabel) => {
      const x = lm.x * VIDEO_W + (label.offsetX ?? 8);
      const y = lm.y * VIDEO_H + (label.offsetY ?? -8);
      // Background pill
      ctx.font = "bold 8px Inter, sans-serif";
      const lineW = ctx.measureText(label.medical).width;
      ctx.font = "7px Inter, sans-serif";
      const w = Math.max(lineW, ctx.measureText(label.label).width) + 8;
      ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
      ctx.beginPath();
      ctx.roundRect(x - 2, y - 12, w + 4, 24, 4);
      ctx.fill();
      // Medical term
      ctx.fillStyle = CYAN;
      ctx.font = "bold 8px Inter, sans-serif";
      ctx.fillText(label.medical, x, y);
      // Common name
      ctx.fillStyle = "#a1a1aa";
      ctx.font = "7px Inter, sans-serif";
      ctx.fillText(label.label, x, y + 10);
    }, []
  );

  const drawRomGauge = useCallback(
    (ctx: CanvasRenderingContext2D, jointLm: any, currentAngle: number, config: ExerciseConfig) => {
      const cx = jointLm.x * VIDEO_W;
      const cy = jointLm.y * VIDEO_H;
      const radius = 28;

      // Background arc
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
      ctx.lineWidth = 4;
      ctx.stroke();

      // Progress arc
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

      // Angle text in center
      ctx.fillStyle = color;
      ctx.font = "bold 11px monospace";
      ctx.textAlign = "center";
      ctx.fillText(`${currentAngle}°`, cx, cy + 4);
      ctx.textAlign = "start";
    }, []
  );

  /* ── MediaPipe init ──────────────────────────────────────────────────── */
  useEffect(() => {
    let cancelled = false;
    let cameraInstance: any = null;

    async function init() {
      if (cancelled) return;

      // Load scripts from CDN (these packages have no ESM exports)
      await loadScript(POSE_JS);
      await loadScript(CAM_JS);
      if (cancelled) return;

      const PoseCtor = await waitForGlobal("Pose");
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

      pose.onResults((results: any) => {
        if (cancelled) return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.clearRect(0, 0, VIDEO_W, VIDEO_H);

        const lms = results.poseLandmarks;
        if (!lms) return;

        const isVisible = (idx: number) => lms[idx] && (lms[idx].visibility ?? 0) > 0.4;

        /* ── 1. Draw full skeleton ─────────────────────────────────────── */
        for (const [a, b] of SKELETON_CONNECTIONS) {
          if (isVisible(a) && isVisible(b)) {
            drawLine(ctx, lms[a], lms[b], "rgba(0, 255, 255, 0.25)");
          }
        }

        // Dots for all visible landmarks
        for (let i = 0; i < 33; i++) {
          if (isVisible(i)) {
            drawDot(ctx, lms[i], "rgba(0, 255, 255, 0.4)", 3);
          }
        }

        /* ── 2. Highlight exercise chain ───────────────────────────────── */
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

        /* ── 3. Medical labels ─────────────────────────────────────────── */
        if (showLabels) {
          for (const label of MEDICAL_LABELS) {
            if (isVisible(label.idx)) {
              drawLabel(ctx, lms[label.idx], label);
            }
          }
        }

        /* ── 4. Angle calculation & rep counting ───────────────────────── */
        const [aIdx, bIdx, cIdx] = ex.landmarks;
        if (isVisible(aIdx) && isVisible(bIdx) && isVisible(cIdx)) {
          const currentAngle = calcAngle(lms[aIdx], lms[bIdx], lms[cIdx]);
          setAngle(currentAngle);

          // ROM gauge at the joint
          drawRomGauge(ctx, lms[bIdx], currentAngle, ex);

          // Track best ROM
          const rom = Math.abs(currentAngle - ex.contractedAngle);
          if (rom > bestRomRef.current) {
            bestRomRef.current = rom;
            setBestRom(rom);
          }

          // Rep counting: detect contraction then extension
          const threshold = (ex.contractedAngle + ex.extendedAngle) / 2;
          if (phaseRef.current === "extending" && currentAngle < threshold) {
            phaseRef.current = "contracting";
          } else if (phaseRef.current === "contracting" && currentAngle > threshold) {
            phaseRef.current = "extending";
            repCountRef.current += 1;
            setReps(repCountRef.current);
            onRepComplete?.(repCountRef.current);
          }

          // Breach detection
          if (currentAngle < ex.breachBelow) {
            setIsBreach(true);
            // Redraw chain in red
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

      // Camera constructor from CDN
      const CamCtor = await waitForGlobal("Camera");
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

  /* ═══════════════════════════════════════════════════════════════════════ */
  /*  RENDER                                                                */
  /* ═══════════════════════════════════════════════════════════════════════ */
  return (
    <div
      className="relative overflow-hidden rounded-2xl border border-white/10 bg-black shadow-2xl"
      style={{ width: VIDEO_W, height: VIDEO_H }}
    >
      {/* Webcam */}
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

      {/* Pose overlay */}
      <canvas
        ref={canvasRef}
        width={VIDEO_W}
        height={VIDEO_H}
        className="absolute inset-0 h-full w-full"
        style={{ transform: "scaleX(-1)" }}
      />

      {/* Loading */}
      {isLoading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/80">
          <p className="animate-pulse text-sm text-neutral-400">Loading pose model…</p>
        </div>
      )}

      {/* ── Metrics HUD (top-left) ─────────────────────────────────────── */}
      <div className="absolute top-3 left-3 z-20 rounded-lg border border-white/10 bg-black/70 px-3 py-2 backdrop-blur-md">
        <div className="text-[9px] font-bold uppercase tracking-widest text-cyan-400 mb-1">
          {ex.name}
        </div>
        <div className="text-[8px] text-zinc-500 mb-2">{ex.muscle}</div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[10px] font-mono">
          <span className="text-zinc-500">Reps</span>
          <span className="text-emerald-400 font-bold text-right">{reps}</span>
          <span className="text-zinc-500">Best ROM</span>
          <span className="text-cyan-400 text-right">{bestRom}°</span>
          <span className="text-zinc-500">Time</span>
          <span className="text-zinc-400 text-right">{formatTime(sessionTime)}</span>
        </div>
      </div>

      {/* ── Live Angle (top-right) ─────────────────────────────────────── */}
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

      {/* ── Breach warning ─────────────────────────────────────────────── */}
      {isBreach && (
        <div className="absolute bottom-4 left-1/2 z-20 -translate-x-1/2 animate-pulse rounded-full border border-red-500/40 bg-red-950/70 px-6 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-red-400 backdrop-blur-md">
          ⚠ ROM Breach — Correct Form
        </div>
      )}

      {/* ── Exercise instruction (bottom-left) ─────────────────────────── */}
      <div className="absolute bottom-3 left-3 z-20 max-w-[240px] rounded-lg border border-white/5 bg-black/60 px-3 py-1.5 backdrop-blur-md">
        <p className="text-[9px] text-zinc-500 leading-relaxed">{ex.instruction}</p>
      </div>
    </div>
  );
};

export default LivePTCamera;
