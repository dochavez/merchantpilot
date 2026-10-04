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
import { KIND_LABEL, STATUS_STYLE, decideActionClient, fetchActions, money } from './actions-client';

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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const decide = async (decision: 'approve' | 'reject') => {
    if (!actionId) return;
    setBusy(true);
    setError(null);
    try {
      setAction(await decideActionClient(actionId, decision));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

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
      {action.status === 'pending' ? (
        <div className="mt-3 flex gap-2">
          <button
            className="flex-1 rounded-md bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
            disabled={busy}
            onClick={() => decide('approve')}
          >
            {busy ? 'Working…' : isDraft ? 'Save draft' : 'Approve'}
          </button>
          <button
            className="rounded-md border border-[var(--line)] px-3 py-1.5 text-xs hover:bg-[var(--hover)] disabled:opacity-50"
            disabled={busy}
            onClick={() => decide('reject')}
          >
            Reject
          </button>
        </div>
      ) : (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
          <span className={`rounded px-1.5 py-0.5 font-semibold ${STATUS_STYLE[action.status]}`}>{action.status}</span>
          {action.executedVia && action.executedVia !== 'none' && (
            <span className="text-[var(--muted)]">via {action.executedVia === 'paypal-agent-toolkit' ? 'PayPal Agent Toolkit (sandbox)' : 'demo data'}</span>
          )}
        </div>
      )}
      {(error || action.error) && <div className="mt-1 text-[11px] text-rose-600">{error ?? action.error}</div>}
    </article>
  );
}
