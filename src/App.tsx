import { useCallback, useEffect, useState } from 'react';
import { OutputsGallery } from './components/OutputsGallery';
import { StudioWorkspace } from './components/StudioWorkspace';
import { TopNav } from './components/TopNav';
import {
  buildTemplateEnhancedPrompt,
  SAMPLE_PRESETS,
  STYLE_DEFINITIONS,
} from './data/presets';
import type {
  ComponentMarker,
  GenerationSettings,
  LabelingConfig,
  SavedOutput,
  WorkspaceTab,
} from './types/project';
import { downloadDataUrlAsPng } from './utils/zipExport';

const INITIAL_PRESET = SAMPLE_PRESETS[0];
const INITIAL_ENHANCED = buildTemplateEnhancedPrompt(
  INITIAL_PRESET.prompt,
  INITIAL_PRESET.style
);

export default function App() {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('studio');

  // Studio State
  const [prompt, setPrompt] = useState(INITIAL_PRESET.prompt);
  const [enhancedPrompt, setEnhancedPrompt] = useState(
    INITIAL_ENHANCED.enhancedPrompt
  );
  const [negativePrompt, setNegativePrompt] = useState(
    INITIAL_ENHANCED.negativePrompt
  );
  const [settings, setSettings] = useState<GenerationSettings>({
    style: INITIAL_PRESET.style,
    steps: 30,
    guidanceScale: 7.5,
    width: 1024,
    height: 768,
    seed: INITIAL_PRESET.seed,
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
  }: {
    originalDataUrl: string;
    labeledDataUrl: string;
  }) => {
    const res = await fetch('/api/outputs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: labelingConfig.title,
        prompt,
        enhancedPrompt,
        style: settings.style,
        width: settings.width,
        height: settings.height,
        steps: settings.steps,
        guidanceScale: settings.guidanceScale,
        seed: settings.seed,
        originalDataUrl,
        labeledDataUrl,
        components,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to archive PNG in outputs/.');
    }
    if (data.output) {
      setSavedOutputs((prev) => [data.output as SavedOutput, ...prev]);
    }
  };

  const handleDeleteOutput = async (id: string) => {
    const res = await fetch(`/api/outputs/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    if (res.ok) {
      setSavedOutputs((prev) => prev.filter((item) => item.id !== id));
    }
  };

  const handleLoadOutputInStudio = (output: SavedOutput) => {
    setPrompt(output.prompt);
    setEnhancedPrompt(output.enhancedPrompt);
    setSettings({
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
    <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A]">
      <TopNav
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        onDownloadPng={handleDownloadPng}
        canDownload={Boolean(labeledImageUrl)}
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
            originalImageUrl={originalImageUrl}
            setOriginalImageUrl={setOriginalImageUrl}
            labeledImageUrl={labeledImageUrl}
            setLabeledImageUrl={setLabeledImageUrl}
            components={components}
            setComponents={setComponents}
            labelingConfig={labelingConfig}
            setLabelingConfig={setLabelingConfig}
            onSaveToOutputs={handleSaveToOutputs}
            onDownloadPng={handleDownloadPng}
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
