# Campfire Care Copilot — Session Memory

## Project Overview
Post-acute care voice assistant. Three specialized agents: Medication, Recovery, Emergency.
Stack: Next.js 16 + React 19 frontend, FastAPI + LangGraph backend, Modal cloud for GPU inference.

## Architecture
- **Backend**: `backend/main.py` — LangGraph state machine, FastAPI, FAISS semantic gate
- **Frontend**: `frontend/src/` — Next.js app router, Zustand store, Tailwind CSS v4
- **Modal**: `modal_app/` — Mistral-7B LLM, Qwen2-VL parser, Medication Visualizer

## Key Files
- `backend/main.py` — Main orchestrator, `OrchestrateResponse`, `GraphState`
- `backend/mock_data/discharge_state.json` — Patient discharge data (knee arthroscopy)
- `frontend/src/types/index.ts` — All TypeScript types
- `frontend/src/components/rooms/AgentRoom.tsx` — Per-room chat UI (has been refactored from original)
- `frontend/src/app/globals.css` — CSS animations (visual-enter, card-enter, shimmer, etc.)
- `modal_app/medication_visualizer.py` — NEW: Pillow-based medication schedule image generator

## Medication Visualizer Feature (added this session)
- `modal_app/medication_visualizer.py`: Modal ASGI app, CPU-only, generates PNG via Pillow
  - Endpoint: `POST /visualize` with `{medications, patient_name}`
  - Returns: `{image_base64, schedule[], medication_count}`
  - `_parse_slots()` maps frequency strings to morning/afternoon/evening/night
- Backend: `MODAL_VISUALIZER_URL` env var, `call_medication_visualizer()` runs in parallel with LLM via `asyncio.gather`
- `OrchestrateResponse` has `visual_data: dict | None`
- Frontend: `MedicationVisualizer.tsx` — animated PNG + interactive time-slot tabs + expandable med cards
- `ToolCallBubble` component shows "calling" → "done" sequence to mimic tool-call UX
- Deploy with: `modal deploy modal_app/medication_visualizer.py`, set `MODAL_VISUALIZER_URL` in backend `.env`

## Env Vars Needed
- `MODAL_MEDICAL_LLM_URL` — LLM inference
- `MODAL_VLM_URL` — PDF parser
- `MODAL_VISUALIZER_URL` — Medication visualizer (new)
- `ELEVENLABS_API_KEY`, `DEEPGRAM_API_KEY`

## Frontend Conventions
- Dark theme: bg `#09090b`, surface `#111113`, border `rgba(255,255,255,0.06)`
- Room colors: teal `#14b8a6` (medication), green `#10b981` (recovery), red `#ef4444` (emergency)
- Animations defined in `globals.css`, applied via inline `style.animation`
- No Framer Motion — pure CSS keyframes
- Zustand store in `frontend/src/stores/useAppStore.ts`

## AgentRoom Current State
- Simplified version (not the original voice-orb version from the first read)
- Simple text chat, sends to `/api/orchestrate` with `{user_message, history, discharge_context, active_agent}`
- Note: backend expects `{query}` — mismatch exists, frontend sends richer body
- `AgentRoomId` type added to `frontend/src/types/index.ts`
