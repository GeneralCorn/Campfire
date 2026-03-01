import modal
from pydantic import BaseModel

app = modal.App("medical-llm-inference")

image = (
    modal.Image.debian_slim(python_version="3.10")
    .pip_install(
        "transformers",
        "peft",
        "accelerate",
        "bitsandbytes",
        "torch",
        "sentencepiece",
        "fastapi[standard]"
    )
)

lora_volume = modal.Volume.from_name("medical-lora-weights", create_if_missing=True)

class InferenceRequest(BaseModel):
    agent_type: str
    query: str
    context: str
    system_prompt: str = ""

@app.cls(
    image=image,
    gpu="A10G",
    volumes={"/vol/lora-weights": lora_volume},
    secrets=[modal.Secret.from_dotenv()],
    keep_warm=1,  # Keep 1 container warm to prevent typical 60s cold starts during the demo
)
class MedicalLLM:
    @modal.enter()
    def load_model(self):
        import torch
        from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig
        from peft import PeftModel

        print("Container initializing... Loading base model")
        model_id = "mistralai/Mistral-7B-Instruct-v0.3"

        bnb_config = BitsAndBytesConfig(
            load_in_4bit=True,
            bnb_4bit_quant_type="nf4",
            bnb_4bit_compute_dtype=torch.float16,
        )

        base_model = AutoModelForCausalLM.from_pretrained(
            model_id,
            quantization_config=bnb_config,
            device_map="auto"
        )
        self.tokenizer = AutoTokenizer.from_pretrained(model_id)

        print("Loading adapter weights from volume...")
        adapter_path = "/vol/lora-weights/medical-adapter"

        model_with_lora = PeftModel.from_pretrained(base_model, adapter_path)
        print("Merging adapter...")
        try:
            self.model = model_with_lora.merge_and_unload()
        except Exception as e:
            print("Could not merge 4-bit adapter directly, falling back to unmerged inference:", e)
            self.model = model_with_lora

        print("Model ready for inference!")

    @modal.method()
    def generate_response(self, system_prompt: str, user_content: str, temperature: float, max_new_tokens: int) -> str:
        prompt = f"<s>[INST] {system_prompt}\n\nContext:\n{user_content} [/INST] "

        inputs = self.tokenizer(prompt, return_tensors="pt").to("cuda")
        input_length = inputs.input_ids.shape[1]

        out = self.model.generate(
            **inputs,
            max_new_tokens=max_new_tokens,
            temperature=temperature,
            do_sample=True if temperature > 0 else False,
            pad_token_id=self.tokenizer.eos_token_id
        )

        generated_ids = out[0][input_length:]
        response = self.tokenizer.decode(generated_ids, skip_special_tokens=True).strip()
        return response

    @modal.method(is_generator=True)
    def generate_stream(self, system_prompt: str, user_content: str, temperature: float, max_new_tokens: int):
        from transformers import TextIteratorStreamer
        from threading import Thread

        prompt = f"<s>[INST] {system_prompt}\n\nContext:\n{user_content} [/INST] "

        inputs = self.tokenizer(prompt, return_tensors="pt").to("cuda")
        streamer = TextIteratorStreamer(self.tokenizer, skip_prompt=True, skip_special_tokens=True)

        generation_kwargs = dict(
            **inputs,
            streamer=streamer,
            max_new_tokens=max_new_tokens,
            temperature=temperature,
            do_sample=True if temperature > 0 else False,
            pad_token_id=self.tokenizer.eos_token_id
        )

        thread = Thread(target=self.model.generate, kwargs=generation_kwargs)
        thread.start()

        for new_text in streamer:
            yield new_text

    @modal.method()
    def medication_query(self, query: str, context: str, system_prompt: str = "") -> str:
        sys_prompt = system_prompt or "You are a medication specialist assistant. You answer questions about medications, dosages, drug interactions, and timing based strictly on the patient's discharge information provided. If the answer is not in the provided context, say you don't have that information. Never guess about drug interactions."
        user_content = f"Patient question: {query}"
        return self.generate_response(sys_prompt, user_content, temperature=0.1, max_new_tokens=512)

    @modal.method()
    def recovery_query(self, query: str, context: str, system_prompt: str = "") -> str:
        sys_prompt = system_prompt or "You are a recovery and rehabilitation specialist assistant. You answer questions about physical restrictions, exercise protocols, wound care, and activity timelines based strictly on the patient's discharge information provided. If the answer is not in the provided context, say you don't have that information. Never speculate about recovery timelines beyond what the discharge plan states."
        user_content = f"Patient question: {query}"
        return self.generate_response(sys_prompt, user_content, temperature=0.1, max_new_tokens=512)

    @modal.method()
    def emergency_query(self, query: str, context: str, system_prompt: str = "") -> str:
        sys_prompt = system_prompt or "You are an emergency triage assistant. You help patients assess whether their symptoms require immediate medical attention based on the warning signs in their discharge plan. Always err on the side of caution. If a symptom matches or is close to a listed warning sign, advise contacting their healthcare provider immediately. Never tell a patient to ignore a symptom."
        user_content = f"Patient question: {query}"
        return self.generate_response(sys_prompt, user_content, temperature=0.05, max_new_tokens=256)

@app.function(image=image)
@modal.asgi_app()
def asgi_app():
    from fastapi import FastAPI, Request
    from fastapi.responses import StreamingResponse
    from fastapi.middleware.cors import CORSMiddleware
    import json
    import time

    web_app = FastAPI()

    web_app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @web_app.post("/medical-inference")
    async def medical_inference(request: InferenceRequest):
        agent_type = request.agent_type
        query = request.query
        context = request.context

        llm = MedicalLLM()
        if agent_type == "medication":
            result = llm.medication_query.remote(query, context, request.system_prompt)
        elif agent_type == "recovery":
            result = llm.recovery_query.remote(query, context, request.system_prompt)
        elif agent_type == "emergency":
            result = llm.emergency_query.remote(query, context, request.system_prompt)
        else:
            result = "Unknown agent type"
        return {"response": result}

    @web_app.post("/v1/webhook")
    async def elevenlabs_webhook(request: Request):
        try:
            body = await request.json()
            print(f"[Webhook] Received payload from ElevenLabs: {json.dumps(body)}")

            messages = body.get("messages", [])
            system_prompt = "You are a helpful medical assistant."
            user_query = ""

            dynamic_vars = body.get("dynamic_variables", {})
            if "context" in dynamic_vars:
                system_prompt += f"\n\nContext:\n{dynamic_vars['context']}"

            for msg in messages:
                if msg.get("role") == "system":
                    system_prompt = msg.get("content", system_prompt)
                elif msg.get("role") == "user":
                    user_query = msg.get("content", "")

            if not user_query:
                user_query = body.get("text", "Please continue.")

            llm = MedicalLLM()
            response_text = llm.generate_response.remote(system_prompt, user_query, temperature=0.1, max_new_tokens=256)

            return {"text": response_text}

        except Exception as e:
            import traceback
            err = traceback.format_exc()
            print(f"[Webhook ERROR]: {err}")
            from fastapi import HTTPException
            raise HTTPException(status_code=500, detail=str(e))

    @web_app.post("/v1/chat/completions")
    async def chat_completions(request: Request):
        try:
            body = await request.json()
            messages = body.get("messages", [])
            stream = body.get("stream", False)

            system_prompt = "You are a helpful medical assistant."
            user_query = ""

            for msg in messages:
                if msg.get("role") == "system":
                    system_prompt = msg.get("content", system_prompt)
                elif msg.get("role") == "user":
                    user_query = msg.get("content", "")

            if not user_query:
                user_query = "Hello."

            llm = MedicalLLM()
            chunk_id = f"chatcmpl-{int(time.time())}"

            if not stream:
                response_text = await llm.generate_response.remote.aio(system_prompt, user_query, temperature=0.1, max_new_tokens=256)
                return {
                    "id": chunk_id,
                    "object": "chat.completion",
                    "created": int(time.time()),
                    "model": "mistral-medical",
                    "choices": [{
                        "index": 0,
                        "message": {"role": "assistant", "content": response_text},
                        "finish_reason": "stop"
                    }],
                    "usage": {
                        "prompt_tokens": 0,
                        "completion_tokens": len(response_text.split()),
                        "total_tokens": len(response_text.split())
                    }
                }

            async def event_stream():
                init_chunk = {
                    "id": chunk_id,
                    "object": "chat.completion.chunk",
                    "created": int(time.time()),
                    "model": "mistral-medical",
                    "choices": [{"index": 0, "delta": {"role": "assistant", "content": ""}, "finish_reason": None}]
                }
                yield f"data: {json.dumps(init_chunk)}\n\n"

                response_text = await llm.generate_response.remote.aio(system_prompt, user_query, temperature=0.1, max_new_tokens=256)

                for word in response_text.split():
                    chunk = {
                        "id": chunk_id,
                        "object": "chat.completion.chunk",
                        "created": int(time.time()),
                        "model": "mistral-medical",
                        "choices": [{"index": 0, "delta": {"content": word + " "}, "finish_reason": None}]
                    }
                    yield f"data: {json.dumps(chunk)}\n\n"

                final_chunk = {
                    "id": chunk_id,
                    "object": "chat.completion.chunk",
                    "created": int(time.time()),
                    "model": "mistral-medical",
                    "choices": [{"index": 0, "delta": {}, "finish_reason": "stop"}]
                }
                yield f"data: {json.dumps(final_chunk)}\n\n"
                yield "data: [DONE]\n\n"

            return StreamingResponse(
                event_stream(),
                media_type="text/event-stream",
                headers={
                    "Cache-Control": "no-cache",
                    "Connection": "keep-alive",
                    "X-Accel-Buffering": "no"
                }
            )
        except Exception as e:
            import traceback
            err = traceback.format_exc()
            print(f"[Custom LLM ERROR]: {err}")
            from fastapi import HTTPException
            raise HTTPException(status_code=500, detail=str(e))

    return web_app

# To deploy:
# modal deploy modal_app/medical_llm.py
