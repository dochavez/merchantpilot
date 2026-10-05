'use client';

/** Confirmation page for approve/reject links from the morning brief (email / WhatsApp). */
import { useEffect, useState } from 'react';
import type { ProposedAction } from '@/lib/types';

export default function ApprovePage() {
  const [token] = useState(() => (typeof window === 'undefined' ? '' : (new URLSearchParams(window.location.search).get('t') ?? '')));
  const [info, setInfo] = useState<{ decision: 'approve' | 'reject'; approver: string; action: ProposedAction } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<ProposedAction | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void fetch(`/api/approve-link?t=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((b) => (b.error ? setError(b.error) : setInfo(b)));
  }, [token]);

  const confirm = async () => {
    setBusy(true);
    const r = await fetch('/api/approve-link', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ t: token }) });
    const b = await r.json();
    setBusy(false);
    if (b.error) setError(b.error);
    else setDone(b.action);
  };

  const a = done ?? info?.action;
  return (
    <main className="mx-auto max-w-md p-6">
      <div className="mb-4 flex items-center gap-2 font-semibold">
        <span className="grid h-7 w-7 place-items-center rounded-md bg-[var(--accent)] text-xs font-bold text-white">MP</span> MerchantPilot
      </div>
      <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-5 shadow-sm">
        {error && <p className="text-sm text-rose-600" data-testid="approve-error">{error}</p>}
        {!error && !a && <p className="text-sm text-[var(--muted)]">Checking link…</p>}
        {a && (
          <>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--accent)]">{info?.decision === 'reject' ? 'Reject action' : 'Approve action'}</div>
            <h1 className="mt-1 text-base font-semibold leading-snug">{a.title}</h1>
            <p className="mt-2 text-sm text-[var(--muted)]">{a.rationale}</p>
            {done ? (
              <p className="mt-4 rounded-md bg-emerald-50 p-3 text-sm text-emerald-800" data-testid="approve-done">
                Done: status <b>{done.status}</b>
                {done.status === 'pending' && (done.requiredApprovals ?? 1) > 1 ? ' – waiting for a second approver.' : '.'} It is logged in the audit trail.
              </p>
            ) : a.status !== 'pending' ? (
              <p className="mt-4 text-sm">This action is already <b>{a.status}</b>.</p>
            ) : (
              <button
                className={`mt-4 w-full rounded-md px-3 py-2 text-sm font-semibold text-white disabled:opacity-50 ${info?.decision === 'reject' ? 'bg-zinc-600' : 'bg-[var(--accent)]'}`}
                onClick={confirm}
                disabled={busy}
                data-testid="approve-confirm"
              >
                {busy ? 'Working…' : info?.decision === 'reject' ? 'Confirm reject' : 'Confirm approve'}
              </button>
            )}
          </>
        )}
      </div>
      <p className="mt-3 text-center text-xs text-[var(--muted)]">
        <a className="underline" href="/dashboard">
          Open the dashboard
        </a>
      </p>
    </main>
  );
}
