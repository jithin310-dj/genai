import {
  AlertCircle,
  ArrowRightLeft,
  BookmarkPlus,
  Check,
  ChevronDown,
  ChevronUp,
  Columns2,
  Copy,
  Crosshair,
  Download,
  History,
  ImagePlus,
  Info,
  Layers,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  Wand2,
  X,
} from 'lucide-react';
import { type ChangeEvent, type MouseEvent, useEffect, useRef, useState } from 'react';
import {
  buildTemplateEnhancedPrompt,
  HF_MODEL_OPTIONS,
  MARKER_COLOR_OPTIONS,
  RESOLUTION_OPTIONS,
  SAMPLE_PRESETS,
  STYLE_DEFINITIONS,
  TECHNICAL_PROMPT_TEMPLATES,
} from '../data/presets';
import type {
  BatchVariation,
  ComponentMarker,
  GenerationSettings,
  HfModelOption,
  ImageEngine,
  LabelingConfig,
  ProviderErrorState,
  ProvidersHealth,
  QualityEvaluation,
  RecentGenerationItem,
  SavedStyleConfig,
  TargetAudience,
  VisualStyle,
} from '../types/project';
import {
  imageUrlToPngDataUrl,
  rasterizeSvgToPng,
  renderLabeledIllustration,
  validateCoordinates,
} from '../utils/labeler';
import { QualityEvaluationPanel } from './QualityEvaluationPanel';

interface StudioWorkspaceProps {
  prompt: string;
  setPrompt: (value: string) => void;
  enhancedPrompt: string;
  setEnhancedPrompt: (value: string) => void;
  negativePrompt: string;
  setNegativePrompt: (value: string) => void;
  settings: GenerationSettings;
  setSettings: (next: GenerationSettings) => void;
  hfModels: HfModelOption[];
  providersHealth: ProvidersHealth | null;
  onRefreshHealth: (force?: boolean) => void;
  originalImageUrl: string;
  setOriginalImageUrl: (url: string) => void;
  labeledImageUrl: string;
  setLabeledImageUrl: (url: string) => void;
  components: ComponentMarker[];
  setComponents: (next: ComponentMarker[]) => void;
  labelingConfig: LabelingConfig;
  setLabelingConfig: (next: LabelingConfig) => void;
  recentHistory: RecentGenerationItem[];
  onAddRecentHistory: (item: RecentGenerationItem) => void;
  onClearRecentHistory: () => void;
  onSaveToOutputs: (payload: {
    originalDataUrl: string;
    labeledDataUrl: string;
    seedOverride?: number;
    titleOverride?: string;
    componentsOverride?: ComponentMarker[];
  }) => Promise<string | null>;
  onDownloadPng: () => void;
  evaluation: QualityEvaluation;
  setEvaluation: (next: QualityEvaluation) => void;
  activeSavedOutputId: string | null;
  onPersistEvaluation: (evaluation: QualityEvaluation) => Promise<boolean>;
  savedStyleConfigs: SavedStyleConfig[];
  onSaveStyleConfig: (config: Omit<SavedStyleConfig, 'id'>) => void;
  onDeleteStyleConfig: (id: string) => void;
}

const STYLES_LIST: VisualStyle[] = [
  'Professional 3D',
  'Flat Vector',
  'Blueprint',
  'Isometric',
];

const MAX_GENERATION_ATTEMPTS = 3;
const GENERATE_COOLDOWN_SECONDS = 3;
const CLIENT_TIMEOUT_MS = 65_000;

function providerDisplayName(provider: ImageEngine): string {
  return provider === 'huggingface' ? 'Hugging Face' : 'Gemini';
}

function engineButtonLabel(provider: ImageEngine): string {
  return provider === 'huggingface' ? 'Hugging Face' : 'Gemini SVG';
}

function looksLikeRawJson(text: string): boolean {
  const trimmed = text.trim();
  return (
    trimmed.startsWith('{') ||
    trimmed.startsWith('[') ||
    /"error"\s*:\s*\{/i.test(trimmed) ||
    /"status"\s*:\s*"UNAVAILABLE"/i.test(trimmed)
  );
}

function sanitizeUserMessage(raw: unknown, fallback: string): string {
  if (typeof raw !== 'string') return fallback;
  const cleaned = raw.trim();
  if (!cleaned || looksLikeRawJson(cleaned)) return fallback;
  return cleaned;
}

function makeLocalError(
  provider: ImageEngine,
  userMessage: string,
  code = 'VALIDATION_ERROR'
): ProviderErrorState {
  return {
    provider,
    providerLabel: providerDisplayName(provider),
    code,
    userMessage,
    retryable: false,
  };
}

function parseProviderError(
  defaultProvider: ImageEngine,
  payload: unknown,
  fallbackMessage: string
): ProviderErrorState {
  if (payload && typeof payload === 'object') {
    const obj = payload as Record<string, unknown>;
    const provider: ImageEngine =
      obj.provider === 'huggingface' || obj.provider === 'gemini'
        ? obj.provider
        : defaultProvider;
    const providerLabel =
      typeof obj.providerLabel === 'string' && obj.providerLabel.trim()
        ? obj.providerLabel.trim()
        : providerDisplayName(provider);
    const code =
      typeof obj.code === 'string' && obj.code.trim()
        ? obj.code.trim()
        : 'PROVIDER_ERROR';
    const userMessage = sanitizeUserMessage(
      obj.userMessage ?? obj.error,
      fallbackMessage
    );
    const retryable = Boolean(obj.retryable);
    const retryAfterSeconds =
      typeof obj.retryAfterSeconds === 'number' &&
      Number.isFinite(obj.retryAfterSeconds) &&
      obj.retryAfterSeconds > 0
        ? obj.retryAfterSeconds
        : undefined;

    return {
      provider,
      providerLabel,
      code,
      userMessage,
      retryable,
      retryAfterSeconds,
    };
  }

  return {
    provider: defaultProvider,
    providerLabel: providerDisplayName(defaultProvider),
    code: 'PROVIDER_ERROR',
    userMessage: fallbackMessage,
    retryable: false,
  };
}

const NON_FALLBACK_VALIDATION_CODES = new Set([
  'VALIDATION_ERROR',
  'SAVE_ERROR',
  'INVALID_PROMPT',
  'PROMPT_TOO_LONG',
  'INVALID_NEGATIVE_PROMPT',
  'NEGATIVE_PROMPT_TOO_LONG',
  'UNSUPPORTED_MODEL',
  'INVALID_DIMENSIONS',
  'INVALID_REQUEST',
]);

function shouldTriggerAutoFallback(err: ProviderErrorState): boolean {
  if (NON_FALLBACK_VALIDATION_CODES.has(err.code)) return false;
  if (err.retryable) return true;
  return [
    'QUOTA_EXCEEDED',
    'RATE_LIMITED',
    'MODEL_UNAVAILABLE',
    'MODEL_LOADING',
    'MODEL_NOT_FOUND',
    'MISSING_TOKEN',
    'INVALID_TOKEN',
    'TIMEOUT',
    'NETWORK_ERROR',
  ].includes(err.code);
}

function buildFallbackSuccessBanner(
  primaryErr: ProviderErrorState,
  fallbackEngine: ImageEngine
): string {
  const fromLabel = primaryErr.providerLabel;
  const toLabel = engineButtonLabel(fallbackEngine);
  if (primaryErr.code === 'QUOTA_EXCEEDED') {
    return `${fromLabel} quota reached — generated with ${toLabel} instead.`;
  }
  if (primaryErr.code === 'RATE_LIMITED') {
    return `${fromLabel} rate limit reached — generated with ${toLabel} instead.`;
  }
  if (primaryErr.code === 'MISSING_TOKEN' || primaryErr.code === 'INVALID_TOKEN') {
    return `${fromLabel} is not configured — generated with ${toLabel} instead.`;
  }
  if (primaryErr.code === 'MODEL_UNAVAILABLE' || primaryErr.code === 'MODEL_LOADING') {
    return `${fromLabel} is temporarily busy — generated with ${toLabel} instead.`;
  }
  return `${fromLabel} could not complete the request — generated with ${toLabel} instead.`;
}

function computeRetryDelayMs(attempt: number, retryAfterSeconds?: number): number {
  const baseMs = 1000 * 2 ** (attempt - 1); // ~1s, ~2s, ~4s
  const jittered = Math.round(baseMs * (0.85 + Math.random() * 0.3));
  if (retryAfterSeconds && retryAfterSeconds > 0) {
    return Math.min(8000, Math.max(jittered, retryAfterSeconds * 1000));
  }
  return jittered;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function fetchJsonWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = CLIENT_TIMEOUT_MS
): Promise<{ ok: boolean; status: number; data: Record<string, unknown> | null }> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    let data: Record<string, unknown> | null = null;
    try {
      data = (await res.json()) as Record<string, unknown>;
    } catch {
      data = null;
    }
    return { ok: res.ok, status: res.status, data };
  } finally {
    window.clearTimeout(timer);
  }
}

function getEngineDotMeta(
  status: { configured: boolean; ok: boolean; quotaExhausted?: boolean } | undefined
): { dotClass: string; label: string } {
  if (!status) {
    return { dotClass: 'bg-slate-300 dark:bg-slate-600', label: 'Checking' };
  }
  if (!status.configured) {
    return { dotClass: 'bg-slate-400 dark:bg-slate-500', label: 'Not configured' };
  }
  if (status.quotaExhausted) {
    return { dotClass: 'bg-amber-500', label: 'Quota reached' };
  }
  if (status.ok) {
    return { dotClass: 'bg-emerald-500', label: 'Ready' };
  }
  return { dotClass: 'bg-amber-500', label: 'Busy' };
}

async function createHistoryThumbnail(dataUrl: string, maxDim = 480): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const ratio = Math.min(1, maxDim / Math.max(img.naturalWidth || maxDim, img.naturalHeight || maxDim));
      const w = Math.max(1, Math.round((img.naturalWidth || maxDim) * ratio));
      const h = Math.max(1, Math.round((img.naturalHeight || maxDim) * ratio));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(dataUrl);
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

export function StudioWorkspace({
  prompt,
  setPrompt,
  enhancedPrompt,
  setEnhancedPrompt,
  negativePrompt,
  setNegativePrompt,
  settings,
  setSettings,
  hfModels,
  providersHealth,
  onRefreshHealth,
  originalImageUrl,
  setOriginalImageUrl,
  labeledImageUrl,
  setLabeledImageUrl,
  components,
  setComponents,
  labelingConfig,
  setLabelingConfig,
  recentHistory,
  onAddRecentHistory,
  onClearRecentHistory,
  onSaveToOutputs,
  onDownloadPng,
  evaluation,
  setEvaluation,
  activeSavedOutputId,
  onPersistEvaluation,
  savedStyleConfigs,
  onSaveStyleConfig,
  onDeleteStyleConfig,
}: StudioWorkspaceProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showPromptBuilder, setShowPromptBuilder] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState(
    TECHNICAL_PROMPT_TEMPLATES[0].id
  );
  const [builderAudience, setBuilderAudience] = useState<TargetAudience>(
    'Technical Documentation'
  );
  const [builderComponents, setBuilderComponents] = useState('');
  const [styleConfigName, setStyleConfigName] = useState('');
  const [autoFallback, setAutoFallback] = useState(true);
  const [batchVariations, setBatchVariations] = useState<BatchVariation[]>([]);
  const [activeVariationId, setActiveVariationId] = useState<string | null>(null);
  const [compareBatchMode, setCompareBatchMode] = useState(false);
  const [activeMarkerId, setActiveMarkerId] = useState<string | null>(
    components[0]?.id ?? null
  );
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState<string>('');
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const [fallbackNotice, setFallbackNotice] = useState<string | null>(null);
  const [toastError, setToastError] = useState<ProviderErrorState | null>(null);
  const [rawCoordInputs, setRawCoordInputs] = useState<
    Record<string, { x: string; y: string }>
  >({});

  const inFlightRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const stageImgRef = useRef<HTMLImageElement | null>(null);

  const availableHfModels = hfModels.length > 0 ? hfModels : HF_MODEL_OPTIONS;
  const activeHfModelMeta =
    availableHfModels.find((m) => m.id === settings.hfModel) ?? availableHfModels[0];

  const hfStatusMeta = getEngineDotMeta(providersHealth?.huggingface);
  const geminiStatusMeta = getEngineDotMeta(providersHealth?.gemini);

  // Tick down the 3-second post-click Generate cooldown
  useEffect(() => {
    if (cooldownSeconds <= 0) return;
    const timer = window.setTimeout(
      () => setCooldownSeconds((s) => Math.max(0, s - 1)),
      1000
    );
    return () => window.clearTimeout(timer);
  }, [cooldownSeconds]);

  // Auto-dismiss error toast after 12 seconds
  useEffect(() => {
    if (!toastError) return;
    const timer = window.setTimeout(() => setToastError(null), 12000);
    return () => window.clearTimeout(timer);
  }, [toastError]);

  // Sync raw coordinate string buffers when components list changes externally (presets/AI)
  useEffect(() => {
    setRawCoordInputs((prev) => {
      const next: Record<string, { x: string; y: string }> = {};
      for (const c of components) {
        const existing = prev[c.id];
        if (
          existing &&
          Number(existing.x) === c.x &&
          Number(existing.y) === c.y
        ) {
          next[c.id] = existing;
        } else {
          next[c.id] = { x: c.x.toFixed(2), y: c.y.toFixed(2) };
        }
      }
      return next;
    });
    if (components.length > 0 && !components.some((c) => c.id === activeMarkerId)) {
      setActiveMarkerId(components[0].id);
    }
  }, [components, activeMarkerId]);

  // Keep composite PNG up to date for instant Download PNG and Save to outputs/
  useEffect(() => {
    let cancelled = false;
    async function rebuildComposite() {
      if (!originalImageUrl) return;
      try {
        const rendered = await renderLabeledIllustration(
          originalImageUrl,
          components,
          labelingConfig,
          settings.style
        );
        if (!cancelled) {
          setLabeledImageUrl(rendered);
        }
      } catch (err) {
        console.error('Graphic export render error:', err);
      }
    }
    rebuildComposite();
    return () => {
      cancelled = true;
    };
  }, [originalImageUrl, components, labelingConfig, settings.style, setLabeledImageUrl]);

  const invalidMarkerErrors = components
    .map((c, idx) => {
      const res = validateCoordinates(c.x, c.y);
      return res.valid ? null : `#${idx + 1} (${c.name || 'Unnamed'}): ${res.error}`;
    })
    .filter((msg): msg is string => Boolean(msg));

  const validComponents = components.filter((c) => validateCoordinates(c.x, c.y).valid);
  const isBlueprint = settings.style === 'Blueprint';

  const handleLoadPreset = (presetId: string) => {
    const preset = SAMPLE_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    setToastError(null);
    setPrompt(preset.prompt);
    const { enhancedPrompt: ep, negativePrompt: np } = buildTemplateEnhancedPrompt(
      preset.prompt,
      preset.style
    );
    setEnhancedPrompt(ep);
    setNegativePrompt(np);
    setSettings({
      ...settings,
      style: preset.style,
      seed: preset.seed,
    });
    setOriginalImageUrl(preset.imageUrl);
    setComponents(preset.components.map((c) => ({ ...c })));
    setActiveMarkerId(preset.components[0]?.id ?? null);
    setLabelingConfig({
      ...labelingConfig,
      title: preset.title,
      subtitle: preset.subtitle,
      markerColor: STYLE_DEFINITIONS[preset.style].defaultMarkerColor,
    });
  };

  const handleEngineChange = (engine: ImageEngine) => {
    setSettings({ ...settings, engine });
    setToastError(null);
    setFallbackNotice(null);
  };

  const handleStyleChange = (nextStyle: VisualStyle) => {
    setSettings({ ...settings, style: nextStyle });
    const { enhancedPrompt: ep, negativePrompt: np } = buildTemplateEnhancedPrompt(
      prompt || 'Technical system architecture',
      nextStyle
    );
    setEnhancedPrompt(ep);
    setNegativePrompt(np);
    setLabelingConfig({
      ...labelingConfig,
      markerColor: STYLE_DEFINITIONS[nextStyle].defaultMarkerColor,
    });
  };

  const handleTemplateEnhance = () => {
    if (!prompt.trim()) {
      setToastError(makeLocalError(settings.engine, 'Enter a prompt before enhancing.'));
      return;
    }
    setToastError(null);
    const { enhancedPrompt: ep, negativePrompt: np } = buildTemplateEnhancedPrompt(
      prompt,
      settings.style
    );
    setEnhancedPrompt(ep);
    setNegativePrompt(np);
    setShowAdvanced(true);
  };

  const handleAiEnhance = async () => {
    if (!prompt.trim()) {
      setToastError(makeLocalError('gemini', 'Enter a prompt before enhancing.'));
      return;
    }
    setToastError(null);
    setIsEnhancing(true);
    try {
      const { ok, data } = await fetchJsonWithTimeout('/api/enhance-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: prompt.trim(), style: settings.style }),
      });
      if (!ok || !data) {
        setToastError(
          parseProviderError(
            'gemini',
            data,
            'Gemini could not enhance this prompt right now. Please try again.'
          )
        );
        return;
      }
      setEnhancedPrompt(String(data.enhancedPrompt ?? ''));
      setNegativePrompt(String(data.negativePrompt ?? ''));
      if (typeof data.suggestedTitle === 'string' && data.suggestedTitle.trim()) {
        setLabelingConfig({
          ...labelingConfig,
          title: data.suggestedTitle,
        });
      }
      if (Array.isArray(data.suggestedComponents) && data.suggestedComponents.length > 0) {
        const mapped: ComponentMarker[] = data.suggestedComponents.map(
          (item: { name: string; description: string; x: number; y: number }, i: number) => ({
            id: `ai-comp-${Date.now()}-${i}`,
            name: item.name,
            description: item.description,
            x: Number(item.x),
            y: Number(item.y),
          })
        );
        setComponents(mapped);
        setActiveMarkerId(mapped[0]?.id ?? null);
      }
      setShowAdvanced(true);
    } catch (err) {
      const isTimeout = err instanceof DOMException && err.name === 'AbortError';
      setToastError({
        provider: 'gemini',
        providerLabel: 'Gemini',
        code: isTimeout ? 'TIMEOUT' : 'NETWORK_ERROR',
        userMessage: isTimeout
          ? 'Gemini prompt enhancement timed out. Please try again.'
          : 'Could not reach the server to enhance the prompt. Please try again.',
        retryable: true,
      });
    } finally {
      setIsEnhancing(false);
    }
  };

  const handleCopyPrompt = async () => {
    const textToCopy = prompt.trim() || enhancedPrompt.trim();
    if (!textToCopy) return;
    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopiedPrompt(true);
      window.setTimeout(() => setCopiedPrompt(false), 2000);
    } catch {
      setToastError(
        makeLocalError(settings.engine, 'Unable to copy prompt to clipboard.')
      );
    }
  };

  const executeSingleEngineAttempt = async (
    engine: ImageEngine,
    seedToUse: number
  ): Promise<
    | { ok: true; engine: 'huggingface'; data: Record<string, unknown>; seed: number }
    | { ok: true; engine: 'gemini'; data: Record<string, unknown>; seed: number }
    | { ok: false; error: ProviderErrorState }
  > => {
    try {
      const styleEnhanced =
        enhancedPrompt.trim() ||
        buildTemplateEnhancedPrompt(prompt, settings.style, builderAudience).enhancedPrompt;

      if (engine === 'huggingface') {
        const hfPrompt = settings.applyStyleToHf
          ? styleEnhanced.slice(0, 990)
          : prompt.trim();
        const { ok, data } = await fetchJsonWithTimeout('/api/generate-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: hfPrompt,
            negativePrompt: negativePrompt.trim() || undefined,
            model: settings.hfModel,
            width: settings.width,
            height: settings.height,
            steps: settings.steps,
            guidanceScale: settings.guidanceScale,
            seed: seedToUse,
            maxAttempts: 1,
          }),
        });
        if (!ok || !data || !data.imageUrl) {
          return {
            ok: false,
            error: parseProviderError(
              'huggingface',
              data,
              'Hugging Face image generation failed. Please try again or switch engines.'
            ),
          };
        }
        return { ok: true, engine: 'huggingface', data, seed: seedToUse };
      } else {
        const { ok, data } = await fetchJsonWithTimeout('/api/generate-diagram', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: prompt.trim(),
            enhancedPrompt: styleEnhanced,
            style: settings.style,
            width: settings.width,
            height: settings.height,
            steps: settings.steps,
            guidanceScale: settings.guidanceScale,
            seed: seedToUse,
            maxAttempts: 1,
          }),
        });
        if (!ok || !data || !data.svg) {
          return {
            ok: false,
            error: parseProviderError(
              'gemini',
              data,
              'Gemini could not generate the diagram right now. Please try again or switch engines.'
            ),
          };
        }
        return { ok: true, engine: 'gemini', data, seed: seedToUse };
      }
    } catch (err) {
      const isTimeout = err instanceof DOMException && err.name === 'AbortError';
      return {
        ok: false,
        error: {
          provider: engine,
          providerLabel: providerDisplayName(engine),
          code: isTimeout ? 'TIMEOUT' : 'NETWORK_ERROR',
          userMessage: isTimeout
            ? `${providerDisplayName(engine)} took too long to respond (over 60 seconds). Please try again.`
            : `Network error reaching ${providerDisplayName(engine)}. Please check your connection and try again.`,
          retryable: true,
        },
      };
    }
  };

  const runEngineWithRetries = async (
    engine: ImageEngine,
    isFallbackPhase: boolean,
    seedToUse: number,
    batchPrefix = ''
  ): Promise<
    | { ok: true; engine: 'huggingface'; data: Record<string, unknown>; seed: number }
    | { ok: true; engine: 'gemini'; data: Record<string, unknown>; seed: number }
    | { ok: false; error: ProviderErrorState }
  > => {
    const label = engineButtonLabel(engine);
    let lastError: ProviderErrorState | null = null;

    for (let attempt = 1; attempt <= MAX_GENERATION_ATTEMPTS; attempt += 1) {
      if (attempt === 1) {
        setLoadingStatus(
          isFallbackPhase
            ? `${batchPrefix}Switching to ${label}...`
            : `${batchPrefix}Generating with ${label}...`
        );
      } else {
        setLoadingStatus(
          `${batchPrefix}${providerDisplayName(engine)} is busy. Retrying (${attempt}/${MAX_GENERATION_ATTEMPTS})...`
        );
      }

      const result = await executeSingleEngineAttempt(engine, seedToUse);
      if (result.ok) {
        return result;
      }

      lastError = result.error;
      if (!result.error.retryable || attempt >= MAX_GENERATION_ATTEMPTS) {
        return result;
      }

      const nextAttempt = attempt + 1;
      setLoadingStatus(
        `${batchPrefix}${result.error.providerLabel} is busy. Retrying (${nextAttempt}/${MAX_GENERATION_ATTEMPTS})...`
      );
      await sleep(computeRetryDelayMs(attempt, result.error.retryAfterSeconds));
    }

    return {
      ok: false,
      error:
        lastError ??
        makeLocalError(
          engine,
          `${providerDisplayName(engine)} generation failed. Please try again.`,
          'PROVIDER_ERROR'
        ),
    };
  };

  const materializeVariation = async (
    result:
      | { ok: true; engine: 'huggingface'; data: Record<string, unknown>; seed: number }
      | { ok: true; engine: 'gemini'; data: Record<string, unknown>; seed: number }
  ): Promise<BatchVariation> => {
    if (result.engine === 'huggingface') {
      const data = result.data;
      const generatedUrl = String(data.imageUrl);
      const outWidth = Number(data.width) || settings.width;
      const outHeight = Number(data.height) || settings.height;
      const outModel = typeof data.model === 'string' ? data.model : settings.hfModel;
      const nextTitle =
        prompt.trim().length > 52 ? `${prompt.trim().slice(0, 52)}...` : prompt.trim();
      const nextSubtitle = `${activeHfModelMeta.label} · ${outWidth}×${outHeight} · Seed ${result.seed}`;

      const thumbUrl = await createHistoryThumbnail(generatedUrl);
      onAddRecentHistory({
        id: `hist_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        prompt: prompt.trim(),
        negativePrompt: negativePrompt.trim(),
        model: outModel,
        engine: 'huggingface',
        style: settings.style,
        width: outWidth,
        height: outHeight,
        imageUrl: thumbUrl,
        createdAt: new Date().toISOString(),
      });

      return {
        id: `var_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        imageUrl: generatedUrl,
        seed: result.seed,
        engine: 'huggingface',
        model: outModel,
        width: outWidth,
        height: outHeight,
        title: nextTitle,
        subtitle: nextSubtitle,
      };
    } else {
      const data = result.data;
      const rasterizedPng = await rasterizeSvgToPng(
        String(data.svg),
        settings.width,
        settings.height
      );
      const nextTitle =
        typeof data.title === 'string' && data.title.trim()
          ? data.title
          : labelingConfig.title;
      const nextSubtitle = `${settings.style} · ${settings.width}×${settings.height} · Seed ${result.seed}`;

      let nextComponents: ComponentMarker[] | undefined;
      if (Array.isArray(data.components) && data.components.length > 0) {
        nextComponents = data.components.map(
          (
            item: { name: string; description: string; x: number; y: number },
            i: number
          ) => ({
            id: `gen-comp-${Date.now()}-${i}`,
            name: item.name,
            description: item.description,
            x: Number(item.x),
            y: Number(item.y),
          })
        );
      }

      const thumbUrl = await createHistoryThumbnail(rasterizedPng);
      onAddRecentHistory({
        id: `hist_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        prompt: prompt.trim(),
        negativePrompt: negativePrompt.trim(),
        model: 'Gemini SVG Diagram',
        engine: 'gemini',
        style: settings.style,
        width: settings.width,
        height: settings.height,
        imageUrl: thumbUrl,
        createdAt: new Date().toISOString(),
      });

      return {
        id: `var_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        imageUrl: rasterizedPng,
        seed: result.seed,
        engine: 'gemini',
        model: 'Gemini SVG Diagram',
        width: settings.width,
        height: settings.height,
        title: nextTitle,
        subtitle: nextSubtitle,
        components: nextComponents,
      };
    }
  };

  const selectVariationToStage = async (
    variation: BatchVariation,
    archiveToDisk = false
  ) => {
    setActiveVariationId(variation.id);
    setOriginalImageUrl(variation.imageUrl);

    const activeComps =
      variation.components && variation.components.length > 0
        ? variation.components
        : components;
    if (variation.components && variation.components.length > 0) {
      setComponents(variation.components);
      setActiveMarkerId(variation.components[0]?.id ?? null);
    }

    const nextLabelConfig: LabelingConfig = {
      ...labelingConfig,
      title: variation.title,
      subtitle: variation.subtitle,
      markerColor: STYLE_DEFINITIONS[settings.style].defaultMarkerColor,
    };
    setLabelingConfig(nextLabelConfig);

    const renderedComposite = await renderLabeledIllustration(
      variation.imageUrl,
      activeComps,
      nextLabelConfig,
      settings.style
    );
    setLabeledImageUrl(renderedComposite);

    if (archiveToDisk) {
      try {
        const origPng =
          variation.imageUrl.startsWith('data:image/png')
            ? variation.imageUrl
            : await imageUrlToPngDataUrl(variation.imageUrl);
        await onSaveToOutputs({
          originalDataUrl: origPng,
          labeledDataUrl: renderedComposite,
          seedOverride: variation.seed,
          titleOverride: variation.title,
          componentsOverride: activeComps,
        });
        setSaveNotice('Generated & saved to outputs/');
        window.setTimeout(() => setSaveNotice(null), 3500);
      } catch {
        // Non-blocking
      }
    }
  };

  const handleGenerate = async (overrideEngine?: ImageEngine) => {
    const primaryEngine = overrideEngine ?? settings.engine;

    // Ignore duplicate clicks while a request is already in flight
    if (inFlightRef.current) return;

    if (!prompt.trim()) {
      setToastError(
        makeLocalError(primaryEngine, 'Please enter a prompt before generating.')
      );
      return;
    }

    const totalCount = Math.min(4, Math.max(1, Number(settings.quantity) || 1));

    inFlightRef.current = true;
    setCooldownSeconds(GENERATE_COOLDOWN_SECONDS);
    setToastError(null);
    setFallbackNotice(null);
    setCompareBatchMode(false);
    setIsGenerating(true);

    const collectedVariations: BatchVariation[] = [];
    let resolvedEngine: ImageEngine = primaryEngine;
    let fallbackBannerToShow: string | null = null;

    try {
      // If HF quota is already known-exhausted and auto-fallback is ON, route straight to Gemini SVG
      if (
        primaryEngine === 'huggingface' &&
        !overrideEngine &&
        autoFallback &&
        providersHealth?.huggingface.quotaExhausted
      ) {
        resolvedEngine = 'gemini';
        fallbackBannerToShow =
          'Hugging Face quota reached — generated with Gemini SVG instead.';
      }

      for (let i = 0; i < totalCount; i += 1) {
        const seedForItem = settings.seed + i;
        const batchPrefix = totalCount > 1 ? `[${i + 1}/${totalCount}] ` : '';

        let itemResult = await runEngineWithRetries(
          resolvedEngine,
          resolvedEngine !== primaryEngine,
          seedForItem,
          batchPrefix
        );

        if (!itemResult.ok) {
          const primaryErr = itemResult.error;
          const fallbackEngine: ImageEngine =
            resolvedEngine === 'huggingface' ? 'gemini' : 'huggingface';

          if (
            resolvedEngine === primaryEngine &&
            autoFallback &&
            shouldTriggerAutoFallback(primaryErr)
          ) {
            const fallbackResult = await runEngineWithRetries(
              fallbackEngine,
              true,
              seedForItem,
              batchPrefix
            );

            if (fallbackResult.ok) {
              resolvedEngine = fallbackEngine;
              fallbackBannerToShow = buildFallbackSuccessBanner(
                primaryErr,
                fallbackEngine
              );
              itemResult = fallbackResult;
            } else {
              if (collectedVariations.length === 0) {
                setToastError({
                  provider: primaryErr.provider,
                  providerLabel: `${primaryErr.providerLabel} & ${fallbackResult.error.providerLabel}`,
                  code: primaryErr.code,
                  userMessage: `${primaryErr.userMessage} Fallback to ${engineButtonLabel(fallbackEngine)} also failed: ${fallbackResult.error.userMessage}`,
                  retryable: primaryErr.retryable || fallbackResult.error.retryable,
                });
              }
              onRefreshHealth();
              break;
            }
          } else {
            if (collectedVariations.length === 0) {
              setToastError(primaryErr);
            }
            onRefreshHealth();
            break;
          }
        }

        if (itemResult.ok) {
          const variation = await materializeVariation(itemResult);
          collectedVariations.push(variation);
          // Show the first variation immediately as soon as it lands
          if (collectedVariations.length === 1) {
            await selectVariationToStage(variation, true);
          }
        }
      }

      if (collectedVariations.length > 0) {
        setBatchVariations(collectedVariations);
        if (fallbackBannerToShow) {
          setFallbackNotice(fallbackBannerToShow);
          onRefreshHealth();
        }
      }
    } catch {
      if (collectedVariations.length === 0) {
        setToastError(
          makeLocalError(
            primaryEngine,
            `${providerDisplayName(primaryEngine)} encountered an unexpected error. Please try again.`,
            'PROVIDER_ERROR'
          )
        );
      }
    } finally {
      inFlightRef.current = false;
      setIsGenerating(false);
      setLoadingStatus('');
    }
  };

  const handleApplyPromptTemplate = () => {
    const tpl =
      TECHNICAL_PROMPT_TEMPLATES.find((t) => t.id === selectedTemplateId) ??
      TECHNICAL_PROMPT_TEMPLATES[0];
    const focusClause = builderComponents.trim()
      ? ` featuring ${builderComponents.trim()}`
      : '';
    const composedPrompt = `${tpl.promptTemplate}${focusClause}.`;
    setPrompt(composedPrompt);

    const nextStyle = tpl.recommendedStyle;
    const { enhancedPrompt: ep, negativePrompt: np } = buildTemplateEnhancedPrompt(
      composedPrompt,
      nextStyle,
      builderAudience
    );
    setEnhancedPrompt(ep);
    setNegativePrompt(np);
    setSettings({ ...settings, style: nextStyle });
    setLabelingConfig({
      ...labelingConfig,
      title: `${tpl.domain}: ${tpl.label}`,
      subtitle: `${builderAudience} · ${nextStyle}`,
      markerColor: STYLE_DEFINITIONS[nextStyle].defaultMarkerColor,
    });
    setToastError(null);
  };

  const handleSaveCurrentStyleConfig = () => {
    const name = styleConfigName.trim() || `${settings.style} (${settings.width}×${settings.height})`;
    onSaveStyleConfig({
      name,
      style: settings.style,
      markerColor: labelingConfig.markerColor,
      steps: settings.steps,
      guidanceScale: settings.guidanceScale,
      width: settings.width,
      height: settings.height,
      negativePrompt: negativePrompt.trim(),
    });
    setStyleConfigName('');
  };

  const handleApplySavedStyleConfig = (cfg: SavedStyleConfig) => {
    setSettings({
      ...settings,
      style: cfg.style,
      steps: cfg.steps,
      guidanceScale: cfg.guidanceScale,
      width: cfg.width,
      height: cfg.height,
    });
    setNegativePrompt(cfg.negativePrompt);
    const { enhancedPrompt: ep } = buildTemplateEnhancedPrompt(
      prompt || 'Technical system architecture',
      cfg.style,
      builderAudience
    );
    setEnhancedPrompt(ep);
    setLabelingConfig({
      ...labelingConfig,
      markerColor: cfg.markerColor,
    });
  };

  const handleTryOtherEngine = () => {
    if (!toastError) return;
    const otherEngine: ImageEngine =
      toastError.provider === 'huggingface' ? 'gemini' : 'huggingface';
    setSettings({ ...settings, engine: otherEngine });
    setToastError(null);
    void handleGenerate(otherEngine);
  };

  const handleRestoreHistoryItem = (item: RecentGenerationItem) => {
    setToastError(null);
    setFallbackNotice(null);
    setPrompt(item.prompt);
    setNegativePrompt(item.negativePrompt);
    setSettings({
      ...settings,
      engine: item.engine,
      hfModel:
        item.engine === 'huggingface' && availableHfModels.some((m) => m.id === item.model)
          ? item.model
          : settings.hfModel,
      style: item.style,
      width: item.width,
      height: item.height,
    });
    setOriginalImageUrl(item.imageUrl);
    setLabelingConfig({
      ...labelingConfig,
      title:
        item.prompt.length > 52 ? `${item.prompt.slice(0, 52)}...` : item.prompt,
      subtitle: `${item.model} · ${item.width}×${item.height}`,
    });
  };

  const handleUploadCustomImage = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setToastError(
        makeLocalError(settings.engine, 'Please upload a PNG or JPG image file.')
      );
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setToastError(null);
        setFallbackNotice(null);
        setOriginalImageUrl(reader.result);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleImageCanvasClick = (e: MouseEvent<HTMLDivElement>) => {
    const imgEl = stageImgRef.current;
    if (!imgEl || !activeMarkerId) return;

    const rect = imgEl.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const relX = (e.clientX - rect.left) / rect.width;
    const relY = (e.clientY - rect.top) / rect.height;

    if (relX < 0 || relX > 1 || relY < 0 || relY > 1) return;

    const clampedX = Number(Math.min(1, Math.max(0, relX)).toFixed(2));
    const clampedY = Number(Math.min(1, Math.max(0, relY)).toFixed(2));

    setComponents(
      components.map((c) =>
        c.id === activeMarkerId ? { ...c, x: clampedX, y: clampedY } : c
      )
    );
    setRawCoordInputs((prev) => ({
      ...prev,
      [activeMarkerId]: { x: clampedX.toFixed(2), y: clampedY.toFixed(2) },
    }));
  };

  const handleCoordChange = (id: string, axis: 'x' | 'y', rawValue: string) => {
    setRawCoordInputs((prev) => ({
      ...prev,
      [id]: {
        x: axis === 'x' ? rawValue : prev[id]?.x ?? '0.50',
        y: axis === 'y' ? rawValue : prev[id]?.y ?? '0.50',
      },
    }));

    const parsed = Number(rawValue);
    if (rawValue.trim() !== '' && Number.isFinite(parsed)) {
      setComponents(
        components.map((c) => (c.id === id ? { ...c, [axis]: parsed } : c))
      );
    }
  };

  const handleAddComponent = () => {
    const idx = components.length + 1;
    const nextX = Number(Math.min(0.88, 0.16 + ((idx - 1) % 4) * 0.22).toFixed(2));
    const nextY = Number(idx > 4 ? 0.72 : 0.48);
    const created: ComponentMarker = {
      id: `comp-${Date.now()}`,
      name: `Component ${idx}`,
      description: 'Describe the role of this system component.',
      x: nextX,
      y: nextY,
    };
    setComponents([...components, created]);
    setActiveMarkerId(created.id);
  };

  const handleRemoveComponent = (id: string) => {
    const remaining = components.filter((c) => c.id !== id);
    setComponents(remaining);
    if (activeMarkerId === id) {
      setActiveMarkerId(remaining[0]?.id ?? null);
    }
  };

  const handleManualSaveOutputs = async () => {
    if (invalidMarkerErrors.length > 0) {
      setToastError(
        makeLocalError(
          settings.engine,
          'Please fix out-of-range coordinates (must be between 0.00 and 1.00) before saving.'
        )
      );
      return;
    }
    setIsSaving(true);
    setToastError(null);
    try {
      const origPng = await imageUrlToPngDataUrl(originalImageUrl);
      const compositePng =
        labeledImageUrl ||
        (await renderLabeledIllustration(
          originalImageUrl,
          components,
          labelingConfig,
          settings.style
        ));
      await onSaveToOutputs({
        originalDataUrl: origPng,
        labeledDataUrl: compositePng,
      });
      setSaveNotice('Saved to outputs/');
      window.setTimeout(() => setSaveNotice(null), 3000);
    } catch (err) {
      setToastError(
        makeLocalError(
          settings.engine,
          sanitizeUserMessage(
            err instanceof Error ? err.message : null,
            'Failed to save illustration to outputs/.'
          ),
          'SAVE_ERROR'
        )
      );
    } finally {
      setIsSaving(false);
    }
  };

  const activeMarkerIndex = components.findIndex((c) => c.id === activeMarkerId);

  return (
    <div className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6">
      <div className="grid items-start gap-6 lg:grid-cols-[376px_1fr]">
        {/* LEFT RAIL: Prompt, Model, Size & Generation Controls */}
        <aside className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          {/* Generation Provider Selector + Live Health Status */}
          <div>
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Generation Engine
              </p>
              <button
                type="button"
                onClick={() => onRefreshHealth(true)}
                title="Refresh engine availability"
                aria-label="Refresh engine availability"
                className="inline-flex cursor-pointer items-center gap-1 text-[11px] font-medium text-slate-500 transition-colors hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
              >
                <RefreshCw className="h-3 w-3" aria-hidden="true" />
                <span>Status</span>
              </button>
            </div>

            <div className="mt-2 grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-950">
              <button
                type="button"
                onClick={() => handleEngineChange('huggingface')}
                title={`Hugging Face: ${hfStatusMeta.label}`}
                className={`inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                  settings.engine === 'huggingface'
                    ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-800 dark:text-white'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`h-2 w-2 shrink-0 rounded-full ${hfStatusMeta.dotClass}`}
                />
                <span>Hugging Face</span>
                <span className="sr-only">({hfStatusMeta.label})</span>
              </button>
              <button
                type="button"
                onClick={() => handleEngineChange('gemini')}
                title={`Gemini SVG: ${geminiStatusMeta.label}`}
                className={`inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                  settings.engine === 'gemini'
                    ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-800 dark:text-white'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`h-2 w-2 shrink-0 rounded-full ${geminiStatusMeta.dotClass}`}
                />
                <span>Gemini SVG</span>
                <span className="sr-only">({geminiStatusMeta.label})</span>
              </button>
            </div>

            <p className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400">
              HF: {hfStatusMeta.label} · Gemini: {geminiStatusMeta.label}
            </p>

            {/* Auto-Fallback Toggle */}
            <label className="mt-3 flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2 text-xs text-slate-700 dark:border-slate-800 dark:bg-slate-950/70 dark:text-slate-300">
              <input
                type="checkbox"
                checked={autoFallback}
                onChange={(e) => setAutoFallback(e.target.checked)}
                className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded border-slate-300 text-blue-700 focus:ring-blue-600 dark:border-slate-600 dark:bg-slate-900"
              />
              <span className="leading-snug">
                <span className="font-medium text-slate-900 dark:text-slate-100">
                  Auto-fallback to other engine
                </span>
                <span className="block text-[11px] text-slate-500 dark:text-slate-400">
                  Switches automatically if one engine is busy or out of quota.
                </span>
              </span>
            </label>
          </div>

          {/* Hugging Face Model Selector */}
          {settings.engine === 'huggingface' && (
            <div className="mt-4">
              <label
                htmlFor="hf-model-select"
                className="block text-xs font-semibold text-slate-800 dark:text-slate-200"
              >
                Hugging Face Model
              </label>
              <select
                id="hf-model-select"
                value={settings.hfModel}
                onChange={(e) =>
                  setSettings({ ...settings, hfModel: e.target.value })
                }
                className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/15 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              >
                {availableHfModels.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.label}
                  </option>
                ))}
              </select>
              <p className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                {activeHfModelMeta.description}
              </p>
              <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                Tip: FLUX.1 Schnell at 768×768 uses the fewest credits. Larger sizes and FLUX.1 Dev use more credits.
              </p>
            </div>
          )}

          <hr className="my-5 border-slate-100 dark:border-slate-800" />

          {/* Prompt Input */}
          <div>
            <div className="flex items-center justify-between gap-2">
              <label
                htmlFor="prompt-input"
                className="block text-sm font-semibold text-slate-900 dark:text-slate-100"
              >
                Prompt
              </label>
              <span className="font-mono text-[11px] text-slate-400 tabular-nums dark:text-slate-500">
                {prompt.length}/1000
              </span>
            </div>
            <textarea
              id="prompt-input"
              rows={3}
              maxLength={1000}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Example: a red fox in a snowy forest, soft light"
              className="mt-2 w-full rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600/15 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:bg-slate-950"
            />

            <div className="mt-2.5 flex items-center gap-2">
              <button
                type="button"
                onClick={handleAiEnhance}
                disabled={isEnhancing || isGenerating}
                className="inline-flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-800 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 whitespace-nowrap dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
              >
                {isEnhancing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <Wand2 className="h-3.5 w-3.5 text-blue-700 dark:text-blue-400" aria-hidden="true" />
                )}
                <span>{isEnhancing ? 'Enhancing...' : 'AI Enhance Prompt'}</span>
              </button>

              <button
                type="button"
                onClick={handleTemplateEnhance}
                disabled={isGenerating}
                className="cursor-pointer rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-60 whitespace-nowrap dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                Template Rules
              </button>
            </div>

            {/* Structured Technical Prompt Templates Disclosure */}
            <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50/70 p-2.5 dark:border-slate-800 dark:bg-slate-950/70">
              <button
                type="button"
                onClick={() => setShowPromptBuilder((v) => !v)}
                className="flex w-full cursor-pointer items-center justify-between text-xs font-semibold text-slate-700 hover:text-slate-950 dark:text-slate-300 dark:hover:text-white"
              >
                <span>Structured Technical Prompt Builder (10 Domains)</span>
                {showPromptBuilder ? (
                  <ChevronUp className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                )}
              </button>

              {showPromptBuilder && (
                <div className="mt-2.5 space-y-2.5">
                  <div>
                    <label
                      htmlFor="domain-template-select"
                      className="block text-[11px] font-medium text-slate-600 dark:text-slate-400"
                    >
                      Technical Domain Template
                    </label>
                    <select
                      id="domain-template-select"
                      value={selectedTemplateId}
                      onChange={(e) => {
                        const nextId = e.target.value;
                        setSelectedTemplateId(nextId);
                        const tpl = TECHNICAL_PROMPT_TEMPLATES.find((t) => t.id === nextId);
                        if (tpl) setBuilderAudience(tpl.defaultAudience);
                      }}
                      className="mt-1 h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    >
                      {TECHNICAL_PROMPT_TEMPLATES.map((tpl) => (
                        <option key={tpl.id} value={tpl.id}>
                          {tpl.domain} — {tpl.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label
                      htmlFor="audience-select"
                      className="block text-[11px] font-medium text-slate-600 dark:text-slate-400"
                    >
                      Target Use Case
                    </label>
                    <select
                      id="audience-select"
                      value={builderAudience}
                      onChange={(e) => setBuilderAudience(e.target.value as TargetAudience)}
                      className="mt-1 h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    >
                      <option value="Technical Documentation">Technical Documentation</option>
                      <option value="Developer Tutorial">Developer Tutorial</option>
                      <option value="Product & Marketing">Product &amp; Marketing</option>
                    </select>
                  </div>

                  <div>
                    <label
                      htmlFor="builder-components-input"
                      className="block text-[11px] font-medium text-slate-600 dark:text-slate-400"
                    >
                      Key Components to Highlight (optional)
                    </label>
                    <input
                      id="builder-components-input"
                      type="text"
                      value={builderComponents}
                      onChange={(e) => setBuilderComponents(e.target.value)}
                      placeholder={
                        TECHNICAL_PROMPT_TEMPLATES.find((t) => t.id === selectedTemplateId)
                          ?.subjectHint
                      }
                      className="mt-1 h-8 w-full rounded-md border border-slate-200 bg-white px-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={handleApplyPromptTemplate}
                    className="w-full cursor-pointer rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-slate-800 dark:bg-blue-600 dark:hover:bg-blue-500"
                  >
                    Apply Structured Template
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Primary Generate Button (3s cooldown + in-flight lock + live retry status) */}
          <div className="mt-4">
            <button
              type="button"
              onClick={() => void handleGenerate()}
              disabled={isGenerating || cooldownSeconds > 0}
              className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-blue-700 px-4 py-3 text-sm font-semibold text-white transition-colors duration-150 hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-blue-600 dark:hover:bg-blue-500"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden="true" />
                  <span className="truncate">
                    {loadingStatus ||
                      (settings.engine === 'huggingface'
                        ? 'Generating with Hugging Face...'
                        : 'Generating with Gemini SVG...')}
                  </span>
                </>
              ) : cooldownSeconds > 0 ? (
                <span>Wait {cooldownSeconds}s...</span>
              ) : (
                <span>
                  {settings.quantity > 1
                    ? `Generate ${settings.quantity} Variations`
                    : 'Generate'}
                </span>
              )}
            </button>
          </div>

          <hr className="my-5 border-slate-100 dark:border-slate-800" />

          {/* Generation Settings: Size, Quantity, Style, Palette, Reusable Configs, Steps, CFG, Seed */}
          <div className="space-y-4">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Image Settings
            </h2>

            {/* Size & Quantity Row */}
            <div className="grid grid-cols-[1fr_92px] gap-2.5">
              <div>
                <label
                  htmlFor="resolution-select"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                >
                  Image Size
                </label>
                <select
                  id="resolution-select"
                  value={`${settings.width}x${settings.height}`}
                  onChange={(e) => {
                    const [w, h] = e.target.value.split('x').map(Number);
                    setSettings({ ...settings, width: w, height: h });
                  }}
                  className="mt-1.5 h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/15 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                >
                  {RESOLUTION_OPTIONS.map((opt) => (
                    <option key={opt.label} value={`${opt.width}x${opt.height}`}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="quantity-select"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                >
                  Quantity
                </label>
                <select
                  id="quantity-select"
                  value={settings.quantity}
                  onChange={(e) =>
                    setSettings({ ...settings, quantity: Number(e.target.value) || 1 })
                  }
                  className="mt-1.5 h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 font-mono text-xs text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/15 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                >
                  {[1, 2, 3, 4].map((count) => (
                    <option key={count} value={count}>
                      {count} {count === 1 ? 'img' : 'imgs'}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {settings.quantity > 1 && (
              <p className="-mt-2 text-[11px] text-slate-500 dark:text-slate-400">
                Generates {settings.quantity} seed variations ({settings.seed}–
                {settings.seed + settings.quantity - 1}) for side-by-side comparison. Uses{' '}
                {settings.quantity}× credits.
              </p>
            )}

            {/* Visual Styles + Palette Consistency Swatches */}
            <div>
              <p className="text-xs font-medium text-slate-700 dark:text-slate-300">
                Visual Style &amp; Palette
              </p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {STYLES_LIST.map((styleName) => {
                  const active = settings.style === styleName;
                  return (
                    <button
                      key={styleName}
                      type="button"
                      onClick={() => handleStyleChange(styleName)}
                      className={`cursor-pointer rounded-lg border px-3 py-2 text-left transition-colors duration-150 ${
                        active
                          ? 'border-blue-700 bg-blue-700 text-white dark:border-blue-500 dark:bg-blue-600'
                          : 'border-slate-200 bg-white text-slate-800 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800'
                      }`}
                    >
                      <span className="block text-xs font-semibold whitespace-nowrap">
                        {styleName}
                      </span>
                    </button>
                  );
                })}
              </div>
              <p className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                {STYLE_DEFINITIONS[settings.style].summary}
              </p>

              {/* Style Color Palette Swatches */}
              <div className="mt-2 flex items-center justify-between gap-2 rounded-md border border-slate-100 bg-slate-50/80 px-2.5 py-1.5 dark:border-slate-800 dark:bg-slate-950/70">
                <span className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                  {STYLE_DEFINITIONS[settings.style].backgroundNote}
                </span>
                <div className="flex items-center gap-1 shrink-0" aria-label="Style color palette">
                  {STYLE_DEFINITIONS[settings.style].palette.map((hex) => (
                    <span
                      key={hex}
                      title={hex}
                      style={{ backgroundColor: hex }}
                      className="h-3.5 w-3.5 rounded-sm border border-slate-300/80 dark:border-slate-600"
                    />
                  ))}
                </div>
              </div>

              {settings.engine === 'huggingface' && (
                <label className="mt-2 flex cursor-pointer items-center gap-2 text-[11px] text-slate-600 dark:text-slate-400">
                  <input
                    type="checkbox"
                    checked={settings.applyStyleToHf}
                    onChange={(e) =>
                      setSettings({ ...settings, applyStyleToHf: e.target.checked })
                    }
                    className="h-3.5 w-3.5 rounded border-slate-300 text-blue-700 focus:ring-blue-600 dark:border-slate-600 dark:bg-slate-900"
                  />
                  <span>Enforce visual style &amp; clean background in HF prompt</span>
                </label>
              )}
            </div>

            {/* Reusable Style Configurations */}
            <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3 dark:border-slate-800 dark:bg-slate-950/50">
              <p className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                Reusable Style Configurations
              </p>
              <div className="mt-2 flex items-center gap-1.5">
                <input
                  type="text"
                  value={styleConfigName}
                  onChange={(e) => setStyleConfigName(e.target.value)}
                  placeholder="Preset name (e.g. Docs Blueprint)"
                  className="h-8 min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500"
                />
                <button
                  type="button"
                  onClick={handleSaveCurrentStyleConfig}
                  className="inline-flex h-8 cursor-pointer items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-800 hover:bg-slate-50 whitespace-nowrap shrink-0 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
                >
                  <BookmarkPlus className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Save</span>
                </button>
              </div>
              {savedStyleConfigs.length > 0 && (
                <div className="mt-2 space-y-1">
                  {savedStyleConfigs.map((cfg) => (
                    <div
                      key={cfg.id}
                      className="flex items-center justify-between gap-2 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] dark:border-slate-800 dark:bg-slate-900"
                    >
                      <button
                        type="button"
                        onClick={() => handleApplySavedStyleConfig(cfg)}
                        className="min-w-0 flex-1 cursor-pointer truncate text-left font-medium text-slate-800 hover:text-blue-700 dark:text-slate-200 dark:hover:text-blue-400"
                      >
                        {cfg.name}{' '}
                        <span className="font-mono text-[10px] text-slate-400">
                          · {cfg.style} · {cfg.steps}s
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteStyleConfig(cfg.id)}
                        aria-label={`Delete style configuration ${cfg.name}`}
                        className="cursor-pointer rounded p-0.5 text-slate-400 hover:text-red-600 dark:hover:text-red-400"
                      >
                        <X className="h-3 w-3" aria-hidden="true" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Advanced Prompt & Parameters Disclosure */}
            <div className="border-t border-slate-100 pt-3 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setShowAdvanced((v) => !v)}
                className="flex w-full cursor-pointer items-center justify-between text-xs font-semibold text-slate-700 hover:text-slate-950 dark:text-slate-300 dark:hover:text-white"
              >
                <span>Advanced Options (Negative Prompt, Steps, Seed)</span>
                {showAdvanced ? (
                  <ChevronUp className="h-4 w-4 text-slate-400" aria-hidden="true" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-slate-400" aria-hidden="true" />
                )}
              </button>

              {showAdvanced && (
                <div className="mt-3 space-y-3">
                  <div>
                    <label
                      htmlFor="negative-prompt-input"
                      className="block text-[11px] font-medium text-slate-600 dark:text-slate-400"
                    >
                      Negative Prompt (optional)
                    </label>
                    <textarea
                      id="negative-prompt-input"
                      rows={2}
                      maxLength={500}
                      value={negativePrompt}
                      onChange={(e) => setNegativePrompt(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs text-slate-800 focus:border-blue-600 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                    />
                  </div>

                  {settings.engine === 'gemini' && (
                    <div>
                      <label
                        htmlFor="enhanced-prompt-input"
                        className="block text-[11px] font-medium text-slate-600 dark:text-slate-400"
                      >
                        Enhanced Diagram Prompt
                      </label>
                      <textarea
                        id="enhanced-prompt-input"
                        rows={3}
                        value={enhancedPrompt}
                        onChange={(e) => setEnhancedPrompt(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs text-slate-800 focus:border-blue-600 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                      />
                    </div>
                  )}

                  {/* Inference Steps */}
                  <div>
                    <div className="flex items-center justify-between text-xs">
                      <label htmlFor="steps-slider" className="font-medium text-slate-700 dark:text-slate-300">
                        Inference Steps
                      </label>
                      <span className="font-mono font-semibold text-slate-900 tabular-nums dark:text-slate-100">
                        {settings.steps}
                      </span>
                    </div>
                    <input
                      id="steps-slider"
                      type="range"
                      min={15}
                      max={50}
                      step={1}
                      value={settings.steps}
                      onChange={(e) =>
                        setSettings({ ...settings, steps: Number(e.target.value) })
                      }
                      className="mt-1.5 h-1.5 w-full cursor-pointer"
                    />
                  </div>

                  {/* Guidance Scale */}
                  <div>
                    <div className="flex items-center justify-between text-xs">
                      <label htmlFor="cfg-slider" className="font-medium text-slate-700 dark:text-slate-300">
                        Guidance Scale (CFG)
                      </label>
                      <span className="font-mono font-semibold text-slate-900 tabular-nums dark:text-slate-100">
                        {settings.guidanceScale.toFixed(1)}
                      </span>
                    </div>
                    <input
                      id="cfg-slider"
                      type="range"
                      min={1.0}
                      max={15.0}
                      step={0.5}
                      value={settings.guidanceScale}
                      onChange={(e) =>
                        setSettings({ ...settings, guidanceScale: Number(e.target.value) })
                      }
                      className="mt-1.5 h-1.5 w-full cursor-pointer"
                    />
                  </div>

                  {/* Random Seed */}
                  <div>
                    <label
                      htmlFor="seed-input"
                      className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                    >
                      Random Seed
                    </label>
                    <div className="mt-1.5 flex items-center gap-2">
                      <input
                        id="seed-input"
                        type="number"
                        min={0}
                        max={999999}
                        value={settings.seed}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            seed: Math.max(0, Number(e.target.value) || 0),
                          })
                        }
                        className="h-9 flex-1 rounded-lg border border-slate-200 bg-white px-3 font-mono text-xs text-slate-900 tabular-nums focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setSettings({
                            ...settings,
                            seed: Math.floor(Math.random() * 90000) + 1000,
                          })
                        }
                        aria-label="Randomize seed"
                        className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 whitespace-nowrap dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                      >
                        <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>Random</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          <hr className="my-5 border-slate-100 dark:border-slate-800" />

          {/* Example Presets & Upload */}
          <div>
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Quick Examples
              </h2>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-medium text-blue-700 hover:text-blue-800 whitespace-nowrap dark:text-blue-400 dark:hover:text-blue-300"
              >
                <ImagePlus className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Upload PNG</span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={handleUploadCustomImage}
                className="hidden"
              />
            </div>

            <div className="mt-2.5 grid grid-cols-2 gap-2">
              {SAMPLE_PRESETS.map((preset) => {
                const isSelected = originalImageUrl === preset.imageUrl;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => handleLoadPreset(preset.id)}
                    className={`cursor-pointer rounded-lg border px-3 py-2 text-left transition-colors duration-150 ${
                      isSelected
                        ? 'border-blue-600 bg-blue-50/70 text-slate-900 dark:border-blue-500 dark:bg-blue-950/50 dark:text-slate-100'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-800'
                    }`}
                  >
                    <p className="truncate text-xs font-semibold">{preset.label}</p>
                    <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                      {preset.shortTag}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>
        </aside>

        {/* RIGHT STAGE: Unified Interactive Illustration Canvas, History Strip & Smart Labeling Controls */}
        <div className="min-w-0 space-y-6">
          {/* Unified Interactive Illustration Preview Panel */}
          <section className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            {/* Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3.5 sm:px-5 dark:border-slate-800">
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 tabular-nums dark:text-slate-400">
                <span className="font-semibold text-slate-900 dark:text-slate-100">
                  Result Preview
                </span>
                <span aria-hidden="true">·</span>
                <span>
                  {settings.engine === 'huggingface'
                    ? activeHfModelMeta.label
                    : `Gemini · ${settings.style}`}
                </span>
                <span aria-hidden="true">·</span>
                <span>
                  {settings.width}×{settings.height}
                </span>
                <span aria-hidden="true" className="hidden sm:inline">
                  ·
                </span>
                <span className="hidden sm:inline">
                  {activeMarkerIndex >= 0
                    ? `Click graphic to place marker #${activeMarkerIndex + 1}`
                    : `${components.length} markers`}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {saveNotice && (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                    <Check className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>{saveNotice}</span>
                  </span>
                )}

                <button
                  type="button"
                  onClick={handleCopyPrompt}
                  disabled={!prompt.trim()}
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  {copiedPrompt ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                      <span>Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Copy Prompt</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleManualSaveOutputs}
                  disabled={isSaving || isGenerating}
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  <Save className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{isSaving ? 'Saving...' : 'Save to outputs/'}</span>
                </button>

                <button
                  type="button"
                  onClick={onDownloadPng}
                  disabled={isGenerating || !labeledImageUrl}
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap dark:bg-blue-600 dark:hover:bg-blue-500"
                >
                  <Download className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Download</span>
                </button>
              </div>
            </div>

            {/* Fallback Info Notice Banner */}
            {fallbackNotice && (
              <div
                role="status"
                aria-live="polite"
                className="flex items-center justify-between gap-3 border-b border-blue-200 bg-blue-50 px-4 py-2.5 text-xs text-blue-900 sm:px-5 dark:border-blue-900/60 dark:bg-blue-950/50 dark:text-blue-200"
              >
                <div className="flex items-center gap-2">
                  <Info
                    className="h-4 w-4 shrink-0 text-blue-700 dark:text-blue-400"
                    aria-hidden="true"
                  />
                  <span className="font-medium">{fallbackNotice}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setFallbackNotice(null)}
                  aria-label="Dismiss fallback notice"
                  className="cursor-pointer rounded p-1 text-blue-700 hover:bg-blue-100 dark:text-blue-300 dark:hover:bg-blue-900/60"
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
            )}

            {/* Single Unified Interactive Documentation Frame */}
            <div className="studio-grid-bg p-4 sm:p-5">
              {isGenerating ? (
                <div className="flex min-h-[420px] flex-col items-center justify-center rounded-lg border border-slate-200 bg-white p-8 text-center dark:border-slate-800 dark:bg-slate-900">
                  <Loader2 className="h-8 w-8 animate-spin text-blue-700 dark:text-blue-400" aria-hidden="true" />
                  <p className="mt-4 text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {loadingStatus ||
                      (settings.engine === 'huggingface'
                        ? `Generating image with ${activeHfModelMeta.label}`
                        : `Synthesizing ${settings.style} technical illustration`)}
                  </p>
                  <p className="mt-1 text-xs text-slate-500 tabular-nums dark:text-slate-400">
                    {settings.width}×{settings.height} · Automatic retries and timeout protection active
                  </p>
                </div>
              ) : (
                <div
                  className={`mx-auto max-w-[920px] overflow-hidden rounded-lg border shadow-xs ${
                    isBlueprint
                      ? 'border-[#1E3A5F] bg-[#0A1E34]'
                      : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900'
                  }`}
                >
                  {/* Title Banner */}
                  {labelingConfig.showTitle && (
                    <div
                      className={`border-b px-5 py-4 sm:px-6 ${
                        isBlueprint
                          ? 'border-[#1E3A5F] bg-[#0A1E34] text-slate-50'
                          : 'border-slate-200 bg-white text-slate-900 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100'
                      }`}
                    >
                      <h3 className="font-display text-lg font-bold tracking-tight">
                        {labelingConfig.title.trim() || 'Technical Documentation Diagram'}
                      </h3>
                      {labelingConfig.subtitle.trim() && (
                        <p
                          className={`mt-0.5 text-xs ${
                            isBlueprint
                              ? 'text-blue-200'
                              : 'text-slate-500 dark:text-slate-400'
                          }`}
                        >
                          {labelingConfig.subtitle}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Interactive Image & Marker Placement Surface */}
                  <div className="flex items-center justify-center">
                    <div
                      onClick={handleImageCanvasClick}
                      role="button"
                      tabIndex={0}
                      aria-label="Click anywhere on the illustration to position the active marker"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && components[0]) {
                          setActiveMarkerId(components[0].id);
                        }
                      }}
                      className="relative inline-block w-full cursor-crosshair select-none"
                    >
                      <img
                        ref={stageImgRef}
                        src={originalImageUrl}
                        alt={labelingConfig.title || 'Generated illustration'}
                        referrerPolicy="no-referrer"
                        className="block h-auto w-full object-contain"
                      />

                      {validComponents.map((comp, idx) => {
                        const isSelected = comp.id === activeMarkerId;
                        const placeLeft = comp.x > 0.72;
                        return (
                          <div
                            key={comp.id}
                            style={{
                              left: `${comp.x * 100}%`,
                              top: `${comp.y * 100}%`,
                            }}
                            className="absolute -translate-x-1/2 -translate-y-1/2"
                          >
                            <button
                              type="button"
                              onClick={(ev) => {
                                ev.stopPropagation();
                                setActiveMarkerId(comp.id);
                              }}
                              title={`#${idx + 1} ${comp.name} (${comp.x.toFixed(2)}, ${comp.y.toFixed(2)})`}
                              style={{ backgroundColor: labelingConfig.markerColor }}
                              className={`flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border-2 border-white font-mono text-xs font-bold text-white shadow-md transition-transform duration-150 ${
                                isSelected
                                  ? 'scale-115 ring-2 ring-blue-400 ring-offset-1'
                                  : 'hover:scale-110'
                              }`}
                            >
                              {idx + 1}
                            </button>

                            {labelingConfig.showMarkerTags && comp.name.trim() && (
                              <span
                                className={`pointer-events-none absolute top-1/2 -translate-y-1/2 rounded-md border px-2 py-0.5 text-[11px] font-semibold shadow-sm whitespace-nowrap ${
                                  placeLeft ? 'right-9' : 'left-9'
                                } ${
                                  isBlueprint
                                    ? 'border-sky-300/40 bg-[#0A1E34]/95 text-slate-50'
                                    : 'border-slate-200 bg-white/95 text-slate-900 dark:border-slate-700 dark:bg-slate-900/95 dark:text-slate-100'
                                }`}
                              >
                                {comp.name}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Auto-Formatted Component Legend */}
                  {labelingConfig.showLegend && validComponents.length > 0 && (
                    <div
                      className={`border-t px-5 py-5 sm:px-6 ${
                        isBlueprint
                          ? 'border-[#1E3A5F] bg-[#0B223B] text-slate-100'
                          : 'border-slate-200 bg-slate-50 text-slate-900 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100'
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p
                          className={`text-xs font-semibold ${
                            isBlueprint
                              ? 'text-blue-200'
                              : 'text-slate-600 dark:text-slate-300'
                          }`}
                        >
                          Component Legend
                        </p>
                        <p
                          className={`text-[11px] ${
                            isBlueprint
                              ? 'text-blue-300/80'
                              : 'text-slate-500 dark:text-slate-400'
                          }`}
                        >
                          Positions manually annotated (0.00–1.00)
                        </p>
                      </div>

                      <div
                        className={`mt-4 grid gap-x-8 gap-y-4 ${
                          validComponents.length > 2 ? 'sm:grid-cols-2' : 'grid-cols-1'
                        }`}
                      >
                        {validComponents.map((comp, idx) => (
                          <div key={comp.id} className="flex items-start gap-3">
                            <span
                              style={{ backgroundColor: labelingConfig.markerColor }}
                              className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-mono text-[11px] font-bold text-white tabular-nums"
                            >
                              {idx + 1}
                            </span>
                            <div className="min-w-0">
                              <p
                                className={`text-xs font-semibold ${
                                  isBlueprint
                                    ? 'text-white'
                                    : 'text-slate-900 dark:text-slate-100'
                                }`}
                              >
                                {comp.name || `Component ${idx + 1}`}
                              </p>
                              <p
                                className={`mt-0.5 text-xs leading-relaxed ${
                                  isBlueprint
                                    ? 'text-slate-300'
                                    : 'text-slate-600 dark:text-slate-400'
                                }`}
                              >
                                {comp.description || 'Component description not specified.'}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Batch Variations Switcher & Inline Side-by-Side Comparison (when Quantity > 1) */}
            {batchVariations.length > 1 && (
              <div className="border-t border-slate-200 px-4 py-4 sm:px-5 dark:border-slate-800">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs text-slate-800 dark:text-slate-200">
                    <Layers className="h-3.5 w-3.5 text-blue-700 dark:text-blue-400" aria-hidden="true" />
                    <span className="font-semibold">
                      Batch Variations ({batchVariations.length} generated)
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setCompareBatchMode((v) => !v)}
                    className={`inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                      compareBatchMode
                        ? 'border-blue-600 bg-blue-50 text-blue-700 dark:border-blue-500 dark:bg-blue-950/50 dark:text-blue-300'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'
                    }`}
                  >
                    <Columns2 className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>{compareBatchMode ? 'Hide Side-by-Side' : 'Compare Side-by-Side'}</span>
                  </button>
                </div>

                <div
                  className={`mt-3 grid gap-3 ${
                    compareBatchMode ? 'sm:grid-cols-2' : 'grid-cols-2 sm:grid-cols-4'
                  }`}
                >
                  {batchVariations.map((variant, idx) => {
                    const isActive = variant.id === activeVariationId;
                    return (
                      <button
                        key={variant.id}
                        type="button"
                        onClick={() => void selectVariationToStage(variant, false)}
                        className={`flex cursor-pointer flex-col overflow-hidden rounded-lg border text-left transition-colors ${
                          isActive
                            ? 'border-blue-600 bg-blue-50/40 ring-1 ring-blue-600/20 dark:border-blue-500 dark:bg-blue-950/30'
                            : 'border-slate-200 bg-slate-50 hover:border-blue-400 dark:border-slate-700 dark:bg-slate-950'
                        }`}
                      >
                        <div
                          className={`w-full overflow-hidden bg-white dark:bg-slate-900 ${
                            compareBatchMode ? 'aspect-[4/3]' : 'aspect-square'
                          }`}
                        >
                          <img
                            src={variant.imageUrl}
                            alt={`Variation ${idx + 1} (Seed ${variant.seed})`}
                            referrerPolicy="no-referrer"
                            className="h-full w-full object-contain"
                          />
                        </div>
                        <div className="flex items-center justify-between px-2.5 py-1.5 text-[11px]">
                          <span className="font-semibold text-slate-900 dark:text-slate-100">
                            Variant #{idx + 1}
                          </span>
                          <span className="font-mono text-slate-500 tabular-nums dark:text-slate-400">
                            Seed {variant.seed}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Recent Generations History Strip (last 8 generations in localStorage) */}
            <div className="border-t border-slate-200 px-4 py-4 sm:px-5 dark:border-slate-800">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300">
                  <History className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                  <span className="font-semibold">Recent Generations</span>
                  <span className="font-mono text-[11px] text-slate-400 tabular-nums dark:text-slate-500">
                    {recentHistory.length}/8
                  </span>
                </div>
                {recentHistory.length > 0 && (
                  <button
                    type="button"
                    onClick={onClearRecentHistory}
                    className="cursor-pointer text-xs font-medium text-slate-500 transition-colors hover:text-red-600 dark:text-slate-400 dark:hover:text-red-400"
                  >
                    Clear History
                  </button>
                )}
              </div>

              {recentHistory.length === 0 ? (
                <p className="mt-2.5 text-xs text-slate-500 dark:text-slate-400">
                  Your last 8 generated images will appear here automatically for quick recall.
                </p>
              ) : (
                <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {recentHistory.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleRestoreHistoryItem(item)}
                      title={item.prompt}
                      className="group flex cursor-pointer flex-col overflow-hidden rounded-lg border border-slate-200 bg-slate-50 text-left transition-colors hover:border-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:hover:border-blue-400"
                    >
                      <div className="aspect-[4/3] w-full overflow-hidden bg-slate-100 dark:bg-slate-900">
                        <img
                          src={item.imageUrl}
                          alt={item.prompt}
                          referrerPolicy="no-referrer"
                          className="h-full w-full object-cover transition-transform duration-150 group-hover:scale-105"
                        />
                      </div>
                      <div className="p-2">
                        <p className="truncate text-[11px] font-medium text-slate-800 dark:text-slate-200">
                          {item.prompt}
                        </p>
                        <p className="mt-0.5 truncate font-mono text-[10px] text-slate-500 tabular-nums dark:text-slate-400">
                          {item.model.split('/').pop()} · {item.width}×{item.height}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </section>

          {/* Smart Labeling Controls */}
          <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  Smart Labeling Controls
                </h2>
                <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">
                  Add a title, position numbered markers manually, and customize the component
                  legend.
                </p>
              </div>

              <button
                type="button"
                onClick={handleAddComponent}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-800 transition-colors hover:bg-slate-50 whitespace-nowrap shrink-0 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Add Component</span>
              </button>
            </div>

            {/* Transparency Note */}
            <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-xs leading-relaxed text-slate-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
              <span className="font-semibold text-slate-900 dark:text-slate-100">
                Manual Position Disclosure:{' '}
              </span>
              Component marker positions (<code className="font-mono">X</code> and{' '}
              <code className="font-mono">Y</code> between{' '}
              <code className="font-mono">0.00</code> and{' '}
              <code className="font-mono">1.00</code>) are{' '}
              <strong>manually provided by you</strong> by clicking directly on the graphic
              above or typing coordinates below — they are not automatically detected by an
              object-detection model.
            </div>

            {/* Title, Subtitle, Marker Color & Visibility Toggles */}
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div>
                <label
                  htmlFor="diagram-title-input"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                >
                  Diagram Title
                </label>
                <input
                  id="diagram-title-input"
                  type="text"
                  value={labelingConfig.title}
                  onChange={(e) =>
                    setLabelingConfig({ ...labelingConfig, title: e.target.value })
                  }
                  className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/15 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </div>

              <div>
                <label
                  htmlFor="diagram-subtitle-input"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                >
                  Subtitle (Optional)
                </label>
                <input
                  id="diagram-subtitle-input"
                  type="text"
                  value={labelingConfig.subtitle}
                  onChange={(e) =>
                    setLabelingConfig({ ...labelingConfig, subtitle: e.target.value })
                  }
                  className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/15 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4 dark:border-slate-800">
              <div className="flex flex-wrap items-center gap-5 text-xs text-slate-700 dark:text-slate-300">
                <label className="inline-flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={labelingConfig.showTitle}
                    onChange={(e) =>
                      setLabelingConfig({
                        ...labelingConfig,
                        showTitle: e.target.checked,
                      })
                    }
                    className="h-4 w-4 rounded border-slate-300 text-blue-700 focus:ring-blue-600 dark:border-slate-600 dark:bg-slate-950"
                  />
                  <span>Show Title Banner</span>
                </label>

                <label className="inline-flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={labelingConfig.showLegend}
                    onChange={(e) =>
                      setLabelingConfig({
                        ...labelingConfig,
                        showLegend: e.target.checked,
                      })
                    }
                    className="h-4 w-4 rounded border-slate-300 text-blue-700 focus:ring-blue-600 dark:border-slate-600 dark:bg-slate-950"
                  />
                  <span>Show Legend Below Image</span>
                </label>

                <label className="inline-flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={labelingConfig.showMarkerTags}
                    onChange={(e) =>
                      setLabelingConfig({
                        ...labelingConfig,
                        showMarkerTags: e.target.checked,
                      })
                    }
                    className="h-4 w-4 rounded border-slate-300 text-blue-700 focus:ring-blue-600 dark:border-slate-600 dark:bg-slate-950"
                  />
                  <span>Inline Callout Tags</span>
                </label>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  Marker Accent:
                </span>
                {MARKER_COLOR_OPTIONS.map((swatch) => (
                  <button
                    key={swatch.value}
                    type="button"
                    title={swatch.label}
                    aria-label={`Set marker accent to ${swatch.label}`}
                    onClick={() =>
                      setLabelingConfig({
                        ...labelingConfig,
                        markerColor: swatch.value,
                      })
                    }
                    style={{ backgroundColor: swatch.value }}
                    className={`h-5 w-5 cursor-pointer rounded-full transition-transform ${
                      labelingConfig.markerColor === swatch.value
                        ? 'scale-110 ring-2 ring-slate-900 ring-offset-2 dark:ring-white dark:ring-offset-slate-900'
                        : 'hover:scale-105'
                    }`}
                  />
                ))}
              </div>
            </div>

            {/* Coordinate Validation Banner */}
            {invalidMarkerErrors.length > 0 && (
              <div
                role="alert"
                className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-xs text-red-800 dark:border-red-900/60 dark:bg-red-950/50 dark:text-red-200"
              >
                <p className="font-semibold">
                  Coordinate Validation Error (valid range: 0.00 to 1.00):
                </p>
                <ul className="mt-1 list-disc space-y-0.5 pl-4">
                  {invalidMarkerErrors.map((err, i) => (
                    <li key={i}>{err}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Component Coordinates Table */}
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[680px] border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400">
                    <th className="w-12 py-2.5 font-medium">#</th>
                    <th className="w-44 py-2.5 pr-3 font-medium">Component Name</th>
                    <th className="py-2.5 pr-3 font-medium">Legend Description</th>
                    <th className="w-24 py-2.5 pr-2 font-medium">X (0–1)</th>
                    <th className="w-24 py-2.5 pr-2 font-medium">Y (0–1)</th>
                    <th className="w-24 py-2.5 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {components.map((comp, idx) => {
                    const isSelected = comp.id === activeMarkerId;
                    const validation = validateCoordinates(comp.x, comp.y);
                    const raw = rawCoordInputs[comp.id] ?? {
                      x: comp.x.toFixed(2),
                      y: comp.y.toFixed(2),
                    };

                    return (
                      <tr
                        key={comp.id}
                        className={
                          isSelected
                            ? 'bg-blue-50/40 dark:bg-blue-950/30'
                            : 'hover:bg-slate-50/70 dark:hover:bg-slate-800/40'
                        }
                      >
                        <td className="py-2.5 pr-2">
                          <span
                            className={`inline-flex h-6 w-6 items-center justify-center rounded-full font-mono text-[11px] font-bold text-white tabular-nums ${
                              isSelected ? 'bg-blue-700 dark:bg-blue-600' : 'bg-slate-700'
                            }`}
                          >
                            {idx + 1}
                          </span>
                        </td>
                        <td className="py-2.5 pr-3">
                          <input
                            type="text"
                            value={comp.name}
                            onFocus={() => setActiveMarkerId(comp.id)}
                            onChange={(e) =>
                              setComponents(
                                components.map((item) =>
                                  item.id === comp.id
                                    ? { ...item, name: e.target.value }
                                    : item
                                )
                              )
                            }
                            aria-label={`Component ${idx + 1} name`}
                            className="h-8 w-full rounded-md border border-slate-200 bg-white px-2.5 text-xs text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                          />
                        </td>
                        <td className="py-2.5 pr-3">
                          <input
                            type="text"
                            value={comp.description}
                            onFocus={() => setActiveMarkerId(comp.id)}
                            onChange={(e) =>
                              setComponents(
                                components.map((item) =>
                                  item.id === comp.id
                                    ? { ...item, description: e.target.value }
                                    : item
                                )
                              )
                            }
                            aria-label={`Component ${idx + 1} description`}
                            className="h-8 w-full rounded-md border border-slate-200 bg-white px-2.5 text-xs text-slate-700 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                          />
                        </td>
                        <td className="py-2.5 pr-2">
                          <input
                            type="number"
                            step={0.01}
                            min={-0.5}
                            max={1.5}
                            value={raw.x}
                            onFocus={() => setActiveMarkerId(comp.id)}
                            onChange={(e) =>
                              handleCoordChange(comp.id, 'x', e.target.value)
                            }
                            aria-label={`Component ${idx + 1} X coordinate`}
                            className={`h-8 w-full rounded-md border px-2 font-mono text-xs tabular-nums focus:outline-none ${
                              validation.valid
                                ? 'border-slate-200 bg-white text-slate-900 focus:border-blue-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100'
                                : 'border-red-400 bg-red-50 text-red-800 focus:border-red-600 dark:border-red-500 dark:bg-red-950/60 dark:text-red-200'
                            }`}
                          />
                        </td>
                        <td className="py-2.5 pr-2">
                          <input
                            type="number"
                            step={0.01}
                            min={-0.5}
                            max={1.5}
                            value={raw.y}
                            onFocus={() => setActiveMarkerId(comp.id)}
                            onChange={(e) =>
                              handleCoordChange(comp.id, 'y', e.target.value)
                            }
                            aria-label={`Component ${idx + 1} Y coordinate`}
                            className={`h-8 w-full rounded-md border px-2 font-mono text-xs tabular-nums focus:outline-none ${
                              validation.valid
                                ? 'border-slate-200 bg-white text-slate-900 focus:border-blue-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100'
                                : 'border-red-400 bg-red-50 text-red-800 focus:border-red-600 dark:border-red-500 dark:bg-red-950/60 dark:text-red-200'
                            }`}
                          />
                        </td>
                        <td className="py-2.5 text-right">
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => setActiveMarkerId(comp.id)}
                              title="Click the graphic above to position this marker"
                              className={`inline-flex h-8 cursor-pointer items-center gap-1 rounded-md px-2 text-[11px] font-medium transition-colors ${
                                isSelected
                                  ? 'bg-blue-700 text-white dark:bg-blue-600'
                                  : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'
                              }`}
                            >
                              <Crosshair className="h-3 w-3" aria-hidden="true" />
                              <span>Place</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRemoveComponent(comp.id)}
                              aria-label={`Remove ${comp.name}`}
                              className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600 dark:text-slate-500 dark:hover:bg-red-950/50 dark:hover:text-red-400"
                            >
                              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {/* Technical Graphic Quality Evaluation Rubric (9 Criteria + Markdown Export) */}
          <QualityEvaluationPanel
            title={labelingConfig.title}
            prompt={prompt}
            enhancedPrompt={enhancedPrompt}
            settings={settings}
            evaluation={evaluation}
            onChangeEvaluation={setEvaluation}
            activeSavedOutputId={activeSavedOutputId}
            onPersistEvaluation={onPersistEvaluation}
          />
        </div>
      </div>

      {/* Floating Normalized Provider Error Toast */}
      {toastError && (
        <div
          role="alert"
          aria-live="assertive"
          className="fixed bottom-4 right-4 z-50 flex max-w-md items-start gap-3 rounded-xl border border-red-200 bg-white p-4 text-sm shadow-lg dark:border-red-900/70 dark:bg-slate-900"
        >
          <AlertCircle
            className="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-400"
            aria-hidden="true"
          />
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-slate-900 dark:text-slate-100">
              {toastError.providerLabel} Error
            </p>
            <p className="mt-0.5 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
              {toastError.userMessage}
            </p>
            {!NON_FALLBACK_VALIDATION_CODES.has(toastError.code) && (
                <div className="mt-2.5 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleTryOtherEngine}
                    disabled={isGenerating}
                    className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-800 transition-colors hover:bg-slate-100 disabled:opacity-50 whitespace-nowrap dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
                  >
                    <ArrowRightLeft className="h-3 w-3" aria-hidden="true" />
                    <span>
                      Try{' '}
                      {toastError.provider === 'huggingface'
                        ? 'Gemini SVG'
                        : 'Hugging Face'}
                    </span>
                  </button>
                </div>
              )}
          </div>
          <button
            type="button"
            onClick={() => setToastError(null)}
            aria-label="Dismiss error notification"
            className="cursor-pointer rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
}
