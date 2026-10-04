'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import type { Dataset } from '@/lib/types';
import ActionCenter from './ActionCenter';
import ExportMenu from './ExportMenu';
import { ACTION_EXECUTED_EVENT } from './studio/actions-client';
import { clearSavedDashboard } from './studio/StudioDashboard';

const StudioDashboard = dynamic(() => import('./studio/StudioDashboard'), {
  ssr: false,
  loading: () => <div className="grid h-full place-items-center text-sm text-[var(--muted)]">Loading dashboard…</div>,
});

export default function DashboardShell() {
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showActions, setShowActions] = useState(true);
  const [studioKey, setStudioKey] = useState(0);

  const load = useCallback(async (fresh = false) => {
    try {
      const res = await fetch(`/api/data${fresh ? '?fresh=1' : ''}`, { cache: 'no-store' });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setDataset(body);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(() => load()); // async fetch; setState happens after await
    // Approvals (from the Action Center or the chat cards) change PayPal data: reload it.
    const onExecuted = () => void load(true);
    window.addEventListener(ACTION_EXECUTED_EVENT, onExecuted);
    return () => window.removeEventListener(ACTION_EXECUTED_EVENT, onExecuted);
  }, [load]);

  const resetDemo = async () => {
    await fetch('/api/demo/reset', { method: 'POST' });
    clearSavedDashboard();
    await load(true);
    setStudioKey((k) => k + 1);
  };

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex items-center gap-3 border-b border-[var(--line)] bg-[var(--panel)] px-4 py-2">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <span className="grid h-7 w-7 place-items-center rounded-md bg-[var(--accent)] text-xs font-bold text-white">MP</span>
          <span className="hidden sm:inline">MerchantPilot</span>
        </Link>
        {dataset && (
          <span className="truncate text-sm text-[var(--muted)]">
            {dataset.merchantName}
            <span
              className={`ml-2 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                dataset.mode === 'live' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
              }`}
            >
              {dataset.mode === 'live' ? 'PayPal sandbox · live' : 'Demo data'}
            </span>
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <ExportMenu />
          <button className="rounded-md border border-[var(--line)] px-2.5 py-1 text-xs hover:bg-[var(--hover)]" onClick={() => load(true)}>
            Refresh data
          </button>
          <button className="rounded-md border border-[var(--line)] px-2.5 py-1 text-xs hover:bg-[var(--hover)]" onClick={resetDemo}>
            Reset demo
          </button>
          <button
            className="rounded-md bg-[var(--accent)] px-2.5 py-1 text-xs font-semibold text-white hover:opacity-90"
            onClick={() => setShowActions((s) => !s)}
            aria-pressed={showActions}
          >
            Action Center
          </button>
        </div>
      </header>
      {dataset?.warnings?.length ? (
        <div className="border-b border-amber-300 bg-amber-50 px-4 py-1.5 text-xs text-amber-900">
          Some PayPal data could not be loaded: {dataset.warnings.join(' · ')}
        </div>
      ) : null}
      <main className="flex min-h-0 flex-1">
        <section className="min-w-0 flex-1">
          {error && <div className="p-6 text-sm text-rose-600">Could not load data: {error}</div>}
          {dataset && <StudioDashboard key={studioKey} dataset={dataset} />}
        </section>
        {showActions && (
          <div className="w-[320px] shrink-0 max-md:absolute max-md:inset-y-12 max-md:right-0 max-md:z-50 max-md:w-[90vw]">
            <ActionCenter />
          </div>
        )}
      </main>
    </div>
  );
}
