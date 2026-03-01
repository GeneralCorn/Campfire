"use client";

import { useEffect, useRef, useState } from "react";
import { useAppStore } from "@/stores/useAppStore";
import { teammates } from "@/lib/teammates";
import type { PipelineNodeStatus } from "@/types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const W = 308;
const H_INIT = 300; // fallback before ResizeObserver fires
const CORE_R = 22;
const SAT_R = 15;
const ORBIT_R = 58;

const COLORS: Record<string, string> = {
  router: "#888888",
  maya: teammates.maya.colorHex,
  rex: teammates.rex.colorHex,
  sol: teammates.sol.colorHex,
  synthesize: "#888888",
};

const LABELS: Record<string, string> = {
  router: "Router",
  maya: "Maya",
  rex: "Rex",
  sol: "Sol",
  synthesize: "Synth",
};

// Sandbox model display info
const MODEL_SHORT: Record<string, string> = {
  vlm: "VLM", mediapipe: "Pose", mistral: "LLM",
  research: "PubMed", biobert: "BioBERT", viz: "HTML", fda: "FDA",
};
const MODEL_FULL: Record<string, { name: string; why: string; what: string }> = {
  vlm:       { name: "Florence-2 VLM",   why: "Image detected — using VLM to extract text and data from medical documents", what: "Runs vision-language model on your uploaded image to decode prescriptions and notes" },
  mediapipe: { name: "MediaPipe Pose",   why: "Movement/ROM question — analyzing physical therapy restrictions", what: "Tracks joint angles from pose estimation to compare against PT-prescribed limits" },
  mistral:   { name: "Mistral 7B",       why: "Clinical Q&A requiring deep medical reasoning", what: "Queries a locally-hosted medical language model for evidence-based clinical answers" },
  research:  { name: "PubMed Search",    why: "Literature lookup needed for evidence-based answer", what: "Searches PubMed for peer-reviewed clinical studies relevant to your question" },
  biobert:   { name: "BioBERT NER",      why: "Extracting drug names and medical entities from text", what: "Runs named-entity recognition to identify medications, conditions, and dosages" },
  viz:       { name: "HTML Visualizer",  why: "Generating visual medication schedule from Maya & Rex findings", what: "Produces an interactive HTML chart of drug timing, doses, and interaction warnings" },
  fda:       { name: "OpenFDA + RxNorm", why: "Medication names found — cross-referencing FDA safety database", what: "Queries OpenFDA drug labels and RxNorm for interactions and adverse event reports" },
};

// Sandbox square half-dimensions
const SB_HW = 26;
const SB_HH = 17;

function makeTargets(h: number): Record<string, [number, number]> {
  return {
    router:     [W / 2,    Math.round(h * 0.14)],
    maya:       [56,        Math.round(h * 0.50)],
    rex:        [W / 2,    Math.round(h * 0.50)],
    sol:        [W - 56,   Math.round(h * 0.50)],
    synthesize: [W / 2,    Math.round(h * 0.86)],
  };
}

const PIPELINE_EDGES: [string, string][] = [
  ["router", "maya"],
  ["router", "rex"],
  ["router", "sol"],
  ["maya", "synthesize"],
  ["rex", "synthesize"],
  ["sol", "synthesize"],
];

// ---------------------------------------------------------------------------
// Types (internal)
// ---------------------------------------------------------------------------
interface GNode {
  id: string;
  type: "core" | "sandbox";
  parentId?: string;
  x: number;
  y: number;
  px: number;
  py: number;
  tx: number;
  ty: number;
  r: number;
  color: string;
  label: string;
  status: PipelineNodeStatus;
  detail?: string;
  gpu?: boolean;
  model?: string;
  gpuTier?: string;
  packages?: string[];
  spawnT?: number;
  doneT?: number;
  startedAt?: number;
  completedAt?: number;
  executionContext?: "modal-gpu" | "modal-cpu" | "browser";
  gpuName?: string;
}

interface GEdge {
  from: string;
  to: string;
  type: "pipe" | "tether";
}

interface Dot {
  edge: GEdge;
  t: number;
  speed: number;
}

interface GState {
  nodes: Map<string, GNode>;
  edges: GEdge[];
  dots: Dot[];
  tick: number;
  lastSbCount: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return h;
}

function easeOutBack(t: number) {
  return 1 + 2.70158 * Math.pow(t - 1, 3) + 1.70158 * Math.pow(t - 1, 2);
}

function hexToRgb(hex: string) {
  const c = parseInt(hex.replace("#", ""), 16);
  return [(c >> 16) & 255, (c >> 8) & 255, c & 255];
}

function getNodeAt(g: GState, x: number, y: number): GNode | null {
  // Iterate in reverse so top-painted nodes win hit-test
  const nodes = [...g.nodes.values()].reverse();
  for (const n of nodes) {
    const dx = x - n.x;
    const dy = y - n.y;
    if (dx * dx + dy * dy <= (n.r + 4) * (n.r + 4)) return n;
  }
  return null;
}

function sandboxTarget(parent: GNode, idx: number, total: number): [number, number] {
  const base =
    parent.id === "maya" ? Math.PI * 1.1 : parent.id === "sol" ? -Math.PI * 0.1 : -Math.PI * 0.5;
  const spread = Math.PI * 0.8;
  const angle = base - spread / 2 + ((idx + 1) * spread) / (total + 1);
  return [parent.tx + Math.cos(angle) * ORBIT_R, parent.ty + Math.sin(angle) * ORBIT_R];
}

// ---------------------------------------------------------------------------
// Graph factory
// ---------------------------------------------------------------------------
function createGraph(): GState {
  const nodes = new Map<string, GNode>();
  const targets = makeTargets(H_INIT);
  for (const id of ["router", "maya", "rex", "sol", "synthesize"]) {
    const [tx, ty] = targets[id];
    nodes.set(id, {
      id,
      type: "core",
      x: tx + (Math.random() - 0.5) * 4,
      y: ty + (Math.random() - 0.5) * 4,
      px: tx,
      py: ty,
      tx,
      ty,
      r: CORE_R,
      color: COLORS[id],
      label: LABELS[id],
      status: "pending",
    });
  }
  const edges: GEdge[] = PIPELINE_EDGES.map(([f, t]) => ({ from: f, to: t, type: "pipe" as const }));
  return { nodes, edges, dots: [], tick: 0, lastSbCount: 0 };
}

// ---------------------------------------------------------------------------
// Physics
// ---------------------------------------------------------------------------
function simulate(g: GState, draggedId: string | null = null, ch = H_INIT) {
  const DAMP = 0.9;
  const SPRING = 0.025;
  const REPULSE = 600;
  const MAX_DIST_SQ = 90 * 90;

  for (const n of g.nodes.values()) {
    if (n.id === draggedId) continue;
    const vx = (n.x - n.px) * DAMP;
    const vy = (n.y - n.py) * DAMP;

    // Spring to target
    let fx = (n.tx - n.x) * SPRING;
    let fy = (n.ty - n.y) * SPRING;

    // Breathing
    const ph = hash(n.id) * 0.001;
    fx += Math.sin(g.tick * 0.018 + ph) * 0.12;
    fy += Math.cos(g.tick * 0.013 + ph * 1.4) * 0.09;

    // Repulsion
    for (const o of g.nodes.values()) {
      if (o.id === n.id) continue;
      const dx = n.x - o.x;
      const dy = n.y - o.y;
      const dSq = dx * dx + dy * dy;
      if (dSq > MAX_DIST_SQ || dSq < 1) continue;
      const d = Math.sqrt(dSq);
      const f = REPULSE / dSq;
      fx += (dx / d) * f;
      fy += (dy / d) * f;
    }

    n.px = n.x;
    n.py = n.y;
    n.x += vx + fx;
    n.y += vy + fy;
    n.x = Math.max(n.r, Math.min(W - n.r, n.x));
    n.y = Math.max(n.r, Math.min(ch - n.r, n.y));
  }
}

// ---------------------------------------------------------------------------
// Sync store → graph
// ---------------------------------------------------------------------------
function syncFromStore(g: GState) {
  const { pipelineNodes, sandboxEntries } = useAppStore.getState();

  // If pipeline was reset, clear sandbox nodes
  const allPending = Object.values(pipelineNodes).every((n) => n.status === "pending");
  if (allPending) {
    for (const [id, n] of g.nodes) {
      if (n.type === "sandbox") g.nodes.delete(id);
    }
    g.edges = g.edges.filter((e) => e.type === "pipe");
    g.dots = [];
  }

  // Sync core node statuses
  for (const [id, pn] of Object.entries(pipelineNodes)) {
    const gn = g.nodes.get(id);
    if (!gn) continue;
    if (gn.status !== pn.status && pn.status === "done" && !gn.doneT) gn.doneT = Date.now();
    gn.status = pn.status;
    gn.detail = pn.detail;
    gn.startedAt = pn.startedAt;
    gn.completedAt = pn.completedAt;
  }

  // Derive sandbox satellites from sandboxEntries
  if (sandboxEntries.length !== g.lastSbCount) {
    g.lastSbCount = sandboxEntries.length;

    const spawns = sandboxEntries.filter((e) => e.id.startsWith("sb-spawn-"));
    const dones = new Set(
      sandboxEntries.filter((e) => e.id.startsWith("sb-done-")).map((e) => e.teammateId)
    );

    // Count per-agent for orbit positioning
    const countPerAgent: Record<string, number> = {};
    for (const sp of spawns) {
      countPerAgent[sp.teammateId] = (countPerAgent[sp.teammateId] || 0) + 1;
    }

    const idxPerAgent: Record<string, number> = {};
    for (const sp of spawns) {
      const agent = sp.teammateId;
      idxPerAgent[agent] = (idxPerAgent[agent] || 0);
      const satId = `sb-${agent}-${idxPerAgent[agent]}`;
      idxPerAgent[agent]++;

      if (!g.nodes.has(satId)) {
        const parent = g.nodes.get(agent);
        if (!parent) continue;
        const total = countPerAgent[agent] || 1;
        const idx = idxPerAgent[agent] - 1;
        const [stx, sty] = sandboxTarget(parent, idx, total);

        const ctx = sp.executionContext
          ?? ((sp.model === "mediapipe") ? "browser"
            : sp.gpuTier ? "modal-gpu" : "modal-cpu");
        const hasGpu = ctx === "modal-gpu";
        const isBrowser = ctx === "browser";

        const MODEL_SHORT_MAP: Record<string, string> = {
          vlm: "VLM", mediapipe: "Pose", mistral: "LLM",
          research: "PubMed", biobert: "NER", viz: "Viz", fda: "FDA",
        };
        const modelLabel = MODEL_SHORT_MAP[sp.model ?? ""]
          ?? (isBrowser ? "Browser" : "CPU");

        const nodeColor = hasGpu ? "#7c3aed" : isBrowser ? "#059669" : "#0891B2";

        g.nodes.set(satId, {
          id: satId,
          type: "sandbox",
          parentId: agent,
          x: parent.x,
          y: parent.y,
          px: parent.x,
          py: parent.y,
          tx: stx,
          ty: sty,
          r: hasGpu ? SAT_R + 5 : SAT_R,
          color: nodeColor,
          label: modelLabel,
          status: "sandbox",
          gpu: hasGpu,
          model: sp.model,
          gpuTier: sp.gpuTier,
          packages: sp.packages,
          spawnT: Date.now(),
          executionContext: ctx,
          gpuName: sp.gpuName,
        });

        g.edges.push({ from: agent, to: satId, type: "tether" });

        // Tether particles — more/faster for GPU
        const edge = g.edges[g.edges.length - 1];
        if (hasGpu) {
          for (let p = 0; p < 4; p++) g.dots.push({ edge, t: p / 4, speed: 0.016 });
        } else {
          g.dots.push({ edge, t: 0, speed: 0.010 });
          g.dots.push({ edge, t: 0.5, speed: 0.010 });
        }
      }

      // Mark done
      if (dones.has(agent)) {
        const satNode = g.nodes.get(`sb-${agent}-${idxPerAgent[agent] - 1}`);
        if (satNode && satNode.status !== "done") {
          satNode.status = "done";
          satNode.doneT = Date.now();
        }
      }
    }
  }

  // Pipeline particles
  for (const edge of g.edges) {
    if (edge.type !== "pipe") continue;
    const from = g.nodes.get(edge.from);
    const to = g.nodes.get(edge.to);
    if (!from || !to) continue;
    const active =
      (from.status === "done" && to.status !== "pending") ||
      to.status === "running" ||
      to.status === "sandbox";
    const hasDots = g.dots.some(
      (d) => d.edge.from === edge.from && d.edge.to === edge.to
    );
    if (active && !hasDots) {
      g.dots.push({ edge, t: 0, speed: 0.008 });
      g.dots.push({ edge, t: 0.33, speed: 0.008 });
      g.dots.push({ edge, t: 0.66, speed: 0.008 });
    }
  }

  // Advance + cull dots
  g.dots = g.dots.filter((d) => {
    d.t += d.speed;
    if (d.t >= 1) d.t -= 1;
    const from = g.nodes.get(d.edge.from);
    const to = g.nodes.get(d.edge.to);
    if (!from || !to) return false;
    // Keep dots while anything is active
    if (to.status === "done" && from.status === "done") return false;
    return true;
  });
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------
function render(ctx: CanvasRenderingContext2D, g: GState, ch = H_INIT) {
  ctx.clearRect(0, 0, W, ch);

  // 1. Edges
  for (const edge of g.edges) {
    const from = g.nodes.get(edge.from);
    const to = g.nodes.get(edge.to);
    if (!from || !to) continue;

    const toActive = to.status === "running" || to.status === "sandbox";
    const toDone = to.status === "done";
    const fromDone = from.status === "done";

    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);

    if (edge.type === "tether") {
      ctx.strokeStyle = "rgba(124,58,237,0.30)";
      ctx.setLineDash([3, 3]);
      ctx.lineWidth = 1.5;
    } else if (toDone) {
      ctx.strokeStyle = "rgba(100,116,139,0.18)";
      ctx.setLineDash([]);
      ctx.lineWidth = 1.5;
    } else if (fromDone && toActive) {
      ctx.strokeStyle = "rgba(234,88,12,0.55)";
      ctx.setLineDash([6, 4]);
      ctx.lineDashOffset = -g.tick * 0.5;
      ctx.lineWidth = 2;
    } else {
      ctx.strokeStyle = "rgba(100,116,139,0.09)";
      ctx.setLineDash([]);
      ctx.lineWidth = 1.5;
    }
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.lineDashOffset = 0;
  }

  // 2. Particles
  for (const d of g.dots) {
    const from = g.nodes.get(d.edge.from);
    const to = g.nodes.get(d.edge.to);
    if (!from || !to) continue;
    const x = from.x + (to.x - from.x) * d.t;
    const y = from.y + (to.y - from.y) * d.t;
    ctx.beginPath();
    ctx.arc(x, y, 1.8, 0, Math.PI * 2);
    if (d.edge.type === "tether") {
      const targetNode = g.nodes.get(d.edge.to);
      ctx.fillStyle = targetNode?.gpu ? "#a78bfa" : "#0891B2";
    } else {
      ctx.fillStyle = "#ea580c";
    }
    ctx.globalAlpha = 0.75;
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  // 3. Glows (active nodes only — done nodes need no glow on light background)
  for (const n of g.nodes.values()) {
    const isActive = n.status === "running" || n.status === "sandbox";
    if (!isActive) continue;

    const [r, gv, b] = hexToRgb(n.color);
    const pulse = 0.12 + 0.05 * Math.sin(g.tick * 0.05);
    const grad = ctx.createRadialGradient(n.x, n.y, n.r * 0.5, n.x, n.y, n.r * 2.2);
    grad.addColorStop(0, `rgba(${r},${gv},${b},${pulse})`);
    grad.addColorStop(1, `rgba(${r},${gv},${b},0)`);
    ctx.beginPath();
    ctx.arc(n.x, n.y, n.r * 2.5, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();
  }

  // 4. Nodes
  for (const n of g.nodes.values()) {
    const isPending = n.status === "pending";
    const isActive = n.status === "running" || n.status === "sandbox";
    const isDone = n.status === "done";
    const isSandbox = n.status === "sandbox";

    if (n.type === "sandbox") {
      // Scale-in
      let scale = 1;
      if (n.spawnT) {
        const t = Math.min(1, (Date.now() - n.spawnT) / 350);
        scale = easeOutBack(t);
      }
      const hw = SB_HW * scale;
      const hh = SB_HH * scale;

      // Fill
      ctx.beginPath();
      ctx.roundRect(n.x - hw, n.y - hh, hw * 2, hh * 2, 4);
      ctx.fillStyle = isActive ? n.color + "28" : isDone ? n.color + "18" : "rgba(241,245,249,0.95)";
      ctx.fill();

      // Border
      ctx.beginPath();
      ctx.roundRect(n.x - hw, n.y - hh, hw * 2, hh * 2, 4);
      ctx.strokeStyle = isDone ? n.color + "80" : n.color;
      ctx.lineWidth = isActive ? 2 : 1.5;
      ctx.stroke();

      // Spinning arcs around the square
      if (isSandbox) {
        const arcR = Math.sqrt(hw * hw + hh * hh) + 4;
        if (n.gpu) {
          const a0 = g.tick * 0.05, a1 = g.tick * -0.04, a2 = g.tick * 0.07;
          ctx.strokeStyle = "#7c3aed";
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(n.x, n.y, arcR,     a0, a0 + Math.PI * (80 / 180)); ctx.stroke();
          ctx.beginPath(); ctx.arc(n.x, n.y, arcR - 4, a1, a1 + Math.PI * (55 / 180)); ctx.stroke();
          ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.arc(n.x, n.y, arcR - 8, a2, a2 + Math.PI * (30 / 180)); ctx.stroke();
        } else {
          const a1 = g.tick * 0.04;
          ctx.strokeStyle = "#0891B2";
          ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.arc(n.x, n.y, arcR, a1,              a1 + Math.PI * 0.4); ctx.stroke();
          ctx.beginPath(); ctx.arc(n.x, n.y, arcR, a1 + Math.PI,    a1 + Math.PI * 1.4); ctx.stroke();
        }
      }

      // Labels inside the square
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const isDoneSat = isDone;
      const labelColor = isDoneSat ? "rgba(30,41,59,0.45)" : (n.gpu ? "#6d28d9" : "#0891B2");

      // Model short name
      ctx.font = `bold ${Math.round(7 * scale)}px monospace`;
      ctx.fillStyle = labelColor;
      ctx.fillText(MODEL_SHORT[n.model ?? ""] ?? n.label, n.x, n.y - 4 * scale);

      // Tier or CPU / elapsed
      ctx.font = `400 ${Math.round(6 * scale)}px monospace`;
      if (isDoneSat && n.spawnT && n.doneT) {
        ctx.fillStyle = "rgba(30,41,59,0.40)";
        ctx.fillText(((n.doneT - n.spawnT) / 1000).toFixed(1) + "s", n.x, n.y + 5 * scale);
      } else if (n.gpu && n.gpuTier) {
        ctx.fillStyle = "#D97706";
        ctx.fillText(n.gpuTier, n.x, n.y + 5 * scale);
      } else {
        ctx.fillStyle = "rgba(30,41,59,0.35)";
        ctx.fillText("CPU", n.x, n.y + 5 * scale);
      }

    } else {
      // Core nodes — circle as before
      let dr = n.r;

      ctx.beginPath();
      ctx.arc(n.x, n.y, dr, 0, Math.PI * 2);
      ctx.fillStyle = isActive ? n.color + "35" : isDone ? n.color + "28" : "rgba(241,245,249,0.95)";
      ctx.fill();

      ctx.beginPath();
      ctx.arc(n.x, n.y, dr, 0, Math.PI * 2);
      ctx.strokeStyle = isPending ? "rgba(100,116,139,0.4)" : n.color;
      ctx.lineWidth = isActive ? 2.5 : isPending ? 1.5 : 2;
      ctx.stroke();

      if (n.status === "running") {
        ctx.beginPath();
        const a = g.tick * 0.08;
        ctx.arc(n.x, n.y, dr + 4, a, a + Math.PI * 0.65);
        ctx.strokeStyle = n.color;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      // Labels
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = "bold 10px monospace";
      ctx.fillStyle = isPending ? "rgba(30,41,59,0.55)" : n.color;
      ctx.fillText(n.label, n.x, n.y - 3);

      ctx.font = "400 7px monospace";
      if (isDone && n.startedAt && n.completedAt) {
        ctx.fillStyle = "rgba(30,41,59,0.55)";
        ctx.fillText(((n.completedAt - n.startedAt) / 1000).toFixed(1) + "s", n.x, n.y + 9);
      } else if (n.detail && (n.status === "running" || n.status === "sandbox")) {
        ctx.fillStyle = n.color;
        const d = n.detail.length > 14 ? n.detail.slice(0, 14) + "…" : n.detail;
        ctx.fillText(d, n.x, n.y + 9);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
interface TooltipState {
  node: GNode;
  cx: number; // canvas x
  cy: number; // canvas y
}

export function PipelineGraph() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const graphRef = useRef<GState>(createGraph());
  const rafRef = useRef<number>(0);
  const dragRef = useRef<{ id: string; ox: number; oy: number; moved: boolean } | null>(null);
  const hRef = useRef<number>(H_INIT);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;

    function resize() {
      const h = container!.clientHeight;
      hRef.current = h;
      canvas!.width = W * dpr;
      canvas!.height = h * dpr;
      canvas!.style.width = `${W}px`;
      canvas!.style.height = `${h}px`;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      // Reposition core node targets for new height
      const targets = makeTargets(h);
      const g = graphRef.current;
      for (const [id, [tx, ty]] of Object.entries(targets)) {
        const n = g.nodes.get(id);
        if (n) { n.tx = tx; n.ty = ty; }
      }
    }

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(container);

    function tick() {
      const g = graphRef.current;
      const h = hRef.current;
      syncFromStore(g);
      simulate(g, dragRef.current?.id ?? null, h);
      g.tick++;
      render(ctx!, g, h);
      rafRef.current = requestAnimationFrame(tick);
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(rafRef.current); ro.disconnect(); };
  }, []);

  function canvasPos(e: React.MouseEvent<HTMLCanvasElement>) {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 pt-3 pb-1 shrink-0">
        <div className="text-[10px] font-mono text-[#94A3B8] uppercase tracking-[0.08em]">
          Pipeline
        </div>
      </div>

      <div ref={containerRef} className="flex-1 px-4 min-h-0 relative">
        <canvas
          ref={canvasRef}
          style={{ cursor: "default" }}
          onMouseDown={(e) => {
            const { x, y } = canvasPos(e);
            const n = getNodeAt(graphRef.current, x, y);
            if (n) {
              dragRef.current = { id: n.id, ox: x - n.x, oy: y - n.y, moved: false };
              canvasRef.current!.style.cursor = "grabbing";
            }
          }}
          onMouseMove={(e) => {
            const { x, y } = canvasPos(e);
            if (dragRef.current) {
              dragRef.current.moved = true;
              const n = graphRef.current.nodes.get(dragRef.current.id);
              if (n) {
                const nx = Math.max(n.r, Math.min(W - n.r, x - dragRef.current.ox));
                const ny = Math.max(n.r, Math.min(hRef.current - n.r, y - dragRef.current.oy));
                n.x = nx; n.y = ny;
                n.px = nx; n.py = ny;
              }
            } else {
              const hit = getNodeAt(graphRef.current, x, y);
              canvasRef.current!.style.cursor = hit ? "grab" : "default";
            }
          }}
          onMouseUp={(e) => {
            if (dragRef.current) {
              const { id, moved } = dragRef.current;
              const n = graphRef.current.nodes.get(id);
              if (n) { n.tx = n.x; n.ty = n.y; }
              dragRef.current = null;
              canvasRef.current!.style.cursor = "default";

              // Click (no drag) on sandbox node → toggle tooltip
              if (!moved && n?.type === "sandbox") {
                const { x, y } = canvasPos(e);
                setTooltip((prev) =>
                  prev?.node.id === id ? null : { node: { ...n }, cx: x, cy: y }
                );
              } else if (!moved) {
                setTooltip(null);
              }
            }
          }}
          onMouseLeave={() => {
            if (dragRef.current) {
              const n = graphRef.current.nodes.get(dragRef.current.id);
              if (n) { n.tx = n.x; n.ty = n.y; }
              dragRef.current = null;
            }
            if (canvasRef.current) canvasRef.current.style.cursor = "default";
          }}
        />

        {/* Sandbox click popup — rich context-aware info card */}
        {tooltip && (() => {
          const { node } = tooltip;
          const info = MODEL_FULL[node.model ?? ""];
          const ctx = node.executionContext ?? (node.gpu ? "modal-gpu" : "modal-cpu");
          const elapsed = node.doneT && node.spawnT
            ? ((node.doneT - node.spawnT) / 1000).toFixed(1) + "s"
            : node.status === "sandbox" ? "running…" : null;

          const isGpu     = ctx === "modal-gpu";
          const isBrowser = ctx === "browser";

          const accent  = isGpu ? "#7c3aed" : isBrowser ? "#059669" : "#0891B2";
          const bandBg  = isGpu ? "#faf5ff" : isBrowser ? "#f0fdf4" : "#f0fdfa";
          const bandBdr = isGpu ? "#e9d5ff" : isBrowser ? "#bbf7d0" : "#99f6e4";
          const tagBg   = isGpu ? "#ede9fe" : isBrowser ? "#dcfce7" : "#ccfbf1";
          const tagText = isGpu ? "#6d28d9" : isBrowser ? "#15803d" : "#0e7490";

          const headerLabel = isGpu
            ? "⚡ Modal GPU Sandbox"
            : isBrowser
            ? "🌐 Runs in Your Browser"
            : "☁ Modal CPU Sandbox";

          return (
            <div
              className="absolute z-20 w-72 bg-white rounded-xl shadow-xl overflow-hidden text-[11px]"
              style={{
                left: Math.min(tooltip.cx + 10, W - 296),
                top: Math.max(tooltip.cy - 60, 4),
                border: `1px solid ${bandBdr}`,
              }}
            >
              {/* Header band */}
              <div
                className="flex items-center justify-between px-3 py-2"
                style={{ background: bandBg, borderBottom: `1px solid ${bandBdr}` }}
              >
                <span className="font-semibold text-[12px]" style={{ color: accent }}>
                  {headerLabel}
                </span>
                {isGpu && node.gpuName && (
                  <span className="text-[10px] font-mono ml-2 shrink-0" style={{ color: accent }}>
                    {node.gpuName}
                  </span>
                )}
              </div>

              <div className="p-3 space-y-2">
                {/* Model name */}
                <div className="font-semibold text-[#1E293B] text-[12px]">
                  {info?.name ?? node.label}
                </div>

                {/* Why triggered */}
                {info?.why && (
                  <div className="leading-snug" style={{ color: accent }}>{info.why}</div>
                )}

                {/* What it does */}
                {info?.what && (
                  <div className="text-[#64748B] leading-snug">{info.what}</div>
                )}

                {/* Browser: PT Camera CTA */}
                {isBrowser && (
                  <button
                    className="w-full text-left text-[11px] font-medium rounded-lg px-2.5 py-1.5 transition-colors"
                    style={{
                      background: tagBg,
                      border: `1px solid ${bandBdr}`,
                      color: tagText,
                    }}
                    onClick={() => {
                      useAppStore.getState().setActiveRoom("pt-studio");
                      setTooltip(null);
                    }}
                  >
                    → Open PT Camera to run live pose tracking
                  </button>
                )}

                {/* Packages */}
                {node.packages && node.packages.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {node.packages.map((pkg) => (
                      <span key={pkg} className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-[#F1F5F9] text-[#475569]">
                        {pkg}
                      </span>
                    ))}
                  </div>
                )}

                {/* Footer: context badge + elapsed */}
                <div className="flex items-center justify-between pt-0.5">
                  <span
                    className="px-2 py-0.5 rounded-full text-[10px] font-mono"
                    style={{ background: tagBg, color: tagText }}
                  >
                    {isGpu ? `GPU · ${node.gpuTier ?? "A10G"}` : isBrowser ? "browser" : "CPU"}
                  </span>
                  {elapsed && (
                    <span className="text-[#94A3B8] font-mono text-[10px]">{elapsed}</span>
                  )}
                </div>
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}
