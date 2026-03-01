"use client";

import { useEffect, useRef } from "react";
import { useAppStore } from "@/stores/useAppStore";
import { teammates } from "@/lib/teammates";
import { Activity } from "lucide-react";
import type { PipelineNodeId, PipelineNodeStatus, TeammateId } from "@/types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const W = 308;
const H = 300;
const CORE_R = 22;
const SAT_R = 13;
const ORBIT_R = 52;

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

const TARGETS: Record<string, [number, number]> = {
  router: [W / 2, 44],
  maya: [58, 155],
  rex: [W / 2, 155],
  sol: [W - 58, 155],
  synthesize: [W / 2, 260],
};

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
  spawnT?: number;
  doneT?: number;
  startedAt?: number;
  completedAt?: number;
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
  for (const id of ["router", "maya", "rex", "sol", "synthesize"]) {
    const [tx, ty] = TARGETS[id];
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
function simulate(g: GState) {
  const DAMP = 0.9;
  const SPRING = 0.025;
  const REPULSE = 600;
  const MAX_DIST_SQ = 90 * 90;

  for (const n of g.nodes.values()) {
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
    n.y = Math.max(n.r, Math.min(H - n.r, n.y));
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

        // Extract detail from entry text
        const hasGpu = sp.text.includes("GPU");
        const pkgMatch = sp.text.match(/\(([^)]+)\)/);
        const detail = pkgMatch ? pkgMatch[1] : "";

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
          r: SAT_R,
          color: "#a855f7",
          label: detail.split(",")[0]?.trim().split(" ")[0] || "SB",
          status: "sandbox",
          gpu: hasGpu,
          spawnT: Date.now(),
        });

        g.edges.push({ from: agent, to: satId, type: "tether" });

        // Tether particles
        const edge = g.edges[g.edges.length - 1];
        g.dots.push({ edge, t: 0, speed: 0.012 });
        g.dots.push({ edge, t: 0.5, speed: 0.012 });
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
function render(ctx: CanvasRenderingContext2D, g: GState) {
  ctx.clearRect(0, 0, W, H);

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
      ctx.strokeStyle = to.status === "done" ? "rgba(48,240,96,0.2)" : "rgba(168,85,247,0.3)";
      ctx.setLineDash([3, 3]);
      ctx.lineWidth = 1;
    } else if (toDone) {
      ctx.strokeStyle = "rgba(48,240,96,0.2)";
      ctx.setLineDash([]);
      ctx.lineWidth = 1.5;
    } else if (fromDone && toActive) {
      ctx.strokeStyle = "rgba(240,160,48,0.35)";
      ctx.setLineDash([6, 4]);
      ctx.lineDashOffset = -g.tick * 0.5;
      ctx.lineWidth = 1.5;
    } else {
      ctx.strokeStyle = "rgba(255,255,255,0.06)";
      ctx.setLineDash([]);
      ctx.lineWidth = 1;
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
    ctx.fillStyle = d.edge.type === "tether" ? "#a855f7" : "#f0a030";
    ctx.globalAlpha = 0.75;
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  // 3. Glows
  for (const n of g.nodes.values()) {
    const isActive = n.status === "running" || n.status === "sandbox";
    const isDone = n.status === "done";
    if (!isActive && !isDone) continue;

    const [r, green, b] = isDone ? [48, 240, 96] : hexToRgb(n.color);
    const pulse = isActive ? 0.25 + 0.12 * Math.sin(g.tick * 0.05) : 0.15;
    const grad = ctx.createRadialGradient(n.x, n.y, n.r * 0.5, n.x, n.y, n.r * 2.5);
    grad.addColorStop(0, `rgba(${r},${green},${b},${pulse})`);
    grad.addColorStop(1, `rgba(${r},${green},${b},0)`);
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

    // Scale-in for sandbox satellites
    let dr = n.r;
    if (n.type === "sandbox" && n.spawnT) {
      const elapsed = Date.now() - n.spawnT;
      const t = Math.min(1, elapsed / 350);
      dr = n.r * easeOutBack(t);
    }

    // Fill
    ctx.beginPath();
    ctx.arc(n.x, n.y, dr, 0, Math.PI * 2);
    if (isActive) {
      ctx.fillStyle = n.color + "20";
    } else if (isDone) {
      ctx.fillStyle = n.color + "12";
    } else {
      ctx.fillStyle = "rgba(255,255,255,0.03)";
    }
    ctx.fill();

    // Border
    ctx.beginPath();
    ctx.arc(n.x, n.y, dr, 0, Math.PI * 2);
    ctx.strokeStyle = isPending ? "rgba(255,255,255,0.1)" : n.color;
    ctx.lineWidth = isActive ? 2 : 1;
    ctx.stroke();

    // Spinner arc for running
    if (n.status === "running") {
      ctx.beginPath();
      const a = g.tick * 0.08;
      ctx.arc(n.x, n.y, dr + 4, a, a + Math.PI * 0.65);
      ctx.strokeStyle = n.color;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    // Container ring for sandbox
    if (isSandbox) {
      ctx.beginPath();
      const a1 = g.tick * 0.04;
      ctx.arc(n.x, n.y, dr + 4, a1, a1 + Math.PI * 0.4);
      ctx.strokeStyle = "#a855f7";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(n.x, n.y, dr + 4, a1 + Math.PI, a1 + Math.PI + Math.PI * 0.4);
      ctx.stroke();
    }

    // GPU badge
    if (n.type === "sandbox" && n.gpu) {
      const bx = n.x + dr * 0.5;
      const by = n.y - dr - 5;
      ctx.beginPath();
      ctx.roundRect(bx, by, 20, 10, 3);
      ctx.fillStyle = "#a855f7cc";
      ctx.fill();
      ctx.font = "bold 6px monospace";
      ctx.textAlign = "center";
      ctx.fillStyle = "#fff";
      ctx.fillText("GPU", bx + 10, by + 7.5);
    }
  }

  // 5. Labels
  for (const n of g.nodes.values()) {
    const isPending = n.status === "pending";
    const isDone = n.status === "done";

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    if (n.type === "core") {
      ctx.font = "bold 10px monospace";
      ctx.fillStyle = isPending ? "rgba(255,255,255,0.25)" : n.color;
      ctx.fillText(n.label, n.x, n.y - 3);

      // Sub-label
      ctx.font = "400 7px monospace";
      if (isDone && n.startedAt && n.completedAt) {
        ctx.fillStyle = "rgba(48,240,96,0.6)";
        ctx.fillText(((n.completedAt - n.startedAt) / 1000).toFixed(1) + "s", n.x, n.y + 9);
      } else if (n.detail && (n.status === "running" || n.status === "sandbox")) {
        ctx.fillStyle = n.color + "80";
        const d = n.detail.length > 14 ? n.detail.slice(0, 14) + "…" : n.detail;
        ctx.fillText(d, n.x, n.y + 9);
      }
    } else {
      // Sandbox satellite label
      ctx.font = "bold 7px monospace";
      ctx.fillStyle = n.status === "done" ? "rgba(48,240,96,0.7)" : "#a855f7aa";
      const lbl = n.label.length > 8 ? n.label.slice(0, 8) : n.label;
      ctx.fillText(lbl, n.x, n.y + 1);
    }
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function PipelineGraph() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const graphRef = useRef<GState>(createGraph());
  const rafRef = useRef<number>(0);
  const logRef = useRef<HTMLDivElement>(null);

  // For activity log only (React re-render)
  const sandboxEntries = useAppStore((s) => s.sandboxEntries);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [sandboxEntries.length]);

  // Animation loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;
    ctx.scale(dpr, dpr);

    function tick() {
      const g = graphRef.current;
      syncFromStore(g);
      simulate(g);
      g.tick++;
      render(ctx!, g);
      rafRef.current = requestAnimationFrame(tick);
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  const recentEntries = sandboxEntries.slice(-12);

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 pt-3 pb-1">
        <div className="text-[10px] font-mono text-text-dim uppercase tracking-[0.08em]">
          Pipeline
        </div>
      </div>

      <div className="px-4 shrink-0">
        <canvas
          ref={canvasRef}
          style={{ width: W, height: H }}
        />
      </div>

      <div className="border-t border-white/[0.06] mx-4 mt-1" />

      <div className="flex-1 flex flex-col min-h-0">
        <div className="flex items-center gap-2 px-4 py-2 shrink-0">
          <Activity size={12} className="text-text-dim" />
          <span className="text-[10px] font-mono text-text-dim uppercase tracking-[0.08em]">
            Activity
          </span>
          {recentEntries.length > 0 && (
            <span className="text-[9px] font-mono text-text-dim/50">
              ({sandboxEntries.length})
            </span>
          )}
        </div>
        <div ref={logRef} className="flex-1 overflow-y-auto px-4 pb-2">
          {recentEntries.length === 0 ? (
            <p className="text-[10px] text-text-dim italic">Waiting for pipeline...</p>
          ) : (
            <div className="space-y-0.5">
              {recentEntries.map((entry) => {
                const t = teammates[entry.teammateId as TeammateId];
                const isError = entry.text.startsWith("ERROR:");
                return (
                  <div key={entry.id} className="text-[10px] font-mono leading-tight">
                    <span style={{ color: isError ? "#ff4444" : (t?.colorHex ?? "#888") }} className="font-bold">
                      {isError ? "Error" : (t?.name ?? entry.teammateId)}
                    </span>{" "}
                    <span className={isError ? "text-red-400/70" : "text-text-dim"}>{entry.text}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
