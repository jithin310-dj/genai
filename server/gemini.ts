import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import {
  extractErrorStatus,
  isNetworkOrTimeoutError,
  ProviderError,
  redactSecrets,
  retryWithBackoff,
  withTimeout,
} from './providerUtils.ts';

export const DEFAULT_GEMINI_MODEL = 'gemini-3.1-flash-lite';
export const DEFAULT_GEMINI_FALLBACK_MODEL = 'gemini-4-hydrogen';
const GEMINI_TIMEOUT_MS = 60_000;

export function getGeminiPrimaryModel(): string {
  return process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL;
}

export function getGeminiFallbackModel(): string {
  return process.env.GEMINI_FALLBACK_MODEL?.trim() || DEFAULT_GEMINI_FALLBACK_MODEL;
}

export function isGeminiConfigured(): boolean {
  const key = process.env.GEMINI_API_KEY?.trim();
  return Boolean(key && key !== 'MY_GEMINI_API_KEY');
}

function getClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new ProviderError(503, {
      provider: 'gemini',
      providerLabel: 'Gemini',
      code: 'MISSING_TOKEN',
      userMessage:
        'Gemini API key is not configured on the server. Add GEMINI_API_KEY in Settings > Secrets or switch engine.',
      retryable: false,
    });
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

export function normalizeGeminiError(error: unknown): ProviderError {
  if (error instanceof ProviderError) {
    return error;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  const status = extractErrorStatus(error);
  const rawMessage = redactSecrets(
    error instanceof Error ? error.message : String(error ?? 'Unknown Gemini error'),
    [apiKey]
  );
  const lower = rawMessage.toLowerCase();
  let normalized: ProviderError;

  if (isNetworkOrTimeoutError(error)) {
    normalized = new ProviderError(504, {
      provider: 'gemini',
      providerLabel: 'Gemini',
      code: 'TIMEOUT',
      userMessage:
        'Gemini timed out or lost connection while generating. Please retry or switch engine.',
      retryable: true,
      retryAfterSeconds: 3,
    });
  } else if (
    status === 401 ||
    status === 403 ||
    lower.includes('api_key_invalid') ||
    lower.includes('api key not valid') ||
    lower.includes('permission_denied')
  ) {
    normalized = new ProviderError(status === 403 ? 403 : 401, {
      provider: 'gemini',
      providerLabel: 'Gemini',
      code: 'INVALID_TOKEN',
      userMessage:
        'Gemini API key is invalid or lacks permission. Check GEMINI_API_KEY in Settings > Secrets.',
      retryable: false,
    });
  } else if (status === 400 || lower.includes('invalid_argument')) {
    normalized = new ProviderError(400, {
      provider: 'gemini',
      providerLabel: 'Gemini',
      code: 'INVALID_REQUEST',
      userMessage:
        'Gemini could not process this prompt or request parameters. Try shortening or simplifying the prompt.',
      retryable: false,
    });
  } else if (status === 404 || lower.includes('not_found')) {
    normalized = new ProviderError(502, {
      provider: 'gemini',
      providerLabel: 'Gemini',
      code: 'MODEL_NOT_FOUND',
      userMessage:
        'The configured Gemini model ID was not found. Check GEMINI_MODEL in your server environment.',
      retryable: false,
    });
  } else if (
    status === 429 ||
    lower.includes('resource_exhausted') ||
    lower.includes('quota') ||
    lower.includes('rate limit')
  ) {
    normalized = new ProviderError(429, {
      provider: 'gemini',
      providerLabel: 'Gemini',
      code: 'QUOTA_EXCEEDED',
      userMessage:
        'Gemini rate limit or quota reached. Wait a moment or switch to Hugging Face.',
      retryable: true,
      retryAfterSeconds: 10,
    });
  } else if (
    status === 503 ||
    status === 502 ||
    status === 504 ||
    lower.includes('unavailable') ||
    lower.includes('high demand') ||
    lower.includes('overloaded')
  ) {
    normalized = new ProviderError(503, {
      provider: 'gemini',
      providerLabel: 'Gemini',
      code: 'MODEL_UNAVAILABLE',
      userMessage:
        'Gemini is busy right now due to high demand. Please retry in a few seconds or switch engine.',
      retryable: true,
      retryAfterSeconds: 5,
    });
  } else {
    normalized = new ProviderError(502, {
      provider: 'gemini',
      providerLabel: 'Gemini',
      code: 'UPSTREAM_ERROR',
      userMessage:
        'Gemini encountered an unexpected error while generating. Please retry or switch engine.',
      retryable: status >= 500 || status === 0,
    });
  }

  console.info(
    `[Gemini] upstream status=${status || 'unknown'} code=${normalized.payload.code}`
  );
  return normalized;
}

function shouldFallbackToSecondaryModel(err: ProviderError): boolean {
  return (
    err.statusCode === 503 ||
    err.statusCode === 429 ||
    err.statusCode === 504 ||
    err.payload.code === 'MODEL_UNAVAILABLE' ||
    err.payload.code === 'QUOTA_EXCEEDED' ||
    err.payload.code === 'MODEL_NOT_FOUND' ||
    err.payload.code === 'TIMEOUT'
  );
}

function buildThinkingConfig(model: string, preferred: 'low' | 'medium') {
  if (model.startsWith('gemini-3.1-flash-lite')) {
    return {
      thinkingConfig: {
        thinkingLevel: ThinkingLevel.MINIMAL,
      },
    };
  }
  if (model.startsWith('gemini-4')) {
    return {
      thinkingConfig: {
        thinkingLevel: preferred === 'medium' ? ThinkingLevel.LOW : ThinkingLevel.LOW,
      },
    };
  }
  if (model.startsWith('gemini-3')) {
    return {
      thinkingConfig: {
        thinkingLevel: ThinkingLevel.LOW,
      },
    };
  }
  return {};
}

export interface GeminiExecutionOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  timeoutMs?: number;
  invokeModel?: (model: string, signal: AbortSignal) => Promise<string | undefined>;
}

/**
 * Executes a Gemini generation call with:
 * - 60s request timeout
 * - Max 3 attempts with exponential backoff + jitter on transient errors (503, 429, timeout)
 * - Automatic single fallback attempt on GEMINI_FALLBACK_MODEL if primary fails with 503/429
 */
export async function executeGeminiWithResilience(
  runner: (model: string, signal: AbortSignal) => Promise<string | undefined>,
  options: GeminiExecutionOptions = {}
): Promise<{ text: string; modelUsed: string; usedFallbackModel: boolean }> {
  const primaryModel = getGeminiPrimaryModel();
  const fallbackModel = getGeminiFallbackModel();
  const maxAttempts = options.maxAttempts ?? 3;
  const timeoutMs = options.timeoutMs ?? GEMINI_TIMEOUT_MS;
  const actualRunner = options.invokeModel ?? runner;

  const callSingleModel = async (model: string): Promise<string> => {
    try {
      const text = await withTimeout(
        (signal) => actualRunner(model, signal),
        timeoutMs,
        'gemini'
      );
      const trimmed = text?.trim();
      if (!trimmed) {
        throw new ProviderError(502, {
          provider: 'gemini',
          providerLabel: 'Gemini',
          code: 'EMPTY_RESPONSE',
          userMessage: 'Gemini returned an empty response. Please try again.',
          retryable: true,
        });
      }
      return trimmed;
    } catch (err) {
      throw normalizeGeminiError(err);
    }
  };

  try {
    const text = await retryWithBackoff(() => callSingleModel(primaryModel), {
      maxAttempts,
      baseDelayMs: options.baseDelayMs ?? 1000,
      shouldRetry: (err) => err instanceof ProviderError && err.payload.retryable,
      onRetry: (attempt, total, delayMs, err) => {
        const code = err instanceof ProviderError ? err.payload.code : 'TRANSIENT';
        console.info(
          `[Gemini] ${primaryModel} attempt ${attempt}/${total} failed (${code}); retrying in ${delayMs}ms`
        );
      },
    });
    markGeminiHealthy();
    return { text, modelUsed: primaryModel, usedFallbackModel: false };
  } catch (primaryErr) {
    const normalized = normalizeGeminiError(primaryErr);
    if (
      fallbackModel &&
      fallbackModel !== primaryModel &&
      shouldFallbackToSecondaryModel(normalized)
    ) {
      console.info(
        `[Gemini] Primary model ${primaryModel} failed (${normalized.payload.code}); retrying once on fallback model ${fallbackModel}`
      );
      try {
        const fallbackText = await callSingleModel(fallbackModel);
        markGeminiHealthy();
        return { text: fallbackText, modelUsed: fallbackModel, usedFallbackModel: true };
      } catch (fallbackErr) {
        const normalizedFallback = normalizeGeminiError(fallbackErr);
        if (
          normalizedFallback.payload.code === 'MODEL_UNAVAILABLE' ||
          normalizedFallback.payload.code === 'QUOTA_EXCEEDED'
        ) {
          markGeminiDegraded();
        }
        throw normalizedFallback;
      }
    }
    if (
      normalized.payload.code === 'MODEL_UNAVAILABLE' ||
      normalized.payload.code === 'QUOTA_EXCEEDED'
    ) {
      markGeminiDegraded();
    }
    throw normalized;
  }
}

export interface EnhancePromptRequest {
  prompt: string;
  style: string;
  maxAttempts?: number;
}

export interface SuggestedComponent {
  name: string;
  description: string;
  x: number;
  y: number;
}

export interface EnhancePromptResponse {
  enhancedPrompt: string;
  negativePrompt: string;
  suggestedTitle: string;
  suggestedComponents: SuggestedComponent[];
  modelUsed?: string;
}

export async function enhanceTechnicalPrompt(
  req: EnhancePromptRequest
): Promise<EnhancePromptResponse> {
  const ai = getClient();

  const systemInstruction = `You are a senior technical documentation illustrator and prompt engineer for Stable Diffusion and architectural diagram systems.
Given a user's natural-language technical concept and a visual style (Professional 3D, Flat Vector, Blueprint, or Isometric), return a JSON object with:
1. "enhancedPrompt": A rich, concrete Stable Diffusion technical illustration prompt specifying geometry, layout flow, lighting/palette matching the requested style, clean documentation clarity, and explicitly avoiding embedded garbled text.
2. "negativePrompt": Comma-separated terms to avoid (blurry, watermark, distorted text, messy wires, low resolution, photorealistic people, cluttered background).
3. "suggestedTitle": A crisp 3-to-6 word documentation diagram title.
4. "suggestedComponents": Exactly 4 or 5 key architectural components that belong in this diagram, each with "name" (2-4 words), "description" (1 clear sentence), and normalized approximate layout coordinates "x" and "y" strictly between 0.12 and 0.88 arranged cleanly from left-to-right or top-to-bottom.`;

  const { text, modelUsed } = await executeGeminiWithResilience(
    async (model) => {
      const response = await ai.models.generateContent({
        model,
        contents: `User concept: "${req.prompt}"\nSelected visual style: "${req.style}"`,
        config: {
          systemInstruction,
          ...buildThinkingConfig(model, 'low'),
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              enhancedPrompt: { type: Type.STRING },
              negativePrompt: { type: Type.STRING },
              suggestedTitle: { type: Type.STRING },
              suggestedComponents: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    name: { type: Type.STRING },
                    description: { type: Type.STRING },
                    x: { type: Type.NUMBER },
                    y: { type: Type.NUMBER },
                  },
                  required: ['name', 'description', 'x', 'y'],
                },
              },
            },
            required: ['enhancedPrompt', 'negativePrompt', 'suggestedTitle', 'suggestedComponents'],
          },
        },
      });
      return response.text;
    },
    { maxAttempts: req.maxAttempts }
  );

  try {
    const parsed = JSON.parse(text) as EnhancePromptResponse;
    parsed.suggestedComponents = (parsed.suggestedComponents ?? []).map((comp) => ({
      name: comp.name,
      description: comp.description,
      x: Number(Math.min(0.92, Math.max(0.08, comp.x)).toFixed(2)),
      y: Number(Math.min(0.9, Math.max(0.1, comp.y)).toFixed(2)),
    }));
    parsed.modelUsed = modelUsed;
    return parsed;
  } catch {
    throw new ProviderError(502, {
      provider: 'gemini',
      providerLabel: 'Gemini',
      code: 'PARSE_ERROR',
      userMessage: 'Gemini returned an unreadable prompt response. Please try again.',
      retryable: true,
    });
  }
}

export interface GenerateDiagramRequest {
  prompt: string;
  enhancedPrompt: string;
  style: string;
  width: number;
  height: number;
  steps: number;
  guidanceScale: number;
  seed: number;
  maxAttempts?: number;
}

export interface GenerateDiagramResponse {
  svg: string;
  title: string;
  components: SuggestedComponent[];
  modelUsed?: string;
  usedFallbackModel?: boolean;
}

export async function generateTechnicalDiagramSvg(
  req: GenerateDiagramRequest
): Promise<GenerateDiagramResponse> {
  const ai = getClient();

  const styleDirectives: Record<string, string> = {
    'Professional 3D':
      'Clean studio 3D technical hardware illustration on a soft off-white backdrop (#F6F7F9). Render components as extruded 3D geometric blocks, glossy server towers, metallic hubs, and glass storage cylinders using SVG linearGradient shading, soft drop-shadow filters, subtle specular highlights, and sleek cobalt-blue (#2563EB) directional data conduits.',
    'Flat Vector':
      'Crisp minimalist Swiss flat vector engineering graphic on a clean cool-white canvas (#F8FAFC). Use flat geometric modules, clean 2.5px slate navy (#0F172A) strokes, cobalt (#2563EB) and teal (#0D9488) accent fills, crisp directional arrowheads, and balanced architectural alignment with generous negative space.',
    Blueprint:
      'Authentic architectural CAD blueprint on deep Prussian blue (#0E2A47) with an orthographic fine grid pattern (#1D4E7A at 0.35 opacity) and an outer double technical drafting frame. Draw all system modules, storage blocks, routing pipes, and schematic paths in crisp white (#F8FAFC) and pale cyan (#7DD3FC) technical line art with dashed bus lines and dimension crosshairs.',
    Isometric:
      'Precision 30-degree isometric technical illustration on a pale cool gray-blue drafting field (#F4F7FB) with faint isometric grid lines. Construct every system node as a crisp 3-face isometric prism, stacked compute plane, or isometric cylinder with distinct top/left/right luminance faces (#E2E8F0, #CBD5E1, #1E3A8A, #2563EB) linked by clean isometric path connectors.',
  };

  const directive = styleDirectives[req.style] ?? styleDirectives['Flat Vector'];
  const detailHint =
    req.steps >= 35
      ? 'high geometric richness, layered sub-details, fine connector conduits, and refined shading'
      : req.steps <= 20
        ? 'clean streamlined schematic geometry with bold readable forms'
        : 'balanced engineering detail with clear component silhouettes and directional connectors';

  const systemInstruction = `You are a master technical documentation graphic illustrator.
Synthesize a bespoke, publication-grade standalone <svg> technical illustration matching the user's architecture description and requested visual style.

CRITICAL SVG RULES:
1. Return a JSON object containing "svg", "title", and "components".
2. The "svg" MUST be a complete, valid standalone <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 900" width="1200" height="900">...</svg> string.
3. DO NOT include ANY <text> or <tspan> words inside the SVG! The diagram MUST be a pure, ultra-clean visual technical graphic with ZERO embedded text labels, because our Smart Labeling engine overlays crisp numbered markers and a structured legend on top of it afterward.
4. Draw 4 to 6 distinct, recognizable technical components (e.g., client devices, load balancers, neural layers, server clusters, API gateways, database cylinders, caches, message queues, query optimizers) connected by crisp directional pipelines/arrows/synapses.
5. Style requirement: ${directive}
6. Detail level: ${detailHint}. Use seed ${req.seed} to vary subtle layout composition.
7. Never use external href/images, scripts, or CSS classes that require external stylesheets. All fills, strokes, patterns, markers, and gradients must be self-contained inside <defs> and inline SVG attributes.
8. For "components", return the exact 4 to 6 main visual components you drew in the SVG, with their accurate normalized center coordinates "x" (centerX / 1200) and "y" (centerY / 900) strictly between 0.08 and 0.92, so that numbered smart-label markers can be positioned accurately on each visual block.`;

  const { text, modelUsed, usedFallbackModel } = await executeGeminiWithResilience(
    async (model) => {
      const response = await ai.models.generateContent({
        model,
        contents: `Technical description: ${req.prompt}\nEnhanced prompt context: ${req.enhancedPrompt}\nVisual style: ${req.style}\nTarget aspect canvas: 1200x900 (will rasterize to ${req.width}x${req.height})\nGuidance scale: ${req.guidanceScale} | Steps: ${req.steps} | Seed: ${req.seed}`,
        config: {
          systemInstruction,
          seed: Number.isFinite(req.seed) ? Math.floor(req.seed) : 42,
          ...buildThinkingConfig(model, 'medium'),
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              svg: { type: Type.STRING },
              title: { type: Type.STRING },
              components: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    name: { type: Type.STRING },
                    description: { type: Type.STRING },
                    x: { type: Type.NUMBER },
                    y: { type: Type.NUMBER },
                  },
                  required: ['name', 'description', 'x', 'y'],
                },
              },
            },
            required: ['svg', 'title', 'components'],
          },
        },
      });
      return response.text;
    },
    { maxAttempts: req.maxAttempts }
  );

  let parsed: GenerateDiagramResponse;
  try {
    parsed = JSON.parse(text) as GenerateDiagramResponse;
  } catch {
    throw new ProviderError(502, {
      provider: 'gemini',
      providerLabel: 'Gemini',
      code: 'PARSE_ERROR',
      userMessage: 'Gemini returned an unreadable diagram payload. Please try again.',
      retryable: true,
    });
  }

  if (!parsed.svg || !parsed.svg.includes('<svg')) {
    throw new ProviderError(502, {
      provider: 'gemini',
      providerLabel: 'Gemini',
      code: 'INVALID_SVG',
      userMessage: 'Gemini did not return valid diagram graphics. Please retry or switch engine.',
      retryable: true,
    });
  }

  // Strip any accidental script tags for safety while preserving SVG graphics
  const sanitizedSvg = parsed.svg.replace(/<script[\s\S]*?<\/script>/gi, '').trim();

  return {
    svg: sanitizedSvg,
    title: parsed.title || 'Technical Architecture Diagram',
    components: (parsed.components ?? []).map((comp) => ({
      name: comp.name,
      description: comp.description,
      x: Number(Math.min(0.92, Math.max(0.08, comp.x)).toFixed(2)),
      y: Number(Math.min(0.9, Math.max(0.1, comp.y)).toFixed(2)),
    })),
    modelUsed,
    usedFallbackModel,
  };
}

// Cheap, non-billable cached health check (GET model metadata — consumes 0 tokens)
interface HealthStatus {
  configured: boolean;
  ok: boolean;
  model: string;
  fallbackModel: string;
}

let cachedGeminiHealth: { expiresAt: number; status: HealthStatus } | null = null;
let geminiDegradedUntil = 0;

function markGeminiDegraded(): void {
  geminiDegradedUntil = Date.now() + 60_000;
  cachedGeminiHealth = null;
}

function markGeminiHealthy(): void {
  geminiDegradedUntil = 0;
}

export async function checkGeminiHealth(forceRefresh = false): Promise<HealthStatus> {
  const model = getGeminiPrimaryModel();
  const fallbackModel = getGeminiFallbackModel();
  const configured = isGeminiConfigured();

  if (!configured) {
    return { configured: false, ok: false, model, fallbackModel };
  }

  if (forceRefresh) {
    geminiDegradedUntil = 0;
    cachedGeminiHealth = null;
  }

  const now = Date.now();
  if (geminiDegradedUntil > now) {
    return { configured: true, ok: false, model, fallbackModel };
  }

  if (cachedGeminiHealth && cachedGeminiHealth.expiresAt > now) {
    return cachedGeminiHealth.status;
  }

  const apiKey = process.env.GEMINI_API_KEY!.trim();
  let ok = false;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}`,
        {
          method: 'GET',
          headers: { 'x-goog-api-key': apiKey },
          signal: controller.signal,
        }
      );
      ok = res.ok;
    } finally {
      clearTimeout(timer);
    }
  } catch {
    ok = false;
  }

  const status: HealthStatus = { configured, ok, model, fallbackModel };
  cachedGeminiHealth = { expiresAt: now + 30_000, status };
  return status;
}
