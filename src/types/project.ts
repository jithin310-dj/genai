export type VisualStyle = 'Professional 3D' | 'Flat Vector' | 'Blueprint' | 'Isometric';

export type WorkspaceTab = 'studio' | 'outputs';

export interface GenerationSettings {
  style: VisualStyle;
  steps: number;
  guidanceScale: number;
  width: number;
  height: number;
  seed: number;
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
