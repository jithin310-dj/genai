import type { HfModelOption, SamplePreset, VisualStyle } from '../types/project';

export const HF_MODEL_OPTIONS: HfModelOption[] = [
  {
    id: 'black-forest-labs/FLUX.1-schnell',
    label: 'FLUX.1 Schnell (Fast · Default)',
    description: 'Fast 4-step generation — lowest credit usage',
    badge: 'Fast',
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

export const DEFAULT_HF_MODEL = HF_MODEL_OPTIONS[0].id;
export const DEFAULT_HF_WIDTH = 768;
export const DEFAULT_HF_HEIGHT = 768;

export interface StyleDefinition {
  id: VisualStyle;
  summary: string;
  promptTemplate: string;
  negativePrompt: string;
  defaultMarkerColor: string;
}

export const STYLE_DEFINITIONS: Record<VisualStyle, StyleDefinition> = {
  'Professional 3D': {
    id: 'Professional 3D',
    summary: 'Studio-lit 3D hardware modules and architectural conduits',
    promptTemplate:
      'clean professional 3D technical documentation illustration, modular industrial hardware geometry, studio diffused lighting, soft ambient occlusion, crisp directional data pathways, neutral off-white studio backdrop, sharp focus, zero embedded text or letters',
    negativePrompt:
      'blurry, low resolution, watermark, distorted text, garbled letters, messy cables, cartoon characters, noisy background, oversaturated neon',
    defaultMarkerColor: '#1D4ED8',
  },
  'Flat Vector': {
    id: 'Flat Vector',
    summary: 'Crisp Swiss 2D geometric diagrams for engineering docs',
    promptTemplate:
      'minimalist Swiss flat vector technical illustration, crisp 2D geometric icons, clean slate navy outlines, cobalt blue and teal accents, balanced directional flow arrows, off-white editorial background, ultra-sharp edges, zero embedded text',
    negativePrompt:
      '3D shading, photorealistic, blurry, watermark, text, illegible labels, sketchy lines, cluttered background, gradients',
    defaultMarkerColor: '#0F172A',
  },
  Blueprint: {
    id: 'Blueprint',
    summary: 'Orthographic CAD technical drafting on Prussian navy grid',
    promptTemplate:
      'authentic architectural CAD technical blueprint, deep Prussian blue background with fine orthographic drafting grid lines, crisp white and cyan technical schematic line art, clean cross-section modules, precision engineering drawing, zero embedded text',
    negativePrompt:
      'bright white background, photorealistic, blurry, colorful cartoon, watermark, distorted letters, hand-drawn scribbles',
    defaultMarkerColor: '#0EA5E9',
  },
  Isometric: {
    id: 'Isometric',
    summary: '30-degree layered isometric planes and system topologies',
    promptTemplate:
      'precision 30-degree isometric technical architecture illustration, layered floating geometric planes, crisp faceted nodes and clean isometric connectors, cool technical palette of cobalt and brushed titanium on light drafting backdrop, zero embedded text',
    negativePrompt:
      'perspective distortion, blurry, watermark, garbled text, dark muddy shadows, organic clutter, low contrast',
    defaultMarkerColor: '#2563EB',
  },
};

export const RESOLUTION_OPTIONS = [
  { label: '512 × 512 (Square · Lowest Credits)', width: 512, height: 512 },
  { label: '768 × 768 (Square · Default)', width: 768, height: 768 },
  { label: '768 × 576 (4:3 Standard)', width: 768, height: 576 },
  { label: '1024 × 768 (4:3 HD · More Credits)', width: 1024, height: 768 },
  { label: '1024 × 1024 (Square HD · More Credits)', width: 1024, height: 1024 },
];

export const MARKER_COLOR_OPTIONS = [
  { label: 'Cobalt Blue', value: '#1D4ED8' },
  { label: 'Slate Navy', value: '#0F172A' },
  { label: 'Blueprint Cyan', value: '#0EA5E9' },
  { label: 'Emerald', value: '#059669' },
  { label: 'Crimson', value: '#DC2626' },
];

export function buildTemplateEnhancedPrompt(rawPrompt: string, style: VisualStyle): {
  enhancedPrompt: string;
  negativePrompt: string;
} {
  const def = STYLE_DEFINITIONS[style];
  const cleaned = rawPrompt.trim().replace(/\.+$/, '');
  return {
    enhancedPrompt: `${cleaned}, ${def.promptTemplate}`,
    negativePrompt: def.negativePrompt,
  };
}

export const SAMPLE_PRESETS: SamplePreset[] = [
  {
    id: 'cloud-architecture',
    label: 'Cloud Computing Architecture',
    shortTag: 'Professional 3D',
    prompt: 'Create a cloud computing architecture diagram.',
    style: 'Professional 3D',
    imageUrl: '/src/assets/images/sample_cloud_architecture_1795190848104.jpg',
    title: 'Cloud Computing Reference Architecture',
    subtitle: 'Ingress Gateway, Load Balancing, Stateless Compute & Replicated Storage',
    seed: 4219,
    components: [
      {
        id: 'cloud-1',
        name: 'Edge API Gateway',
        description:
          'Terminates external HTTPS traffic, enforces rate limiting, and routes authenticated requests into the private VPC.',
        x: 0.16,
        y: 0.44,
      },
      {
        id: 'cloud-2',
        name: 'Application Load Balancer',
        description:
          'Distributes incoming client sessions across healthy compute nodes using round-robin and health checks.',
        x: 0.35,
        y: 0.66,
      },
      {
        id: 'cloud-3',
        name: 'Auto-Scaling Compute Cluster',
        description:
          'Horizontally scalable stateless application servers executing core business logic across availability zones.',
        x: 0.54,
        y: 0.43,
      },
      {
        id: 'cloud-4',
        name: 'Replicated Database Nodes',
        description:
          'Primary and standby persistent storage cylinders maintaining synchronous transactional durability.',
        x: 0.83,
        y: 0.58,
      },
    ],
  },
  {
    id: 'neural-network',
    label: 'Neural Network Architecture',
    shortTag: 'Isometric',
    prompt: 'Generate a neural network architecture illustration.',
    style: 'Isometric',
    imageUrl: '/src/assets/images/sample_neural_network_1795190847354.jpg',
    title: 'Multi-Layer Feedforward Neural Network',
    subtitle: 'Normalized Input Features Through Dense Hidden Representations to Output Logits',
    seed: 7814,
    components: [
      {
        id: 'nn-1',
        name: 'Input Feature Layer',
        description:
          'Ingests normalized raw feature vectors or tokenized embeddings into the network.',
        x: 0.15,
        y: 0.48,
      },
      {
        id: 'nn-2',
        name: 'Dense Hidden Layer 1',
        description:
          'Applies learned linear weight matrices followed by non-linear ReLU/GELU activations to extract low-level patterns.',
        x: 0.41,
        y: 0.47,
      },
      {
        id: 'nn-3',
        name: 'Dense Hidden Layer 2',
        description:
          'Combines intermediate representations into higher-order abstractions before classification.',
        x: 0.65,
        y: 0.50,
      },
      {
        id: 'nn-4',
        name: 'Output Prediction Layer',
        description:
          'Projects final activations into class probabilities (Softmax) or continuous regression predictions.',
        x: 0.83,
        y: 0.50,
      },
    ],
  },
  {
    id: 'client-server',
    label: 'Client-Server Application',
    shortTag: 'Flat Vector',
    prompt: 'Show how a client-server application works.',
    style: 'Flat Vector',
    imageUrl: '/src/assets/images/sample_client_server_1795190847619.jpg',
    title: 'Client-Server Request Lifecycle',
    subtitle: 'Web & Mobile Clients Communicating Through a Protected API Gateway',
    seed: 3042,
    components: [
      {
        id: 'cs-1',
        name: 'Web & Mobile Clients',
        description:
          'End-user browser and mobile interfaces initiating REST or GraphQL requests over TLS.',
        x: 0.17,
        y: 0.48,
      },
      {
        id: 'cs-2',
        name: 'Security & API Gateway',
        description:
          'Validates JWT authentication tokens, applies firewall rules, and proxies calls to backend services.',
        x: 0.42,
        y: 0.50,
      },
      {
        id: 'cs-3',
        name: 'Application Server Tier',
        description:
          'Processes business workflows, renders responses, and coordinates downstream data reads and writes.',
        x: 0.66,
        y: 0.50,
      },
      {
        id: 'cs-4',
        name: 'Primary Relational Database',
        description:
          'Persists structured application state with ACID guarantees and indexed query access.',
        x: 0.89,
        y: 0.50,
      },
    ],
  },
  {
    id: 'database-system',
    label: 'Database Management System',
    shortTag: 'Blueprint',
    prompt: 'Create a database management system illustration.',
    style: 'Blueprint',
    imageUrl: '/src/assets/images/sample_database_system_1795190850468.jpg',
    title: 'Relational DBMS Internal Architecture',
    subtitle: 'Query Processing Pipeline, B-Tree Indexing, and Disk Storage Subsystem',
    seed: 9105,
    components: [
      {
        id: 'db-1',
        name: 'Connection & SQL Parser',
        description:
          'Accepts client connections, tokenizes incoming SQL statements, and builds a validated syntax tree.',
        x: 0.21,
        y: 0.48,
      },
      {
        id: 'db-2',
        name: 'Cost-Based Query Optimizer',
        description:
          'Evaluates candidate join orders and index scans using table statistics to pick the lowest-cost execution plan.',
        x: 0.46,
        y: 0.32,
      },
      {
        id: 'db-3',
        name: 'Execution & Transaction Manager',
        description:
          'Runs physical operators while coordinating MVCC isolation, row locks, and ACID commit states.',
        x: 0.46,
        y: 0.66,
      },
      {
        id: 'db-4',
        name: 'B-Tree Index Hierarchy',
        description:
          'Balanced tree structures enabling logarithmic-time key lookups and ordered range scans.',
        x: 0.78,
        y: 0.26,
      },
      {
        id: 'db-5',
        name: 'Disk Storage & WAL Buffer',
        description:
          'Manages buffered data pages on disk alongside sequential write-ahead logs for crash recovery.',
        x: 0.78,
        y: 0.72,
      },
    ],
  },
];
