import { InferenceClient } from '@huggingface/inference';
import {
  extractErrorStatus,
  isNetworkOrTimeoutError,
  ProviderError,
  redactSecrets,
  retryWithBackoff,
  withTimeout,
} from './providerUtils.ts';

export interface HfModelMetadata {
  id: string;
  label: string;
  description: string;
  badge: string;
}

/**
 * Verified live text-to-image models queried from:
 * https://huggingface.co/api/models?inference_provider=all&pipeline_tag=text-to-image
 */
export const HF_MODELS: HfModelMetadata[] = [
  {
    id: 'black-forest-labs/FLUX.1-schnell',
    label: 'FLUX.1 Schnell (Fast · Default)',
    description: 'Fast 4-step generation — lowest credit usage',
    badge: 'Fast · Default',
  },
  {
    id: 'black-forest-labs/FLUX.1-dev',
    label: 'FLUX.1 Dev (High Quality)',
    description: 'Higher detail and prompt fidelity — uses more credits',
    badge: 'High Quality',
  },
  {
    id: 'stabilityai/stable-diffusion-3.5-large',
    label: 'Stable Diffusion 3.5 Large',
    description: 'Strong composition and complex scene adherence',
    badge: 'Detailed',
  },
  {
    id: 'stabilityai/stable-diffusion-xl-base-1.0',
    label: 'Stable Diffusion XL 1.0',
    description: 'Classic SDXL base model with strong negative prompt support',
    badge: 'Classic SDXL',
  },
];

export const DEFAULT_HF_MODEL = HF_MODELS[0].id;
export const DEFAULT_HF_WIDTH = 768;
export const DEFAULT_HF_HEIGHT = 768;
export const HF_ALLOWED_MODEL_IDS = new Set(HF_MODELS.map((m) => m.id));

export const MAX_PROMPT_LENGTH = 1000;
export const MAX_NEGATIVE_PROMPT_LENGTH = 500;
export const MIN_IMAGE_DIM = 256;
export const MAX_IMAGE_DIM = 1536;
const HF_TIMEOUT_MS = 60_000;

export function isHfTokenConfigured(): boolean {
  const token = process.env.HF_TOKEN?.trim();
  return Boolean(token && token !== 'your_token_here');
}

export interface GenerateHfImageRequest {
  prompt: unknown;
  negativePrompt?: unknown;
  model?: unknown;
  width?: unknown;
  height?: unknown;
  steps?: unknown;
  guidanceScale?: unknown;
  seed?: unknown;
  maxAttempts?: number;
}

export interface GenerateHfImageResult {
  imageUrl: string;
  mimeType: string;
  model: string;
  width: number;
  height: number;
  prompt: string;
}

// In-memory sliding-window rate limiter per client IP
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 12;
const requestTimestampsByIp = new Map<string, number[]>();

export function checkHfRateLimit(ipKey: string): {
  allowed: boolean;
  retryAfterSeconds: number;
} {
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW_MS;
  const recent = (requestTimestampsByIp.get(ipKey) ?? []).filter(
    (ts) => ts > windowStart
  );

  if (recent.length >= RATE_LIMIT_MAX_REQUESTS) {
    const oldestInWindow = recent[0];
    const retryAfterMs = Math.max(1000, oldestInWindow + RATE_LIMIT_WINDOW_MS - now);
    requestTimestampsByIp.set(ipKey, recent);
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil(retryAfterMs / 1000),
    };
  }

  recent.push(now);
  requestTimestampsByIp.set(ipKey, recent);

  if (requestTimestampsByIp.size > 500) {
    for (const [key, list] of requestTimestampsByIp.entries()) {
      const pruned = list.filter((ts) => ts > windowStart);
      if (pruned.length === 0) {
        requestTimestampsByIp.delete(key);
      } else {
        requestTimestampsByIp.set(key, pruned);
      }
    }
  }

  return { allowed: true, retryAfterSeconds: 0 };
}

export function normalizeHfError(error: unknown, token?: string): ProviderError {
  if (error instanceof ProviderError) {
    return error;
  }

  const status = extractErrorStatus(error);
  const rawMessage = redactSecrets(
    error instanceof Error ? error.message : String(error ?? 'Unknown Hugging Face error'),
    [token]
  );
  const lower = rawMessage.toLowerCase();
  let normalized: ProviderError;

  if (isNetworkOrTimeoutError(error)) {
    normalized = new ProviderError(504, {
      provider: 'huggingface',
      providerLabel: 'Hugging Face',
      code: 'TIMEOUT',
      userMessage:
        'Hugging Face timed out while generating the image. Please retry or switch engine.',
      retryable: true,
      retryAfterSeconds: 3,
    });
  } else if (
    status === 401 ||
    status === 403 ||
    lower.includes('unauthorized') ||
    lower.includes('invalid username or password') ||
    lower.includes('invalid token') ||
    lower.includes('permissions') ||
    lower.includes('sufficient permissions')
  ) {
    normalized = new ProviderError(status === 403 ? 403 : 401, {
      provider: 'huggingface',
      providerLabel: 'Hugging Face',
      code: 'INVALID_TOKEN',
      userMessage:
        'Hugging Face token invalid or missing the Inference Providers permission.',
      retryable: false,
    });
  } else if (
    status === 402 ||
    lower.includes('payment required') ||
    lower.includes('credit') ||
    lower.includes('monthly included') ||
    lower.includes('exceeded your monthly') ||
    lower.includes('quota')
  ) {
    // Mark HF quota exhausted for 10 minutes so /api/health reflects accurate availability
    hfQuotaExhaustedUntil = Date.now() + 10 * 60_000;
    cachedHfHealth = null;
    normalized = new ProviderError(429, {
      provider: 'huggingface',
      providerLabel: 'Hugging Face',
      code: 'QUOTA_EXCEEDED',
      userMessage:
        'Hugging Face free credits used up. Add credits at huggingface.co/settings/billing or switch engine.',
      retryable: false,
    });
  } else if (
    status === 429 ||
    lower.includes('rate limit') ||
    lower.includes('too many requests')
  ) {
    normalized = new ProviderError(429, {
      provider: 'huggingface',
      providerLabel: 'Hugging Face',
      code: 'RATE_LIMITED',
      userMessage:
        'Hugging Face is rate-limiting requests right now. Please wait a moment or switch engine.',
      retryable: true,
      retryAfterSeconds: 5,
    });
  } else if (
    status === 503 ||
    lower.includes('currently loading') ||
    lower.includes('model is loading') ||
    lower.includes('estimated_time') ||
    lower.includes('temporarily unavailable')
  ) {
    normalized = new ProviderError(503, {
      provider: 'huggingface',
      providerLabel: 'Hugging Face',
      code: 'MODEL_LOADING',
      userMessage:
        'The selected Hugging Face model is warming up right now. Please retry in a few seconds or switch engine.',
      retryable: true,
      retryAfterSeconds: 5,
    });
  } else if (status === 400) {
    normalized = new ProviderError(400, {
      provider: 'huggingface',
      providerLabel: 'Hugging Face',
      code: 'INVALID_REQUEST',
      userMessage:
        'Hugging Face rejected this prompt or image size. Try adjusting the prompt or choosing 768×768.',
      retryable: false,
    });
  } else {
    normalized = new ProviderError(502, {
      provider: 'huggingface',
      providerLabel: 'Hugging Face',
      code: 'UPSTREAM_ERROR',
      userMessage:
        'Hugging Face could not generate the image right now. Please retry or switch engine.',
      retryable: status >= 500 || status === 0,
    });
  }

  console.info(
    `[Hugging Face] upstream status=${status || 'unknown'} code=${normalized.payload.code}`
  );
  return normalized;
}

function validateDimension(value: unknown, fallback: number, name: string): number {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }
  const num = Number(value);
  if (!Number.isFinite(num) || !Number.isInteger(num)) {
    throw new ProviderError(400, {
      provider: 'huggingface',
      providerLabel: 'Hugging Face',
      code: 'INVALID_DIMENSIONS',
      userMessage: `${name} must be an integer between ${MIN_IMAGE_DIM} and ${MAX_IMAGE_DIM}.`,
      retryable: false,
    });
  }
  if (num < MIN_IMAGE_DIM || num > MAX_IMAGE_DIM) {
    throw new ProviderError(400, {
      provider: 'huggingface',
      providerLabel: 'Hugging Face',
      code: 'INVALID_DIMENSIONS',
      userMessage: `${name} (${num}) must be between ${MIN_IMAGE_DIM} and ${MAX_IMAGE_DIM} pixels.`,
      retryable: false,
    });
  }
  if (num % 8 !== 0) {
    throw new ProviderError(400, {
      provider: 'huggingface',
      providerLabel: 'Hugging Face',
      code: 'INVALID_DIMENSIONS',
      userMessage: `${name} (${num}) must be a multiple of 8.`,
      retryable: false,
    });
  }
  return num;
}

export interface HfExecutionOptions {
  baseDelayMs?: number;
  timeoutMs?: number;
  invokeTextToImage?: (
    params: {
      model: string;
      prompt: string;
      negativePrompt?: string;
      width: number;
      height: number;
    },
    signal: AbortSignal
  ) => Promise<Blob>;
}

export async function generateHuggingFaceImage(
  input: GenerateHfImageRequest,
  options: HfExecutionOptions = {}
): Promise<GenerateHfImageResult> {
  // 1. Validate prompt
  if (typeof input.prompt !== 'string' || !input.prompt.trim()) {
    throw new ProviderError(400, {
      provider: 'huggingface',
      providerLabel: 'Hugging Face',
      code: 'INVALID_PROMPT',
      userMessage: 'Please enter a non-empty prompt describing the image you want to generate.',
      retryable: false,
    });
  }
  const prompt = input.prompt.trim();
  if (prompt.length > MAX_PROMPT_LENGTH) {
    throw new ProviderError(400, {
      provider: 'huggingface',
      providerLabel: 'Hugging Face',
      code: 'PROMPT_TOO_LONG',
      userMessage: `Prompt is too long (${prompt.length} characters). Maximum allowed is ${MAX_PROMPT_LENGTH} characters.`,
      retryable: false,
    });
  }

  // 2. Validate optional negative prompt
  let negativePrompt = '';
  if (input.negativePrompt !== undefined && input.negativePrompt !== null) {
    if (typeof input.negativePrompt !== 'string') {
      throw new ProviderError(400, {
        provider: 'huggingface',
        providerLabel: 'Hugging Face',
        code: 'INVALID_NEGATIVE_PROMPT',
        userMessage: 'Negative prompt must be text.',
        retryable: false,
      });
    }
    negativePrompt = input.negativePrompt.trim();
    if (negativePrompt.length > MAX_NEGATIVE_PROMPT_LENGTH) {
      throw new ProviderError(400, {
        provider: 'huggingface',
        providerLabel: 'Hugging Face',
        code: 'NEGATIVE_PROMPT_TOO_LONG',
        userMessage: `Negative prompt exceeds ${MAX_NEGATIVE_PROMPT_LENGTH} characters.`,
        retryable: false,
      });
    }
  }

  // 3. Validate model against verified allowlist
  const model =
    typeof input.model === 'string' && input.model.trim()
      ? input.model.trim()
      : DEFAULT_HF_MODEL;
  if (!HF_ALLOWED_MODEL_IDS.has(model)) {
    throw new ProviderError(400, {
      provider: 'huggingface',
      providerLabel: 'Hugging Face',
      code: 'UNSUPPORTED_MODEL',
      userMessage: `Model "${model}" is not in the allowed Hugging Face model list.`,
      retryable: false,
    });
  }

  // 4. Validate dimensions & optional diffusion hyperparameters
  const width = validateDimension(input.width, DEFAULT_HF_WIDTH, 'Width');
  const height = validateDimension(input.height, DEFAULT_HF_HEIGHT, 'Height');

  const rawSteps = Number(input.steps);
  const steps =
    Number.isFinite(rawSteps) && rawSteps >= 1 && rawSteps <= 50
      ? model === 'black-forest-labs/FLUX.1-schnell'
        ? Math.min(8, Math.max(1, Math.round(rawSteps <= 8 ? rawSteps : 4)))
        : Math.round(rawSteps)
      : undefined;

  const rawCfg = Number(input.guidanceScale);
  const guidanceScale =
    Number.isFinite(rawCfg) && rawCfg >= 1 && rawCfg <= 20
      ? Number(rawCfg.toFixed(1))
      : undefined;

  // 5. Verify server-side HF_TOKEN (unless test hook provided)
  const token = process.env.HF_TOKEN?.trim();
  if (!options.invokeTextToImage && (!token || token === 'your_token_here')) {
    throw new ProviderError(503, {
      provider: 'huggingface',
      providerLabel: 'Hugging Face',
      code: 'MISSING_TOKEN',
      userMessage:
        'Hugging Face token is not configured on the server. Add HF_TOKEN in Settings > Secrets or switch engine.',
      retryable: false,
    });
  }

  const maxAttempts = input.maxAttempts ?? 3;
  const timeoutMs = options.timeoutMs ?? HF_TIMEOUT_MS;

  const invokeOnce = async (): Promise<GenerateHfImageResult> => {
    try {
      const blob = await withTimeout(
        async (signal) => {
          if (options.invokeTextToImage) {
            return options.invokeTextToImage(
              { model, prompt, negativePrompt: negativePrompt || undefined, width, height },
              signal
            );
          }
          const client = new InferenceClient(token!);
          const parameters: Record<string, unknown> = { width, height };
          if (negativePrompt) {
            parameters.negative_prompt = negativePrompt;
          }
          if (steps !== undefined) {
            parameters.num_inference_steps = steps;
          }
          if (guidanceScale !== undefined && model !== 'black-forest-labs/FLUX.1-schnell') {
            parameters.guidance_scale = guidanceScale;
          }
          return client.textToImage(
            {
              provider: 'auto',
              model,
              inputs: prompt,
              parameters,
            },
            { outputType: 'blob', signal }
          );
        },
        timeoutMs,
        'huggingface'
      );

      const arrayBuffer = await blob.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      if (buffer.length === 0) {
        throw new ProviderError(502, {
          provider: 'huggingface',
          providerLabel: 'Hugging Face',
          code: 'EMPTY_IMAGE',
          userMessage: 'Hugging Face returned an empty image. Please retry.',
          retryable: true,
        });
      }

      const mimeType =
        blob.type && blob.type.startsWith('image/') ? blob.type : 'image/png';
      const imageUrl = `data:${mimeType};base64,${buffer.toString('base64')}`;

      return {
        imageUrl,
        mimeType,
        model,
        width,
        height,
        prompt,
      };
    } catch (error) {
      throw normalizeHfError(error, token);
    }
  };

  return retryWithBackoff(() => invokeOnce(), {
    maxAttempts,
    baseDelayMs: options.baseDelayMs ?? 1000,
    shouldRetry: (err) => err instanceof ProviderError && err.payload.retryable,
    onRetry: (attempt, total, delayMs, err) => {
      const code = err instanceof ProviderError ? err.payload.code : 'TRANSIENT';
      console.info(
        `[Hugging Face] ${model} attempt ${attempt}/${total} failed (${code}); retrying in ${delayMs}ms`
      );
    },
  });
}

// Cheap, non-billable cached health check (GET /api/whoami-v2 — consumes 0 inference credits)
interface HfHealthStatus {
  configured: boolean;
  ok: boolean;
  quotaExhausted?: boolean;
}

let cachedHfHealth: { expiresAt: number; status: HfHealthStatus } | null = null;
let hfQuotaExhaustedUntil = 0;

export async function checkHfHealth(forceRefresh = false): Promise<HfHealthStatus> {
  const configured = isHfTokenConfigured();
  if (!configured) {
    return { configured: false, ok: false };
  }

  if (forceRefresh) {
    hfQuotaExhaustedUntil = 0;
    cachedHfHealth = null;
  }

  const now = Date.now();
  if (hfQuotaExhaustedUntil > now) {
    return { configured: true, ok: false, quotaExhausted: true };
  }

  if (cachedHfHealth && cachedHfHealth.expiresAt > now) {
    return cachedHfHealth.status;
  }

  const token = process.env.HF_TOKEN!.trim();
  let ok = false;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      const res = await fetch('https://huggingface.co/api/whoami-v2', {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      });
      ok = res.ok;
    } finally {
      clearTimeout(timer);
    }
  } catch {
    ok = false;
  }

  const status: HfHealthStatus = { configured, ok, quotaExhausted: false };
  cachedHfHealth = { expiresAt: now + 30_000, status };
  return status;
}
