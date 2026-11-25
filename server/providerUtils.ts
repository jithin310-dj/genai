export type ProviderId = 'huggingface' | 'gemini';

export interface NormalizedProviderErrorPayload {
  provider: ProviderId;
  providerLabel: string;
  code: string;
  userMessage: string;
  retryable: boolean;
  retryAfterSeconds?: number;
}

export class ProviderError extends Error {
  statusCode: number;
  payload: NormalizedProviderErrorPayload;

  constructor(statusCode: number, payload: NormalizedProviderErrorPayload) {
    super(payload.userMessage);
    this.name = 'ProviderError';
    this.statusCode = statusCode;
    this.payload = payload;
  }
}

export function getProviderLabel(provider: ProviderId): string {
  return provider === 'huggingface' ? 'Hugging Face' : 'Gemini';
}

export function redactSecrets(raw: string, secrets: Array<string | undefined>): string {
  let out = raw;
  for (const secret of secrets) {
    const trimmed = secret?.trim();
    if (trimmed && trimmed.length >= 6) {
      out = out.split(trimmed).join('[REDACTED]');
    }
  }
  return out;
}

/**
 * Extracts HTTP status code from heterogeneous SDK errors (@google/genai, @huggingface/inference, fetch).
 */
export function extractErrorStatus(error: unknown): number {
  if (!error || typeof error !== 'object') return 0;
  const err = error as {
    status?: number;
    statusCode?: number;
    code?: number | string;
    httpResponse?: { status?: number };
    response?: { status?: number };
    message?: string;
  };

  const numericCandidates = [
    err.httpResponse?.status,
    err.response?.status,
    err.statusCode,
    err.status,
    typeof err.code === 'number' ? err.code : undefined,
  ];
  for (const candidate of numericCandidates) {
    if (typeof candidate === 'number' && candidate >= 100 && candidate < 600) {
      return candidate;
    }
  }

  // Some SDKs embed JSON like {"error":{"code":503,"status":"UNAVAILABLE"}} in error.message
  if (typeof err.message === 'string') {
    const jsonCodeMatch = err.message.match(/"code"\s*:\s*(\d{3})/);
    if (jsonCodeMatch) {
      return Number(jsonCodeMatch[1]);
    }
    const httpMatch = err.message.match(/\b(400|401|402|403|404|408|429|500|502|503|504)\b/);
    if (httpMatch) {
      return Number(httpMatch[1]);
    }
  }

  return 0;
}

export function isNetworkOrTimeoutError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const err = error as { name?: string; code?: string; message?: string };
  const msg = String(err.message ?? '').toLowerCase();
  const code = String(err.code ?? '').toUpperCase();
  return (
    err.name === 'AbortError' ||
    err.name === 'TimeoutError' ||
    code === 'ETIMEDOUT' ||
    code === 'ECONNRESET' ||
    code === 'ECONNREFUSED' ||
    code === 'UND_ERR_CONNECT_TIMEOUT' ||
    msg.includes('timed out') ||
    msg.includes('timeout') ||
    msg.includes('fetch failed') ||
    msg.includes('network error') ||
    msg.includes('socket hang up')
  );
}

/**
 * Wraps an async operation with a hard timeout (default 60s).
 */
export async function withTimeout<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  timeoutMs = 60_000,
  provider: ProviderId = 'gemini'
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      const label = getProviderLabel(provider);
      reject(
        new ProviderError(504, {
          provider,
          providerLabel: label,
          code: 'TIMEOUT',
          userMessage: `${label} took too long to respond (${Math.round(timeoutMs / 1000)}s timeout). Please retry or switch engine.`,
          retryable: true,
          retryAfterSeconds: 2,
        })
      );
    }, timeoutMs);
  });

  try {
    return await Promise.race([operation(controller.signal), timeoutPromise]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export interface RetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  shouldRetry: (error: unknown) => boolean;
  onRetry?: (attempt: number, maxAttempts: number, delayMs: number, error: unknown) => void;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Exponential backoff with jitter (~1s, ~2s, ~4s) for transient upstream failures.
 * Never retries non-retryable errors (400, invalid token, validation, exhausted billing quota).
 */
export async function retryWithBackoff<T>(
  fn: (attempt: number) => Promise<T>,
  options: RetryOptions
): Promise<T> {
  const maxAttempts = Math.max(1, Math.min(5, options.maxAttempts ?? 3));
  const baseDelayMs = options.baseDelayMs ?? 1000;

  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn(attempt);
    } catch (error) {
      lastError = error;
      if (attempt >= maxAttempts || !options.shouldRetry(error)) {
        throw error;
      }
      // Exponential delay: base * 2^(attempt-1) with +/-20% jitter (~1s, ~2s, ~4s)
      const exponential = baseDelayMs * Math.pow(2, attempt - 1);
      const jitterFactor = 0.8 + Math.random() * 0.4;
      const delayMs = Math.round(exponential * jitterFactor);
      options.onRetry?.(attempt, maxAttempts, delayMs, error);
      await sleep(delayMs);
    }
  }

  throw lastError;
}
