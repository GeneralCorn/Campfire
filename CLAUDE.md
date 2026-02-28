# Campfire (AgentFM)

AI team collaboration platform — three agents (Mika, Rune, Sage) work together via turn-based SSE streaming with voice synthesis.

## Stack

- **Frontend:** Next.js 16 (App Router) + React 19 + Zustand + Tailwind CSS 4
- **Backend:** Modal (serverless Python) + Claude Sonnet/Haiku (Anthropic)
- **Memory:** Supermemory (per-agent + shared context)
- **Voice:** ElevenLabs TTS (from Next.js API routes)
- **Sprites:** FLUX Sprites LoRA via Replicate API

## Quick Start

```bash
# Frontend
cd frontend && npm install && npm run dev  # localhost:3000

# Backend
cd backend && modal deploy app.py

# Sprites (requires Replicate credit)
cd frontend && node scripts/generate-sprites.mjs --res=64
# Paid Replicate: add --concurrency=20 for parallel generation
```

## Environment Variables

Copy `.env.example` to `frontend/.env.local`:

| Variable | Where | Purpose |
|----------|-------|---------|
| `MODAL_ENDPOINT_URL` | frontend/.env.local | Deployed Modal agent endpoint |
| `ELEVENLABS_API_KEY` | frontend/.env.local | TTS voice synthesis |
| `SUPERMEMORY_API_KEY` | frontend/.env.local | Agent memory persistence |
| `REPLICATE_API_KEY` | frontend/.env.local | Sprite generation |
| `ANTHROPIC_API_KEY` | Modal secrets only | Claude models (`modal secret create agentfm-secrets`) |

## Project Structure

```
backend/
  app.py              # Modal function: agent_respond() — two-layer (Sonnet task + Haiku voice)
  config.py            # Teammate configs (personality, prompts, voice IDs). Add teammate = add dict.
  memory.py            # Supermemory client wrapper

frontend/src/
  app/
    globals.css        # Tailwind v4 inline theme (colors, animations, scanlines)
    api/
      team-chat/route.ts   # SSE orchestrator — decides turn order, calls Modal, streams events
      hangout/route.ts     # 1:1 agent chat endpoint
      memories/route.ts    # Memory fetch (stubbed)
  components/
    team-room/         # Main view: TeammateStage, Avatar, ChatArea, TaskInput, VuMeter
    layout/            # AppShell (4-column grid), ServerBar, ChannelSidebar, RightPanel
    hangout/           # 1:1 chat view
    sandbox/           # Agent action logs
    memories/          # Memory browser
  stores/
    useAppStore.ts     # Single Zustand store (all app state)
  hooks/
    useSSE.ts          # SSE event parser + store dispatcher
    useDemo.ts         # Auto-play demo sequence on first load
  lib/
    teammates.ts       # Agent metadata (id, name, badge, colorHex, voiceId)
    sprite-config.ts   # Sprite animation config (frames, duration, loop mode per state)
    demo-sequence.ts   # Scripted 8-turn demo conversation
    channels.ts        # Channel definitions
  types/
    index.ts           # TeammateId, TeammateState, Message, SSEEvent, etc.

frontend/scripts/
  generate-sprites.mjs # FLUX Sprites LoRA generation (sequential or parallel)

frontend/public/sprites/
  {resolution}/{agentId}/{state}_{frame}.png   # e.g. 64/mika/idle_0.png
```

## Architecture Decisions

### SSE Streaming (not WebSockets)
Next.js API routes stream `data: {JSON}\n\n` events. Client parses via `ReadableStream.getReader()`. Events: `thinking`, `task_result`, `voice_chunk`, `memory_node`, `turn_end`, `complete`.

### Two-Layer Agent Response
Each turn calls Modal twice: **Sonnet** for the heavy task (thinking + result + action + memory), then **Haiku** to distill into 2-3 spoken sentences for TTS.

### Turn Order
Decided by keyword matching in `team-chat/route.ts`: research keywords → Mika first, review keywords → Rune first, planning → Sage first. Default task order cycles all three with multiple rounds.

### Sprite System
Config-driven in `sprite-config.ts`. Each agent has 3 states (idle/thinking/talking) × 4 frames. Avatar.tsx cycles frames via `setInterval` using the config's `frameDuration` and `loop` mode (loop or pingpong). Falls back to text badges if sprites don't exist.

### State Management
Single Zustand store. No Redux. Direct `set()` mutations. Selectors in components: `useAppStore((s) => s.field)`.

## Teammate System

| Agent | Role | Color | Trigger Keywords |
|-------|------|-------|-----------------|
| Mika | The Finder | #4ECDC4 (teal) | research, find, search, explore, dig |
| Rune | The Skeptic | #FF6B6B (coral) | review, check, validate, analyze, critique |
| Sage | The Builder | #FFE66D (gold) | summarize, plan, decide, synthesize, strategy |

Adding a new teammate: add config dict in `backend/config.py`, entry in `frontend/src/lib/teammates.ts`, entry in `frontend/src/lib/sprite-config.ts`, update `TeammateId` union in `types/index.ts`.

## Conventions

- **Tailwind v4** — theme defined inline in `globals.css` via `@theme inline`, not `tailwind.config.js`
- **React 19 compiler** enabled (`reactCompiler: true` in next.config.ts)
- **Path alias** `@/*` → `./src/*`
- **No separate API client library** — fetch calls in API routes directly
- **Fonts:** Outfit (sans), Space Mono (mono)
- Dark theme only. Charcoal backgrounds (#0a0a0a → #1f1f1f). No blue tint.

## Common Tasks

**Modify agent personality:** Edit the config dict in `backend/config.py`. System prompt, voice guidance, and relationships are all in one place.

**Change colors/animations:** Edit `frontend/src/app/globals.css` theme block.

**Add demo steps:** Append to the array in `frontend/src/lib/demo-sequence.ts`.

**Regenerate sprites for one agent:** `node scripts/generate-sprites.mjs --agent=mika --res=64`

**Test without backend:** The demo auto-plays on first load with no API calls needed.
