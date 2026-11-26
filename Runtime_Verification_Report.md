# DevIllustrate AI — Stable Diffusion Runtime Verification Report

**Project:** DevIllustrate AI – Technical Documentation Graphic Generator  
**Companion Diffusers Package:** `DevIllustrate-AI/` (`generator.py`, `verify_runtime.py`, `config.py`, `requirements.txt`)  
**Colab T4 Notebook:** `DevIllustrate-AI/DevIllustrate_Colab_T4_Verification.ipynb`  
**Honesty & Evidence Policy:** No GPU execution results, timings, or generated PNGs are fabricated below. Section 1 documents everything actually verified in this sandbox; Section 2 provides the exact Google Colab T4 GPU execution workflow that automatically records real GPU timings, SHA-256 checksums, and verified PNG evidence.

---

## 1. Actual Evidence Verified in This Workspace Sandbox

### 1.1 Inspected `DevIllustrate-AI/requirements.txt`
```text
torch>=2.1.0
diffusers>=0.27.2
transformers>=4.39.0
accelerate>=0.28.0
safetensors>=0.4.2
huggingface-hub>=0.23.0
streamlit>=1.35.0
pillow>=10.2.0
google-genai>=1.10.0
python-dotenv>=1.0.1
```

### 1.2 Critical Model ID Fix Discovered During Inspection
- **Issue Found:** `DevIllustrate-AI/config.py` previously referenced `runwayml/stable-diffusion-v1-5`, which was removed from Hugging Face Hub and fails with `404 Repository Not Found` in Colab.
- **Fix Applied:** Updated `DEFAULT_MODEL_ID` in `DevIllustrate-AI/config.py` to:
  ```python
  DEFAULT_MODEL_ID = os.getenv("SD_MODEL_ID", "stable-diffusion-v1-5/stable-diffusion-v1-5")
  ```
  `stable-diffusion-v1-5/stable-diffusion-v1-5` is the active public community mirror maintained for Diffusers and requires no gated access token for default testing.

### 1.3 Static & Automated Verification Results (Observed in Sandbox)

| Verification Step | Command Executed | Actual Observed Result | Status |
|---|---|---|---|
| Python Syntax Check | `python3 -m py_compile DevIllustrate-AI/*.py DevIllustrate-AI/utils/*.py DevIllustrate-AI/tests/*.py` | `0` syntax errors | **PASS** |
| Generator Unit Tests | `python3 -m unittest DevIllustrate-AI/tests/test_generator.py -v` | `7 / 7` tests passed (`CUDA float16`, `MPS float32 NaN-safe`, `CPU float32`, missing dependency diagnostics, argument validation, auth/OOM formatting, honest `verify_runtime()`) | **PASS** |
| Sandbox Runtime Diagnostic | `python3 DevIllustrate-AI/verify_runtime.py` | `"dependencies_ready": false`, `"device_label": "Unavailable"`, `"missing_packages": ["torch>=2.1.0", "diffusers>=0.27.2", "transformers>=4.39.0", "accelerate>=0.28.0", "safetensors>=0.4.2", "pillow>=10.2.0"]`, `"generation_verified": false` | **VERIFIED HONEST (No GPU / ML deps in Node container)** |
| Live Stable Diffusion T4 GPU Image Generation | Requires Google Colab T4 GPU (`DevIllustrate_Colab_T4_Verification.ipynb`) | **Not executed in this Node.js container** (no CUDA GPU or PyTorch runtime attached) | **PENDING COLAB T4 EXECUTION** |

---

## 2. Complete Google Colab T4 GPU Execution Workflow

To execute the final live Stable Diffusion T4 GPU verification and generate real evidence (`colab_t4_cloud_architecture.png` + `Colab_Runtime_Verification_Report.md`):

### Option A — One-Click Notebook (Recommended)
1. Open [Google Colab](https://colab.research.google.com/) and upload `DevIllustrate-AI/DevIllustrate_Colab_T4_Verification.ipynb`.
2. Switch runtime to GPU: **Runtime → Change runtime type → T4 GPU → Save**.
3. Run all cells sequentially. When prompted in Step 1, upload `DevIllustrate-AI-Python-Streamlit.zip` (rebuilt with the updated `config.py`, `generator.py`, `verify_runtime.py`, and `requirements.txt`).
4. Step 5 executes `verify_runtime.py --run-generation` and automatically writes your actual GPU measurements (device, VRAM, dtype, model load seconds, inference seconds, PNG byte size, verified dimensions, SHA-256 hash) to `DevIllustrate-AI/outputs/Colab_Runtime_Verification_Report.md`.
5. Step 6 verifies the PNG file exists, is non-empty, starts with the `\x89PNG\r\n\x1a\n` signature, and displays the rendered image inline.

### Option B — Manual Colab Cell Commands
```python
# 1. Extract project & install dependencies
!unzip -qo DevIllustrate-AI-Python-Streamlit.zip -d .
!pip install -q --upgrade -r DevIllustrate-AI/requirements.txt

# 2. Verify PyTorch, CUDA GPU & Diffusers
!nvidia-smi
import torch, diffusers, transformers, accelerate, safetensors, PIL
print("PyTorch:", torch.__version__, "| CUDA:", torch.cuda.is_available())
if torch.cuda.is_available():
    print("GPU:", torch.cuda.get_device_name(0))
print("Diffusers:", diffusers.__version__, "| Transformers:", transformers.__version__)

# 3. Run baseline runtime verification check
!python DevIllustrate-AI/verify_runtime.py

# 4. Run actual Stable Diffusion technical illustration generation & record evidence report
!python DevIllustrate-AI/verify_runtime.py \
  --run-generation \
  --prompt "clean professional 3D cloud computing microservices architecture diagram showing an API gateway, application load balancer, auto-scaling compute cluster, and replicated database cylinders, crisp directional data pathways, neutral off-white studio backdrop, sharp focus, zero embedded text" \
  --negative-prompt "blurry, low resolution, watermark, distorted text, garbled letters, messy cables, cartoon characters, noisy background" \
  --width 768 \
  --height 576 \
  --steps 30 \
  --guidance-scale 7.5 \
  --seed 4219 \
  --output DevIllustrate-AI/outputs/colab_t4_cloud_architecture.png \
  --report-md DevIllustrate-AI/outputs/Colab_Runtime_Verification_Report.md

# 5. Verify PNG exists, is non-empty, and display inline
from pathlib import Path
from PIL import Image
from IPython.display import display, Markdown

png_path = Path("DevIllustrate-AI/outputs/colab_t4_cloud_architecture.png")
assert png_path.exists() and png_path.stat().st_size > 0
assert png_path.read_bytes()[:8] == b"\x89PNG\r\n\x1a\n"
img = Image.open(png_path)
print(f"Verified PNG: {png_path} ({png_path.stat().st_size:,} bytes, {img.size[0]}x{img.size[1]})")
display(img)
display(Markdown(Path("DevIllustrate-AI/outputs/Colab_Runtime_Verification_Report.md").read_text()))
```

---

## 3. Secure Hugging Face Authentication (For Optional Gated Models)

The default model **`stable-diffusion-v1-5/stable-diffusion-v1-5`** is public and works **without** an authentication token.

If you switch `SD_MODEL_ID` to a gated model (such as `stabilityai/stable-diffusion-3.5-large` or `black-forest-labs/FLUX.1-dev`):
1. Accept the model license on its Hugging Face model card.
2. Create a **Read-only** access token at `https://huggingface.co/settings/tokens`.
3. In Google Colab, open the **Secrets** panel (key icon on the left sidebar), add secret name **`HF_TOKEN`**, paste your token, and toggle **Notebook access** ON.
4. Load it securely at runtime (never hardcode tokens in code or notebooks):
   ```python
   import os
   from google.colab import userdata
   from huggingface_hub import login

   token = userdata.get("HF_TOKEN")
   os.environ["HF_TOKEN"] = token
   login(token=token, add_to_git_credential=False)
   ```
   `DevIllustrate-AI/generator.py` automatically reads `os.getenv("HF_TOKEN") or os.getenv("HUGGINGFACE_HUB_TOKEN")` and passes `token=...` to `StableDiffusionPipeline.from_pretrained()`.

---

## 4. Actual GPU Execution Record (To Be Populated Automatically by Colab T4 Run)

| Metric | Sandbox Status | Populated By Colab T4 Run |
|---|---|---|
| **Model ID** | `stable-diffusion-v1-5/stable-diffusion-v1-5` | Recorded automatically in `Colab_Runtime_Verification_Report.md` |
| **Compute Device & Dtype** | `Unavailable` (Node sandbox) | Expected `CUDA GPU (Tesla T4, float16)` |
| **Resolution / Steps / CFG / Seed** | `768×576`, `30 steps`, `CFG 7.5`, `seed 4219` | Recorded automatically |
| **Model Load Time (`load_seconds`)** | `Not executed` | Measured live via `time.perf_counter()` |
| **Inference Time (`generation_seconds`)** | `Not executed` | Measured live via `time.perf_counter()` |
| **PNG Verification (`exists`, `bytes`, `89 50 4E 47`, `dims`, `SHA-256`)** | `Not executed` | Verified automatically by `verify_runtime.py` |
| **Result** | **Pending Colab T4 GPU Run** | **PASS** once `generation_verified: true` on Colab T4 |
