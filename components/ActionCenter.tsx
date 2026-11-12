'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ProposedAction } from '@/lib/types';
import { ACTIONS_CHANGED_EVENT } from './studio/paypal-agent';
import { KIND_LABEL, STATUS_STYLE, fetchActions, money, setApprover, viaLabel } from './studio/actions-client';
import ActionDecision, { useApprover } from './studio/ActionDecision';
import RulesDialog from './RulesDialog';
import { OPEN_RULES_EVENT } from './tour-events';

export default function ActionCenter() {
  const [actions, setActions] = useState<ProposedAction[]>([]);
  const [rules, setRules] = useState(false);
  const approver = useApprover();

  const refresh = useCallback(async () => {
    setActions(await fetchActions());
  }, []);

  useEffect(() => {
    void Promise.resolve().then(refresh); // async fetch; setState happens after await
    const on = () => refresh();
    const openRules = () => setRules(true);
    window.addEventListener(ACTIONS_CHANGED_EVENT, on);
    window.addEventListener(OPEN_RULES_EVENT, openRules);
    const t = setInterval(refresh, 15_000);
    return () => {
      window.removeEventListener(ACTIONS_CHANGED_EVENT, on);
      window.removeEventListener(OPEN_RULES_EVENT, openRules);
      clearInterval(t);
    };
  }, [refresh]);

  const pending = actions.filter((a) => a.status === 'pending');
  const history = actions.filter((a) => a.status !== 'pending');

  return (
    <aside className="flex h-full flex-col border-l border-[var(--line)] bg-[var(--panel)]" aria-label="Action Center">
      <div className="border-b border-[var(--line)] px-4 py-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Action Center</h2>
          <button className="rounded-md border border-[var(--line)] px-2 py-0.5 text-[11px] hover:bg-[var(--hover)]" onClick={() => setRules(true)} data-testid="open-rules">
            ⚖ Rules
          </button>
        </div>
        <p className="mt-0.5 text-xs text-[var(--muted)]">The AI proposes. You decide. Nothing moves money unless you or your rules approve it.</p>
        <label className="mt-2 flex items-center gap-2 text-[11px] text-[var(--muted)]">
          Approving as
          <input
            className="min-w-0 flex-1 rounded border border-[var(--line)] bg-[var(--card)] px-1.5 py-0.5 text-[11px] text-[var(--text)]"
            value={approver}
            onChange={(e) => setApprover(e.target.value)}
            data-testid="approver-name"
            aria-label="Approver name"
          />
        </label>
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
            {a.kind === 'submit_dispute_evidence' && (
              <a className="mt-2 inline-block text-xs text-[var(--accent)] underline" href={`/api/disputes/${a.data.disputeId}/evidence-pack?action=${a.id}`} target="_blank" rel="noreferrer">
                📄 Preview the evidence pack (PDF)
              </a>
            )}
            <ActionDecision action={a} onDecided={() => void refresh()} />
          </article>
        ))}
        {history.length > 0 && (
          <div className="pt-2">
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">Audit trail</h3>
            <ul className="space-y-2">
              {history.map((a) => (
                <li key={a.id} className="rounded-md border border-[var(--line)] p-2 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-medium">{a.title}</span>
                    <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${STATUS_STYLE[a.status]}`}>
                      {a.autoApproved && a.status === 'executed' ? 'auto' : a.status}
                    </span>
                  </div>
                  <div className="mt-1 text-[10px] text-[var(--muted)]">
                    {a.decidedAt ? a.decidedAt.slice(0, 16).replace('T', ' ') : ''}
                    {a.decidedBy ? ` · by ${a.decidedBy}` : ''}
                    {a.executedVia && a.executedVia !== 'none' ? ` · via ${viaLabel(a.executedVia)}` : ''}
                  </div>
                  {a.error && <div className="mt-1 text-[10px] text-rose-600">{a.error}</div>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      {rules && <RulesDialog onClose={() => setRules(false)} />}
    </aside>
  );
}
