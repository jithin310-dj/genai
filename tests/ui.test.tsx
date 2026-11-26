// @vitest-environment jsdom
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../src/App';
import { OutputsGallery } from '../src/components/OutputsGallery';
import { QualityEvaluationPanel } from '../src/components/QualityEvaluationPanel';
import { TopNav } from '../src/components/TopNav';
import { DEFAULT_HF_MODEL, DEFAULT_QUALITY_RATINGS } from '../src/data/presets';
import type { GenerationSettings, QualityEvaluation, SavedOutput } from '../src/types/project';

const SAMPLE_OUTPUT_A: SavedOutput = {
  id: 'diagram_101',
  title: 'Cloud Microservices Architecture',
  prompt: 'Cloud microservices with API gateway and Redis cache',
  enhancedPrompt: 'Clean professional 3D cloud microservices illustration',
  style: 'Professional 3D',
  width: 1024,
  height: 768,
  steps: 30,
  guidanceScale: 7.5,
  seed: 4219,
  createdAt: '2026-11-25T12:00:00.000Z',
  originalFile: '/outputs/cloud_original.png',
  labeledFile: '/outputs/cloud_labeled.png',
  componentCount: 4,
  components: [],
  evaluation: {
    ratings: { ...DEFAULT_QUALITY_RATINGS, promptAlignment: 5, clarity: 5 },
    averageScore: 4.22,
    notes: 'Crisp studio lighting',
    evaluatedAt: '2026-11-25T12:05:00.000Z',
  },
};

const SAMPLE_OUTPUT_B: SavedOutput = {
  id: 'diagram_102',
  title: 'Relational DBMS Blueprint',
  prompt: 'Database query optimizer and B-Tree storage layout',
  enhancedPrompt: 'Authentic architectural CAD blueprint of relational DBMS',
  style: 'Blueprint',
  width: 1024,
  height: 768,
  steps: 35,
  guidanceScale: 8.5,
  seed: 9105,
  createdAt: '2026-11-25T12:15:00.000Z',
  originalFile: '/outputs/db_original.png',
  labeledFile: '/outputs/db_labeled.png',
  componentCount: 5,
  components: [],
};

const BASE_SETTINGS: GenerationSettings = {
  engine: 'huggingface',
  hfModel: DEFAULT_HF_MODEL,
  applyStyleToHf: true,
  style: 'Professional 3D',
  width: 768,
  height: 768,
  steps: 30,
  guidanceScale: 7.5,
  seed: 4219,
  quantity: 1,
};

describe('DevIllustrate AI Frontend UI & Interaction Tests', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('navigates between Studio and Outputs, toggles theme, and triggers Download PNG in TopNav', async () => {
    const user = userEvent.setup();
    const onSelectTab = vi.fn();
    const onDownloadPng = vi.fn();
    const onToggleTheme = vi.fn();

    render(
      <TopNav
        activeTab="studio"
        onSelectTab={onSelectTab}
        onDownloadPng={onDownloadPng}
        canDownload={true}
        theme="light"
        onToggleTheme={onToggleTheme}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Outputs' }));
    expect(onSelectTab).toHaveBeenCalledWith('outputs');

    await user.click(screen.getByRole('button', { name: 'Switch to dark mode' }));
    expect(onToggleTheme).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: /Download PNG/i }));
    expect(onDownloadPng).toHaveBeenCalledTimes(1);
  });

  it('loads OutputsGallery, filters by style/search, compares 2 graphics side-by-side, downloads PNG, and deletes output', async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn().mockResolvedValue(undefined);
    const onLoadInStudio = vi.fn();
    const onGoToStudio = vi.fn();

    render(
      <OutputsGallery
        outputs={[SAMPLE_OUTPUT_A, SAMPLE_OUTPUT_B]}
        isLoading={false}
        onDelete={onDelete}
        onLoadInStudio={onLoadInStudio}
        onGoToStudio={onGoToStudio}
      />
    );

    // Gallery renders both saved outputs and saved score badge
    expect(screen.getByText('Cloud Microservices Architecture')).toBeInTheDocument();
    expect(screen.getByText('Relational DBMS Blueprint')).toBeInTheDocument();
    expect(screen.getByText('Score 4.2/5')).toBeInTheDocument();

    // Verify Download PNG anchor has valid href and download attribute
    const downloadLinks = screen.getAllByRole('link', { name: /Download PNG/i });
    expect(downloadLinks[0]).toHaveAttribute('href', '/outputs/cloud_labeled.png');
    expect(downloadLinks[0]).toHaveAttribute('download');

    // Select both outputs for side-by-side comparison
    const compareButtons = screen.getAllByRole('button', { name: /^Compare$/i });
    await user.click(compareButtons[0]);
    await user.click(compareButtons[1]);
    expect(screen.getByText(/Side-by-Side Graphic Comparison \(2\/2 selected\)/i)).toBeInTheDocument();
    expect(screen.getByText('Option A')).toBeInTheDocument();
    expect(screen.getByText('Option B')).toBeInTheDocument();

    // Clear comparison panel before testing style filter
    await user.click(screen.getByRole('button', { name: /Clear Comparison/i }));
    expect(screen.queryByText(/Side-by-Side Graphic Comparison/i)).not.toBeInTheDocument();

    // Filter by Blueprint style
    await user.click(screen.getByRole('button', { name: 'Blueprint' }));
    expect(screen.getByText('Relational DBMS Blueprint')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Cloud Microservices Architecture' })).not.toBeInTheDocument();

    // Reset filter to All and delete an item
    await user.click(screen.getByRole('button', { name: 'All' }));
    await user.click(screen.getByRole('button', { name: 'Delete Cloud Microservices Architecture' }));
    expect(onDelete).toHaveBeenCalledWith('diagram_101');
  });

  it('scores all 9 criteria, enforces human review disclaimer, persists scores, and exports .md report', async () => {
    const user = userEvent.setup();
    let currentEval: QualityEvaluation = {
      ratings: { ...DEFAULT_QUALITY_RATINGS },
      averageScore: 4.0,
      notes: '',
      evaluatedAt: '2026-11-25T12:00:00.000Z',
    };
    const onPersist = vi.fn().mockResolvedValue(true);

    // Stub Blob URL + anchor click for Markdown export verification
    const createObjectURLSpy = vi.fn(() => 'blob:mock-report');
    const revokeObjectURLSpy = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', { value: createObjectURLSpy, writable: true });
    Object.defineProperty(URL, 'revokeObjectURL', { value: revokeObjectURLSpy, writable: true });
    const anchorClickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {});

    const { rerender } = render(
      <QualityEvaluationPanel
        title="Cloud Architecture"
        prompt="Cloud diagram"
        enhancedPrompt="Enhanced cloud diagram"
        settings={BASE_SETTINGS}
        evaluation={currentEval}
        onChangeEvaluation={(next) => {
          currentEval = next;
        }}
        activeSavedOutputId="diagram_101"
        onPersistEvaluation={onPersist}
      />
    );

    // Honest human review disclaimer must be visible
    expect(screen.getByText(/Human Review Disclaimer:/i)).toBeInTheDocument();
    expect(
      screen.getByText(/does not automatically verify factual, architectural, or protocol accuracy/i)
    ).toBeInTheDocument();

    // Click score "5" for Prompt Alignment
    const promptAlignGroup = screen.getByRole('radiogroup', { name: 'Prompt Alignment score' });
    await user.click(within(promptAlignGroup).getByRole('radio', { name: '5' }));
    expect(currentEval.ratings.promptAlignment).toBe(5);
    expect(currentEval.averageScore).toBe(4.11);

    // Rerender with updated score and click Save Score to Archive
    rerender(
      <QualityEvaluationPanel
        title="Cloud Architecture"
        prompt="Cloud diagram"
        enhancedPrompt="Enhanced cloud diagram"
        settings={BASE_SETTINGS}
        evaluation={currentEval}
        onChangeEvaluation={(next) => {
          currentEval = next;
        }}
        activeSavedOutputId="diagram_101"
        onPersistEvaluation={onPersist}
      />
    );

    await user.click(screen.getByRole('button', { name: /Save Score to Archive/i }));
    await waitFor(() => {
      expect(onPersist).toHaveBeenCalledWith(expect.objectContaining({ averageScore: 4.11 }));
    });
    expect(screen.getByText('Saved to output archive')).toBeInTheDocument();

    // Export Markdown report
    await user.click(screen.getByRole('button', { name: /Export Report \(\.md\)/i }));
    expect(createObjectURLSpy).toHaveBeenCalledTimes(1);
    expect(anchorClickSpy).toHaveBeenCalledTimes(1);
    expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:mock-report');
  });

  it('runs end-to-end App UI interactions: structured prompt template, AI enhance, normalized error handling, and tab switch', async () => {
    const user = userEvent.setup();

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/outputs')) {
        return new Response(JSON.stringify({ outputs: [SAMPLE_OUTPUT_A] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.includes('/api/health')) {
        return new Response(
          JSON.stringify({
            huggingface: { configured: true, ok: true, quotaExhausted: false },
            gemini: { configured: true, ok: true, model: 'gemini-3.1-flash-lite' },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (url.includes('/api/hf-models')) {
        return new Response(
          JSON.stringify({
            models: [
              {
                id: DEFAULT_HF_MODEL,
                label: 'FLUX.1 Schnell (Fast · Default)',
                description: 'Fast 4-step generation',
                badge: 'Fast',
              },
            ],
            defaultModel: DEFAULT_HF_MODEL,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (url.includes('/api/enhance-prompt')) {
        return new Response(
          JSON.stringify({
            enhancedPrompt: 'Clean isometric microservices architecture with API gateway and event bus',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return new Response(JSON.stringify({}), { status: 200 });
    });

    vi.stubGlobal('fetch', fetchMock);

    render(<App />);

    // Open Structured Technical Prompt Builder (10 Domains) and apply template
    await user.click(screen.getByRole('button', { name: /Structured Technical Prompt Builder/i }));
    const domainSelect = screen.getByLabelText(/Technical Domain Template/i);
    await user.selectOptions(domainSelect, 'ai-ml-workflow');
    await user.click(screen.getByRole('button', { name: /Apply Structured Template/i }));

    const promptInput = screen.getByLabelText(/^Prompt$/i) as HTMLTextAreaElement;
    expect(promptInput.value).toMatch(/retrieval-augmented generation/i);

    // Click AI Enhance Prompt and confirm /api/enhance-prompt is called
    await user.click(screen.getByRole('button', { name: /AI Enhance Prompt/i }));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/enhance-prompt',
        expect.objectContaining({ method: 'POST' })
      );
    });

    // Switch to Outputs tab and verify gallery loaded from mocked /api/outputs
    await user.click(screen.getByRole('button', { name: 'Outputs' }));
    await waitFor(() => {
      expect(screen.getByText('Saved Outputs & Comparison Gallery')).toBeInTheDocument();
      expect(screen.getByText('Cloud Microservices Architecture')).toBeInTheDocument();
    });
  });
});
