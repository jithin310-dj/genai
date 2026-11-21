import { Download } from 'lucide-react';
import type { WorkspaceTab } from '../types/project';

interface TopNavProps {
  activeTab: WorkspaceTab;
  onSelectTab: (tab: WorkspaceTab) => void;
  onDownloadPng: () => void;
  canDownload: boolean;
}

const NAV_ITEMS: Array<{ id: WorkspaceTab; label: string }> = [
  { id: 'studio', label: 'Studio' },
  { id: 'outputs', label: 'Outputs' },
];

export function TopNav({
  activeTab,
  onSelectTab,
  onDownloadPng,
  canDownload,
}: TopNavProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur-sm">
      <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between gap-8 px-6">
        {/* Zone 1: Single text wordmark */}
        <button
          type="button"
          onClick={() => onSelectTab('studio')}
          className="cursor-pointer rounded font-display text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
        >
          DevIllustrate AI
        </button>

        {/* Zone 2: Concise single-line navigation links */}
        <nav
          aria-label="Primary workspace navigation"
          className="flex items-center gap-6 overflow-x-auto"
        >
          {NAV_ITEMS.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectTab(item.id)}
                className={`relative cursor-pointer py-5 text-sm font-medium transition-colors duration-150 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                  isActive
                    ? 'text-slate-950'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {item.label}
                {isActive && (
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-0 bottom-0 h-0.5 bg-blue-700"
                  />
                )}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: 1 primary action */}
        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={onDownloadPng}
            disabled={!canDownload}
            className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-xs font-medium text-white transition-colors duration-150 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Download PNG</span>
          </button>
        </div>
      </div>
    </header>
  );
}
