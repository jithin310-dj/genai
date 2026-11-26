import { useCallback, useEffect, useState } from 'react';
import { OutputsGallery } from './components/OutputsGallery';
import { StudioWorkspace } from './components/StudioWorkspace';
import { TopNav } from './components/TopNav';
import {
  buildTemplateEnhancedPrompt,
  DEFAULT_HF_HEIGHT,
  DEFAULT_HF_MODEL,
  DEFAULT_HF_WIDTH,
  DEFAULT_QUALITY_RATINGS,
  HF_MODEL_OPTIONS,
  SAMPLE_PRESETS,
  STYLE_DEFINITIONS,
} from './data/presets';
import type {
  ComponentMarker,
  GenerationSettings,
  HfModelOption,
  LabelingConfig,
  ProvidersHealth,
  QualityEvaluation,
  RecentGenerationItem,
  SavedOutput,
  SavedStyleConfig,
  ThemeMode,
  WorkspaceTab,
} from './types/project';
import { downloadDataUrlAsPng } from './utils/zipExport';

const INITIAL_PRESET = SAMPLE_PRESETS[0];
const INITIAL_ENHANCED = buildTemplateEnhancedPrompt(
  INITIAL_PRESET.prompt,
  INITIAL_PRESET.style
);

const HISTORY_STORAGE_KEY = 'devillustrate_recent_history_v1';
const THEME_STORAGE_KEY = 'devillustrate_theme_v1';
const STYLE_CONFIGS_STORAGE_KEY = 'devillustrate_style_configs_v1';
const MAX_RECENT_HISTORY = 8;

function createDefaultEvaluation(): QualityEvaluation {
  return {
    ratings: { ...DEFAULT_QUALITY_RATINGS },
    averageScore: 4,
    notes: '',
    evaluatedAt: new Date().toISOString(),
  };
}

function loadInitialHistory(): RecentGenerationItem[] {
  try {
    const raw = window.localStorage.getItem(HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.slice(0, MAX_RECENT_HISTORY) : [];
  } catch {
    return [];
  }
}

function loadInitialStyleConfigs(): SavedStyleConfig[] {
  try {
    const raw = window.localStorage.getItem(STYLE_CONFIGS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SavedStyleConfig[]) : [];
  } catch {
    return [];
  }
}

function loadInitialTheme(): ThemeMode {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === 'dark' || stored === 'light') return stored;
    if (
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-color-scheme: dark)').matches
    ) {
      return 'dark';
    }
  } catch {
    // Fallback to light
  }
  return 'light';
}

export default function App() {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('studio');
  const [theme, setTheme] = useState<ThemeMode>(loadInitialTheme);
  const [hfModels, setHfModels] = useState<HfModelOption[]>(HF_MODEL_OPTIONS);
  const [providersHealth, setProvidersHealth] = useState<ProvidersHealth | null>(
    null
  );

  // Sync dark mode class on <html>
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Ignore storage failures
    }
  }, [theme]);

  // Fetch live provider configuration & health status (cheap non-billable check)
  const refreshHealth = useCallback(async (force = false) => {
    try {
      const res = await fetch(force ? '/api/health?refresh=1' : '/api/health');
      if (res.ok) {
        const data = (await res.json()) as ProvidersHealth;
        if (data?.huggingface && data?.gemini) {
          setProvidersHealth(data);
        }
      }
    } catch {
      // Non-fatal if health probe fails transiently
    }
  }, []);

  useEffect(() => {
    refreshHealth();
  }, [refreshHealth]);

  // Fetch verified Hugging Face models from server
  useEffect(() => {
    let cancelled = false;
    fetch('/api/hf-models')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && Array.isArray(data?.models) && data.models.length > 0) {
          setHfModels(data.models as HfModelOption[]);
        }
      })
      .catch(() => {
        // Keep bundled verified fallback list
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Studio State
  const [prompt, setPrompt] = useState(INITIAL_PRESET.prompt);
  const [enhancedPrompt, setEnhancedPrompt] = useState(
    INITIAL_ENHANCED.enhancedPrompt
  );
  const [negativePrompt, setNegativePrompt] = useState(
    INITIAL_ENHANCED.negativePrompt
  );
  const [settings, setSettings] = useState<GenerationSettings>({
    engine: 'huggingface',
    hfModel: DEFAULT_HF_MODEL,
    style: INITIAL_PRESET.style,
    steps: 30,
    guidanceScale: 7.5,
    width: DEFAULT_HF_WIDTH,
    height: DEFAULT_HF_HEIGHT,
    seed: INITIAL_PRESET.seed,
    quantity: 1,
    applyStyleToHf: true,
  });
  const [originalImageUrl, setOriginalImageUrl] = useState(
    INITIAL_PRESET.imageUrl
  );
  const [labeledImageUrl, setLabeledImageUrl] = useState('');
  const [components, setComponents] = useState<ComponentMarker[]>(
    INITIAL_PRESET.components.map((c) => ({ ...c }))
  );
  const [labelingConfig, setLabelingConfig] = useState<LabelingConfig>({
    title: INITIAL_PRESET.title,
    subtitle: INITIAL_PRESET.subtitle,
    showTitle: true,
    showLegend: true,
    showMarkerTags: false,
    markerColor: STYLE_DEFINITIONS[INITIAL_PRESET.style].defaultMarkerColor,
  });

  // Quality Evaluation State
  const [evaluation, setEvaluation] = useState<QualityEvaluation>(
    createDefaultEvaluation
  );
  const [activeSavedOutputId, setActiveSavedOutputId] = useState<string | null>(
    null
  );

  // Reusable Style Configurations (localStorage)
  const [savedStyleConfigs, setSavedStyleConfigs] = useState<SavedStyleConfig[]>(
    loadInitialStyleConfigs
  );

  const persistStyleConfigs = (items: SavedStyleConfig[]) => {
    try {
      window.localStorage.setItem(STYLE_CONFIGS_STORAGE_KEY, JSON.stringify(items));
    } catch {
      // Ignore storage quota issues
    }
  };

  const handleSaveStyleConfig = (config: Omit<SavedStyleConfig, 'id'>) => {
    const created: SavedStyleConfig = {
      ...config,
      id: `style_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    };
    setSavedStyleConfigs((prev) => {
      const next = [created, ...prev].slice(0, 12);
      persistStyleConfigs(next);
      return next;
    });
  };

  const handleDeleteStyleConfig = (id: string) => {
    setSavedStyleConfigs((prev) => {
      const next = prev.filter((item) => item.id !== id);
      persistStyleConfigs(next);
      return next;
    });
  };

  // Recent 8 Generations Strip (persisted in localStorage)
  const [recentHistory, setRecentHistory] =
    useState<RecentGenerationItem[]>(loadInitialHistory);

  const persistHistory = (items: RecentGenerationItem[]) => {
    const trimmed = items.slice(0, MAX_RECENT_HISTORY);
    try {
      window.localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(trimmed));
    } catch {
      try {
        window.localStorage.setItem(
          HISTORY_STORAGE_KEY,
          JSON.stringify(trimmed.slice(0, 4))
        );
      } catch {
        // Ignore
      }
    }
  };

  const handleAddRecentHistory = (item: RecentGenerationItem) => {
    setRecentHistory((prev) => {
      const next = [item, ...prev].slice(0, MAX_RECENT_HISTORY);
      persistHistory(next);
      return next;
    });
  };

  const handleClearRecentHistory = () => {
    setRecentHistory([]);
    try {
      window.localStorage.removeItem(HISTORY_STORAGE_KEY);
    } catch {
      // Ignore
    }
  };

  // Saved outputs/ Directory State
  const [savedOutputs, setSavedOutputs] = useState<SavedOutput[]>([]);
  const [isLoadingOutputs, setIsLoadingOutputs] = useState(true);

  const fetchOutputs = useCallback(async () => {
    setIsLoadingOutputs(true);
    try {
      const res = await fetch('/api/outputs');
      if (res.ok) {
        const data = await res.json();
        setSavedOutputs(Array.isArray(data.outputs) ? data.outputs : []);
      }
    } catch (err) {
      console.error('Failed to load outputs directory:', err);
    } finally {
      setIsLoadingOutputs(false);
    }
  }, []);

  useEffect(() => {
    fetchOutputs();
  }, [fetchOutputs]);

  const handleSaveToOutputs = async ({
    originalDataUrl,
    labeledDataUrl,
    seedOverride,
    titleOverride,
    componentsOverride,
  }: {
    originalDataUrl: string;
    labeledDataUrl: string;
    seedOverride?: number;
    titleOverride?: string;
    componentsOverride?: ComponentMarker[];
  }): Promise<string | null> => {
    const res = await fetch('/api/outputs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: titleOverride ?? labelingConfig.title,
        prompt,
        enhancedPrompt,
        style: settings.style,
        width: settings.width,
        height: settings.height,
        steps: settings.steps,
        guidanceScale: settings.guidanceScale,
        seed: seedOverride ?? settings.seed,
        originalDataUrl,
        labeledDataUrl,
        components: componentsOverride ?? components,
        evaluation,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to archive PNG in outputs/.');
    }
    if (data.output) {
      const created = data.output as SavedOutput;
      setSavedOutputs((prev) => [created, ...prev]);
      setActiveSavedOutputId(created.id);
      return created.id;
    }
    return null;
  };

  const handlePersistEvaluation = async (
    nextEval: QualityEvaluation
  ): Promise<boolean> => {
    if (!activeSavedOutputId) return false;
    try {
      const res = await fetch(
        `/api/outputs/${encodeURIComponent(activeSavedOutputId)}/evaluation`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(nextEval),
        }
      );
      if (!res.ok) return false;
      const data = await res.json();
      if (data.output) {
        const updated = data.output as SavedOutput;
        setSavedOutputs((prev) =>
          prev.map((item) => (item.id === updated.id ? updated : item))
        );
      }
      return true;
    } catch {
      return false;
    }
  };

  const handleDeleteOutput = async (id: string) => {
    const res = await fetch(`/api/outputs/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    if (res.ok) {
      setSavedOutputs((prev) => prev.filter((item) => item.id !== id));
      if (activeSavedOutputId === id) {
        setActiveSavedOutputId(null);
      }
    }
  };

  const handleLoadOutputInStudio = (output: SavedOutput) => {
    setPrompt(output.prompt);
    setEnhancedPrompt(output.enhancedPrompt);
    setSettings({
      ...settings,
      style: output.style,
      width: output.width,
      height: output.height,
      steps: output.steps,
      guidanceScale: output.guidanceScale,
      seed: output.seed,
    });
    setOriginalImageUrl(output.originalFile);
    setComponents(
      output.components?.length
        ? output.components.map((c) => ({ ...c }))
        : components
    );
    setLabelingConfig({
      ...labelingConfig,
      title: output.title,
      markerColor:
        STYLE_DEFINITIONS[output.style]?.defaultMarkerColor ?? '#1D4ED8',
    });
    setActiveSavedOutputId(output.id);
    setEvaluation(output.evaluation ?? createDefaultEvaluation());
    setActiveTab('studio');
  };

  const handleDownloadPng = () => {
    if (!labeledImageUrl) return;
    const slug = labelingConfig.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
    downloadDataUrlAsPng(labeledImageUrl, `${slug || 'devillustrate'}.png`);
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A] transition-colors duration-150 dark:bg-[#0B1120] dark:text-slate-100">
      <TopNav
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        onDownloadPng={handleDownloadPng}
        canDownload={Boolean(labeledImageUrl)}
        theme={theme}
        onToggleTheme={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
      />

      <main>
        {activeTab === 'studio' && (
          <StudioWorkspace
            prompt={prompt}
            setPrompt={setPrompt}
            enhancedPrompt={enhancedPrompt}
            setEnhancedPrompt={setEnhancedPrompt}
            negativePrompt={negativePrompt}
            setNegativePrompt={setNegativePrompt}
            settings={settings}
            setSettings={setSettings}
            hfModels={hfModels}
            providersHealth={providersHealth}
            onRefreshHealth={refreshHealth}
            originalImageUrl={originalImageUrl}
            setOriginalImageUrl={setOriginalImageUrl}
            labeledImageUrl={labeledImageUrl}
            setLabeledImageUrl={setLabeledImageUrl}
            components={components}
            setComponents={setComponents}
            labelingConfig={labelingConfig}
            setLabelingConfig={setLabelingConfig}
            recentHistory={recentHistory}
            onAddRecentHistory={handleAddRecentHistory}
            onClearRecentHistory={handleClearRecentHistory}
            onSaveToOutputs={handleSaveToOutputs}
            onDownloadPng={handleDownloadPng}
            evaluation={evaluation}
            setEvaluation={setEvaluation}
            activeSavedOutputId={activeSavedOutputId}
            onPersistEvaluation={handlePersistEvaluation}
            savedStyleConfigs={savedStyleConfigs}
            onSaveStyleConfig={handleSaveStyleConfig}
            onDeleteStyleConfig={handleDeleteStyleConfig}
          />
        )}

        {activeTab === 'outputs' && (
          <OutputsGallery
            outputs={savedOutputs}
            isLoading={isLoadingOutputs}
            onDelete={handleDeleteOutput}
            onLoadInStudio={handleLoadOutputInStudio}
            onGoToStudio={() => setActiveTab('studio')}
          />
        )}
      </main>
    </div>
  );
}
