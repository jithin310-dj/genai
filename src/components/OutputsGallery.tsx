import { ArrowUpRight, Download, FolderOpen, Search, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
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

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await onDelete(id);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="mx-auto max-w-[1440px] px-6 py-8">
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-6 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Saved Outputs Directory
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Generated technical documentation PNGs archived in{' '}
            <code className="font-mono text-xs text-slate-800">outputs/</code>.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
              aria-hidden="true"
            />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter by title or prompt..."
              className="h-10 w-64 rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/15"
            />
          </div>

          <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
            {STYLE_FILTERS.map((style) => (
              <button
                key={style}
                type="button"
                onClick={() => setStyleFilter(style)}
                className={`cursor-pointer rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  styleFilter === style
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {style}
              </button>
            ))}
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="mt-8 grid gap-6 md:grid-cols-2">
          {[1, 2].map((skeleton) => (
            <div
              key={skeleton}
              className="h-80 animate-pulse rounded-xl border border-slate-200 bg-white p-5"
            />
          ))}
        </div>
      ) : outputs.length === 0 ? (
        <div className="mt-12 flex flex-col items-center justify-center rounded-xl border border-slate-200 bg-white px-6 py-16 text-center">
          <FolderOpen className="h-10 w-10 text-slate-400" aria-hidden="true" />
          <h2 className="mt-4 text-lg font-semibold text-slate-900">
            No saved illustrations in outputs/ yet
          </h2>
          <p className="mt-2 max-w-md text-sm text-slate-600">
            Generate a technical illustration or annotate one of the built-in studio presets, then
            click Save to outputs/ to archive your finished PNG here.
          </p>
          <button
            type="button"
            onClick={onGoToStudio}
            className="mt-6 cursor-pointer rounded-lg bg-blue-700 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-800 whitespace-nowrap"
          >
            Open Studio
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="mt-12 rounded-xl border border-slate-200 bg-white p-10 text-center">
          <p className="text-sm text-slate-600">
            No archived illustrations match your current search or style filter.
          </p>
        </div>
      ) : (
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          {filtered.map((item) => (
            <article
              key={item.id}
              className="flex flex-col rounded-xl border border-slate-200 bg-white p-5"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h2 className="truncate text-base font-semibold text-slate-900">
                    {item.title}
                  </h2>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500 tabular-nums">
                    <span>{item.style}</span>
                    <span aria-hidden="true">·</span>
                    <span>
                      {item.width}×{item.height}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>Seed {item.seed}</span>
                    <span aria-hidden="true">·</span>
                    <span>{item.componentCount} markers</span>
                    <span aria-hidden="true">·</span>
                    <span>{new Date(item.createdAt).toLocaleString()}</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleDelete(item.id)}
                  disabled={deletingId === item.id}
                  aria-label={`Delete ${item.title}`}
                  className="cursor-pointer rounded-md p-2 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>

              <p className="mt-3 line-clamp-2 text-xs text-slate-600">{item.prompt}</p>

              <div className="mt-4 overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                <img
                  src={item.labeledFile}
                  alt={item.title}
                  referrerPolicy="no-referrer"
                  className="max-h-72 w-full object-contain"
                />
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  onClick={() => onLoadInStudio(item)}
                  className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-medium text-blue-700 hover:text-blue-800 whitespace-nowrap"
                >
                  <span>Open in Studio</span>
                  <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                </button>

                <a
                  href={item.labeledFile}
                  download
                  className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-slate-800 whitespace-nowrap"
                >
                  <Download className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Download PNG</span>
                </a>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
