# Hearthside

AI team for post-hospital patients — specialized agents that read your prescriptions, check drug interactions, and answer any question about your recovery. Computer vision watches your hands (MediaPipe) and sees you (VLM) to guide exercises and verify form in real time.

## Stack

- **Frontend** — Next.js, Tailwind, AI SDK streaming
- **Agents** — Medication, Recovery, Emergency (FastAPI + LangGraph)
- **Vision** — MediaPipe hand tracking · Florence-2 VLM for prescriptions & exercise form
- **Memory** — ChromaDB for discharge context
