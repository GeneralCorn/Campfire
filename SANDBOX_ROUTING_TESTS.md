# Sandbox Routing Tests

How to verify that routing decisions in `lab_graph.py` actually spin up Modal sandboxes.

## How routing works

The `router_node` calls Claude with the user's query and sets four boolean flags:

| Flag | Sandbox triggered | Agent | Image |
|---|---|---|---|
| `needs_vlm` | Maya VLM sandbox (GPU) | maya | `vlm` (Florence-2) |
| `needs_ner` | Maya BioBERT sandbox (CPU) | maya | `biobert` |
| `needs_fda_check` | Maya PubMed sandbox + Rex FDA sandbox | maya + rex | `research` |
| `needs_visualization` | Sol viz sandbox | sol | `viz` |

**Maya's routing** (`lab_graph.py:677`): sandbox if `needs_vlm OR needs_ner OR needs_fda_check`
**Rex's routing** (`lab_graph.py:681`): sandbox if `needs_fda_check`
**Sol's routing** (`lab_graph.py:684`): sandbox if `needs_visualization`

---

## Method 1 — Watch the SSE stream (fastest)

Every sandbox spawn emits a `sandbox_spawn` event before `modal.Sandbox.create()` is called.
Every `text_only` path emits no sandbox events at all.

```bash
curl -s -N -X POST http://localhost:8001/api/lab/run \
  -H "Content-Type: application/json" \
  -d '{"query": "YOUR QUERY HERE", "medications": [], "image": null}' \
  | grep --line-buffered '"event"'
```

**What to look for:**
- `"event": "router_plan"` — shows all four flags the router set
- `"event": "sandbox_spawn"` — confirms a Modal sandbox was created (with `teammate` = maya/rex/sol)
- `"event": "sandbox_complete"` — sandbox ran and returned
- No `sandbox_spawn` = routed to text-only

---

## Method 2 — Check Modal dashboard

Go to **modal.com → generalcorn workspace → Apps → agentfm → Sandboxes**.
A new sandbox entry appears for every `modal.Sandbox.create()` call.

---

## Test Cases

### TC-1: No sandbox (text-only path)

**Query:** `"how do I figure out my prescription"`
**No image, no drug names**

Expected `router_plan`:
```json
{
  "needs_vlm": false,
  "needs_ner": false,
  "needs_fda": false,
  "needs_viz": false
}
```

Expected events: `router_plan`, `thinking` ×3, `voice_text` ×3 — **no `sandbox_spawn`**
Modal dashboard: no new sandbox

---

### TC-2: Rex + Sol sandboxes (drug interaction query)

**Query:** `"what are the interactions between metformin and lisinopril"`
**medications:** `["metformin", "lisinopril"]`

```bash
curl -s -N -X POST http://localhost:8001/api/lab/run \
  -H "Content-Type: application/json" \
  -d '{"query": "what are the interactions between metformin and lisinopril", "medications": ["metformin", "lisinopril"], "image": null}' \
  | grep --line-buffered '"event"'
```

Expected `router_plan`:
```json
{
  "needs_vlm": false,
  "needs_ner": false,
  "needs_fda": true,
  "needs_viz": true
}
```

Expected events (in order):
1. `router_plan`
2. `thinking` (maya)
3. `sandbox_spawn` teammate=maya, packages=["requests"] — PubMed search
4. `sandbox_output` lines from maya
5. `sandbox_complete` teammate=maya
6. `thinking` (rex)
7. `sandbox_spawn` teammate=rex, packages=["requests"] — FDA/RxNorm check
8. `sandbox_output` lines from rex
9. `sandbox_complete` teammate=rex
10. `thinking` (sol)
11. `sandbox_spawn` teammate=sol, packages=["flask","jinja2","matplotlib"] — viz
12. `sandbox_complete` teammate=sol
13. `complete`

Modal dashboard: **3 new sandboxes** (maya=research, rex=research, sol=viz)

---

### TC-3: Maya BioBERT sandbox (clinical text NER)

**Query:** `"Patient was discharged on metformin 500mg twice daily and lisinopril 10mg once daily for hypertension and type 2 diabetes"`
**No medications list** (let BioBERT extract them)

```bash
curl -s -N -X POST http://localhost:8001/api/lab/run \
  -H "Content-Type: application/json" \
  -d '{"query": "Patient was discharged on metformin 500mg twice daily and lisinopril 10mg once daily for hypertension and type 2 diabetes", "medications": [], "image": null}' \
  | grep --line-buffered '"event"'
```

Expected `router_plan`:
```json
{
  "needs_vlm": false,
  "needs_ner": true,
  "needs_fda": true,
  "needs_viz": true
}
```

Expected events:
- `sandbox_spawn` teammate=maya (biobert image, no GPU)
- BioBERT extracts medications from text → updates state
- `sandbox_spawn` teammate=rex (research image, FDA check on extracted meds)
- `sandbox_spawn` teammate=sol (viz image)

Modal dashboard: **3 new sandboxes** — maya=biobert, rex=research, sol=viz

---

### TC-4: Maya VLM sandbox (image upload)

**Requires:** a base64-encoded image of a prescription label

```bash
IMAGE_B64=$(base64 -i /path/to/prescription.jpg)
curl -s -N -X POST http://localhost:8001/api/lab/run \
  -H "Content-Type: application/json" \
  -d "{\"query\": \"what medications are on this prescription\", \"medications\": [], \"image\": \"$IMAGE_B64\"}" \
  | grep --line-buffered '"event"'
```

Expected `router_plan`:
```json
{
  "needs_vlm": true,
  "needs_ner": false,
  "needs_fda": false,
  "needs_viz": false
}
```

Expected events:
- `sandbox_spawn` teammate=maya, **with `"gpu": "T4"` or higher** — VLM runs on GPU
- `sandbox_complete` teammate=maya with Florence-2 output
- No rex or sol sandboxes (unless FDA check is also triggered)

Modal dashboard: **1 new sandbox** with GPU — check the GPU type matches `pick_gpu(model_params_b=0.5)` → should be `T4`

---

## What to check if sandboxes don't appear

1. **Check `router_plan` flags** — if all four are `false`, the router decided text-only is sufficient. The query didn't clearly signal drug safety or clinical text.

2. **Check backend logs** — look for `[ROUTER] Parsed routing JSON:` to see exactly what Claude decided.

3. **Check fallback path** (`lab_graph.py:291-297`) — if Claude's JSON parse fails, it falls back to:
   - `needs_vlm = has_image`
   - `needs_fda = len(medications) >= 1`
   - `needs_ner = False`
   Look for `[ROUTER] Fallback due to:` in logs.

4. **Check Modal auth** — run `modal token list` in the backend shell. If not authenticated, `modal.Sandbox.create()` will throw and the graph will error out before any sandbox spawns.

---

## Interpreting sandbox_complete

```json
{
  "event": "sandbox_complete",
  "teammate": "maya",
  "exit_code": 0,
  "duration_ms": 12450
}
```

- `exit_code: 0` = sandbox ran successfully
- `exit_code: 1` = sandbox code threw an exception (check `sandbox_output` lines above it)
- `duration_ms` = wall time including Modal cold start — first run of an image will be 60-120s longer than subsequent runs due to image build/download
