# DevIllustrate AI – Technical Documentation Graphic Generator (Python + Streamlit)

Full Python + Streamlit conversion of the React + Express **DevIllustrate AI** application. Converts natural-language technical descriptions into clean documentation graphics using **Stable Diffusion (Hugging Face Diffusers + PyTorch)** and adds crisp titles, numbered component markers, and auto-wrapped legends using **Pillow (PIL)**.

## Project Structure

```text
DevIllustrate-AI/
├── app.py              # Main Streamlit UI (Studio & Outputs views + Swiss theme CSS)
├── config.py           # Brand palette, 4 visual styles, 4 sample presets, generation bounds
├── prompt_engine.py    # Deterministic template enhancement + optional Gemini API enhancement
├── generator.py        # PyTorch + Diffusers Stable Diffusion (CUDA GPU + MPS + CPU fallback)
├── labeler.py          # Pillow smart labeler (manual 0.0–1.0 markers, boundary clamping, legend)
├── database.py         # SQLite history database (outputs/devillustrate.db) + disk PNG cleanup
├── requirements.txt    # Python dependencies
├── README.md           # Setup & usage guide
├── assets/             # 4 pre-rendered sample technical illustrations
├── outputs/            # Archived original & labeled PNG files + SQLite DB
└── utils/
    ├── __init__.py
    └── helpers.py      # Filename slugs, hex-to-RGB, PNG bytes, coordinate clamping
```

## Key Features Preserved from React + Express

- **Same Swiss Technical Branding & Layout**: `#F8FAFC` light studio canvas, `#FFFFFF` bordered surfaces, `#0F172A` slate ink, `#1D4ED8` engineering cobalt accents, `Plus Jakarta Sans` / `DM Sans` / `JetBrains Mono` typography, and Blueprint dark Prussian navy (`#0A1E34`) canvas framing.
- **Studio & Outputs Navigation**: Two-page workspace (`Studio` and `Outputs`) plus a top-bar **Download PNG** action.
- **4 Built-in Sample Presets + Custom PNG/JPG Upload**: Cloud Computing Architecture (*Professional 3D*), Neural Network Architecture (*Isometric*), Client-Server Application (*Flat Vector*), and Database Management System (*Blueprint*), plus upload support for annotating external images.
- **Prompt Enhancement & Negative Prompts**: Offline deterministic template rules (`prompt_engine.enhance_prompt_template`) plus optional AI Prompt Enhancement via `google-genai` when `GEMINI_API_KEY` is configured.
- **Stable Diffusion Generation**: Adjustable inference steps (`15–50`), guidance scale (`1.0–15.0`), resolution (`512×512` up to `1024×1024`), deterministic seed + randomize, CUDA GPU `float16` with attention/VAE slicing, and safe CPU `float32` fallback.
- **Smart Labeling (`labeler.py`)**: Title, subtitle, 5 marker accent colors, inline callout tags, 2-column auto-wrapped legend, boundary clamping, and strict `0.00–1.00` coordinate validation.
  - **Transparency Disclosure**: Component marker coordinates `(x, y)` are **manually provided by the user** between `0.00` and `1.00`, not automatically detected by an object-detection model.
- **Original vs. Labeled Comparison & PNG Download**: Switch between *Side-by-Side*, *Labeled*, and *Original* previews, and download either Original PNG or Smart Labeled PNG.
- **SQLite Outputs Archive (`database.py`)**: Searchable, style-filterable gallery of archived diagrams with *Open in Studio*, *Download PNG*, and *Delete* (removing both DB row and PNG files on disk).

## Migration Note: Direct Click-to-Place Coordinates

In the React version, clicking directly on the HTML `<img>` element captured relative `(x, y)` click coordinates. Native Streamlit `st.image` does not expose pixel click events out of the box, so `app.py` provides clean numeric `X (0.00–1.00)` and `Y (0.00–1.00)` inputs with immediate live preview updates. If you want click-to-place coordinates in Streamlit later, you can optionally install `streamlit-image-coordinates`.

## Running Locally

```bash
cd DevIllustrate-AI
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt

# Optional: enable AI Prompt Enhancement via Gemini API
export GEMINI_API_KEY="your_api_key_here"

streamlit run app.py --server.port 8501
```

Open `http://localhost:8501` in your browser.

## Running in Google Colab (Free T4 GPU + Cloudflare Tunnel)

1. Switch runtime to GPU: **Runtime → Change runtime type → T4 GPU**.
2. Upload `DevIllustrate-AI.zip` to Colab and run:

```python
!unzip -o DevIllustrate-AI.zip -d .
!pip install -q -r DevIllustrate-AI/requirements.txt
!wget -q https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
!dpkg -i cloudflared-linux-amd64.deb > /dev/null 2>&1
```

3. Verify PyTorch, Diffusers, CUDA GPU, and generate a real test PNG before launching the UI:

```python
!python DevIllustrate-AI/verify_runtime.py --run-generation --width 512 --height 512 --steps 20
```

Expected output: `"dependencies_ready": true`, `"device_label": "CUDA GPU"`, `"generation_verified": true`, and a non-empty PNG saved at `DevIllustrate-AI/outputs/runtime_verification_test.png`.

4. Start Streamlit and create a public HTTPS URL:

```python
import subprocess, time
subprocess.Popen([
    "streamlit", "run", "DevIllustrate-AI/app.py",
    "--server.port", "8501",
    "--server.headless", "true",
])
time.sleep(4)
!cloudflared tunnel --url http://localhost:8501
```

5. Optional VRAM optimization (if running `1024×1024` or larger models on a 15 GB T4 GPU):

```python
%env SD_CPU_OFFLOAD=1
```

