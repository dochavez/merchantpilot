'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ProposedAction } from '@/lib/types';
import { ACTIONS_CHANGED_EVENT } from './studio/paypal-agent';
import { KIND_LABEL, STATUS_STYLE, decideActionClient, fetchActions, money } from './studio/actions-client';

export default function ActionCenter() {
  const [actions, setActions] = useState<ProposedAction[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setActions(await fetchActions());
  }, []);

  useEffect(() => {
    void Promise.resolve().then(refresh); // async fetch; setState happens after await
    const on = () => refresh();
    window.addEventListener(ACTIONS_CHANGED_EVENT, on);
    const t = setInterval(refresh, 15_000);
    return () => {
      window.removeEventListener(ACTIONS_CHANGED_EVENT, on);
      clearInterval(t);
    };
  }, [refresh]);

  const decide = async (id: string, decision: 'approve' | 'reject') => {
    setBusy(id);
    try {
      // Fires ACTIONS_CHANGED (refreshes this list and the chat cards) and, after an execution,
      // ACTION_EXECUTED (the dashboard reloads its PayPal data).
      await decideActionClient(id, decision).catch(() => undefined);
    } finally {
      setBusy(null);
    }
  };

  const pending = actions.filter((a) => a.status === 'pending');
  const history = actions.filter((a) => a.status !== 'pending');

  return (
    <aside className="flex h-full flex-col border-l border-[var(--line)] bg-[var(--panel)]" aria-label="Action Center">
      <div className="border-b border-[var(--line)] px-4 py-3">
        <h2 className="text-sm font-semibold">Action Center</h2>
        <p className="mt-0.5 text-xs text-[var(--muted)]">The AI proposes. You decide. Nothing moves money until you approve.</p>
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto p-3">
        {pending.length === 0 && (
          <div className="rounded-lg border border-dashed border-[var(--line)] p-4 text-xs text-[var(--muted)]">
            No pending actions. Ask MerchantPilot something like <em>“Chase my overdue invoices”</em>.
          </div>
        )}
        {pending.map((a) => (
          <article key={a.id} className="rounded-lg border border-[var(--line)] bg-[var(--card)] p-3 shadow-sm" data-testid="pending-action">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-medium uppercase tracking-wide text-[var(--accent)]">{KIND_LABEL[a.kind]}</span>
              {a.impact && (
                <span className={`text-xs font-semibold tabular-nums ${a.impact.amount < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                  {a.kind === 'invoice_reminder' ? 'collect ' : ''}
                  {money(a.impact.amount, a.impact.currency)}
                </span>
              )}
            </div>
            <h3 className="mt-1 text-sm font-medium leading-snug">{a.title}</h3>
            <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">{a.rationale}</p>
            {a.kind === 'dispute_response_draft' && (
              <details className="mt-2 text-xs">
                <summary className="cursor-pointer text-[var(--accent)]">View draft</summary>
                <p className="mt-1 whitespace-pre-wrap">{a.data.message}</p>
                <ul className="mt-1 list-disc pl-4">
                  {a.data.evidence.map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              </details>
            )}
            <div className="mt-3 flex gap-2">
              <button
                className="flex-1 rounded-md bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
                disabled={busy === a.id}
                onClick={() => decide(a.id, 'approve')}
              >
                {busy === a.id ? 'Working…' : a.kind === 'dispute_response_draft' ? 'Save draft' : 'Approve'}
              </button>
              <button
                className="rounded-md border border-[var(--line)] px-3 py-1.5 text-xs hover:bg-[var(--hover)] disabled:opacity-50"
                disabled={busy === a.id}
                onClick={() => decide(a.id, 'reject')}
              >
                Reject
              </button>
            </div>
          </article>
        ))}
        {history.length > 0 && (
          <div className="pt-2">
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">History</h3>
            <ul className="space-y-2">
              {history.map((a) => (
                <li key={a.id} className="rounded-md border border-[var(--line)] p-2 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-medium">{a.title}</span>
                    <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${STATUS_STYLE[a.status]}`}>{a.status}</span>
                  </div>
                  {a.executedVia && a.executedVia !== 'none' && (
                    <div className="mt-1 text-[10px] text-[var(--muted)]">via {a.executedVia === 'paypal-agent-toolkit' ? 'PayPal Agent Toolkit (sandbox)' : 'demo data'}</div>
                  )}
                  {a.error && <div className="mt-1 text-[10px] text-rose-600">{a.error}</div>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </aside>
  );
}
