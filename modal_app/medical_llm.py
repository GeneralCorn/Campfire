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
        
        # Load adapter and merge it for faster inference
        # (Assuming modern PEFT supports merging 4-bit or we tolerate overhead if not fully merged)
        model_with_lora = PeftModel.from_pretrained(base_model, adapter_path)
        print("Merging adapter...")
        try:
            self.model = model_with_lora.merge_and_unload()
        except Exception as e:
            print("Could not merge 4-bit adapter directly, falling back to unmerged inference:", e)
            self.model = model_with_lora
            
        print("Model ready for inference!")

    def generate_response(self, system_prompt: str, user_content: str, temperature: float, max_new_tokens: int) -> str:
        # Construct the Prompt in Mistral instruct format
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
        
        # Extract only the newly generated tokens (skip the input prompt tokens)
        generated_ids = out[0][input_length:]
        response = self.tokenizer.decode(generated_ids, skip_special_tokens=True).strip()
        return response

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
@modal.fastapi_endpoint(method="POST")
def medical_inference(request: InferenceRequest):
    agent_type = request.agent_type
    query = request.query
    context = request.context
    
    # Instantiate the class to call its methods
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

# To deploy:
# modal deploy modal_app/medical_llm.py
