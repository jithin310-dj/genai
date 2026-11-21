import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';

function getClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'GEMINI_API_KEY is not configured. Please check your environment secrets in Settings > Secrets.'
    );
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

export interface EnhancePromptRequest {
  prompt: string;
  style: string;
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

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: `User concept: "${req.prompt}"\nSelected visual style: "${req.style}"`,
    config: {
      systemInstruction,
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
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

  const rawText = response.text?.trim();
  if (!rawText) {
    throw new Error('Model returned an empty response while enhancing the prompt.');
  }

  const parsed = JSON.parse(rawText) as EnhancePromptResponse;
  parsed.suggestedComponents = (parsed.suggestedComponents ?? []).map((comp) => ({
    name: comp.name,
    description: comp.description,
    x: Number(Math.min(0.92, Math.max(0.08, comp.x)).toFixed(2)),
    y: Number(Math.min(0.9, Math.max(0.1, comp.y)).toFixed(2)),
  }));

  return parsed;
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
}

export interface GenerateDiagramResponse {
  svg: string;
  title: string;
  components: SuggestedComponent[];
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

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: `Technical description: ${req.prompt}\nEnhanced prompt context: ${req.enhancedPrompt}\nVisual style: ${req.style}\nTarget aspect canvas: 1200x900 (will rasterize to ${req.width}x${req.height})\nGuidance scale: ${req.guidanceScale} | Steps: ${req.steps} | Seed: ${req.seed}`,
    config: {
      systemInstruction,
      seed: Number.isFinite(req.seed) ? Math.floor(req.seed) : 42,
      thinkingConfig: { thinkingLevel: ThinkingLevel.MEDIUM },
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

  const rawText = response.text?.trim();
  if (!rawText) {
    throw new Error('Model returned an empty response while generating the technical illustration.');
  }

  const parsed = JSON.parse(rawText) as GenerateDiagramResponse;
  if (!parsed.svg || !parsed.svg.includes('<svg')) {
    throw new Error('Generated response did not contain valid SVG illustration markup.');
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
  };
}
