'use client';

/**
 * In-chat approval card: AG Studio renders this under every propose_* / draft_dispute_response call
 * (registered through the `aiToolDisplay` property). The merchant can approve or reject right in the
 * conversation; the Action Center updates too, because both read the same server-side queue.
 */
import { useCallback, useEffect, useState } from 'react';
import type { AgAiToolDetailParams } from 'ag-studio';
import type { ProposedAction } from '@/lib/types';
import { ACTIONS_CHANGED_EVENT } from './paypal-agent';
import { KIND_LABEL, fetchActions, money } from './actions-client';
import ActionDecision from './ActionDecision';

export function proposalIdFrom(result: AgAiToolDetailParams['result']): string | undefined {
  if (!result || !result.success) return undefined;
  try {
    const parsed = JSON.parse(result.response);
    return typeof parsed?.actionId === 'string' ? parsed.actionId : undefined;
  } catch {
    return undefined;
  }
}

export default function ProposalCard(props: AgAiToolDetailParams) {
  const actionId = proposalIdFrom(props.result);
  const [action, setAction] = useState<ProposedAction | null | undefined>(undefined);
  const refresh = useCallback(async () => {
    if (!actionId) return;
    const all = await fetchActions();
    setAction(all.find((a) => a.id === actionId) ?? null);
  }, [actionId]);

  useEffect(() => {
    void Promise.resolve().then(refresh);
    const on = () => void refresh();
    window.addEventListener(ACTIONS_CHANGED_EVENT, on);
    return () => window.removeEventListener(ACTIONS_CHANGED_EVENT, on);
  }, [refresh]);

  if (props.result && !props.result.success) {
    return <div className="text-xs text-rose-600">{props.result.issues.map((i) => i.message).join(' ')}</div>;
  }
  if (!actionId) return null;
  if (action === undefined) return <div className="p-2 text-xs text-[var(--muted)]">Loading proposal…</div>;
  if (action === null) {
    return <div className="p-2 text-xs text-[var(--muted)]">This proposal is no longer in the Action Center (the server restarted or the demo was reset).</div>;
  }

  const isDraft = action.kind === 'dispute_response_draft';
  return (
    <article className="my-1 rounded-lg border border-[var(--line)] bg-[var(--card)] p-3 text-left shadow-sm" data-testid="chat-proposal">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium uppercase tracking-wide text-[var(--accent)]">{KIND_LABEL[action.kind]}</span>
        {action.impact && (
          <span className={`text-xs font-semibold tabular-nums ${action.impact.amount < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
            {action.kind === 'invoice_reminder' ? 'collect ' : ''}
            {money(action.impact.amount, action.impact.currency)}
          </span>
        )}
      </div>
      <h4 className="mt-1 text-sm font-medium leading-snug">{action.title}</h4>
      <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">{action.rationale}</p>
      {isDraft && action.kind === 'dispute_response_draft' && (
        <details className="mt-2 text-xs">
          <summary className="cursor-pointer text-[var(--accent)]">View draft</summary>
          <p className="mt-1 whitespace-pre-wrap">{action.data.message}</p>
        </details>
      )}
      {action.kind === 'submit_dispute_evidence' && (
        <a
          className="mt-2 inline-block text-xs font-medium text-[var(--accent)] underline"
          href={`/api/disputes/${action.data.disputeId}/evidence-pack?action=${action.id}`}
          target="_blank"
          rel="noreferrer"
          data-testid="evidence-pack-link"
        >
          📄 Preview the evidence pack (PDF)
        </a>
      )}
      <ActionDecision action={action} onDecided={setAction} />
    </article>
  );
}
