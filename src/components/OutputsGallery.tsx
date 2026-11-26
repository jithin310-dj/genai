import {
  ArrowUpRight,
  Columns2,
  Download,
  FolderOpen,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { QUALITY_CRITERIA } from '../data/presets';
import type { SavedOutput, VisualStyle } from '../types/project';

interface OutputsGalleryProps {
  outputs: SavedOutput[];
  isLoading: boolean;
  onDelete: (id: string) => Promise<void>;
  onLoadInStudio: (output: SavedOutput) => void;
  onGoToStudio: () => void;
}

const STYLE_FILTERS: Array<'All' | VisualStyle> = [
  'All',
  'Professional 3D',
  'Flat Vector',
  'Blueprint',
  'Isometric',
];

export function OutputsGallery({
  outputs,
  isLoading,
  onDelete,
  onLoadInStudio,
  onGoToStudio,
}: OutputsGalleryProps) {
  const [query, setQuery] = useState('');
  const [styleFilter, setStyleFilter] = useState<'All' | VisualStyle>('All');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [compareIds, setCompareIds] = useState<string[]>([]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return outputs.filter((item) => {
      const matchesStyle = styleFilter === 'All' || item.style === styleFilter;
      const matchesQuery =
        !q ||
        item.title.toLowerCase().includes(q) ||
        item.prompt.toLowerCase().includes(q) ||
        item.style.toLowerCase().includes(q);
      return matchesStyle && matchesQuery;
    });
  }, [outputs, query, styleFilter]);

  const comparedOutputs = useMemo(
    () =>
      compareIds
        .map((id) => outputs.find((o) => o.id === id))
        .filter((o): o is SavedOutput => Boolean(o)),
    [compareIds, outputs]
  );

  const toggleCompare = (id: string) => {
    setCompareIds((prev) => {
      if (prev.includes(id)) {
        return prev.filter((item) => item !== id);
      }
      if (prev.length >= 2) {
        return [prev[1], id];
      }
      return [...prev, id];
    });
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await onDelete(id);
      setCompareIds((prev) => prev.filter((item) => item !== id));
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="mx-auto max-w-[1440px] px-4 py-8 sm:px-6">
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-6 dark:border-slate-800 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Saved Outputs &amp; Comparison Gallery
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Archived technical graphics in{' '}
            <code className="font-mono text-xs text-slate-800 dark:text-slate-200">
              outputs/
            </code>
            . Select any two graphics to compare prompts, styles, and quality scores side-by-side.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500"
              aria-hidden="true"
            />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter by title or prompt..."
              className="h-10 w-64 rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/15 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500"
            />
          </div>

          <div className="flex flex-wrap items-center gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-900">
            {STYLE_FILTERS.map((style) => (
              <button
                key={style}
                type="button"
                onClick={() => setStyleFilter(style)}
                className={`cursor-pointer rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  styleFilter === style
                    ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-800 dark:text-white'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
                }`}
              >
                {style}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Interactive Side-by-Side Comparison Panel */}
      {comparedOutputs.length > 0 && (
        <section className="mt-6 rounded-xl border border-blue-200 bg-white p-5 shadow-xs dark:border-blue-900/60 dark:bg-slate-900">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <Columns2 className="h-4 w-4 text-blue-700 dark:text-blue-400" aria-hidden="true" />
              <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Side-by-Side Graphic Comparison ({comparedOutputs.length}/2 selected)
              </h2>
            </div>
            <button
              type="button"
              onClick={() => setCompareIds([])}
              className="inline-flex cursor-pointer items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Clear Comparison</span>
            </button>
          </div>

          {comparedOutputs.length === 1 ? (
            <p className="mt-3 text-xs text-slate-600 dark:text-slate-400">
              Selected <strong>{comparedOutputs[0].title}</strong>. Click <strong>Compare</strong> on a
              second archived graphic below to view them side-by-side.
            </p>
          ) : (
            <div className="mt-4 grid gap-6 lg:grid-cols-2">
              {comparedOutputs.map((item, idx) => (
                <div
                  key={item.id}
                  className="flex flex-col rounded-lg border border-slate-200 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-950/60"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[11px] font-semibold text-blue-700 dark:text-blue-400">
                      Option {idx === 0 ? 'A' : 'B'}
                    </span>
                    {item.evaluation && (
                      <span className="font-mono text-xs font-bold text-slate-900 tabular-nums dark:text-slate-100">
                        Quality: {item.evaluation.averageScore.toFixed(2)} / 5.00
                      </span>
                    )}
                  </div>
                  <h3 className="mt-1 truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {item.title}
                  </h3>
                  <p className="mt-0.5 font-mono text-[11px] text-slate-500 tabular-nums dark:text-slate-400">
                    {item.style} · {item.width}×{item.height} · Steps {item.steps} · CFG{' '}
                    {item.guidanceScale} · Seed {item.seed}
                  </p>

                  <div className="mt-3 overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                    <img
                      src={item.labeledFile}
                      alt={item.title}
                      referrerPolicy="no-referrer"
                      className="max-h-72 w-full object-contain"
                    />
                  </div>

                  <div className="mt-3 space-y-1.5 text-xs">
                    <p className="text-slate-700 dark:text-slate-300">
                      <span className="font-semibold text-slate-900 dark:text-slate-100">
                        Prompt:{' '}
                      </span>
                      {item.prompt}
                    </p>
                    {item.evaluation ? (
                      <div className="mt-2 grid grid-cols-3 gap-1.5 pt-2 border-t border-slate-200 dark:border-slate-800">
                        {QUALITY_CRITERIA.map((c) => (
                          <div
                            key={c.key}
                            className="flex items-center justify-between rounded bg-white px-2 py-1 text-[11px] dark:bg-slate-900"
                          >
                            <span className="truncate text-slate-600 dark:text-slate-400">
                              {c.label.split(' ')[0]}
                            </span>
                            <span className="font-mono font-semibold text-slate-900 tabular-nums dark:text-slate-100">
                              {item.evaluation?.ratings[c.key]}/5
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        Not yet scored — open in Studio to evaluate all 9 quality criteria.
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {isLoading ? (
        <div className="mt-8 grid gap-6 md:grid-cols-2">
          {[1, 2].map((skeleton) => (
            <div
              key={skeleton}
              className="h-80 animate-pulse rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
            />
          ))}
        </div>
      ) : outputs.length === 0 ? (
        <div className="mt-12 flex flex-col items-center justify-center rounded-xl border border-slate-200 bg-white px-6 py-16 text-center dark:border-slate-800 dark:bg-slate-900">
          <FolderOpen className="h-10 w-10 text-slate-400 dark:text-slate-500" aria-hidden="true" />
          <h2 className="mt-4 text-lg font-semibold text-slate-900 dark:text-slate-100">
            No saved illustrations in outputs/ yet
          </h2>
          <p className="mt-2 max-w-md text-sm text-slate-600 dark:text-slate-400">
            Generate an image or annotate one of the built-in studio presets, then click Save
            to outputs/ to archive your finished PNG here.
          </p>
          <button
            type="button"
            onClick={onGoToStudio}
            className="mt-6 cursor-pointer rounded-lg bg-blue-700 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-800 whitespace-nowrap dark:bg-blue-600 dark:hover:bg-blue-500"
          >
            Open Studio
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="mt-12 rounded-xl border border-slate-200 bg-white p-10 text-center dark:border-slate-800 dark:bg-slate-900">
          <p className="text-sm text-slate-600 dark:text-slate-400">
            No archived illustrations match your current search or style filter.
          </p>
        </div>
      ) : (
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          {filtered.map((item) => {
            const isCompared = compareIds.includes(item.id);
            return (
              <article
                key={item.id}
                className={`flex flex-col rounded-xl border bg-white p-5 transition-colors dark:bg-slate-900 ${
                  isCompared
                    ? 'border-blue-600 ring-1 ring-blue-600/20 dark:border-blue-500'
                    : 'border-slate-200 dark:border-slate-800'
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h2 className="truncate text-base font-semibold text-slate-900 dark:text-slate-100">
                      {item.title}
                    </h2>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500 tabular-nums dark:text-slate-400">
                      <span>{item.style}</span>
                      <span aria-hidden="true">·</span>
                      <span>
                        {item.width}×{item.height}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>Seed {item.seed}</span>
                      <span aria-hidden="true">·</span>
                      <span>{item.componentCount} markers</span>
                      {item.evaluation && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono font-semibold text-blue-700 dark:text-blue-400">
                            Score {item.evaluation.averageScore.toFixed(1)}/5
                          </span>
                        </>
                      )}
                      <span aria-hidden="true">·</span>
                      <span>{new Date(item.createdAt).toLocaleString()}</span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleDelete(item.id)}
                    disabled={deletingId === item.id}
                    aria-label={`Delete ${item.title}`}
                    className="cursor-pointer rounded-md p-2 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:text-slate-500 dark:hover:bg-red-950/50 dark:hover:text-red-400"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>

                <p className="mt-3 line-clamp-2 text-xs text-slate-600 dark:text-slate-400">
                  {item.prompt}
                </p>

                <div className="mt-4 overflow-hidden rounded-lg border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950">
                  <img
                    src={item.labeledFile}
                    alt={item.title}
                    referrerPolicy="no-referrer"
                    className="max-h-72 w-full object-contain"
                  />
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4 dark:border-slate-800">
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={() => onLoadInStudio(item)}
                      className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-medium text-blue-700 hover:text-blue-800 whitespace-nowrap dark:text-blue-400 dark:hover:text-blue-300"
                    >
                      <span>Open in Studio</span>
                      <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>

                    <button
                      type="button"
                      onClick={() => toggleCompare(item.id)}
                      className={`inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                        isCompared
                          ? 'border-blue-600 bg-blue-50 text-blue-700 dark:border-blue-500 dark:bg-blue-950/50 dark:text-blue-300'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'
                      }`}
                    >
                      <Columns2 className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>{isCompared ? 'Selected for Compare' : 'Compare'}</span>
                    </button>
                  </div>

                  <a
                    href={item.labeledFile}
                    download
                    className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-slate-800 whitespace-nowrap dark:bg-blue-600 dark:hover:bg-blue-500"
                  >
                    <Download className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Download PNG</span>
                  </a>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
