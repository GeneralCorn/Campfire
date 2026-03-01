"""
Python code templates executed inside Modal Sandboxes.
Each function returns a string of Python code that the sandbox runs.

Image mapping:
  - build_maya_vlm_code      → image_name="vlm",     gpu=pick_gpu()  (Florence-2 VLM)
  - build_biobert_ner_code   → image_name="biobert"                   (BioBERT medical NER)
  - build_maya_pubmed_code   → image_name="research"                  (PubMed API)
  - build_rex_fda_code       → image_name="research"                  (OpenFDA + RxNorm)
  - build_sol_visualization_code → image_name="viz"                   (HTML generation)
"""


def build_rex_fda_code(medications: list[str]) -> str:
    """Python code for Rex's CPU sandbox: query OpenFDA labels + RxNorm interactions."""
    meds_repr = repr(medications)
    return f"""
import requests
import json
import sys

medications = {meds_repr}

def query_openfda_label(drug_name):
    \"\"\"Query OpenFDA drug label endpoint (free, no auth).\"\"\"
    url = f"https://api.fda.gov/drug/label.json?search=openfda.brand_name:\\"{{drug_name}}\\"&limit=1"
    try:
        r = requests.get(url, timeout=15)
        if r.status_code == 200:
            results = r.json().get("results", [])
            if results:
                label = results[0]
                warnings = label.get("warnings", ["N/A"])
                interactions = label.get("drug_interactions", ["N/A"])
                return {{
                    "drug": drug_name,
                    "warnings": warnings[0][:500] if warnings else "N/A",
                    "drug_interactions": interactions[0][:500] if interactions else "N/A",
                }}
        # Try generic name if brand name fails
        url2 = f"https://api.fda.gov/drug/label.json?search=openfda.generic_name:\\"{{drug_name}}\\"&limit=1"
        r2 = requests.get(url2, timeout=15)
        if r2.status_code == 200:
            results = r2.json().get("results", [])
            if results:
                label = results[0]
                warnings = label.get("warnings", ["N/A"])
                interactions = label.get("drug_interactions", ["N/A"])
                return {{
                    "drug": drug_name,
                    "warnings": warnings[0][:500] if warnings else "N/A",
                    "drug_interactions": interactions[0][:500] if interactions else "N/A",
                }}
    except Exception as e:
        print(f"[ERROR] OpenFDA query failed for {{drug_name}}: {{e}}", file=sys.stderr)
    return None

def get_rxcui(drug_name):
    \"\"\"Get RxNorm RXCUI for a drug name (free NIH API, no auth).\"\"\"
    url = f"https://rxnav.nlm.nih.gov/REST/rxcui.json?name={{drug_name}}"
    try:
        r = requests.get(url, timeout=10)
        if r.status_code == 200:
            ids = r.json().get("idGroup", {{}}).get("rxnormId", [])
            return ids[0] if ids else None
    except:
        return None

def query_rxnorm_interactions(rxcui_list):
    \"\"\"Check drug-drug interactions via RxNorm (free NIH API).\"\"\"
    if len(rxcui_list) < 2:
        return []
    rxcuis = "+".join(rxcui_list)
    url = f"https://rxnav.nlm.nih.gov/REST/interaction/list.json?rxcuis={{rxcuis}}"
    try:
        r = requests.get(url, timeout=15)
        if r.status_code == 200:
            data = r.json()
            interactions = []
            for group in data.get("fullInteractionTypeGroup", []):
                for itype in group.get("fullInteractionType", []):
                    for pair in itype.get("interactionPair", []):
                        desc = pair.get("description", "")
                        severity = pair.get("severity", "N/A")
                        interactions.append({{"description": desc, "severity": severity}})
            return interactions
    except Exception as e:
        print(f"[ERROR] RxNorm interaction query failed: {{e}}", file=sys.stderr)
    return []

# === Main execution ===
print("[Rex] Starting FDA and RxNorm analysis...")
results = {{}}
rxcuis = []

for med in medications:
    print(f"[Rex] Querying OpenFDA for: {{med}}")
    label_data = query_openfda_label(med)
    if label_data:
        results[med] = label_data
        print(f"[Rex] Found FDA label for {{med}}")
    else:
        print(f"[Rex] No FDA label found for {{med}}")

    rxcui = get_rxcui(med)
    if rxcui:
        rxcuis.append(rxcui)
        print(f"[Rex] RxNorm RXCUI for {{med}}: {{rxcui}}")
    else:
        print(f"[Rex] No RxNorm RXCUI found for {{med}}")

if len(rxcuis) >= 2:
    print(f"[Rex] Checking interactions between {{len(rxcuis)}} drugs...")
    interactions = query_rxnorm_interactions(rxcuis)
    if interactions:
        print(f"[Rex] Found {{len(interactions)}} interaction(s):")
        for i, interaction in enumerate(interactions, 1):
            sev = interaction.get("severity", "N/A")
            desc = interaction.get("description", "")
            print(f"  {{i}}. [{{sev}}] {{desc}}")
        results["_interactions"] = interactions
    else:
        print("[Rex] No drug-drug interactions found.")
        results["_interactions"] = []
else:
    print("[Rex] Not enough drugs to check interactions.")
    results["_interactions"] = []

print()
print("[Rex] === RESULTS ===")
print(json.dumps(results, indent=2))
"""


def build_maya_pubmed_code(query: str) -> str:
    """Python code for Maya's CPU sandbox: search PubMed for medical literature."""
    query_repr = repr(query)
    return f"""
import requests
import json

query = {query_repr}

def search_pubmed(search_term, max_results=5):
    \"\"\"Search PubMed via NCBI E-utilities (free, no auth for small queries).\"\"\"
    base_url = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils"

    # Step 1: Search for article IDs
    search_url = f"{{base_url}}/esearch.fcgi"
    params = {{
        "db": "pubmed",
        "term": search_term,
        "retmax": max_results,
        "retmode": "json",
        "sort": "relevance",
    }}
    r = requests.get(search_url, params=params, timeout=15)
    r.raise_for_status()
    ids = r.json().get("esearchresult", {{}}).get("idlist", [])

    if not ids:
        return []

    # Step 2: Fetch article summaries
    fetch_url = f"{{base_url}}/esummary.fcgi"
    params = {{
        "db": "pubmed",
        "id": ",".join(ids),
        "retmode": "json",
    }}
    r = requests.get(fetch_url, params=params, timeout=15)
    r.raise_for_status()
    results = r.json().get("result", {{}})

    articles = []
    for pmid in ids:
        if pmid in results:
            article = results[pmid]
            articles.append({{
                "pmid": pmid,
                "title": article.get("title", ""),
                "source": article.get("source", ""),
                "pubdate": article.get("pubdate", ""),
                "authors": [a.get("name", "") for a in article.get("authors", [])[:3]],
            }})
    return articles

print(f"[Maya] Searching PubMed for: {{query}}")
articles = search_pubmed(query)

if articles:
    print(f"[Maya] Found {{len(articles)}} relevant articles:")
    for i, a in enumerate(articles, 1):
        authors = ", ".join(a["authors"]) if a["authors"] else "Unknown"
        print(f"  {{i}}. {{a['title']}}")
        print(f"     {{authors}} ({{a['pubdate']}}) - PMID: {{a['pmid']}}")
else:
    print("[Maya] No PubMed articles found.")

print()
print("[Maya] === RESULTS ===")
print(json.dumps(articles, indent=2))
"""


def build_sol_visualization_code(
    maya_findings: str,
    rex_findings: str,
    medications: list[str],
) -> str:
    """Python code for Sol's sandbox: generate an HTML medication summary page."""
    maya_repr = repr(maya_findings or "No research data available.")
    rex_repr = repr(rex_findings or "No interaction data available.")
    meds_repr = repr(medications)
    return f"""
import json

medications = {meds_repr}
maya_data = {maya_repr}
rex_data = {rex_repr}

# Parse Rex's JSON results if possible
interactions = []
warnings = {{}}
try:
    rex_parsed = json.loads(rex_data.split("[Rex] === RESULTS ===\\n")[-1])
    interactions = rex_parsed.get("_interactions", [])
    for med in medications:
        if med in rex_parsed:
            warnings[med] = rex_parsed[med]
except:
    pass

# Build HTML summary
html = '''<!DOCTYPE html>
<html>
<head>
<style>
  body {{ font-family: -apple-system, sans-serif; background: #0f0f0f; color: #e0e0e0; padding: 2rem; max-width: 800px; margin: auto; }}
  h1 {{ color: #FFE66D; border-bottom: 2px solid #FFE66D; padding-bottom: 0.5rem; }}
  h2 {{ color: #4ECDC4; margin-top: 1.5rem; }}
  .med-card {{ background: #1a1a1a; border-radius: 8px; padding: 1rem; margin: 0.5rem 0; border-left: 4px solid #4ECDC4; }}
  .interaction {{ background: #1a1a1a; border-radius: 8px; padding: 1rem; margin: 0.5rem 0; border-left: 4px solid #FF6B6B; }}
  .severity {{ display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 0.8rem; font-weight: bold; }}
  .severity-high {{ background: #FF6B6B33; color: #FF6B6B; }}
  .severity-moderate {{ background: #FFE66D33; color: #FFE66D; }}
  .severity-low {{ background: #4ECDC433; color: #4ECDC4; }}
  .footer {{ margin-top: 2rem; padding-top: 1rem; border-top: 1px solid #333; color: #666; font-size: 0.8rem; }}
</style>
</head>
<body>
<h1>Medication Summary</h1>
'''

# Medication cards
html += '<h2>Medications</h2>'
for med in medications:
    html += f'<div class="med-card"><strong>{{med.title()}}</strong>'
    if med in warnings:
        w = warnings[med]
        if w.get("drug_interactions") and w["drug_interactions"] != "N/A":
            html += f'<p><strong>Interactions:</strong> {{w["drug_interactions"][:200]}}...</p>'
    html += '</div>'

# Interaction section
if interactions:
    html += '<h2>Drug Interactions Found</h2>'
    for ix in interactions:
        sev = ix.get("severity", "N/A").lower()
        sev_class = "severity-high" if "high" in sev else "severity-moderate" if "moderate" in sev else "severity-low"
        html += f'<div class="interaction">'
        html += f'<span class="severity {{sev_class}}">{{ix.get("severity", "Unknown")}}</span> '
        html += f'<p>{{ix.get("description", "No description")}}</p>'
        html += '</div>'
else:
    html += '<h2>Drug Interactions</h2>'
    html += '<div class="med-card">No significant drug-drug interactions found.</div>'

html += '''
<div class="footer">
  Generated by Sol (AgentFM Lab) — For informational purposes only. Not medical advice.
  <br>Sources: OpenFDA, RxNorm (NIH)
</div>
</body>
</html>'''

print("[Sol] Generating medication summary visualization...")
print(f"[Sol] Medications: {{', '.join(medications)}}")
print(f"[Sol] Interactions found: {{len(interactions)}}")
print()
print("[Sol] === HTML_OUTPUT ===")
print(html)
print("[Sol] === END_HTML ===")
print("[Sol] Visualization generated successfully.")
"""


def build_biobert_ner_code(text: str) -> str:
    """
    Python code for Maya's CPU sandbox: run BioBERT NER on discharge/clinical text.
    Extracts medications, diseases, procedures, dosages from free-text instructions.
    Uses pre-built BIOBERT_IMAGE with model already downloaded.
    Requires: image_name="biobert" (CPU only — BERT is small)
    """
    text_repr = repr(text)
    return f"""
import json
from transformers import AutoTokenizer, AutoModelForTokenClassification, pipeline

print("[Maya] Loading BioBERT biomedical NER model...")
tokenizer = AutoTokenizer.from_pretrained("d4data/biomedical-ner-all")
model = AutoModelForTokenClassification.from_pretrained("d4data/biomedical-ner-all")
ner = pipeline("ner", model=model, tokenizer=tokenizer, aggregation_strategy="simple")
print("[Maya] BioBERT NER model loaded (CPU)")

text = {text_repr}
print(f"[Maya] Analyzing text ({{len(text)}} chars)...")

# Run NER
raw_entities = ner(text)
print(f"[Maya] Found {{len(raw_entities)}} raw entities")

# Group by entity type and deduplicate
grouped = {{}}
for ent in raw_entities:
    label = ent["entity_group"]
    word = ent["word"].strip()
    score = round(ent["score"], 3)
    if label not in grouped:
        grouped[label] = []
    # Deduplicate by lowercase
    existing = [e["text"].lower() for e in grouped[label]]
    if word.lower() not in existing and len(word) > 1:
        grouped[label].append({{"text": word, "score": score}})

# Extract medications specifically (most critical for the use case)
med_labels = ["Medication", "Drug", "DRUG", "Chemical"]
medications_found = []
for label in med_labels:
    if label in grouped:
        medications_found.extend([e["text"] for e in grouped[label]])

# Also grab dosages and conditions
dosages = [e["text"] for e in grouped.get("Dosage", grouped.get("DOSAGE", []))]
conditions = [e["text"] for e in grouped.get("Disease", grouped.get("DISEASE", []))]
procedures = [e["text"] for e in grouped.get("Procedure", grouped.get("PROCEDURE", []))]

print()
print("[Maya] === Entity Summary ===")
if medications_found:
    print(f"  Medications: {{', '.join(medications_found)}}")
if dosages:
    print(f"  Dosages: {{', '.join(dosages)}}")
if conditions:
    print(f"  Conditions: {{', '.join(conditions)}}")
if procedures:
    print(f"  Procedures: {{', '.join(procedures)}}")

for label, entities in grouped.items():
    if label not in med_labels + ["Dosage", "DOSAGE", "Disease", "DISEASE", "Procedure", "PROCEDURE"]:
        names = ", ".join(e["text"] for e in entities[:5])
        print(f"  {{label}}: {{names}}")

print()
print("[Maya] === RESULTS ===")
output = {{
    "medications": medications_found,
    "dosages": dosages,
    "conditions": conditions,
    "procedures": procedures,
    "all_entities": grouped,
    "raw_text_length": len(text),
}}
print(json.dumps(output, indent=2, default=str))
print("[Maya] === END_NER ===")
print("[Maya] Biomedical entity extraction complete.")
"""


def build_maya_vlm_code(image_b64: str) -> str:
    """
    Python code for Maya's GPU sandbox: run Florence-2 VLM on a prescription image.
    Uses pre-built VLM_IMAGE with model already downloaded.
    Requires: image_name="vlm", gpu=pick_gpu()
    """
    return f"""
import torch
import base64
import io
import json
from PIL import Image
from transformers import AutoProcessor, AutoModelForVision2Seq

print("[Maya] Loading Florence-2 vision-language model...")
processor = AutoProcessor.from_pretrained("microsoft/Florence-2-base")
model = AutoModelForVision2Seq.from_pretrained("microsoft/Florence-2-base")
device = "cuda" if torch.cuda.is_available() else "cpu"
model = model.to(device)
print(f"[Maya] Model loaded on {{device}}")

# Decode the base64 image
print("[Maya] Decoding prescription image...")
image_bytes = base64.b64decode("{image_b64}")
image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
print(f"[Maya] Image size: {{image.size}}")

# Run OCR + detailed captioning
tasks = ["<OCR>", "<DETAILED_CAPTION>", "<MORE_DETAILED_CAPTION>"]
results = {{}}

for task in tasks:
    print(f"[Maya] Running {{task}}...")
    inputs = processor(text=task, images=image, return_tensors="pt").to(device)
    with torch.no_grad():
        generated_ids = model.generate(
            input_ids=inputs["input_ids"],
            pixel_values=inputs["pixel_values"],
            max_new_tokens=1024,
            num_beams=3,
        )
    generated_text = processor.batch_decode(generated_ids, skip_special_tokens=False)[0]
    parsed = processor.post_process_generation(generated_text, task=task, image_size=image.size)
    results[task] = parsed
    print(f"[Maya] {{task}} result: {{str(parsed)[:200]}}")

print()
print("[Maya] === VLM_RESULTS ===")
# Flatten results for JSON serialization
output = {{}}
for task, result in results.items():
    if isinstance(result, dict):
        for k, v in result.items():
            output[f"{{task}}_{{k}}"] = str(v)
    else:
        output[task] = str(result)
print(json.dumps(output, indent=2))
print("[Maya] === END_VLM ===")
print("[Maya] Prescription analysis complete.")
"""
