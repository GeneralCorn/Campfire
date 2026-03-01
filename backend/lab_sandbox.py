"""
Modal Sandbox helper for the Medical Lab.
Wraps the Sandbox.create() / exec() / terminate() lifecycle.

Key concepts:
- Sandboxes are ephemeral by default (spin up → run → terminate)
- Images are CACHED by Modal — first run builds, subsequent runs reuse
- GPU sandboxes can run HuggingFace models (VLMs, LLMs, etc.)
- Tunnels expose live web servers from inside sandboxes
"""

import time
from typing import Optional, Callable
from dataclasses import dataclass

import modal


# ---------------------------------------------------------------------------
# Pre-built images with models baked in (cached by Modal after first build)
# ---------------------------------------------------------------------------

# VLM image: has transformers + a small vision-language model pre-downloaded
VLM_IMAGE = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install(
        "transformers>=4.45.0",
        "torch>=2.1.0",
        "torchvision",
        "Pillow",
        "accelerate",
        "requests",
    )
    .run_commands(
        # Pre-download model weights into the image so sandboxes start instantly
        "python -c \"from transformers import AutoProcessor, AutoModelForVision2Seq; "
        "AutoProcessor.from_pretrained('microsoft/Florence-2-base'); "
        "AutoModelForVision2Seq.from_pretrained('microsoft/Florence-2-base')\"",
    )
)

# Research image: for API calls (FDA, PubMed, RxNorm)
RESEARCH_IMAGE = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install("requests", "pandas")
)

# BioBERT image: medical NER + clinical text understanding (CPU — BERT is small)
BIOBERT_IMAGE = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install(
        "transformers>=4.45.0",
        "torch>=2.1.0",
        "requests",
    )
    .run_commands(
        # Pre-download BioBERT NER model (~400MB) so sandbox starts instantly
        "python -c \"from transformers import AutoTokenizer, AutoModelForTokenClassification, pipeline; "
        "AutoTokenizer.from_pretrained('d4data/biomedical-ner-all'); "
        "AutoModelForTokenClassification.from_pretrained('d4data/biomedical-ner-all')\"",
    )
)

# Visualization image: for generating HTML/charts
VIZ_IMAGE = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install("flask", "jinja2", "matplotlib", "requests")
)


# ---------------------------------------------------------------------------
# Result type
# ---------------------------------------------------------------------------

@dataclass
class SandboxResult:
    agent: str = ""
    sandbox_id: str = ""
    stdout: str = ""
    stderr: str = ""
    exit_code: int = -1
    tunnel_url: Optional[str] = None
    duration_ms: int = 0


# ---------------------------------------------------------------------------
# Image registry — agents pick from pre-built images
# ---------------------------------------------------------------------------

IMAGE_REGISTRY = {
    "vlm": VLM_IMAGE,
    "biobert": BIOBERT_IMAGE,
    "research": RESEARCH_IMAGE,
    "viz": VIZ_IMAGE,
}


# ---------------------------------------------------------------------------
# GPU tier selection — pick cheapest GPU that can handle the job
# ---------------------------------------------------------------------------

# Ordered weakest → strongest. Modal bills per-second, so picking the
# minimum viable GPU saves real money.
GPU_TIERS = {
    "T4":   {"vram_gb": 16,  "desc": "Budget inference — small models (<3B params)"},
    "L4":   {"vram_gb": 24,  "desc": "Mid-tier — medium models (3-7B params)"},
    "A10G": {"vram_gb": 24,  "desc": "Balanced — most VLMs and 7B LLMs"},
    "A100": {"vram_gb": 80,  "desc": "Heavy — large models (13-30B params)"},
    "H100": {"vram_gb": 80,  "desc": "Maximum — huge models (30B+) or fast batch"},
}

def pick_gpu(model_params_b: float = 0, min_vram_gb: int = 0) -> str:
    """
    Pick the cheapest GPU that fits the workload.

    Args:
        model_params_b: Approximate model size in billions of params.
                        Rule of thumb: fp16 needs ~2GB VRAM per 1B params.
        min_vram_gb: Explicit minimum VRAM requirement (overrides param estimate).

    Returns:
        Modal GPU string like "T4", "A10G", "H100", etc.
    """
    needed_vram = max(min_vram_gb, int(model_params_b * 2.5))  # 2.5 GB/B for overhead

    for gpu_name, spec in GPU_TIERS.items():
        if spec["vram_gb"] >= needed_vram:
            return gpu_name

    return "H100"  # fallback to strongest


def run_in_sandbox(
    code: str,
    packages: list[str],
    gpu: Optional[str] = None,
    tunnel_port: Optional[int] = None,
    timeout: int = 120,
    on_stdout: Optional[Callable[[str], None]] = None,
    on_stderr: Optional[Callable[[str], None]] = None,
    image_name: Optional[str] = None,
) -> SandboxResult:
    """
    Provision a Modal Sandbox, execute Python code, stream output, return results.

    Args:
        code: Python source code to execute inside the sandbox.
        packages: pip packages to install (used if image_name not provided).
        gpu: Optional GPU type (e.g. "A10G", "T4", "A100"). None = CPU only.
        tunnel_port: If set, create a tunnel on this port.
        timeout: Sandbox timeout in seconds.
        on_stdout: Callback invoked per stdout line for real-time streaming.
        on_stderr: Callback invoked per stderr line for real-time streaming.
        image_name: Use a pre-built image from IMAGE_REGISTRY (e.g. "vlm", "research").
                    If provided, `packages` is ignored since the image already has deps.

    Returns:
        SandboxResult with captured stdout/stderr, exit code, and optional tunnel URL.
    """
    app = modal.App.lookup("agentfm", create_if_missing=True)

    # Use pre-built image if available, otherwise build from packages
    if image_name and image_name in IMAGE_REGISTRY:
        image = IMAGE_REGISTRY[image_name]
    else:
        image = modal.Image.debian_slim(python_version="3.11").pip_install(*packages)

    create_kwargs = {
        "image": image,
        "timeout": timeout,
        "app": app,
    }
    if gpu:
        create_kwargs["gpu"] = gpu
    if tunnel_port:
        create_kwargs["tunnels"] = {"web": modal.Tunnel(port=tunnel_port)}

    start_time = time.time()

    with modal.enable_output():
        sandbox = modal.Sandbox.create(**create_kwargs)

    sandbox_id = sandbox.object_id or ""
    tunnel_url = None

    if tunnel_port:
        tunnel_info = sandbox.tunnels.get("web")
        if tunnel_info:
            tunnel_url = tunnel_info.url

    try:
        process = sandbox.exec("python", "-c", code)

        stdout_lines = []
        for line in process.stdout:
            stdout_lines.append(line)
            if on_stdout:
                on_stdout(line.rstrip("\n"))

        stderr_text = process.stderr.read()
        if stderr_text and on_stderr:
            for err_line in stderr_text.splitlines():
                on_stderr(err_line)

        process.wait()

        duration_ms = int((time.time() - start_time) * 1000)

        return SandboxResult(
            sandbox_id=sandbox_id,
            stdout="".join(stdout_lines),
            stderr=stderr_text,
            exit_code=process.returncode or 0,
            tunnel_url=tunnel_url,
            duration_ms=duration_ms,
        )
    except Exception as e:
        duration_ms = int((time.time() - start_time) * 1000)
        return SandboxResult(
            sandbox_id=sandbox_id,
            stdout="",
            stderr=str(e),
            exit_code=1,
            tunnel_url=tunnel_url,
            duration_ms=duration_ms,
        )
    finally:
        sandbox.terminate()
