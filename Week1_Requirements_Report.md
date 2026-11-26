# Week 1 — Requirements & Prompt Design Report
**Project:** DevIllustrate AI – Technical Documentation Graphic Generator  
**Document Type:** Week 1 Deliverable (Requirements Analysis, Visual Specification & Prompt Engineering Design)

---

## 1. Project Introduction

**DevIllustrate AI** is a generative AI application designed to transform natural-language engineering descriptions into clean, publication-ready technical illustrations, architecture visuals, and annotated documentation graphics.

The project is implemented as a cohesive dual-architecture system:
1. **Primary Web Application (`React 19 + TypeScript + Vite + Express`)**: Provides an interactive Studio workbench, Hugging Face Inference Providers cloud diffusion integration (`FLUX.1-schnell`, `FLUX.1-dev`, `Stable Diffusion 3.5 Large`, `Stable Diffusion XL 1.0`), Gemini API prompt enhancement and structured SVG diagram synthesis, interactive HTML5 Canvas Smart Labeling, a disk-backed Outputs archive with side-by-side comparison, and a 9-criterion Quality Evaluation rubric with Markdown report export.
2. **Companion Local Diffusion & Streamlit Application (`DevIllustrate-AI/`)**: Implements local Stable Diffusion (`runwayml/stable-diffusion-v1-5`) via PyTorch and Hugging Face `diffusers` (`StableDiffusionPipeline` + `DPMSolverMultistepScheduler`), Pillow-based smart labeling, SQLite persistence, and a Google Colab T4 GPU execution workflow.

---

## 2. Problem Statement

Software engineers, technical writers, developer advocates, and educators regularly need clear visual diagrams for architecture specs, READMEs, tutorials, and product pages. Existing workflows suffer from four recurring bottlenecks:
- **High manual effort**: Creating polished isometric, 3D, or CAD-style diagrams in vector tools requires specialized graphic design skills and hours of manual layout work.
- **Unpredictable generic AI outputs**: Raw text-to-image prompts frequently produce cluttered backgrounds, artistic artifacts, inconsistent palettes, and garbled AI-rendered text inside diagrams.
- **Lack of visual consistency**: Generating multi-diagram documentation sets without reusable style rules and negative prompts yields mismatched aesthetics across pages.
- **No structured review or annotation pipeline**: Teams need a repeatable way to attach clean human-verified callout labels, compare generated variants side-by-side, and score documentation readiness before publishing.

DevIllustrate AI addresses these gaps by combining structured technical prompt engineering, explicit style/negative-prompt templates, deterministic seed controls, manual Smart Labeling (to keep text crisp and human-verified rather than AI-hallucinated), and a 9-criterion human review rubric.

---

## 3. Project Objectives

### Core Functional Objectives
1. Enable text-to-image technical illustration generation from natural-language descriptions.
2. Provide structured technical prompt templates, automated prompt enhancement, and style-specific negative prompts.
3. Expose explicit generation parameters: model selection, resolution, inference steps, guidance scale (CFG), random/fixed seed, and multi-variant batch quantity (`1–4`).
4. Maintain visual consistency across four curated documentation styles with reusable custom style configurations.
5. Support gallery archiving, side-by-side graphic comparison, PNG export, and 9-criterion quality evaluation.

### Alignment with the Five Learning Objectives
| # | Learning Objective | Project Implementation |
|---|---|---|
| 1 | **Understand diffusion-based text-to-image generation** | Exposed steps, CFG, seed, negative prompt, resolution, scheduler (`DPMSolverMultistepScheduler`), and FLUX vs. SDXL/SD3.5 model controls. |
| 2 | **Design structured technical prompts** | 10-domain Structured Technical Prompt Builder, target audience modifiers, rule-based + Gemini prompt enhancement, and anti-artifact negative prompts. |
| 3 | **Implement Stable Diffusion with Diffusers** | Local PyTorch + Diffusers pipeline (`DevIllustrate-AI/generator.py`) with CUDA/MPS/CPU handling plus cloud Hugging Face Inference Providers (`server/huggingface.ts`). |
| 4 | **Control & improve technical graphics** | 4 visual styles with defined hex palettes, reusable style configs, batch generation (`1–4`), interactive Smart Labeling, and side-by-side comparison. |
| 5 | **Evaluate visual & documentation quality** | 9-criterion human review rubric (`QualityEvaluationPanel.tsx`), server persistence (`PATCH /api/outputs/:id/evaluation`), and `.md` report export. |

### Four-Week Deliverable Roadmap
- **Week 1:** Requirements analysis, visual specification, and structured prompt engineering design (`Week1_Requirements_Report.md`).
- **Week 2:** Stable Diffusion generation pipeline (`DevIllustrate-AI/generator.py`, `verify_runtime.py`, and `server/huggingface.ts`).
- **Week 3:** Technical graphic quality & style evaluation methodology and documented experiment results (`Week3_Evaluation_Report.md`).
- **Week 4:** Complete production web application (`React + Express`), companion Python/Streamlit codebase (`DevIllustrate-AI/`), and automated test suite.

---

## 4. Technical Graphic Categories (10 Domains)

DevIllustrate AI explicitly targets all 10 required engineering visual domains (codified in `src/data/presets.ts` as `TECHNICAL_PROMPT_TEMPLATES`):

| # | Technical Domain | Default Template Example | Recommended Style | Default Audience |
|---|---|---|---|---|
| 1 | **Software Architecture** | Microservices & Event Bus | Isometric | Technical Documentation |
| 2 | **System Design** | High-Availability Distributed System | Professional 3D | Technical Documentation |
| 3 | **Workflow Diagram** | CI/CD Deployment Pipeline | Flat Vector | Developer Tutorial |
| 4 | **Database Architecture** | Relational DBMS & Sharded Storage | Blueprint | Technical Documentation |
| 5 | **API Communication** | REST & Webhook Request Lifecycle | Flat Vector | Developer Tutorial |
| 6 | **Network Architecture** | Zero-Trust VPC & Firewall Topology | Blueprint | Technical Documentation |
| 7 | **Cloud Computing** | Multi-AZ Cloud Infrastructure | Professional 3D | Technical Documentation |
| 8 | **AI/ML Workflow** | LLM & RAG Inference Pipeline | Isometric | Technical Documentation |
| 9 | **Developer Tutorial** | Full-Stack State & Data Flow | Flat Vector | Developer Tutorial |
| 10 | **Product & Marketing** | Developer Platform Hero Graphic | Professional 3D | Product & Marketing |

---

## 5. Prompt Engineering Methodology

### 5.1 Four-Part Structured Prompt Anatomy
Raw user prompts (e.g., `"microservices with database"`) are expanded into four deterministic components:

```text
[Technical Subject & Components] + [Visual Style Directive] + [Audience Composition Modifier] + [Clean Backdrop & Zero-Embedded-Text Constraint]
```

1. **Technical Subject & Key Components**: Specifies concrete engineering modules (e.g., API Gateway, Load Balancer, Redis Cache, Primary-Replica Database) and directional data flow.
2. **Visual Style Directive**: Enforces consistent rendering grammar (e.g., 30-degree isometric planes, Swiss flat 2D vector outlines, Prussian navy orthographic CAD blueprint, or studio-lit 3D industrial modules).
3. **Target Audience Modifier** (`AUDIENCE_MODIFIERS`):
   - *Technical Documentation*: `"structured engineering reference layout, balanced orthogonal spacing, clear component separation for technical manuals"`
   - *Developer Tutorial*: `"clear step-by-step left-to-right visual flow, unmistakable directional arrows, approachable educational clarity"`
   - *Product & Marketing*: `"polished editorial hero composition, refined visual depth, cohesive brand-ready presentation suitable for product landing pages"`
4. **Zero-Embedded-Text Rule & Negative Prompts**: Instructs diffusion models to omit embedded text (`"zero embedded text or letters"`) paired with negative prompts (`"distorted text, garbled letters, watermark, blurry, noisy background"`) so crisp, accurate labels are applied afterwards by the **Smart Labeling** canvas/Pillow renderer.

### 5.2 Dual Prompt Enhancement Workflow
- **Deterministic Template Rules (Offline / Zero-Latency)**: Implemented in `buildTemplateEnhancedPrompt()` (`src/data/presets.ts`) and `enhance_prompt_template()` (`DevIllustrate-AI/prompt_engine.py`). Guaranteed repeatable output with zero API cost.
- **AI Prompt Enhancement (`POST /api/enhance-prompt`)**: Uses Gemini (`gemini-3.1-flash-lite` primary, `gemini-4-hydrogen` fallback) to expand terse engineering descriptions into rich, diffusion-ready visual specifications while respecting style guidelines.

---

## 6. Visual Requirements

### 6.1 Visual Style System & Color Palettes
| Style | Aesthetic Summary | Clean Background Rule | Primary Color Palette | Default Marker Accent |
|---|---|---|---|---|
| **Professional 3D** | Studio-lit 3D hardware modules & architectural conduits | Neutral off-white studio backdrop | `#F6F7F9`, `#0F172A`, `#1D4ED8`, `#38BDF8`, `#94A3B8` | `#1D4ED8` (Cobalt Blue) |
| **Flat Vector** | Crisp Swiss 2D geometric diagrams for engineering docs | Clean cool-white editorial canvas | `#F8FAFC`, `#0F172A`, `#2563EB`, `#0D9488`, `#CBD5E1` | `#0F172A` (Slate Navy) |
| **Blueprint** | Orthographic CAD technical drafting on dark grid | Prussian navy orthographic grid | `#0A1E34`, `#1E3A5F`, `#0EA5E9`, `#7DD3FC`, `#F8FAFC` | `#0EA5E9` (Blueprint Cyan) |
| **Isometric** | 30-degree layered isometric planes & topologies | Light cool gray-blue drafting field | `#F4F7FB`, `#1E3A8A`, `#2563EB`, `#94A3B8`, `#E2E8F0` | `#2563EB` (Engineering Blue) |

### 6.2 Output Resolution & Parameter Standards
- **Supported Resolutions (all multiples of 8 for Stable Diffusion UNet/VAE compatibility)**:
  - `512 × 512` (Square · Lowest compute / credits)
  - `768 × 768` (Square · Default)
  - `768 × 576` (4:3 Standard documentation figure)
  - `1024 × 768` (4:3 HD technical documentation)
  - `1024 × 1024` (Square HD hero visual)
- **Inference Controls**: Steps (`15–50`, clamped safely per model such as `1–8` on `FLUX.1-schnell`), Guidance Scale (`1.0–15.0`, omitted for distilled FLUX schnell), deterministic Seed, and Batch Quantity (`1–4` variations with incremented seeds `seed + i`).
- **Smart Labeling Standards**: Normalized coordinates `(x, y) ∈ [0.00, 1.00]` placed manually by the user (explicitly disclosed as manual placement, not automated object detection), numbered circular callouts, title/subtitle framing, and auto-wrapped multi-column legend exported as lossless PNG.

---

## 7. Structured Prompt Templates (All 10 Domains)

Below are the production prompt templates implemented in `src/data/presets.ts`:

1. **Software Architecture (`Microservices & Event Bus`)**:  
   *"Modular software architecture diagram illustrating an API gateway routing traffic to decoupled microservices connected through an asynchronous event bus and isolated data stores"*
2. **System Design (`High-Availability Distributed System`)**:  
   *"High-availability distributed system design illustration showing global edge caching, active-active load balancing, stateless compute clusters, in-memory cache layer, and replicated storage"*
3. **Workflow Diagram (`CI/CD Deployment Pipeline`)**:  
   *"Clean left-to-right CI/CD engineering workflow diagram depicting source commit, automated build and security scanning stages, artifact registry, and staged production rollout"*
4. **Database Architecture (`Relational DBMS & Sharded Storage`)**:  
   *"Detailed database architecture diagram showing connection pooling, SQL query planner, B-Tree index hierarchy, write-ahead log buffer, and partitioned persistent storage nodes"*
5. **API Communication (`REST & Webhook Request Lifecycle`)**:  
   *"Structured API communication diagram showing client applications sending HTTPS requests through an authentication gateway to backend REST endpoints with asynchronous webhook callbacks"*
6. **Network Architecture (`Zero-Trust VPC & Firewall Topology`)**:  
   *"Enterprise network architecture topology showing edge firewall inspection, segmented DMZ and private VPC subnets, internal routing switches, and encrypted site-to-site gateway"*
7. **Cloud Computing (`Multi-AZ Cloud Infrastructure`)**:  
   *"Cloud computing architecture illustration showing multi-availability-zone container orchestration, auto-scaling compute clusters, managed object storage, and centralized telemetry monitoring"*
8. **AI/ML Workflow (`LLM & RAG Inference Pipeline`)**:  
   *"AI/ML retrieval-augmented generation workflow illustration showing document chunking, vector embedding encoder, vector index database, semantic retriever, and model inference node"*
9. **Developer Tutorial (`Full-Stack State & Data Flow`)**:  
   *"Step-by-step developer tutorial visual showing frontend UI state transitions, client fetch layer, server API validation middleware, and database persistence flow"*
10. **Product & Marketing (`Developer Platform Hero Graphic`)**:  
    *"Sleek product marketing technical hero illustration showcasing a modular developer cloud platform hub radiating clean precision conduits to integrated APIs, analytics, and deployment nodes"*

---

## 8. Development Environment

### Web Application Stack (Port `3000`)
- **Runtime**: Node.js `v22.x`, TypeScript (`tsc --noEmit`)
- **Frontend**: React `19`, Vite `8`, Tailwind CSS `4`, Lucide React icons, HTML5 Canvas Smart Labeling
- **Backend**: Express `4` (`server.ts`), `@huggingface/inference` (`server/huggingface.ts`), `@google/genai` (`server/gemini.ts`), filesystem PNG/JSON persistence (`outputs/`)
- **Automated Testing**: Vitest, React Testing Library, `@testing-library/user-event`, `jsdom`
- **Security**: Server-side-only `HF_TOKEN` and `GEMINI_API_KEY`, allowlisted HF models, IP rate limiting, normalized error responses

### Companion Local Diffusion Stack (`DevIllustrate-AI/`)
- **Runtime**: Python `3.11+` (recommended on Google Colab T4 GPU or local CUDA/Apple Silicon machine)
- **ML Libraries (`requirements.txt`)**: `torch>=2.1.0`, `diffusers>=0.27.2`, `transformers>=4.39.0`, `accelerate>=0.28.0`, `safetensors>=0.4.2`
- **UI & Imaging**: `streamlit>=1.35.0`, `pillow>=10.2.0`, `google-genai>=1.10.0`, `python-dotenv>=1.0.1`, SQLite (`outputs/devillustrate.db`)

---

## 9. Evaluation Criteria

### 9.1 Graphic Quality Evaluation Rubric (9 Criteria, 1–5 Scale)
Every generated or annotated technical graphic is scored manually by a human reviewer across:
1. **Prompt Alignment** — Matches requested architecture, components, and flow.
2. **Visual Quality** — Crisp geometry, clean edges, minimal visual artifacts.
3. **Technical Relevance** — Accurately reflects plausible engineering structure.
4. **Clarity** — Understandable at a glance without visual clutter.
5. **Composition** — Balanced spacing, alignment, and logical hierarchy.
6. **Style Consistency** — Adheres to the chosen visual style and color palette.
7. **Readability** — Clean backdrop with strong contrast for markers and legend.
8. **Documentation Suitability** — Ready for READMEs, specs, or API docs.
9. **Marketing Suitability** — Polished enough for product pages, blogs, or slides.

> **Transparency Principle:** DevIllustrate AI does **not** claim automated factual or architectural verification; all nine scores represent structured human review.

### 9.2 Official Project Evaluation Weightage (100 Points)
| Evaluation Category | Weight |
|---|---|
| Prompt Engineering & Technical Relevance | 15% |
| Stable Diffusion & Diffusers Implementation | 25% |
| Visual Quality & Style Consistency | 20% |
| UI Usability & Workflow Completeness | 15% |
| Quality Evaluation & Documentation Support | 15% |
| Code Quality, Reliability & Security | 10% |
| **Total** | **100%** |
