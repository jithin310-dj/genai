# DevIllustrate AI – Technical Documentation Graphic Generator

DevIllustrate AI is a full-stack React + Express web application for generating technical illustrations and documentation graphics using **Hugging Face Inference Providers** (FLUX.1 and Stable Diffusion) and **Gemini** prompt enhancement / SVG diagram synthesis, paired with automatic retries, cross-engine fallback, health checks, and an interactive **Smart Labeling** studio.

## Setting Up Environment Variables

All tokens and keys stay strictly on the server (never prefixed with `VITE_`).

### 1. Hugging Face Token (`HF_TOKEN`)

1. Sign in to Hugging Face and open **[huggingface.co/settings/tokens](https://huggingface.co/settings/tokens)**.
2. Click **Create new token** → choose **Fine-grained** → enable **Make calls to Inference Providers**.
3. Copy the `hf_...` token and set `HF_TOKEN` in `.env` or **Settings → Secrets**.

### 2. Gemini Models & Key (`GEMINI_API_KEY`, `GEMINI_MODEL`, `GEMINI_FALLBACK_MODEL`)

```env
GEMINI_API_KEY="your_gemini_api_key"
GEMINI_MODEL="gemini-3.1-flash-lite"
GEMINI_FALLBACK_MODEL="gemini-4-hydrogen"
HF_TOKEN=your_token_here
```

- If `GEMINI_MODEL` returns `503` (busy/overloaded) or `429`, the server automatically retries with exponential backoff and then falls back once to `GEMINI_FALLBACK_MODEL`.
- `GET /api/health` checks both providers using non-billable metadata endpoints so the Studio shows live availability before generating.

## Verified Hugging Face Text-to-Image Models

- `black-forest-labs/FLUX.1-schnell` *(Default — fast, lowest credit usage at 768×768)*
- `black-forest-labs/FLUX.1-dev` *(Higher detail — uses more credits)*
- `stabilityai/stable-diffusion-3.5-large` *(Detailed scene adherence)*
- `stabilityai/stable-diffusion-xl-base-1.0` *(Classic SDXL)*

## Running the App

```bash
npm install
cp .env.example .env
npm run dev
```

Open `http://localhost:3000` in your browser. For a production build:

```bash
npm run build
NODE_ENV=production npm start
```
