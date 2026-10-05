'use client';

/**
 * The decision part of an action card, shared by the Action Center and the in-chat cards:
 * policy badges, two-person approval progress, Approve/Reject (or the final status), errors.
 */
import { useEffect, useState } from 'react';
import type { ProposedAction } from '@/lib/types';
import { APPROVER_EVENT, STATUS_STYLE, decideActionClient, getApprover } from './actions-client';

export function useApprover() {
  const [name, setName] = useState('Owner');
  useEffect(() => {
    const read = () => setName(getApprover());
    read();
    window.addEventListener(APPROVER_EVENT, read);
    return () => window.removeEventListener(APPROVER_EVENT, read);
  }, []);
  return name;
}

export default function ActionDecision({ action, onDecided }: { action: ProposedAction; onDecided?: (a: ProposedAction) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const approver = useApprover();
  const required = action.requiredApprovals ?? 1;
  const approvals = (action.approvals ?? []).filter((x) => x.by !== 'Policy');
  const iApproved = approvals.some((x) => x.by.toLowerCase() === approver.toLowerCase());
  const isDraft = action.kind === 'dispute_response_draft';

  const decide = async (decision: 'approve' | 'reject') => {
    setBusy(true);
    setError(null);
    try {
      const a = await decideActionClient(action.id, decision);
      if (a) onDecided?.(a);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      {!!action.policyNotes?.length && (
        <div className="mt-2 flex flex-wrap gap-1">
          {action.policyNotes.map((n) => (
            <span
              key={n}
              className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                /limit/i.test(n) ? 'bg-rose-100 text-rose-800' : /Auto-approved/.test(n) ? 'bg-emerald-100 text-emerald-800' : 'bg-violet-100 text-violet-800'
              }`}
              data-testid="policy-note"
            >
              {n}
            </span>
          ))}
        </div>
      )}
      {action.status === 'pending' ? (
        <>
          {required > 1 && (
            <div className="mt-2 text-[11px] text-[var(--muted)]" data-testid="approval-progress">
              <span className="font-semibold text-[var(--text)]">
                {approvals.length} of {required} approvals
              </span>
              {approvals.length > 0 && <> · approved by {approvals.map((x) => x.by).join(', ')}</>}
            </div>
          )}
          <div className="mt-3 flex gap-2">
            <button
              className="flex-1 rounded-md bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
              disabled={busy || iApproved}
              onClick={() => decide('approve')}
              title={iApproved ? 'Waiting for a second, different approver' : undefined}
            >
              {busy ? 'Working…' : iApproved ? `Waiting for 2nd approver` : isDraft ? 'Save draft' : required > 1 ? `Approve as ${approver} (${approvals.length + 1}/${required})` : 'Approve'}
            </button>
            <button
              className="rounded-md border border-[var(--line)] px-3 py-1.5 text-xs hover:bg-[var(--hover)] disabled:opacity-50"
              disabled={busy}
              onClick={() => decide('reject')}
            >
              Reject
            </button>
          </div>
        </>
      ) : (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
          <span className={`rounded px-1.5 py-0.5 font-semibold ${STATUS_STYLE[action.status]}`}>{action.autoApproved && action.status === 'executed' ? 'auto-executed' : action.status}</span>
          {action.decidedBy && <span className="text-[var(--muted)]">by {action.decidedBy}</span>}
          {action.executedVia && action.executedVia !== 'none' && (
            <span className="text-[var(--muted)]">· via {action.executedVia === 'paypal-agent-toolkit' ? 'PayPal Agent Toolkit (sandbox)' : 'demo data'}</span>
          )}
        </div>
      )}
      {(error || action.error) && <div className="mt-1 text-[11px] text-rose-600">{error ?? action.error}</div>}
    </div>
  );
}
