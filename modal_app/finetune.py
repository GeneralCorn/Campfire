import os
import modal

# ── 1. Modal Setup ────────────────────────────────────────────────────────────

app = modal.App("medical-llm-finetune")

# The image incorporates dependencies needed for LoRA finetuning
image = (
    modal.Image.debian_slim(python_version="3.10")
    .pip_install(
        "transformers",
        "peft",
        "trl",
        "datasets",
        "bitsandbytes",
        "accelerate",
        "torch",
        "scipy",
        "rich",
        "sentencepiece"
    )
)

# Volume where the trained LoRA adapter weights will be saved
lora_volume = modal.Volume.from_name("medical-lora-weights", create_if_missing=True)

# ── 2. Finetuning Job ─────────────────────────────────────────────────────────

@app.function(
    image=image,
    gpu="A100",  # Requesting an A100 per user instructions. (A10G can also work if A100 is scarce)
    volumes={"/vol/lora-weights": lora_volume},
    timeout=86400, # Allow up to 24 hours just in case
    secrets=[modal.Secret.from_dotenv()] # Load HF_TOKEN if specified in .env
)
def finetune():
    import torch
    from datasets import load_dataset, concatenate_datasets
    from transformers import (
        AutoModelForCausalLM,
        AutoTokenizer,
        BitsAndBytesConfig,
        TrainingArguments
    )
    from peft import LoraConfig, get_peft_model, prepare_model_for_kbit_training
    from trl import SFTTrainer, SFTConfig
    from accelerate import Accelerator

    print("🚀 Starting Medical LLM Finetuning...")

    # Mistral-7B-Instruct-v0.3 is typically gated so a HF token in the environment might be required.
    # Set HF_TOKEN in your environment or Modal Secrets.
    model_id = "mistralai/Mistral-7B-Instruct-v0.3"

    print("Loading datasets...")
    # Load and subsample datasets for speed (Hackathon mode: fast iteration over large epochs)
    # 1. medical_meadow_medical_flashcards (input/output columns)
    dataset1 = load_dataset("medalpaca/medical_meadow_medical_flashcards", split="train")
    if len(dataset1) > 10000:
        dataset1 = dataset1.shuffle(seed=42).select(range(10000))
    
    # 2. MedQuad-MedicalQnADataset (question/answer columns)
    dataset2 = load_dataset("keivalya/MedQuad-MedicalQnADataset", split="train")
    if len(dataset2) > 10000:
        dataset2 = dataset2.shuffle(seed=42).select(range(10000))

    print(f"Dataset 1 size: {len(dataset1)}")
    print(f"Dataset 2 size: {len(dataset2)}")

    # Standardize format and apply prompt template
    def format_dataset1(example):
        q = example.get("input", "")
        a = example.get("output", "")
        # The mistral instruct format
        text = f"<s>[INST] You are a medical assistant specialized in post-discharge care. Answer precisely based on medical knowledge. Do not speculate or hallucinate.\n\n{q} [/INST] {a}</s>"
        return {"text": text}

    def format_dataset2(example):
        q = example.get("Question", "")
        a = example.get("Answer", "")
        text = f"<s>[INST] You are a medical assistant specialized in post-discharge care. Answer precisely based on medical knowledge. Do not speculate or hallucinate.\n\n{q} [/INST] {a}</s>"
        return {"text": text}

    ds1_formatted = dataset1.map(format_dataset1, remove_columns=dataset1.column_names)
    ds2_formatted = dataset2.map(format_dataset2, remove_columns=dataset2.column_names)

    # Combine
    combined_ds = concatenate_datasets([ds1_formatted, ds2_formatted])
    combined_ds = combined_ds.shuffle(seed=42)
    print(f"Combined dataset size: {len(combined_ds)}")

    print("Loading Tokenizer...")
    tokenizer = AutoTokenizer.from_pretrained(model_id)
    tokenizer.pad_token = tokenizer.eos_token
    tokenizer.padding_side = "right"

    print("Loading Model with 4-bit Quantization...")
    bnb_config = BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_quant_type="nf4",
        bnb_4bit_compute_dtype=torch.bfloat16,
    )

    device_map = "auto"
    model = AutoModelForCausalLM.from_pretrained(
        model_id,
        quantization_config=bnb_config,
        device_map=device_map
    )

    model.config.use_cache = False
    model.config.pretraining_tp = 1
    model = prepare_model_for_kbit_training(model)

    print("Applying LoRA Config...")
    lora_config = LoraConfig(
        r=16,
        lora_alpha=32,
        target_modules=["q_proj", "k_proj", "v_proj", "o_proj"],
        lora_dropout=0.05,
        bias="none",
        task_type="CAUSAL_LM"
    )

    print("Setting up Trainer...")
    import inspect
    
    sft_config_kwargs = {
        "output_dir": "/tmp/results",
        "num_train_epochs": 1, 
        "per_device_train_batch_size": 4,
        "gradient_accumulation_steps": 4,
        "learning_rate": 2e-4,
        "warmup_steps": 10,
        "bf16": True,
        "logging_steps": 10,
        "save_strategy": "no",
        "gradient_checkpointing": True,
    }
    
    sig_config = inspect.signature(SFTConfig)
    if "max_seq_length" in sig_config.parameters:
        sft_config_kwargs["max_seq_length"] = 1024
    elif "max_length" in sig_config.parameters:
        sft_config_kwargs["max_length"] = 1024
        
    if "dataset_text_field" in sig_config.parameters:
        sft_config_kwargs["dataset_text_field"] = "text"

    training_args = SFTConfig(**sft_config_kwargs)

    trainer_kwargs = {
        "model": model,
        "train_dataset": combined_ds,
        "args": training_args,
        "peft_config": lora_config,
    }
    
    sig_trainer = inspect.signature(SFTTrainer.__init__)
    if "processing_class" in sig_trainer.parameters:
        trainer_kwargs["processing_class"] = tokenizer
    else:
        trainer_kwargs["tokenizer"] = tokenizer
        
    if "max_seq_length" not in sft_config_kwargs and "max_seq_length" in sig_trainer.parameters:
        trainer_kwargs["max_seq_length"] = 1024
    if "dataset_text_field" not in sft_config_kwargs and "dataset_text_field" in sig_trainer.parameters:
        trainer_kwargs["dataset_text_field"] = "text"

    trainer = SFTTrainer(**trainer_kwargs)

    print("Starting Training...")
    trainer.train()

    print("Training complete. Saving adapter weights to Volume...")
    output_dir = "/vol/lora-weights/medical-adapter"
    trainer.model.save_pretrained(output_dir)
    tokenizer.save_pretrained(output_dir)
    
    # Commit volume explicitly to persist the saved files
    lora_volume.commit()
    print(f"✅ Adapter saved successfully to {output_dir}")

# To run:
# modal run modal_app/finetune.py
