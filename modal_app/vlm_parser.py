import modal
import base64
import json
import re

# ── 1. Modal App & Image ────────────────────────────────────────────────────────
app = modal.App("carelounge-vlm-parser")

image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install(
        "transformers", "torch", "torchvision", "Pillow", "pdf2image", "accelerate", "bitsandbytes",
        "qwen-vl-utils", "fastapi[standard]"
    )
    .apt_install("poppler-utils")  # needed for pdf2image
)

# ── 2. VLM Parser Class ─────────────────────────────────────────────────────────
@app.cls(
    image=image,
    gpu="A10G",
    timeout=300,
    scaledown_window=120,
)
class DischargeParser:
    @modal.enter()
    def load_model(self):
        from transformers import Qwen2VLForConditionalGeneration, AutoProcessor
        from qwen_vl_utils import process_vision_info
        import torch

        # Load Qwen2-VL-7B-Instruct with 4-bit quantization
        self.model = Qwen2VLForConditionalGeneration.from_pretrained(
            "Qwen/Qwen2-VL-7B-Instruct",
            torch_dtype=torch.bfloat16,
            device_map="auto",
        )
        self.processor = AutoProcessor.from_pretrained("Qwen/Qwen2-VL-7B-Instruct")

    @modal.method()
    def parse_page(self, image_base64: str) -> dict:
        from qwen_vl_utils import process_vision_info
        import torch
        
        prompt = """You are a medical document parser. Extract all structured information from this hospital discharge document image.

Return ONLY valid JSON with this exact schema, no other text:
{
  "patient_info": {
    "name": "",
    "discharge_date": "",
    "procedure": "",
    "doctor": ""
  },
  "medications": [
    {
      "name": "",
      "dosage": "",
      "frequency": "",
      "instructions": "",
      "warnings": ""
    }
  ],
  "restrictions": [
    {
      "activity": "",
      "duration": "",
      "details": ""
    }
  ],
  "warning_signs": [
    {
      "symptom": "",
      "severity": "caution | emergency",
      "action": ""
    }
  ]
}

Extract every medication, restriction, and warning sign visible. 

CRITICAL EXTRACTION INSTRUCTIONS:
1. MEDICATIONS: Extract ALL medications across EVERY section of the document. Do not summarize or group them. Provide a complete list. Look for pharmacological interventions under ALL headings (GI/Bowel regimen, Neurological, Ear/Nose/Throat/Dental, Obstetrics/Gynecology, pre-procedure sedation, pain management, etc.). Do NOT only look in "Medications". For example, ensure "baclofen" and "oral contraceptive" are extracted if present.
2. RESTRICTIONS: Extract ALL restrictions, including but not limited to exercise limitations (e.g., low impact, range of motion, spasticity precautions) and dietary restrictions (e.g., pureed diet, thickened liquids).
3. WARNING SIGNS: Extract ALL warning signs, symptoms, and recognition tips. Ensure specific behavioral signs like "Becomes quiet and withdrawn" and instructions like "Patient does not exhibit typical pain behavior" are included, alongside any physiological warnings like dysphagia.
4. COMPREHENSIVENESS: Act comprehensively. Do not let finding new items "overwrite" or replace previously found items in your attention. Ensure no previous extractions are overwritten or dropped.

If a field is not found, use an empty string. Do not hallucinate information not present in the document."""

        messages = [
            {
                "role": "user",
                "content": [
                    {"type": "image", "image": f"data:image;base64,{image_base64}"},
                    {"type": "text", "text": prompt},
                ],
            }
        ]

        # Preparation for inference
        text = self.processor.apply_chat_template(
            messages, tokenize=False, add_generation_prompt=True
        )
        image_inputs, video_inputs = process_vision_info(messages)
        inputs = self.processor(
            text=[text],
            images=image_inputs,
            videos=video_inputs,
            padding=True,
            return_tensors="pt",
        )
        inputs = inputs.to("cuda")

        # Inference: Generation of the output
        generated_ids = self.model.generate(**inputs, max_new_tokens=4096)
        generated_ids_trimmed = [
            out_ids[len(in_ids) :] for in_ids, out_ids in zip(inputs.input_ids, generated_ids)
        ]
        output_text = self.processor.batch_decode(
            generated_ids_trimmed, skip_special_tokens=True, clean_up_tokenization_spaces=False
        )[0]
        
        # Parse the JSON from the response
        try:
            # remove formatting if LLM added markdown code blocks
            output_clean = output_text.strip()
            if output_clean.startswith("```json"):
                output_clean = output_clean[7:]
            if output_clean.startswith("```"):
                output_clean = output_clean[3:]
            if output_clean.endswith("```"):
                output_clean = output_clean[:-3]
                
            return json.loads(output_clean.strip())
        except json.JSONDecodeError:
            print(f"Failed to parse JSON: {output_text}")
            return {}

# ── 3. VLM Parser HTTP Endpoint ─────────────────────────────────────────────────
@app.function(image=image)
@modal.fastapi_endpoint(method="POST")
def parse_discharge(request: dict):
    parser = DischargeParser()
    
    pages = request.get("pages", [])  # list of base64 encoded images
    document = request.get("document")
    doc_type = request.get("doc_type")
    
    if document and doc_type == "application/pdf":
        import io
        from pdf2image import convert_from_bytes
        import base64
        
        pdf_bytes = base64.b64decode(document)
        images = convert_from_bytes(pdf_bytes)
        for img in images:
            buffer = io.BytesIO()
            img.save(buffer, format="PNG")
            pages.append(base64.b64encode(buffer.getvalue()).decode("utf-8"))
            
    all_meds = []
    all_restrictions = []
    all_warnings = []
    patient_info = {}
    
    for page_b64 in pages:
        result = parser.parse_page.remote(page_b64)
        if result.get("patient_info", {}).get("name"):
            patient_info = result["patient_info"]
        all_meds.extend(result.get("medications", []))
        all_restrictions.extend(result.get("restrictions", []))
        all_warnings.extend(result.get("warning_signs", []))
    
    # Deduplicate medications by name
    seen_meds = set()
    unique_meds = []
    for m in all_meds:
        med_name = m.get("name", "").lower()
        if med_name and med_name not in seen_meds:
            seen_meds.add(med_name)
            unique_meds.append(m)
            
    # Deduplicate restrictions
    seen_restrictions = set()
    unique_restrictions = []
    for r in all_restrictions:
        activity = r.get("activity", "").lower()
        if activity and activity not in seen_restrictions:
            seen_restrictions.add(activity)
            unique_restrictions.append(r)
            
    # Deduplicate warning_signs
    seen_warnings = set()
    unique_warnings = []
    for w in all_warnings:
        symptom = w.get("symptom", "").lower()
        if symptom and symptom not in seen_warnings:
            seen_warnings.add(symptom)
            unique_warnings.append(w)
    
    return {
        "patient_info": patient_info,
        "medications": unique_meds,
        "restrictions": unique_restrictions,
        "warning_signs": unique_warnings
    }
