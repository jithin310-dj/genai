import {
  AlertCircle,
  Check,
  ChevronDown,
  ChevronUp,
  Crosshair,
  Download,
  ImagePlus,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  Wand2,
} from 'lucide-react';
import { type ChangeEvent, type MouseEvent, useEffect, useRef, useState } from 'react';
import {
  buildTemplateEnhancedPrompt,
  MARKER_COLOR_OPTIONS,
  RESOLUTION_OPTIONS,
  SAMPLE_PRESETS,
  STYLE_DEFINITIONS,
} from '../data/presets';
import type {
  ComponentMarker,
  GenerationSettings,
  LabelingConfig,
  VisualStyle,
} from '../types/project';
import {
  imageUrlToPngDataUrl,
  rasterizeSvgToPng,
  renderLabeledIllustration,
  validateCoordinates,
} from '../utils/labeler';

interface StudioWorkspaceProps {
  prompt: string;
  setPrompt: (value: string) => void;
  enhancedPrompt: string;
  setEnhancedPrompt: (value: string) => void;
  negativePrompt: string;
  setNegativePrompt: (value: string) => void;
  settings: GenerationSettings;
  setSettings: (next: GenerationSettings) => void;
  originalImageUrl: string;
  setOriginalImageUrl: (url: string) => void;
  labeledImageUrl: string;
  setLabeledImageUrl: (url: string) => void;
  components: ComponentMarker[];
  setComponents: (next: ComponentMarker[]) => void;
  labelingConfig: LabelingConfig;
  setLabelingConfig: (next: LabelingConfig) => void;
  onSaveToOutputs: (payload: {
    originalDataUrl: string;
    labeledDataUrl: string;
  }) => Promise<void>;
  onDownloadPng: () => void;
}

const STYLES_LIST: VisualStyle[] = [
  'Professional 3D',
  'Flat Vector',
  'Blueprint',
  'Isometric',
];

export function StudioWorkspace({
  prompt,
  setPrompt,
  enhancedPrompt,
  setEnhancedPrompt,
  negativePrompt,
  setNegativePrompt,
  settings,
  setSettings,
  originalImageUrl,
  setOriginalImageUrl,
  labeledImageUrl,
  setLabeledImageUrl,
  components,
  setComponents,
  labelingConfig,
  setLabelingConfig,
  onSaveToOutputs,
  onDownloadPng,
}: StudioWorkspaceProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [activeMarkerId, setActiveMarkerId] = useState<string | null>(
    components[0]?.id ?? null
  );
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [rawCoordInputs, setRawCoordInputs] = useState<
    Record<string, { x: string; y: string }>
  >({});

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const stageImgRef = useRef<HTMLImageElement | null>(null);

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
    setErrorMessage(null);
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
      setErrorMessage('Enter a technical prompt before enhancing.');
      return;
    }
    setErrorMessage(null);
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
      setErrorMessage('Enter a technical prompt before enhancing.');
      return;
    }
    setErrorMessage(null);
    setIsEnhancing(true);
    try {
      const res = await fetch('/api/enhance-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: prompt.trim(), style: settings.style }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Prompt enhancement request failed.');
      }
      setEnhancedPrompt(data.enhancedPrompt);
      setNegativePrompt(data.negativePrompt);
      if (data.suggestedTitle) {
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
      setErrorMessage(
        err instanceof Error ? err.message : 'Unable to enhance prompt right now.'
      );
    } finally {
      setIsEnhancing(false);
    }
  };

  const handleGenerateIllustration = async () => {
    if (!prompt.trim()) {
      setErrorMessage('Please enter a technical description before generating.');
      return;
    }
    setErrorMessage(null);
    setIsGenerating(true);

    const activeEnhanced =
      enhancedPrompt.trim() || buildTemplateEnhancedPrompt(prompt, settings.style).enhancedPrompt;

    try {
      const res = await fetch('/api/generate-diagram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: prompt.trim(),
          enhancedPrompt: activeEnhanced,
          style: settings.style,
          width: settings.width,
          height: settings.height,
          steps: settings.steps,
          guidanceScale: settings.guidanceScale,
          seed: settings.seed,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to generate illustration.');
      }

      const rasterizedPng = await rasterizeSvgToPng(
        data.svg,
        settings.width,
        settings.height
      );
      setOriginalImageUrl(rasterizedPng);

      const nextTitle = data.title || labelingConfig.title;
      const nextLabelConfig: LabelingConfig = {
        ...labelingConfig,
        title: nextTitle,
        subtitle: `${settings.style} · ${settings.width}×${settings.height} · Seed ${settings.seed}`,
        markerColor: STYLE_DEFINITIONS[settings.style].defaultMarkerColor,
      };
      setLabelingConfig(nextLabelConfig);

      let nextComponents = components;
      if (Array.isArray(data.components) && data.components.length > 0) {
        nextComponents = data.components.map(
          (item: { name: string; description: string; x: number; y: number }, i: number) => ({
            id: `gen-comp-${Date.now()}-${i}`,
            name: item.name,
            description: item.description,
            x: Number(item.x),
            y: Number(item.y),
          })
        );
        setComponents(nextComponents);
        setActiveMarkerId(nextComponents[0]?.id ?? null);
      }

      const renderedComposite = await renderLabeledIllustration(
        rasterizedPng,
        nextComponents,
        nextLabelConfig,
        settings.style
      );
      setLabeledImageUrl(renderedComposite);

      await onSaveToOutputs({
        originalDataUrl: rasterizedPng,
        labeledDataUrl: renderedComposite,
      });
      setSaveNotice('Generated & saved to outputs/');
      setTimeout(() => setSaveNotice(null), 3500);
    } catch (err) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : 'Unexpected error generating technical illustration.'
      );
    } finally {
      setIsGenerating(false);
    }
  };

  const handleUploadCustomImage = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setErrorMessage('Please upload a PNG or JPG image file.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setErrorMessage(null);
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
      setErrorMessage(
        'Please fix out-of-range coordinates (must be between 0.00 and 1.00) before saving.'
      );
      return;
    }
    setIsSaving(true);
    setErrorMessage(null);
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
      setTimeout(() => setSaveNotice(null), 3000);
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Failed to save illustration to outputs/.'
      );
    } finally {
      setIsSaving(false);
    }
  };

  const activeMarkerIndex = components.findIndex((c) => c.id === activeMarkerId);

  return (
    <div className="mx-auto max-w-[1440px] px-6 py-6">
      <div className="grid items-start gap-6 lg:grid-cols-[376px_1fr]">
        {/* LEFT RAIL: Prompt, Style & Generation Controls */}
        <aside className="rounded-xl border border-slate-200 bg-white p-5">
          {/* Example Presets & Upload */}
          <div>
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900">Quick Examples</h2>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-medium text-blue-700 hover:text-blue-800 whitespace-nowrap"
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
                        ? 'border-blue-600 bg-blue-50/70 text-slate-900'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <p className="truncate text-xs font-semibold">{preset.label}</p>
                    <p className="mt-0.5 text-[11px] text-slate-500">{preset.shortTag}</p>
                  </button>
                );
              })}
            </div>
          </div>

          <hr className="my-5 border-slate-100" />

          {/* Prompt Input */}
          <div>
            <label
              htmlFor="prompt-input"
              className="block text-sm font-semibold text-slate-900"
            >
              Technical Description
            </label>
            <textarea
              id="prompt-input"
              rows={3}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Example: Create a cloud computing architecture diagram."
              className="mt-2 w-full rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600/15"
            />

            <div className="mt-2.5 flex items-center gap-2">
              <button
                type="button"
                onClick={handleAiEnhance}
                disabled={isEnhancing}
                className="inline-flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-800 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 whitespace-nowrap"
              >
                {isEnhancing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <Wand2 className="h-3.5 w-3.5 text-blue-700" aria-hidden="true" />
                )}
                <span>{isEnhancing ? 'Enhancing...' : 'AI Enhance Prompt'}</span>
              </button>

              <button
                type="button"
                onClick={handleTemplateEnhance}
                className="cursor-pointer rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 whitespace-nowrap"
              >
                Template Rules
              </button>
            </div>
          </div>

          {/* Visual Styles */}
          <div className="mt-5">
            <p className="text-sm font-semibold text-slate-900">Visual Style</p>
            <div className="mt-2.5 grid grid-cols-2 gap-2">
              {STYLES_LIST.map((styleName) => {
                const active = settings.style === styleName;
                return (
                  <button
                    key={styleName}
                    type="button"
                    onClick={() => handleStyleChange(styleName)}
                    className={`cursor-pointer rounded-lg border px-3 py-2.5 text-left transition-colors duration-150 ${
                      active
                        ? 'border-blue-700 bg-blue-700 text-white'
                        : 'border-slate-200 bg-white text-slate-800 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <span className="block text-xs font-semibold whitespace-nowrap">
                      {styleName}
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-xs text-slate-500">
              {STYLE_DEFINITIONS[settings.style].summary}
            </p>
          </div>

          <hr className="my-5 border-slate-100" />

          {/* Generation Settings */}
          <div className="space-y-4">
            <h2 className="text-sm font-semibold text-slate-900">Generation Settings</h2>

            {/* Inference Steps */}
            <div>
              <div className="flex items-center justify-between text-xs">
                <label htmlFor="steps-slider" className="font-medium text-slate-700">
                  Inference Steps
                </label>
                <span className="font-mono font-semibold text-slate-900 tabular-nums">
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
                <label htmlFor="cfg-slider" className="font-medium text-slate-700">
                  Guidance Scale (CFG)
                </label>
                <span className="font-mono font-semibold text-slate-900 tabular-nums">
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

            {/* Resolution */}
            <div>
              <label
                htmlFor="resolution-select"
                className="block text-xs font-medium text-slate-700"
              >
                Image Resolution
              </label>
              <select
                id="resolution-select"
                value={`${settings.width}x${settings.height}`}
                onChange={(e) => {
                  const [w, h] = e.target.value.split('x').map(Number);
                  setSettings({ ...settings, width: w, height: h });
                }}
                className="mt-1.5 h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/15"
              >
                {RESOLUTION_OPTIONS.map((opt) => (
                  <option key={opt.label} value={`${opt.width}x${opt.height}`}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Random Seed */}
            <div>
              <label
                htmlFor="seed-input"
                className="block text-xs font-medium text-slate-700"
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
                  className="h-9 flex-1 rounded-lg border border-slate-200 bg-white px-3 font-mono text-xs text-slate-900 tabular-nums focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/15"
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
                  className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 whitespace-nowrap"
                >
                  <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Random</span>
                </button>
              </div>
            </div>
          </div>

          {/* Advanced Prompt Disclosure */}
          <div className="mt-5 border-t border-slate-100 pt-4">
            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              className="flex w-full cursor-pointer items-center justify-between text-xs font-semibold text-slate-700 hover:text-slate-950"
            >
              <span>Advanced Prompt Options</span>
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
                    htmlFor="enhanced-prompt-input"
                    className="block text-[11px] font-medium text-slate-600"
                  >
                    Enhanced Prompt
                  </label>
                  <textarea
                    id="enhanced-prompt-input"
                    rows={3}
                    value={enhancedPrompt}
                    onChange={(e) => setEnhancedPrompt(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs text-slate-800 focus:border-blue-600 focus:bg-white focus:outline-none"
                  />
                </div>
                <div>
                  <label
                    htmlFor="negative-prompt-input"
                    className="block text-[11px] font-medium text-slate-600"
                  >
                    Negative Prompt
                  </label>
                  <textarea
                    id="negative-prompt-input"
                    rows={2}
                    value={negativePrompt}
                    onChange={(e) => setNegativePrompt(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs text-slate-800 focus:border-blue-600 focus:bg-white focus:outline-none"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Primary Generate Button */}
          <div className="mt-6">
            <button
              type="button"
              onClick={handleGenerateIllustration}
              disabled={isGenerating}
              className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-blue-700 px-4 py-3 text-sm font-semibold text-white transition-colors duration-150 hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  <span>Generating Illustration...</span>
                </>
              ) : (
                <span>Generate Illustration</span>
              )}
            </button>
          </div>
        </aside>

        {/* RIGHT STAGE: Unified Interactive Illustration Canvas & Smart Labeling Controls */}
        <div className="min-w-0 space-y-6">
          {/* Error Notification */}
          {errorMessage && (
            <div
              role="alert"
              className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="font-medium">Action could not be completed</p>
                <p className="mt-0.5 text-xs text-red-700">{errorMessage}</p>
              </div>
              <button
                type="button"
                onClick={() => setErrorMessage(null)}
                className="cursor-pointer text-xs font-medium text-red-700 hover:underline"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Unified Interactive Illustration Preview Panel */}
          <section className="rounded-xl border border-slate-200 bg-white">
            {/* Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 px-5 py-3.5">
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 tabular-nums">
                <span className="font-semibold text-slate-900">Illustration Preview</span>
                <span aria-hidden="true">·</span>
                <span>{settings.style}</span>
                <span aria-hidden="true">·</span>
                <span>
                  {settings.width}×{settings.height}
                </span>
                <span aria-hidden="true">·</span>
                <span>Seed {settings.seed}</span>
                <span aria-hidden="true">·</span>
                <span>
                  {activeMarkerIndex >= 0
                    ? `Click graphic to place marker #${activeMarkerIndex + 1}`
                    : `${components.length} markers`}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {saveNotice && (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
                    <Check className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>{saveNotice}</span>
                  </span>
                )}

                <button
                  type="button"
                  onClick={handleManualSaveOutputs}
                  disabled={isSaving || isGenerating}
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap"
                >
                  <Save className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{isSaving ? 'Saving...' : 'Save to outputs/'}</span>
                </button>

                <button
                  type="button"
                  onClick={onDownloadPng}
                  disabled={isGenerating || !labeledImageUrl}
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap"
                >
                  <Download className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Download PNG</span>
                </button>
              </div>
            </div>

            {/* Single Unified Interactive Documentation Frame */}
            <div className="studio-grid-bg p-5">
              {isGenerating ? (
                <div className="flex min-h-[440px] flex-col items-center justify-center rounded-lg border border-slate-200 bg-white p-8 text-center">
                  <Loader2 className="h-8 w-8 animate-spin text-blue-700" aria-hidden="true" />
                  <p className="mt-4 text-sm font-semibold text-slate-900">
                    Synthesizing {settings.style} technical illustration
                  </p>
                  <p className="mt-1 text-xs text-slate-500 tabular-nums">
                    {settings.width}×{settings.height} · {settings.steps} steps · CFG{' '}
                    {settings.guidanceScale.toFixed(1)} · Seed {settings.seed}
                  </p>
                </div>
              ) : (
                <div
                  className={`mx-auto max-w-[920px] overflow-hidden rounded-lg border shadow-xs ${
                    isBlueprint
                      ? 'border-[#1E3A5F] bg-[#0A1E34]'
                      : 'border-slate-200 bg-white'
                  }`}
                >
                  {/* Title Banner */}
                  {labelingConfig.showTitle && (
                    <div
                      className={`border-b px-6 py-4 ${
                        isBlueprint
                          ? 'border-[#1E3A5F] bg-[#0A1E34] text-slate-50'
                          : 'border-slate-200 bg-white text-slate-900'
                      }`}
                    >
                      <h3 className="font-display text-lg font-bold tracking-tight">
                        {labelingConfig.title.trim() || 'Technical Documentation Diagram'}
                      </h3>
                      {labelingConfig.subtitle.trim() && (
                        <p
                          className={`mt-0.5 text-xs ${
                            isBlueprint ? 'text-blue-200' : 'text-slate-500'
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
                        alt={labelingConfig.title || 'Technical documentation illustration'}
                        referrerPolicy="no-referrer"
                        className="block w-full h-auto object-contain"
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
                                    : 'border-slate-200 bg-white/95 text-slate-900'
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
                      className={`border-t px-6 py-5 ${
                        isBlueprint
                          ? 'border-[#1E3A5F] bg-[#0B223B] text-slate-100'
                          : 'border-slate-200 bg-slate-50 text-slate-900'
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p
                          className={`text-xs font-semibold ${
                            isBlueprint ? 'text-blue-200' : 'text-slate-600'
                          }`}
                        >
                          Component Legend
                        </p>
                        <p
                          className={`text-[11px] ${
                            isBlueprint ? 'text-blue-300/80' : 'text-slate-500'
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
                                  isBlueprint ? 'text-white' : 'text-slate-900'
                                }`}
                              >
                                {comp.name || `Component ${idx + 1}`}
                              </p>
                              <p
                                className={`mt-0.5 text-xs leading-relaxed ${
                                  isBlueprint ? 'text-slate-300' : 'text-slate-600'
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
          </section>

          {/* Smart Labeling Controls */}
          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  Smart Labeling Controls
                </h2>
                <p className="mt-0.5 text-xs text-slate-600">
                  Add a title, position numbered markers manually, and customize the component
                  legend.
                </p>
              </div>

              <button
                type="button"
                onClick={handleAddComponent}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-800 transition-colors hover:bg-slate-50 whitespace-nowrap shrink-0"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Add Component</span>
              </button>
            </div>

            {/* Transparency Note */}
            <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-xs leading-relaxed text-slate-700">
              <span className="font-semibold text-slate-900">
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
                  className="block text-xs font-medium text-slate-700"
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
                  className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/15"
                />
              </div>

              <div>
                <label
                  htmlFor="diagram-subtitle-input"
                  className="block text-xs font-medium text-slate-700"
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
                  className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/15"
                />
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
              <div className="flex flex-wrap items-center gap-5 text-xs text-slate-700">
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
                    className="h-4 w-4 rounded border-slate-300 text-blue-700 focus:ring-blue-600"
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
                    className="h-4 w-4 rounded border-slate-300 text-blue-700 focus:ring-blue-600"
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
                    className="h-4 w-4 rounded border-slate-300 text-blue-700 focus:ring-blue-600"
                  />
                  <span>Inline Callout Tags</span>
                </label>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500">Marker Accent:</span>
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
                        ? 'scale-110 ring-2 ring-slate-900 ring-offset-2'
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
                className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-xs text-red-800"
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
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="w-12 py-2.5 font-medium">#</th>
                    <th className="w-44 py-2.5 pr-3 font-medium">Component Name</th>
                    <th className="py-2.5 pr-3 font-medium">Legend Description</th>
                    <th className="w-24 py-2.5 pr-2 font-medium">X (0–1)</th>
                    <th className="w-24 py-2.5 pr-2 font-medium">Y (0–1)</th>
                    <th className="w-24 py-2.5 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
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
                          isSelected ? 'bg-blue-50/40' : 'hover:bg-slate-50/70'
                        }
                      >
                        <td className="py-2.5 pr-2">
                          <span
                            className={`inline-flex h-6 w-6 items-center justify-center rounded-full font-mono text-[11px] font-bold text-white tabular-nums ${
                              isSelected ? 'bg-blue-700' : 'bg-slate-700'
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
                            className="h-8 w-full rounded-md border border-slate-200 bg-white px-2.5 text-xs text-slate-900 focus:border-blue-600 focus:outline-none"
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
                            className="h-8 w-full rounded-md border border-slate-200 bg-white px-2.5 text-xs text-slate-700 focus:border-blue-600 focus:outline-none"
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
                                ? 'border-slate-200 bg-white text-slate-900 focus:border-blue-600'
                                : 'border-red-400 bg-red-50 text-red-800 focus:border-red-600'
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
                                ? 'border-slate-200 bg-white text-slate-900 focus:border-blue-600'
                                : 'border-red-400 bg-red-50 text-red-800 focus:border-red-600'
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
                                  ? 'bg-blue-700 text-white'
                                  : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                              }`}
                            >
                              <Crosshair className="h-3 w-3" aria-hidden="true" />
                              <span>Place</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRemoveComponent(comp.id)}
                              aria-label={`Remove ${comp.name}`}
                              className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"
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
        </div>
      </div>
    </div>
  );
}
