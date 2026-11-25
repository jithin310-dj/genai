export type VisualStyle = 'Professional 3D' | 'Flat Vector' | 'Blueprint' | 'Isometric';

export type WorkspaceTab = 'studio' | 'outputs';

export type ImageEngine = 'huggingface' | 'gemini';

export type ThemeMode = 'light' | 'dark';

export interface HfModelOption {
  id: string;
  label: string;
  description: string;
  badge: string;
}

export interface ProviderErrorState {
  provider: ImageEngine;
  providerLabel: string;
  code: string;
  userMessage: string;
  retryable: boolean;
  retryAfterSeconds?: number;
}

export interface ProvidersHealth {
  huggingface: {
    configured: boolean;
    ok: boolean;
    quotaExhausted?: boolean;
  };
  gemini: {
    configured: boolean;
    ok: boolean;
    model?: string;
    fallbackModel?: string;
  };
}

export interface GenerationSettings {
  engine: ImageEngine;
  hfModel: string;
  style: VisualStyle;
  steps: number;
  guidanceScale: number;
  width: number;
  height: number;
  seed: number;
}

export interface RecentGenerationItem {
  id: string;
  prompt: string;
  negativePrompt: string;
  model: string;
  engine: ImageEngine;
  style: VisualStyle;
  width: number;
  height: number;
  imageUrl: string;
  createdAt: string;
}

export interface ComponentMarker {
  id: string;
  name: string;
  description: string;
  /** Normalized horizontal coordinate strictly between 0.0 and 1.0 */
  x: number;
  /** Normalized vertical coordinate strictly between 0.0 and 1.0 */
  y: number;
}

export interface LabelingConfig {
  title: string;
  subtitle: string;
  showTitle: boolean;
  showLegend: boolean;
  showMarkerTags: boolean;
  markerColor: string;
}

export interface SamplePreset {
  id: string;
  label: string;
  shortTag: string;
  prompt: string;
  style: VisualStyle;
  imageUrl: string;
  title: string;
  subtitle: string;
  seed: number;
  components: ComponentMarker[];
}

export interface SavedOutput {
  id: string;
  title: string;
  prompt: string;
  enhancedPrompt: string;
  style: VisualStyle;
  width: number;
  height: number;
  steps: number;
  guidanceScale: number;
  seed: number;
  createdAt: string;
  originalFile: string;
  labeledFile: string;
  componentCount: number;
  components: ComponentMarker[];
}
