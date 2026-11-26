import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  checkGeminiHealth,
  enhanceTechnicalPrompt,
  generateTechnicalDiagramSvg,
  normalizeGeminiError,
} from './server/gemini.ts';
import {
  checkHfHealth,
  checkHfRateLimit,
  DEFAULT_HF_HEIGHT,
  DEFAULT_HF_MODEL,
  DEFAULT_HF_WIDTH,
  generateHuggingFaceImage,
  HF_MODELS,
  isHfTokenConfigured,
  normalizeHfError,
} from './server/huggingface.ts';
import { ProviderError, type ProviderId } from './server/providerUtils.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const OUTPUTS_DIR = path.resolve(__dirname, 'outputs');
const METADATA_FILE = path.join(OUTPUTS_DIR, 'index.json');

interface QualityEvaluationRecord {
  ratings: Record<string, number>;
  averageScore: number;
  notes: string;
  evaluatedAt: string;
}

interface SavedOutputRecord {
  id: string;
  title: string;
  prompt: string;
  enhancedPrompt: string;
  style: string;
  width: number;
  height: number;
  steps: number;
  guidanceScale: number;
  seed: number;
  createdAt: string;
  originalFile: string;
  labeledFile: string;
  componentCount: number;
  components: Array<{
    id: string;
    name: string;
    description: string;
    x: number;
    y: number;
  }>;
  evaluation?: QualityEvaluationRecord;
}

function sanitizeEvaluation(raw: unknown): QualityEvaluationRecord | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const obj = raw as Record<string, unknown>;
  if (!obj.ratings || typeof obj.ratings !== 'object') return undefined;

  const allowedKeys = [
    'promptAlignment',
    'visualQuality',
    'technicalRelevance',
    'clarity',
    'composition',
    'styleConsistency',
    'readability',
    'documentationSuitability',
    'marketingSuitability',
  ];
  const ratings: Record<string, number> = {};
  let sum = 0;
  for (const key of allowedKeys) {
    const val = Number((obj.ratings as Record<string, unknown>)[key]);
    const clamped = Number.isFinite(val) ? Math.min(5, Math.max(1, Math.round(val))) : 3;
    ratings[key] = clamped;
    sum += clamped;
  }

  return {
    ratings,
    averageScore: Number((sum / allowedKeys.length).toFixed(2)),
    notes: typeof obj.notes === 'string' ? obj.notes.trim().slice(0, 1000) : '',
    evaluatedAt:
      typeof obj.evaluatedAt === 'string' && obj.evaluatedAt.trim()
        ? obj.evaluatedAt
        : new Date().toISOString(),
  };
}

function ensureOutputsDir(): void {
  if (!fs.existsSync(OUTPUTS_DIR)) {
    fs.mkdirSync(OUTPUTS_DIR, { recursive: true });
  }
  if (!fs.existsSync(METADATA_FILE)) {
    fs.writeFileSync(METADATA_FILE, JSON.stringify([], null, 2), 'utf-8');
  }
}

function readOutputIndex(): SavedOutputRecord[] {
  ensureOutputsDir();
  try {
    const raw = fs.readFileSync(METADATA_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeOutputIndex(records: SavedOutputRecord[]): void {
  ensureOutputsDir();
  fs.writeFileSync(METADATA_FILE, JSON.stringify(records, null, 2), 'utf-8');
}

function saveDataUrlToFile(dataUrl: string, filePath: string): void {
  const match = dataUrl.match(/^data:image\/([a-zA-Z0-9+.-]+);base64,(.+)$/);
  if (!match) {
    throw new Error('Invalid base64 image data URL format.');
  }
  const buffer = Buffer.from(match[2], 'base64');
  fs.writeFileSync(filePath, buffer);
}

function parseMaxAttempts(raw: unknown): number {
  const n = Number(raw);
  if (Number.isInteger(n) && n >= 1 && n <= 3) {
    return n;
  }
  return 3;
}

function sendProviderError(
  res: express.Response,
  provider: ProviderId,
  error: unknown
): void {
  const normalized: ProviderError =
    error instanceof ProviderError
      ? error
      : provider === 'huggingface'
        ? normalizeHfError(error, process.env.HF_TOKEN)
        : normalizeGeminiError(error);

  if (normalized.payload.retryAfterSeconds) {
    res.setHeader('Retry-After', String(normalized.payload.retryAfterSeconds));
  }

  res.status(normalized.statusCode).json({
    ...normalized.payload,
    error: normalized.payload.userMessage,
  });
}

async function startServer() {
  ensureOutputsDir();

  const app = express();
  app.use(express.json({ limit: '25mb' }));

  // Serve generated outputs directly from disk; return 404 for missing files instead of SPA HTML fallback
  app.use('/outputs', express.static(OUTPUTS_DIR));
  app.use('/outputs', (_req, res) => {
    res.status(404).json({ error: 'Output file not found.' });
  });

  // Direct download endpoint for the converted Python + Streamlit project ZIP
  app.get('/api/download-python-zip', (_req, res) => {
    const zipPath = path.resolve(__dirname, 'DevIllustrate-AI-Python-Streamlit.zip');
    if (!fs.existsSync(zipPath)) {
      res.status(404).json({ error: 'Python project ZIP archive not found.' });
      return;
    }
    res.download(zipPath, 'DevIllustrate-AI-Python-Streamlit.zip');
  });

  // Direct download endpoint for the Google Colab T4 GPU verification notebook
  app.get('/api/download-colab-notebook', (_req, res) => {
    const nbPath = path.resolve(
      __dirname,
      'DevIllustrate-AI',
      'DevIllustrate_Colab_T4_Verification.ipynb'
    );
    if (!fs.existsSync(nbPath)) {
      res.status(404).json({ error: 'Colab verification notebook not found.' });
      return;
    }
    res.download(nbPath, 'DevIllustrate_Colab_T4_Verification.ipynb');
  });

  // Cheap, non-billable provider health check (never exposes tokens or keys)
  app.get('/api/health', async (req, res) => {
    const forceRefresh = req.query.refresh === '1';
    const [huggingface, gemini] = await Promise.all([
      checkHfHealth(forceRefresh),
      checkGeminiHealth(forceRefresh),
    ]);
    res.json({ huggingface, gemini });
  });

  // Hugging Face model catalog (verified live Inference Providers models; never exposes HF_TOKEN)
  app.get('/api/hf-models', (_req, res) => {
    res.json({
      models: HF_MODELS,
      defaultModel: DEFAULT_HF_MODEL,
      defaultWidth: DEFAULT_HF_WIDTH,
      defaultHeight: DEFAULT_HF_HEIGHT,
      configured: isHfTokenConfigured(),
    });
  });

  // Hugging Face Text-to-Image Generation Endpoint
  app.post('/api/generate-image', async (req, res) => {
    const forwarded = req.headers['x-forwarded-for'];
    const ipKey =
      (Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(',')[0])?.trim() ||
      req.ip ||
      req.socket.remoteAddress ||
      'unknown';

    const rateCheck = checkHfRateLimit(ipKey);
    if (!rateCheck.allowed) {
      sendProviderError(
        res,
        'huggingface',
        new ProviderError(429, {
          provider: 'huggingface',
          providerLabel: 'Hugging Face',
          code: 'RATE_LIMITED',
          userMessage: `Too many requests sent to Hugging Face. Please wait ${rateCheck.retryAfterSeconds}s or switch engine.`,
          retryable: true,
          retryAfterSeconds: rateCheck.retryAfterSeconds,
        })
      );
      return;
    }

    try {
      const {
        prompt,
        negativePrompt,
        model,
        width,
        height,
        steps,
        guidanceScale,
        seed,
        maxAttempts,
      } = req.body ?? {};
      const result = await generateHuggingFaceImage({
        prompt,
        negativePrompt,
        model,
        width,
        height,
        steps,
        guidanceScale,
        seed,
        maxAttempts: parseMaxAttempts(maxAttempts),
      });
      res.json(result);
    } catch (error) {
      sendProviderError(res, 'huggingface', error);
    }
  });

  // Prompt Enhancement Endpoint (Gemini)
  app.post('/api/enhance-prompt', async (req, res) => {
    try {
      const { prompt, style, maxAttempts } = req.body ?? {};
      if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
        sendProviderError(
          res,
          'gemini',
          new ProviderError(400, {
            provider: 'gemini',
            providerLabel: 'Gemini',
            code: 'INVALID_PROMPT',
            userMessage: 'Please enter a technical prompt to enhance.',
            retryable: false,
          })
        );
        return;
      }

      const result = await enhanceTechnicalPrompt({
        prompt: prompt.trim(),
        style: typeof style === 'string' ? style : 'Professional 3D',
        maxAttempts: parseMaxAttempts(maxAttempts),
      });
      res.json(result);
    } catch (error) {
      sendProviderError(res, 'gemini', error);
    }
  });

  // Technical Illustration Generation Endpoint (Gemini SVG)
  app.post('/api/generate-diagram', async (req, res) => {
    try {
      const {
        prompt,
        enhancedPrompt,
        style,
        width,
        height,
        steps,
        guidanceScale,
        seed,
        maxAttempts,
      } = req.body ?? {};

      if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
        sendProviderError(
          res,
          'gemini',
          new ProviderError(400, {
            provider: 'gemini',
            providerLabel: 'Gemini',
            code: 'INVALID_PROMPT',
            userMessage: 'Please enter a prompt before generating with Gemini.',
            retryable: false,
          })
        );
        return;
      }

      const result = await generateTechnicalDiagramSvg({
        prompt: prompt.trim(),
        enhancedPrompt: typeof enhancedPrompt === 'string' ? enhancedPrompt : prompt.trim(),
        style: typeof style === 'string' ? style : 'Professional 3D',
        width: Number(width) || 768,
        height: Number(height) || 768,
        steps: Number(steps) || 30,
        guidanceScale: Number(guidanceScale) || 7.5,
        seed: Number(seed) || 42,
        maxAttempts: parseMaxAttempts(maxAttempts),
      });

      res.json(result);
    } catch (error) {
      sendProviderError(res, 'gemini', error);
    }
  });

  // List saved files in outputs/
  app.get('/api/outputs', (_req, res) => {
    const records = readOutputIndex();
    res.json({ outputs: records });
  });

  // Save original & labeled PNG to outputs/
  app.post('/api/outputs', (req, res) => {
    try {
      const {
        title,
        prompt,
        enhancedPrompt,
        style,
        width,
        height,
        steps,
        guidanceScale,
        seed,
        originalDataUrl,
        labeledDataUrl,
        components,
        evaluation,
      } = req.body ?? {};

      if (!originalDataUrl || !labeledDataUrl) {
        res.status(400).json({ error: 'Both originalDataUrl and labeledDataUrl are required.' });
        return;
      }

      const id = `diagram_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const safeSlug = String(title || 'diagram')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 36);

      const originalFileName = `${safeSlug || 'diagram'}_${id}_original.png`;
      const labeledFileName = `${safeSlug || 'diagram'}_${id}_labeled.png`;

      saveDataUrlToFile(originalDataUrl, path.join(OUTPUTS_DIR, originalFileName));
      saveDataUrlToFile(labeledDataUrl, path.join(OUTPUTS_DIR, labeledFileName));

      const parsedEvaluation = sanitizeEvaluation(evaluation);

      const record: SavedOutputRecord = {
        id,
        title: String(title || 'Technical Architecture Diagram'),
        prompt: String(prompt || ''),
        enhancedPrompt: String(enhancedPrompt || ''),
        style: String(style || 'Professional 3D'),
        width: Number(width) || 768,
        height: Number(height) || 768,
        steps: Number(steps) || 30,
        guidanceScale: Number(guidanceScale) || 7.5,
        seed: Number(seed) || 42,
        createdAt: new Date().toISOString(),
        originalFile: `/outputs/${originalFileName}`,
        labeledFile: `/outputs/${labeledFileName}`,
        componentCount: Array.isArray(components) ? components.length : 0,
        components: Array.isArray(components) ? components : [],
        ...(parsedEvaluation ? { evaluation: parsedEvaluation } : {}),
      };

      const existing = readOutputIndex();
      existing.unshift(record);
      writeOutputIndex(existing.slice(0, 50));

      res.status(201).json({ output: record });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save output to disk.';
      console.error('[/api/outputs POST] Error:', message);
      res.status(500).json({ error: message });
    }
  });

  // Update quality evaluation for a saved output
  app.patch('/api/outputs/:id/evaluation', (req, res) => {
    try {
      const { id } = req.params;
      const sanitized = sanitizeEvaluation(req.body);
      if (!sanitized) {
        res.status(400).json({ error: 'Valid quality evaluation ratings are required.' });
        return;
      }

      const existing = readOutputIndex();
      const idx = existing.findIndex((item) => item.id === id);
      if (idx === -1) {
        res.status(404).json({ error: 'Output not found.' });
        return;
      }

      existing[idx] = { ...existing[idx], evaluation: sanitized };
      writeOutputIndex(existing);
      res.json({ output: existing[idx] });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save evaluation.';
      res.status(500).json({ error: message });
    }
  });

  // Delete an output record and its PNG files
  app.delete('/api/outputs/:id', (req, res) => {
    try {
      const { id } = req.params;
      const existing = readOutputIndex();
      const target = existing.find((item) => item.id === id);
      if (!target) {
        res.status(404).json({ error: 'Output not found.' });
        return;
      }

      const filesToDelete = [
        path.join(OUTPUTS_DIR, path.basename(target.originalFile)),
        path.join(OUTPUTS_DIR, path.basename(target.labeledFile)),
      ];
      for (const filePath of filesToDelete) {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      }

      const remaining = existing.filter((item) => item.id !== id);
      writeOutputIndex(remaining);
      res.json({ deleted: id });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete output.';
      res.status(500).json({ error: message });
    }
  });

  // Vite middleware in development; static dist in production
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const PORT = Number(process.env.PORT) || 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`DevIllustrate AI server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
