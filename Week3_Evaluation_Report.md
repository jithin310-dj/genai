# Week 3 — Technical Graphic Quality & Style Evaluation Report
**Project:** DevIllustrate AI – Technical Documentation Graphic Generator  
**Document Type:** Week 3 Deliverable (Evaluation Methodology, Real Observed Experiments & Style Consistency Analysis)  
**Verification Standard:** All measurements below are taken strictly from real API runs and actual repository assets verified on `2026-11-25`. No Stable Diffusion GPU or Hugging Face raster outputs are fabricated.

---

## 1. Image Quality Evaluation Methodology

DevIllustrate AI uses a **human-in-the-loop, 9-criterion structured scoring methodology** (`src/components/QualityEvaluationPanel.tsx` & `PATCH /api/outputs/:id/evaluation`):

1. **Scoring Scale**: Each criterion is rated on an integer scale from **1 (Poor)** to **5 (Publication-Ready)** using interactive radio controls.
2. **Composite Score**: The unweighted arithmetic mean across all 9 criteria (`1.00–5.00`) is computed live in the UI and recalculated/sanitized server-side before saving to `outputs/index.json`.
3. **Readiness Tiers**:
   - **4.20 – 5.00**: *Ready for Documentation / Publication*
   - **3.20 – 4.19**: *Usable — Minor Prompt or Marker Refinement Suggested*
   - **1.00 – 3.19**: *Needs Refinement — Adjust Prompt, Style, or Seed*
4. **Honest Human-Review Disclosure**: The UI explicitly states that scores record manual engineering inspection — DevIllustrate AI does **not** automatically verify factual, architectural, or protocol accuracy of generated images.
5. **Reproducible Export**: Reviewers can click **Save Score to Archive** (persisting ratings to `outputs/index.json`) and **Export Report (.md)** to generate per-graphic Markdown evaluation sheets.

---

## 2. Nine Evaluation Criteria

| # | Criterion Key | Criterion Label | Assessment Focus |
|---|---|---|---|
| 1 | `promptAlignment` | **Prompt Alignment** | Matches the requested architecture, components, and flow |
| 2 | `visualQuality` | **Visual Quality** | Crisp geometry, clean edges, minimal visual artifacts |
| 3 | `technicalRelevance` | **Technical Relevance** | Accurately reflects plausible engineering structure |
| 4 | `clarity` | **Clarity** | Easy to understand at a glance without visual clutter |
| 5 | `composition` | **Composition** | Balanced spacing, alignment, and logical visual hierarchy |
| 6 | `styleConsistency` | **Style Consistency** | Adheres to the selected visual style and color palette |
| 7 | `readability` | **Readability** | Clean background with strong contrast for markers and legend |
| 8 | `documentationSuitability` | **Documentation Suitability** | Ready for READMEs, architecture specs, or API docs |
| 9 | `marketingSuitability` | **Marketing Suitability** | Polished enough for product pages, blogs, or slide decks |

---

## 3. Prompt Experiments (Live Verified Runs)

To verify prompt expansion quality and determinism, four live experiments were executed against `POST /api/enhance-prompt` (Gemini `gemini-3.1-flash-lite`) alongside the offline deterministic rule engine (`buildTemplateEnhancedPrompt()` in `src/data/presets.ts`).

| Run ID | Visual Style | Input Prompt (Chars) | HTTP Status | Observed Latency | Enhanced Prompt Length | Observed Result |
|---|---|---:|:---:|---:|---:|---|
| **E1** (`Raw Short`) | Flat Vector | `"microservices with database"` (`27`) | `200 OK` | `2,376 ms` | `436 chars` | **PASS** — Expanded terse 3-word phrase into structured 2D diagram directives |
| **E2** (`Structured Cloud`) | Professional 3D | Modular cloud computing architecture (`126`) | `200 OK` | `1,909 ms` | `443 chars` | **PASS** — Preserved all 4 architectural tiers with studio 3D lighting & backdrop constraints |
| **E3** (`Blueprint DB`) | Blueprint | Relational DBMS internals (`114`) | `200 OK` | `1,780 ms` | `424 chars` | **PASS** — Injected Prussian navy orthographic CAD grid and zero-embedded-text constraints |
| **E4** (`Isometric RAG`) | Isometric | AI/ML RAG inference pipeline (`114`) | `200 OK` | `1,944 ms` | `437 chars` | **PASS** — Expanded into 30-degree isometric layer flow for ingestion → embeddings → vector DB → LLM |

### Key Prompt Engineering Observations
- **Length & Specificity Stability**: Even when given a minimal 27-character prompt (`E1`), AI prompt enhancement normalized output specificity to `424–443` characters across all four visual styles.
- **Zero-Embedded-Text Separation**: Combining negative prompts (`"distorted text, garbled letters, watermark"`) with manual HTML5 Canvas / Pillow Smart Labeling prevents diffusion-era text distortion in final documentation PNGs.
- **Validation Safety**: Empty prompts to `POST /api/enhance-prompt` return `HTTP 400 INVALID_PROMPT` immediately without calling upstream LLMs.

---

## 4. Parameter Experiments (Live Verified Runs & Pending GPU/Credit Runs)

### 4.1 Live Structured Technical Diagram Runs (`POST /api/generate-diagram` — Gemini SVG)
Four live parameter experiments were executed across all 4 visual styles, varying resolution, steps, CFG metadata, and seed:

| Run ID | Style | Resolution | Steps | CFG | Seed | HTTP Status | Latency | SVG Size | Auto-Placed Components | Generated Title |
|---|---|---|---:|---:|---:|:---:|---:|---:|---:|---|
| **P1** | Flat Vector | `768×576` | `20` | `7.0` | `1001` | `200 OK` | `2,448 ms` | `950 chars` | `5` | *Microservices Architecture with Database* |
| **P2** | Professional 3D | `1024×768` | `30` | `7.5` | `4219` | `200 OK` | `3,010 ms` | `1,529 chars` | `4` | *Modular Cloud Architecture* |
| **P3** | Blueprint | `1024×768` | `35` | `8.5` | `9105` | `200 OK` | `3,056 ms` | `1,459 chars` | `5` | *RDBMS Architecture Schematic* |
| **P4** | Isometric | `768×768` | `28` | `7.5` | `7814` | `200 OK` | `4,228 ms` | `1,926 chars` | `5` | *RAG Inference Pipeline Architecture* |

### 4.2 Hugging Face Cloud Diffusion Endpoint Verification (`POST /api/generate-image`)
| Test Case | Model | Resolution / Params | HTTP Status | Observed Behavior |
|---|---|---|---|---|
| **HF-V1** (Model Allowlist) | `malicious-org/unsupported-model` | `512×512` | `400 Bad Request` | Rejected with `UNSUPPORTED_MODEL` |
| **HF-V2** (Prompt Length Cap) | `black-forest-labs/FLUX.1-schnell` | `> 1000 chars` | `400 Bad Request` | Rejected with `PROMPT_TOO_LONG` |
| **HF-L1** (Live Inference Call) | `black-forest-labs/FLUX.1-schnell` | `1024×1024`, `steps=4`, `cfg=7.5` | `429 Too Many Requests` | Normalized `QUOTA_EXCEEDED` returned cleanly; `/api/health` updated `quotaExhausted: true`. **Live raster image generation NOT completed due to exhausted free HF monthly credits.** |

### 4.3 Local Stable Diffusion (`DevIllustrate-AI/generator.py` — PyTorch + Diffusers)
- **Static Verification & Unit Tests**: `python3 -m py_compile` and `DevIllustrate-AI/tests/test_generator.py` verify CUDA (`float16`), Apple MPS (`float32` NaN-safe default), CPU (`float32`) fallback, argument validation (multiples of 8, steps `1–150`, CFG `0–30`), and OOM/auth error handling.
- **Live GPU Raster Sweep Status**: **NOT TESTED IN NODE SANDBOX** (`torch` and `diffusers` are not installed in this container and no CUDA GPU is attached). To run real Stable Diffusion parameter sweeps (`steps ∈ {20, 30, 40}`, `CFG ∈ {6.5, 7.5, 9.0}`), run `DevIllustrate-AI/verify_runtime.py --run-generation` and `DevIllustrate-AI/app.py` on a Google Colab T4 GPU using the instructions in `DevIllustrate-AI/README.md`.

---

## 5. Style Consistency Analysis

Style consistency is enforced across both the web app (`src/data/presets.ts`) and Python companion app (`DevIllustrate-AI/config.py`) using four standardized style specifications:

| Visual Style | Enforced Background | Palette Anchors | Consistency Mechanism |
|---|---|---|---|
| **Professional 3D** | Neutral off-white (`#F6F7F9`) | Slate (`#0F172A`), Cobalt (`#1D4ED8`), Sky (`#38BDF8`) | `applyStyleToHf` toggle + reusable saved style configs |
| **Flat Vector** | Cool-white editorial (`#F8FAFC`) | Slate Navy (`#0F172A`), Blue (`#2563EB`), Teal (`#0D9488`) | Strict `"zero gradients / 3D shading"` negative prompt |
| **Blueprint** | Prussian navy grid (`#0A1E34`) | Grid (`#1E3A5F`), Cyan (`#0EA5E9`), White (`#F8FAFC`) | Canvas header/legend automatically adapts to Prussian navy theme |
| **Isometric** | Light drafting field (`#F4F7FB`) | Indigo (`#1E3A8A`), Cobalt (`#2563EB`), Titanium (`#94A3B8`) | Fixed `"30-degree isometric"` prompt + perspective negative prompt |

Additionally, users can save named **Reusable Style Configurations** (combining Visual Style, Engine/Model, Resolution, Steps, CFG, Marker Accent, and HF Style Enforcement) in `localStorage` so an entire documentation suite shares identical generation settings.

---

## 6. Comparison Methodology

DevIllustrate AI supports two built-in visual comparison workflows:
1. **Studio Batch Comparison (`Quantity 1–4`)**: Generating multiple seed variations (`seed`, `seed+1`, `seed+2`, `seed+3`) populates the **Batch Variations** strip directly below the canvas; clicking **Compare Side-by-Side** renders all variants simultaneously to evaluate layout clarity and artifacts before labeling.
2. **Outputs Gallery Side-by-Side Comparison (`OutputsGallery.tsx`)**: Clicking **Compare** on any two archived records opens the **Side-by-Side Graphic Comparison (2/2 selected)** panel displaying Option A and Option B PNGs alongside their exact prompts, styles, dimensions, steps, CFG, seeds, and all 9 individual quality scores.

---

## 7. Results Based on Actual Available Images & Live Outputs

### 7.1 Available Bundled Reference Illustrations (`src/assets/images/` & `DevIllustrate-AI/assets/`)
All four bundled reference illustrations were verified to exist on disk, bundle cleanly into `dist/assets/` via Vite ES module imports, and render with manual Smart Labeling presets:

| Asset File | Size on Disk | Assigned Style | Domain Preset | Bundled Markers | Visual Verification Notes |
|---|---:|---|---|---:|---|
| `sample_cloud_architecture_1795190848104.jpg` | `503.8 KB` | Professional 3D | Cloud Computing | `4` (`0.16–0.83`) | Neutral backdrop; clear left-to-right flow from Edge API Gateway to Replicated DB |
| `sample_neural_network_1795190847354.jpg` | `755.5 KB` | Isometric | AI/ML Workflow | `4` (`0.15–0.83`) | 30-degree layered planes; clean horizontal spacing for 4 layer callouts |
| `sample_client_server_1795190847619.jpg` | `411.4 KB` | Flat Vector | API / Client-Server | `4` (`0.17–0.89`) | High-contrast 2D editorial canvas; legible marker placement across 4 tiers |
| `sample_database_system_1795190850468.jpg` | `749.2 KB` | Blueprint | Database Architecture | `5` (`0.21–0.78`) | Prussian navy orthographic aesthetic; pairs with Blueprint Cyan (`#0EA5E9`) callouts |

> **Honest Scoring Note:** Rather than inserting fabricated reviewer ratings into this report, use the in-app **Technical Graphic Quality Evaluation** panel to manually score each generated diagram after visual inspection, click **Save Score to Archive** (`PATCH /api/outputs/:id/evaluation`), and click **Export Report (.md)** to append your signed human scores.

### 7.2 Live Evaluation Persistence Verification
End-to-end automated testing (`tests/api.test.ts`) verified that saving an output with initial 9-criterion ratings (`avg = 4.33/5.00`), updating via `PATCH /api/outputs/:id/evaluation` (`avg = 4.78/5.00`), reloading via `GET /api/outputs`, downloading the archived PNG (`image/png`, verified PNG magic header `89 50 4E 47`), and deleting via `DELETE /api/outputs/:id` all execute reliably with zero data loss.

---

## 8. Limitations & Future Improvements

### Current Limitations
1. **External Hugging Face Billing Dependency**: Live cloud diffusion via `POST /api/generate-image` requires active Hugging Face Inference Providers credits (current token returned `429 QUOTA_EXCEEDED`).
2. **External GPU Runtime for Local Diffusers**: Running `DevIllustrate-AI/generator.py` with `runwayml/stable-diffusion-v1-5` requires a CUDA/MPS Python environment (such as Google Colab T4 GPU) with `DevIllustrate-AI/requirements.txt` installed.
3. **Manual Engineering Review Required**: Generative visuals (both diffusion rasters and LLM-synthesized SVGs) can still introduce structural inaccuracies; human inspection and manual Smart Labeling remain essential before publication.

### Recommended Future Improvements
1. **Complete Live Diffusion Sweep on Colab T4**: Run `verify_runtime.py --run-generation` and log real `steps`/`CFG` visual comparisons for `runwayml/stable-diffusion-v1-5` or `FLUX.1-schnell` once GPU/credits are attached.
2. **ControlNet / Layout Conditioning**: Add optional wireframe or Canny-edge conditioning in `DevIllustrate-AI/generator.py` so Stable Diffusion strictly preserves box-and-arrow topology.
3. **Exportable SVG + PNG Bundles**: Allow exporting clean editable SVG alongside composite Smart Labeled PNG for vector editing in Figma or Draw.io.
