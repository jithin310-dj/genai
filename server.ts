import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { enhanceTechnicalPrompt, generateTechnicalDiagramSvg } from './server/gemini.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const OUTPUTS_DIR = path.resolve(__dirname, 'outputs');
const METADATA_FILE = path.join(OUTPUTS_DIR, 'index.json');

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

async function startServer() {
  ensureOutputsDir();

  const app = express();
  app.use(express.json({ limit: '25mb' }));

  // Serve generated outputs directly from disk
  app.use('/outputs', express.static(OUTPUTS_DIR));

  // Prompt Enhancement Endpoint
  app.post('/api/enhance-prompt', async (req, res) => {
    try {
      const { prompt, style } = req.body ?? {};
      if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
        res.status(400).json({ error: 'Please provide a technical prompt to enhance.' });
        return;
      }

      const result = await enhanceTechnicalPrompt({
        prompt: prompt.trim(),
        style: typeof style === 'string' ? style : 'Professional 3D',
      });
      res.json(result);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to enhance prompt via Gemini API.';
      console.error('[/api/enhance-prompt] Error:', message);
      res.status(500).json({ error: message });
    }
  });

  // Technical Illustration Generation Endpoint
  app.post('/api/generate-diagram', async (req, res) => {
    try {
      const { prompt, enhancedPrompt, style, width, height, steps, guidanceScale, seed } =
        req.body ?? {};

      if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
        res.status(400).json({ error: 'Please provide a technical prompt to generate an illustration.' });
        return;
      }

      const result = await generateTechnicalDiagramSvg({
        prompt: prompt.trim(),
        enhancedPrompt: typeof enhancedPrompt === 'string' ? enhancedPrompt : prompt.trim(),
        style: typeof style === 'string' ? style : 'Professional 3D',
        width: Number(width) || 1024,
        height: Number(height) || 768,
        steps: Number(steps) || 30,
        guidanceScale: Number(guidanceScale) || 7.5,
        seed: Number(seed) || 42,
      });

      res.json(result);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Failed to generate technical illustration via Gemini API.';
      console.error('[/api/generate-diagram] Error:', message);
      res.status(500).json({ error: message });
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

      const record: SavedOutputRecord = {
        id,
        title: String(title || 'Technical Architecture Diagram'),
        prompt: String(prompt || ''),
        enhancedPrompt: String(enhancedPrompt || ''),
        style: String(style || 'Professional 3D'),
        width: Number(width) || 1024,
        height: Number(height) || 768,
        steps: Number(steps) || 30,
        guidanceScale: Number(guidanceScale) || 7.5,
        seed: Number(seed) || 42,
        createdAt: new Date().toISOString(),
        originalFile: `/outputs/${originalFileName}`,
        labeledFile: `/outputs/${labeledFileName}`,
        componentCount: Array.isArray(components) ? components.length : 0,
        components: Array.isArray(components) ? components : [],
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
