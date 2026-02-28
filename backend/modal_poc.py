import modal

vllm_image = (
    modal.Image.from_registry("nvidia/cuda:12.8.0-devel-ubuntu22.04", add_python="3.12")
    .entrypoint([])
    .uv_pip_install(
        "vllm==0.13.0",
        "huggingface-hub==0.36.0",
    )
    .env({"HF_XET_HIGH_PERFORMANCE": "1"})  # faster model transfers
)

MODEL_NAME = "deepseek-ai/DeepSeek-R1-Distill-Qwen-7B"

hf_cache_vol = modal.Volume.from_name("huggingface-cache", create_if_missing=True)
vllm_cache_vol = modal.Volume.from_name("vllm-cache", create_if_missing=True)

# Set to True for faster cold starts (disables Torch compilation & CUDA graph capture)
# Set to False for better throughput once your service is consistently warm
FAST_BOOT = True

MINUTES = 60
VLLM_PORT = 8000

app = modal.App("agentfm-brain")


@app.function(
    image=vllm_image,
    gpu="A100",
    scaledown_window=15 * MINUTES,  # keep container warm for 15 min after last request
    timeout=10 * MINUTES,           # allow up to 10 min for cold start
    volumes={
        "/root/.cache/huggingface": hf_cache_vol,
        "/root/.cache/vllm": vllm_cache_vol,
    },
)
@modal.concurrent(max_inputs=32)  # one container handles up to 32 simultaneous requests
@modal.web_server(port=VLLM_PORT, startup_timeout=10 * MINUTES)
def serve():
    import subprocess

    cmd = [
        "vllm", "serve",
        "--uvicorn-log-level=info",
        MODEL_NAME,
        "--served-model-name", MODEL_NAME,
        "--host", "0.0.0.0",
        "--port", str(VLLM_PORT),
        "--max-model-len", "4096",
        "--gpu-memory-utilization", "0.95",
        "--tensor-parallel-size", "1",
    ]

    cmd += ["--enforce-eager" if FAST_BOOT else "--no-enforce-eager"]

    print(*cmd)
    subprocess.Popen(" ".join(cmd), shell=True)
