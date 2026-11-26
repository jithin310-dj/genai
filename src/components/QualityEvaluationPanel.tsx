import { Check, ClipboardCheck, Download, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { DEFAULT_QUALITY_RATINGS, QUALITY_CRITERIA } from '../data/presets';
import type {
  GenerationSettings,
  QualityCriterionKey,
  QualityEvaluation,
  QualityRatings,
} from '../types/project';

interface QualityEvaluationPanelProps {
  title: string;
  prompt: string;
  enhancedPrompt: string;
  settings: GenerationSettings;
  evaluation: QualityEvaluation;
  onChangeEvaluation: (next: QualityEvaluation) => void;
  activeSavedOutputId: string | null;
  onPersistEvaluation: (evaluation: QualityEvaluation) => Promise<boolean>;
}

function computeAverage(ratings: QualityRatings): number {
  const values = Object.values(ratings);
  const sum = values.reduce((acc, v) => acc + v, 0);
  return Number((sum / values.length).toFixed(2));
}

function getReadinessTier(avg: number): {
  label: string;
  toneClass: string;
} {
  if (avg >= 4.2) {
    return {
      label: 'Ready for Documentation / Publication',
      toneClass: 'text-emerald-700 dark:text-emerald-400',
    };
  }
  if (avg >= 3.2) {
    return {
      label: 'Usable — Minor Prompt or Marker Refinement Suggested',
      toneClass: 'text-blue-700 dark:text-blue-400',
    };
  }
  return {
    label: 'Needs Refinement — Adjust Prompt, Style, or Seed',
    toneClass: 'text-amber-700 dark:text-amber-400',
  };
}

export function QualityEvaluationPanel({
  title,
  prompt,
  enhancedPrompt,
  settings,
  evaluation,
  onChangeEvaluation,
  activeSavedOutputId,
  onPersistEvaluation,
}: QualityEvaluationPanelProps) {
  const [isSavingEval, setIsSavingEval] = useState(false);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  const avg = computeAverage(evaluation.ratings);
  const readiness = getReadinessTier(avg);

  const handleSetRating = (key: QualityCriterionKey, value: number) => {
    const nextRatings: QualityRatings = { ...evaluation.ratings, [key]: value };
    onChangeEvaluation({
      ...evaluation,
      ratings: nextRatings,
      averageScore: computeAverage(nextRatings),
      evaluatedAt: new Date().toISOString(),
    });
  };

  const handleReset = () => {
    const freshRatings: QualityRatings = { ...DEFAULT_QUALITY_RATINGS };
    onChangeEvaluation({
      ratings: freshRatings,
      averageScore: computeAverage(freshRatings),
      notes: '',
      evaluatedAt: new Date().toISOString(),
    });
  };

  const handleSave = async () => {
    setIsSavingEval(true);
    setSavedNotice(null);
    try {
      const payload: QualityEvaluation = {
        ...evaluation,
        averageScore: avg,
        evaluatedAt: new Date().toISOString(),
      };
      onChangeEvaluation(payload);
      const persistedToServer = await onPersistEvaluation(payload);
      setSavedNotice(
        persistedToServer
          ? 'Saved to output archive'
          : 'Saved in studio (click Save to outputs/ to archive)'
      );
      window.setTimeout(() => setSavedNotice(null), 4000);
    } finally {
      setIsSavingEval(false);
    }
  };

  const handleExportReport = () => {
    const timestamp = new Date().toISOString();
    const rows = QUALITY_CRITERIA.map(
      (c) => `| ${c.label} | ${evaluation.ratings[c.key]} / 5 | ${c.description} |`
    ).join('\n');

    const markdown = [
      `# DevIllustrate AI — Technical Graphic Quality & Style Evaluation Report`,
      ``,
      `- **Evaluated At:** ${timestamp}`,
      `- **Graphic Title:** ${title || 'Untitled Technical Illustration'}`,
      `- **Engine / Model:** ${settings.engine === 'huggingface' ? `Hugging Face (${settings.hfModel})` : 'Gemini SVG'}`,
      `- **Visual Style:** ${settings.style}`,
      `- **Resolution & Params:** ${settings.width}×${settings.height} · Steps ${settings.steps} · CFG ${settings.guidanceScale.toFixed(1)} · Seed ${settings.seed}`,
      `- **Overall Score:** **${avg.toFixed(2)} / 5.00** (${readiness.label})`,
      ``,
      `## Prompt Details`,
      `- **Original Prompt:** ${prompt || '(none)'}`,
      `- **Enhanced Prompt:** ${enhancedPrompt || '(none)'}`,
      ``,
      `## Quality Rubric Scores (Human Review)`,
      ``,
      `| Criterion | Score | Assessment Focus |`,
      `| --- | :---: | --- |`,
      rows,
      ``,
      `## Reviewer Notes`,
      evaluation.notes.trim() || '_No additional reviewer notes recorded._',
      ``,
      `> **Verification Notice:** Scores reflect manual human review. Generative models do not guarantee factual or architectural accuracy without engineering verification.`,
      ``,
    ].join('\n');

    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const slug = (title || 'evaluation_report')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
    a.href = url;
    a.download = `${slug || 'devillustrate'}_quality_evaluation.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800">
        <div>
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
            Technical Graphic Quality Evaluation
          </h2>
          <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">
            Score the current graphic across all 9 documentation and visual quality criteria (1–5 scale).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleReset}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 whitespace-nowrap dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Reset</span>
          </button>

          <button
            type="button"
            onClick={handleExportReport}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 transition-colors hover:bg-slate-50 whitespace-nowrap dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Export Report (.md)</span>
          </button>

          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={isSavingEval}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap dark:bg-blue-600 dark:hover:bg-blue-500"
          >
            <ClipboardCheck className="h-3.5 w-3.5" aria-hidden="true" />
            <span>
              {isSavingEval
                ? 'Saving...'
                : activeSavedOutputId
                  ? 'Save Score to Archive'
                  : 'Save Evaluation'}
            </span>
          </button>
        </div>
      </div>

      {/* Honest Verification Disclaimer */}
      <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-xs leading-relaxed text-slate-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
        <span className="font-semibold text-slate-900 dark:text-slate-100">
          Human Review Disclaimer:{' '}
        </span>
        These ratings record your manual engineering review. DevIllustrate AI does not
        automatically verify factual, architectural, or protocol accuracy of generated images.
      </div>

      {/* Summary Score Strip */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-950">
        <div className="flex items-baseline gap-3">
          <span className="font-mono text-2xl font-bold tracking-tight text-slate-900 tabular-nums dark:text-white">
            {avg.toFixed(2)}
            <span className="text-sm font-medium text-slate-400 dark:text-slate-500">
              {' '}/ 5.00
            </span>
          </span>
          <span className={`text-xs font-semibold ${readiness.toneClass}`}>
            {readiness.label}
          </span>
        </div>

        {savedNotice && (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">
            <Check className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{savedNotice}</span>
          </span>
        )}
      </div>

      {/* 9-Criterion Rating Grid */}
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {QUALITY_CRITERIA.map((criterion) => {
          const currentVal = evaluation.ratings[criterion.key];
          return (
            <div
              key={criterion.key}
              className="rounded-lg border border-slate-200 bg-slate-50/50 p-3 dark:border-slate-800 dark:bg-slate-950/60"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                  {criterion.label}
                </p>
                <span className="font-mono text-xs font-semibold text-blue-700 tabular-nums dark:text-blue-400">
                  {currentVal}/5
                </span>
              </div>
              <p className="mt-0.5 text-[11px] leading-snug text-slate-500 dark:text-slate-400">
                {criterion.description}
              </p>
              <div
                role="radiogroup"
                aria-label={`${criterion.label} score`}
                className="mt-2.5 grid grid-cols-5 gap-1"
              >
                {[1, 2, 3, 4, 5].map((score) => {
                  const selected = currentVal === score;
                  return (
                    <button
                      key={score}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => handleSetRating(criterion.key, score)}
                      className={`h-7 cursor-pointer rounded-md border font-mono text-xs font-semibold transition-colors ${
                        selected
                          ? 'border-blue-700 bg-blue-700 text-white dark:border-blue-500 dark:bg-blue-600'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'
                      }`}
                    >
                      {score}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Reviewer Notes */}
      <div className="mt-4">
        <label
          htmlFor="evaluation-notes-input"
          className="block text-xs font-medium text-slate-700 dark:text-slate-300"
        >
          Reviewer Notes &amp; Prompt Refinement Observations
        </label>
        <textarea
          id="evaluation-notes-input"
          rows={2}
          maxLength={1000}
          value={evaluation.notes}
          onChange={(e) =>
            onChangeEvaluation({
              ...evaluation,
              notes: e.target.value,
              evaluatedAt: new Date().toISOString(),
            })
          }
          placeholder="Example: Clean isometric layout and color harmony; increase guidance scale or tighten negative prompt to simplify connector arrows."
          className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/15 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500"
        />
      </div>
    </section>
  );
}
