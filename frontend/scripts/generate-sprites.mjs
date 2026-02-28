import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Config — mirrors sprite-config.ts (source of truth for prompts) ─
const AGENTS = {
  mika: {
    base: "tiny cute teal robot girl, round head, small antenna, glowing cyan eyes, teal body",
    states: {
      idle: [
        "browsing tiny holographic screen, antenna left",
        "screen dimmed, antenna centered, eyes half-closed",
        "swiping on screen, antenna right",
        "screen bright, antenna centered, eyes wide curious",
      ],
      thinking: [
        "typing rapidly on floating keyboard, antenna dim",
        "typing faster, antenna bright, eyes focused",
        "paused typing, antenna sparking, squinting at code",
        "eureka moment, antenna pulsing, lightbulb above head",
      ],
      talking: [
        "mouth open, gesturing right hand, excited discovery",
        "mouth closed, both hands up showing data, sparkles",
        "mouth wide, leaning forward enthusiastic, antenna bright",
        "big smile, pointing at chart, antenna wagging",
      ],
      interrupted: [
        "startled, screen glitching static, antenna jolts up",
        "eyes wide, screen flickering, hands pulled back",
        "screen cracking apart, antenna sparking, surprised",
        "screen reforming, antenna settling, blinking confused",
      ],
      reacting: [
        "nodding along, small smile, antenna bobbing",
        "leaning in interested, antenna tilted forward",
        "nodding faster, taking notes on screen, engaged",
        "slight head tilt, antenna perked, listening intently",
      ],
      agreeing: [
        "jumping excitedly, eyes sparkling, antenna spinning",
        "fist pump, screen showing checkmark, antenna bright",
        "clapping hands, sparkle burst, huge smile",
        "bouncing on feet, heart eyes, antenna glowing max",
      ],
    },
  },
  rune: {
    base: "small angular red robot, sharp visor, mechanical arms, coral red body, tough looking",
    states: {
      idle: [
        "arms crossed, standing cool, visor dim glow",
        "arms crossed, lean left, visor flicker",
        "arms crossed, head tilted, visor steady scan",
        "arms crossed, weight shift right, visor pulse",
      ],
      thinking: [
        "stroking chin, visor scanning left, analyzing",
        "hand on chin, visor scanning right, processing",
        "arms uncrossed examining hologram, visor bright",
        "one eye glowing intense, hand raised, breakthrough",
      ],
      talking: [
        "pointing forward assertive, mouth open, bold stance",
        "gesturing both mechanical hands, visor bright red",
        "one fist raised making point, commanding",
        "hands spread wide explaining, visor flashing",
      ],
      interrupted: [
        "eyebrow raised, visor flash white, caught off guard",
        "arms uncrossing reflexive, visor flickering, annoyed",
        "head snapping to look, visor red alert, defensive",
        "settling back, visor dimming, re-crossing arms, grumpy",
      ],
      reacting: [
        "skeptical side-eye, arms crossed, visor narrowed",
        "slight head shake, visor scanning, unconvinced",
        "grudging nod, one arm uncrossed, visor steady",
        "chin up assessing, visor analyzing, reserved",
      ],
      agreeing: [
        "shaking head firmly, visor red flash, arms rejecting",
        "crossing arms tighter, visor angry, disapproval",
        "hand up stop gesture, visor flaring, flagging issue",
        "turning away, visor dimming, arms folded, done",
      ],
    },
  },
  sage: {
    base: "round wise gold robot, single large yellow lens eye, small floating orbs, gold body, calm",
    states: {
      idle: [
        "writing floating notebook, orbs orbit slowly, lens dim",
        "notebook lowered, orbs paused, lens steady warm",
        "looking up from notebook, orbs drifting, lens warm",
        "notebook raised, orbs close together, lens bright",
      ],
      thinking: [
        "looking upward, orbs spinning fast, lens brightening",
        "eyes closed, orbs triangle formation, lens pulsing",
        "head tilted, orbs aligned vertical, lens deep focus",
        "orbs scattered wide, lens very bright, contemplating",
      ],
      talking: [
        "presenting one hand, charts floating, calm gesture",
        "both hands out, orbs highlighting points, lens warm",
        "decisive nod, orbs neat row, lens golden flash",
        "gentle hand wave, orbs orbiting, wise expression",
      ],
      interrupted: [
        "pen dropping, orbs scattering outward, lens unfocus",
        "hands pulling back, orbs frozen, lens dim",
        "notebook closing, orbs slowly regrouping, lens refocus",
        "settling, orbs returning orbit, lens steady again",
      ],
      reacting: [
        "taking rapid notes, orbs pulsing, lens on speaker",
        "nodding slowly, pen moving, orbs aligned, attentive",
        "pausing to consider, orbs hovering still, lens bright",
        "writing again, orbs resuming orbit, quiet agreement",
      ],
      agreeing: [
        "decisive nod, lens bright gold flash, orbs snap to line",
        "stamp of approval, orbs pulse gold, lens max glow",
        "pointing notebook checkmark, orbs circling fast",
        "calm confident, orbs crown formation above, lens warm",
      ],
    },
  },
};

// ── Model versions ──────────────────────────────────────────────────
// flux-sprites (miike-ai) — FLUX fine-tuned specifically for sprite/pixel art
// Supports model: "schnell" for fast 4-step inference (~4s/image)
const FLUX_SPRITES_VERSION =
  "bfbaa4240a9948bcc5483cceb9abd73db68c63018a4a7ba5b8a01616d291dcc9";

// Plain FLUX Schnell — fallback, no pixel art LoRA
const FLUX_SCHNELL_VERSION =
  "5599ed30703defd1d160a25a63321b4dec97101d98b4674bcc56e41f62f35637";

const RESOLUTIONS = [64, 128];
const OUT_ROOT = resolve(__dirname, "../public/sprites");

// ── Rate limiting ───────────────────────────────────────────────────
// Free tier: 6 requests/min, burst of 1. We space requests 11s apart.
// Paid tier: use --concurrency=N to run N in parallel (no delay).
const DEFAULT_CONCURRENCY = 1; // sequential for free tier
const FREE_TIER_DELAY_MS = 11_000; // 11s between requests = ~5.4/min

// ── Read API key ────────────────────────────────────────────────────
const envPath = resolve(__dirname, "../.env.local");
if (!existsSync(envPath)) {
  console.error("Missing .env.local file");
  process.exit(1);
}
const envFile = readFileSync(envPath, "utf-8");
const tokenMatch = envFile.match(/REPLICATE_API_(?:KEY|TOKEN)=(.+)/);
if (!tokenMatch) {
  console.error("Missing REPLICATE_API_KEY or REPLICATE_API_TOKEN in .env.local");
  process.exit(1);
}
const TOKEN = tokenMatch[1].trim();

// ── CLI args ────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const agentFilter = args.find((a) => a.startsWith("--agent="))?.split("=")[1];
const resFilter = args.find((a) => a.startsWith("--res="))?.split("=")[1];
const concurrencyArg = args.find((a) => a.startsWith("--concurrency="))?.split("=")[1];
const usePlainFlux = args.includes("--plain"); // skip sprite LoRA, use vanilla FLUX Schnell
const CONCURRENCY = concurrencyArg ? parseInt(concurrencyArg) : DEFAULT_CONCURRENCY;

// ── Replicate API helpers ───────────────────────────────────────────
async function createPrediction(prompt, retries = 3) {
  const useSpriteLora = !usePlainFlux;

  for (let attempt = 0; attempt < retries; attempt++) {
    const body = useSpriteLora
      ? {
          // flux-sprites: FLUX fine-tuned for pixel/sprite art
          version: FLUX_SPRITES_VERSION,
          input: {
            prompt,
            model: "schnell",           // fast 4-step inference
            go_fast: true,              // fp8 quantization
            num_outputs: 1,
            aspect_ratio: "1:1",
            output_format: "png",
            output_quality: 90,
            num_inference_steps: 4,
            guidance_scale: 3,
          },
        }
      : {
          // Plain FLUX Schnell (no LoRA)
          version: FLUX_SCHNELL_VERSION,
          input: {
            prompt,
            num_outputs: 1,
            aspect_ratio: "1:1",
            output_format: "png",
            output_quality: 90,
            go_fast: true,
          },
        };

    const res = await fetch("https://api.replicate.com/v1/predictions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        "Content-Type": "application/json",
        Prefer: "respond-async",
      },
      body: JSON.stringify(body),
    });

    if (res.ok) return res.json();

    const text = await res.text();

    if (res.status === 429) {
      const retryAfter = parseInt(text.match(/~(\d+)s/)?.[1] || "12");
      console.log(`    ⏳ rate limited, waiting ${retryAfter}s (attempt ${attempt + 1}/${retries})...`);
      await new Promise((r) => setTimeout(r, retryAfter * 1000));
      continue;
    }

    throw new Error(`Replicate API error ${res.status}: ${text}`);
  }
  throw new Error("Max retries exceeded (rate limited)");
}

async function pollPrediction(id) {
  while (true) {
    const res = await fetch(`https://api.replicate.com/v1/predictions/${id}`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    const data = await res.json();
    if (data.status === "succeeded") return data.output;
    if (data.status === "failed" || data.status === "canceled") {
      throw new Error(`Prediction ${id} ${data.status}: ${data.error}`);
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
}

async function downloadImage(url, filepath) {
  const res = await fetch(url);
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(filepath, buf);
}

// ── Frame generation ────────────────────────────────────────────────
async function generateFrame(agentId, state, frameIdx, prompt, resolution) {
  const tag = `${agentId}/${state}_${frameIdx} @${resolution}`;
  const start = Date.now();

  const fullPrompt = `pixel art sprite, ${resolution}x${resolution}, retro game character, single centered character on pure black background, ${prompt}. Clean pixel edges, limited palette, no text, no UI.`;

  const pred = await createPrediction(fullPrompt);
  if (pred.error) throw new Error(`${tag}: ${pred.error}`);

  const output = await pollPrediction(pred.id);
  const url = Array.isArray(output) ? output[0] : output;

  const dir = resolve(OUT_ROOT, `${resolution}/${agentId}`);
  mkdirSync(dir, { recursive: true });

  const filepath = resolve(dir, `${state}_${frameIdx}.png`);
  await downloadImage(url, filepath);

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`  ✓ ${tag} (${elapsed}s)`);
  return { tag, elapsed };
}

// ── Main ────────────────────────────────────────────────────────────
async function main() {
  const agents = agentFilter
    ? { [agentFilter]: AGENTS[agentFilter] }
    : AGENTS;

  if (agentFilter && !AGENTS[agentFilter]) {
    console.error(`Unknown agent: ${agentFilter}`);
    process.exit(1);
  }

  const resolutions = resFilter
    ? [parseInt(resFilter)]
    : RESOLUTIONS;

  // Build job list
  const jobs = [];
  for (const [agentId, agent] of Object.entries(agents)) {
    for (const res of resolutions) {
      for (const [state, prompts] of Object.entries(agent.states)) {
        for (let i = 0; i < prompts.length; i++) {
          const fullPrompt = `${agent.base}, ${prompts[i]}`;
          jobs.push({ agentId, state, frameIdx: i, prompt: fullPrompt, resolution: res });
        }
      }
    }
  }

  const modelName = usePlainFlux ? "FLUX Schnell (plain)" : "FLUX Sprites LoRA (schnell mode)";
  console.log(`Model: ${modelName}`);
  console.log(
    `Generating ${jobs.length} frames across ${Object.keys(agents).length} agent(s) at ${resolutions.join("+")}px`
  );
  console.log(`Concurrency: ${CONCURRENCY} (use --concurrency=N to change)\n`);

  const globalStart = Date.now();
  const results = [];

  if (CONCURRENCY <= 1) {
    // Sequential mode with delay — works on free tier
    for (let i = 0; i < jobs.length; i++) {
      const job = jobs[i];
      console.log(`  [${i + 1}/${jobs.length}]`);
      try {
        const r = await generateFrame(job.agentId, job.state, job.frameIdx, job.prompt, job.resolution);
        results.push({ status: "fulfilled", value: r });
      } catch (e) {
        results.push({ status: "rejected", reason: e });
        console.error(`  ✗ ${e.message}`);
      }
      // Delay between creation calls to stay under rate limit
      if (i < jobs.length - 1) {
        await new Promise((r) => setTimeout(r, FREE_TIER_DELAY_MS));
      }
    }
  } else {
    // Parallel mode for paid accounts — fire all at once with concurrency limit
    let active = 0;
    const queue = [...jobs];
    const running = [];

    function launchNext() {
      while (active < CONCURRENCY && queue.length > 0) {
        active++;
        const job = queue.shift();
        const p = generateFrame(job.agentId, job.state, job.frameIdx, job.prompt, job.resolution)
          .then((v) => results.push({ status: "fulfilled", value: v }))
          .catch((e) => {
            results.push({ status: "rejected", reason: e });
            console.error(`  ✗ ${e.message}`);
          })
          .finally(() => { active--; launchNext(); });
        running.push(p);
      }
    }

    launchNext();
    await Promise.all(running);
  }

  const succeeded = results.filter((r) => r.status === "fulfilled").length;
  const failed = results.filter((r) => r.status === "rejected");

  const totalElapsed = ((Date.now() - globalStart) / 1000).toFixed(1);
  console.log(`\n═══ Done in ${totalElapsed}s — ${succeeded}/${jobs.length} frames ok ═══`);

  if (failed.length > 0) {
    console.error(`\n${failed.length} frame(s) failed:`);
    failed.forEach((f) => console.error(`  ✗ ${f.reason.message}`));
  }

  console.log(`\nSprites saved to: ${OUT_ROOT}/`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
