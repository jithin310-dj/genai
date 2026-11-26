// @vitest-environment node
import { afterAll, describe, expect, it } from 'vitest';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';
const TINY_PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=';

const createdOutputIds: string[] = [];

afterAll(async () => {
  // Ensure any test artifacts created in outputs/ are cleaned up even if an assertion fails
  for (const id of createdOutputIds) {
    try {
      await fetch(`${BASE_URL}/api/outputs/${encodeURIComponent(id)}`, { method: 'DELETE' });
    } catch {
      // Ignore cleanup errors
    }
  }
});

describe('DevIllustrate AI Backend API Integration Suite', () => {
  it('returns provider health status and allowlisted Hugging Face models', async () => {
    const [healthRes, modelsRes] = await Promise.all([
      fetch(`${BASE_URL}/api/health`),
      fetch(`${BASE_URL}/api/hf-models`),
    ]);

    expect(healthRes.status).toBe(200);
    const health = await healthRes.json();
    expect(health).toHaveProperty('huggingface');
    expect(health).toHaveProperty('gemini');
    expect(typeof health.huggingface.configured).toBe('boolean');
    expect(typeof health.gemini.configured).toBe('boolean');

    expect(modelsRes.status).toBe(200);
    const modelsPayload = await modelsRes.json();
    expect(Array.isArray(modelsPayload.models)).toBe(true);
    expect(modelsPayload.models.length).toBeGreaterThanOrEqual(3);
    expect(modelsPayload.defaultModel).toBe('black-forest-labs/FLUX.1-schnell');
  });

  it('validates empty prompt on POST /api/enhance-prompt', async () => {
    const res = await fetch(`${BASE_URL}/api/enhance-prompt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: '   ', style: 'Flat Vector' }),
    });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.code).toBe('INVALID_PROMPT');
    expect(data.provider).toBe('gemini');
  });

  it('enhances a technical prompt via POST /api/enhance-prompt without leaking raw JSON errors', async () => {
    const res = await fetch(`${BASE_URL}/api/enhance-prompt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: 'API gateway routing traffic to auth and order microservices with PostgreSQL',
        style: 'Flat Vector',
        maxAttempts: 1,
      }),
    });

    const data = await res.json();
    if (res.status === 200) {
      expect(typeof data.enhancedPrompt).toBe('string');
      expect(data.enhancedPrompt.length).toBeGreaterThan(40);
    } else {
      // If Gemini experiences transient upstream load, error must still be cleanly normalized
      expect([429, 503, 504]).toContain(res.status);
      expect(data.provider).toBe('gemini');
      expect(typeof data.userMessage).toBe('string');
      expect(data.userMessage).not.toContain('{"error"');
    }
  });

  it('validates empty prompt, oversized prompt, and unsupported models on POST /api/generate-image', async () => {
    // 1. Empty prompt
    const emptyRes = await fetch(`${BASE_URL}/api/generate-image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: '', model: 'black-forest-labs/FLUX.1-schnell' }),
    });
    expect(emptyRes.status).toBe(400);
    const emptyData = await emptyRes.json();
    expect(emptyData.code).toBe('INVALID_PROMPT');

    // 2. Oversized prompt (> 1000 chars)
    const longRes = await fetch(`${BASE_URL}/api/generate-image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: 'microservices '.repeat(120),
        model: 'black-forest-labs/FLUX.1-schnell',
      }),
    });
    expect(longRes.status).toBe(400);
    const longData = await longRes.json();
    expect(longData.code).toBe('PROMPT_TOO_LONG');

    // 3. Unsupported model
    const badModelRes = await fetch(`${BASE_URL}/api/generate-image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: 'Cloud architecture diagram',
        model: 'malicious-org/unsupported-model',
      }),
    });
    expect(badModelRes.status).toBe(400);
    const badModelData = await badModelRes.json();
    expect(badModelData.code).toBe('UNSUPPORTED_MODEL');
    expect(badModelData.provider).toBe('huggingface');
  });

  it('handles live POST /api/generate-image with steps/guidanceScale and normalized provider errors', async () => {
    const res = await fetch(`${BASE_URL}/api/generate-image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: 'Clean isometric API gateway and PostgreSQL architecture diagram',
        negativePrompt: 'blurry, watermark',
        model: 'black-forest-labs/FLUX.1-schnell',
        width: 512,
        height: 512,
        steps: 4,
        guidanceScale: 7.5,
        maxAttempts: 1,
      }),
    });

    const data = await res.json();
    if (res.status === 200) {
      expect(typeof data.imageDataUrl).toBe('string');
      expect(data.imageDataUrl.startsWith('data:image/')).toBe(true);
    } else {
      // Expected when HF_TOKEN has exhausted free credits (429 QUOTA_EXCEEDED) or model is warming
      expect([401, 402, 429, 503, 504]).toContain(res.status);
      expect(data.provider).toBe('huggingface');
      expect(typeof data.userMessage).toBe('string');
      expect(data.userMessage).not.toContain('hf_');
      expect(data.userMessage).not.toContain('{"error"');
    }
  });

  it('supports full outputs lifecycle: save, gallery load, PNG download, evaluation persistence, and deletion', async () => {
    // 1. Save output with 9-criterion quality evaluation
    const saveRes = await fetch(`${BASE_URL}/api/outputs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Automated Test Architecture',
        prompt: 'Event-driven microservices with Kafka and PostgreSQL',
        enhancedPrompt: 'Clean isometric event-driven microservices diagram',
        style: 'Isometric',
        width: 768,
        height: 768,
        steps: 28,
        guidanceScale: 7.5,
        seed: 1234,
        originalDataUrl: TINY_PNG_DATA_URL,
        labeledDataUrl: TINY_PNG_DATA_URL,
        components: [
          {
            id: 'c1',
            name: 'API Gateway',
            description: 'Routes incoming client requests',
            x: 0.2,
            y: 0.5,
          },
        ],
        evaluation: {
          ratings: {
            promptAlignment: 4,
            visualQuality: 4,
            technicalRelevance: 5,
            clarity: 4,
            composition: 4,
            styleConsistency: 5,
            readability: 4,
            documentationSuitability: 5,
            marketingSuitability: 4,
          },
          notes: 'Initial automated test score',
        },
      }),
    });

    expect(saveRes.status).toBe(201);
    const saved = await saveRes.json();
    const id = saved.output.id as string;
    expect(id).toBeTruthy();
    createdOutputIds.push(id);
    expect(saved.output.evaluation.averageScore).toBe(4.33);

    // 2. Gallery loading (GET /api/outputs)
    const galleryRes = await fetch(`${BASE_URL}/api/outputs`);
    expect(galleryRes.status).toBe(200);
    const gallery = await galleryRes.json();
    const matched = gallery.outputs.find((item: { id: string }) => item.id === id);
    expect(matched).toBeDefined();
    expect(matched.title).toBe('Automated Test Architecture');

    // 3. PNG download endpoint serves valid image/png bytes
    const downloadRes = await fetch(`${BASE_URL}${saved.output.labeledFile}`);
    expect(downloadRes.status).toBe(200);
    expect(downloadRes.headers.get('content-type')).toContain('image/png');
    const pngBytes = new Uint8Array(await downloadRes.arrayBuffer());
    expect(pngBytes.length).toBeGreaterThan(20);
    // Verify PNG magic signature (89 50 4E 47)
    expect(Array.from(pngBytes.slice(0, 4))).toEqual([0x89, 0x50, 0x4e, 0x47]);

    // 4. Reject invalid evaluation payload (missing ratings object)
    const badEvalRes = await fetch(`${BASE_URL}/api/outputs/${encodeURIComponent(id)}/evaluation`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes: 'Missing ratings field' }),
    });
    expect(badEvalRes.status).toBe(400);

    // 5. Persist updated 9-criterion quality evaluation
    const patchRes = await fetch(`${BASE_URL}/api/outputs/${encodeURIComponent(id)}/evaluation`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ratings: {
          promptAlignment: 5,
          visualQuality: 5,
          technicalRelevance: 5,
          clarity: 5,
          composition: 5,
          styleConsistency: 5,
          readability: 4,
          documentationSuitability: 5,
          marketingSuitability: 4,
        },
        notes: 'Verified updated evaluation persistence',
      }),
    });
    expect(patchRes.status).toBe(200);
    const patched = await patchRes.json();
    expect(patched.output.evaluation.averageScore).toBe(4.78);
    expect(patched.output.evaluation.notes).toBe('Verified updated evaluation persistence');

    // Confirm persisted on subsequent GET /api/outputs
    const galleryResAfterPatch = await fetch(`${BASE_URL}/api/outputs`);
    const galleryAfterPatch = await galleryResAfterPatch.json();
    const updatedItem = galleryAfterPatch.outputs.find((item: { id: string }) => item.id === id);
    expect(updatedItem.evaluation.averageScore).toBe(4.78);

    // 6. Delete output and verify removal from gallery and disk
    const deleteRes = await fetch(`${BASE_URL}/api/outputs/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    expect(deleteRes.status).toBe(200);

    const galleryAfterDelete = await (await fetch(`${BASE_URL}/api/outputs`)).json();
    expect(galleryAfterDelete.outputs.find((item: { id: string }) => item.id === id)).toBeUndefined();

    // Verify deleted PNG is no longer served
    const deletedImgRes = await fetch(`${BASE_URL}${saved.output.labeledFile}`);
    expect(deletedImgRes.status).toBe(404);
  });
});
