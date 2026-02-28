import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, "../public/sprites");
mkdirSync(OUT_DIR, { recursive: true });

// Read API key from .env.local
const envFile = readFileSync(resolve(__dirname, "../.env.local"), "utf-8");
const tokenMatch = envFile.match(/REPLICATE_API_(?:KEY|TOKEN)=(.+)/);
if (!tokenMatch) {
  console.error("Missing REPLICATE_API_KEY in .env.local");
  process.exit(1);
}
const TOKEN = tokenMatch[1].trim();

// FLUX Schnell — ~3s per image, great pixel art with good prompts
const MODEL_VERSION = "5599ed30703defd1d160a25a63321b4dec97101d98b4674bcc56e41f62f35637";

const TEAMMATES = {
  mika: {
    base: "tiny cute teal robot girl, round head, small antenna, glowing cyan eyes, teal accent color",
    states: {
      idle:        "browsing a small holographic screen, relaxed stance",
      thinking:    "typing rapidly on floating keyboard, focused squinting eyes",
      talking:     "gesturing excitedly with both hands, mouth open, small energy sparkles",
      interrupted: "startled expression, screen glitching, hands up in surprise",
      reacting:    "nodding along, leaning forward listening, small smile",
      agreeing:    "jumping excitedly, eyes bright, sparkle effects around head",
    },
  },
  rune: {
    base: "small angular red robot, sharp visor, mechanical arms, coral red accent color, tough looking",
    states: {
      idle:        "arms crossed, standing cool, slight lean, confident",
      thinking:    "stroking chin with one hand, one eye glowing brighter",
      talking:     "pointing forward assertively, mouth open speaking, bold pose",
      interrupted: "raising one eyebrow, visor flash, leaning back surprised",
      reacting:    "skeptical side-eye, arms still crossed, slight head tilt",
      agreeing:    "shaking head disapprovingly, visor red flash, arms out",
    },
  },
  sage: {
    base: "round wise gold robot, single large yellow lens eye, small floating orbs, gold accent color, calm",
    states: {
      idle:        "writing in floating notebook, calm posture, orbs orbiting slowly",
      thinking:    "looking upward, orbs spinning faster, lens eye brightening",
      talking:     "presenting with one hand, charts floating nearby, measured gesture",
      interrupted: "putting pen down, orbs scattered, lens refocusing",
      reacting:    "taking notes rapidly, nodding, orbs pulsing gently",
      agreeing:    "decisive nod, lens bright gold flash, orbs aligned in a row",
    },
  },
};

async function createPrediction(prompt) {
  const res = await fetch("https://api.replicate.com/v1/predictions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      version: MODEL_VERSION,
      input: {
        prompt,
        num_outputs: 1,
        aspect_ratio: "1:1",
        output_format: "png",
        output_quality: 90,
      },
    }),
  });
  return res.json();
}

async function pollPrediction(id) {
  while (true) {
    const res = await fetch(`https://api.replicate.com/v1/predictions/${id}`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    const data = await res.json();
    if (data.status === "succeeded") return data.output;
    if (data.status === "failed" || data.status === "canceled") {
      throw new Error(`${id} ${data.status}: ${data.error}`);
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
}

async function downloadImage(url, filepath) {
  const res = await fetch(url);
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(filepath, buf);
}

async function generate(teammateId, stateId, prompt) {
  const tag = `${teammateId}_${stateId}`;
  process.stdout.write(`  ${tag}...`);
  const pred = await createPrediction(prompt);
  if (pred.error) throw new Error(`${tag}: ${pred.error}`);
  const output = await pollPrediction(pred.id);
  const url = Array.isArray(output) ? output[0] : output;
  const path = resolve(OUT_DIR, `${tag}.png`);
  await downloadImage(url, path);
  console.log(" ok");
}

async function main() {
  console.log("Generating 18 pixel art sprites with FLUX Schnell\n");

  // Run all 3 teammates in parallel, states sequential per teammate
  const jobs = Object.entries(TEAMMATES).map(async ([id, tm]) => {
    console.log(`[${id}]`);
    for (const [state, action] of Object.entries(tm.states)) {
      const prompt = `pixel art sprite, 64x64, retro game character, single centered character on pure black background, ${tm.base}, ${action}. Clean pixel edges, limited palette, no text, no UI.`;
      await generate(id, state, prompt);
    }
    console.log();
  });

  await Promise.all(jobs);
  console.log("Done! 18 sprites in public/sprites/");
}

main().catch((e) => { console.error(e); process.exit(1); });
