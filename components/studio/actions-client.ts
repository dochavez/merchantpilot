/**
 * Browser helpers shared by the Action Center and the in-chat proposal cards, so both stay in sync.
 * The server route /api/actions/[id] remains the ONLY path that executes money-moving actions.
 */
import type { ProposedAction } from '@/lib/types';
import { ACTIONS_CHANGED_EVENT } from './paypal-agent';

/** Fired after an action was approved (executed) so the dashboard reloads its PayPal data. */
export const ACTION_EXECUTED_EVENT = 'merchantpilot:action-executed';

export async function fetchActions(): Promise<ProposedAction[]> {
  const res = await fetch('/api/actions', { cache: 'no-store' });
  return res.ok ? ((await res.json()).actions as ProposedAction[]) : [];
}

/** Who is approving in this browser (demo identity, used for the two-person rule and audit trail). */
const APPROVER_KEY = 'merchantpilot.approver';
export const APPROVER_EVENT = 'merchantpilot:approver-changed';
export function getApprover(): string {
  try {
    return localStorage.getItem(APPROVER_KEY) || 'Owner';
  } catch {
    return 'Owner';
  }
}
export function setApprover(name: string) {
  try {
    localStorage.setItem(APPROVER_KEY, name.trim().slice(0, 40) || 'Owner');
  } catch {
    /* storage unavailable */
  }
  window.dispatchEvent(new CustomEvent(APPROVER_EVENT));
}

export async function decideActionClient(id: string, decision: 'approve' | 'reject'): Promise<ProposedAction | null> {
  const res = await fetch(`/api/actions/${id}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ decision, approver: getApprover() }),
  });
  const body = await res.json().catch(() => ({}));
  window.dispatchEvent(new CustomEvent(ACTIONS_CHANGED_EVENT));
  if (decision === 'approve' && body?.action?.status === 'executed') window.dispatchEvent(new CustomEvent(ACTION_EXECUTED_EVENT));
  if (body?.action) return body.action as ProposedAction;
  throw new Error(body?.error ?? `HTTP ${res.status}`);
}

export const money = (n: number, c: string) => new Intl.NumberFormat('en-US', { style: 'currency', currency: c }).format(n);

export const KIND_LABEL: Record<ProposedAction['kind'], string> = {
  refund: 'Refund',
  invoice_reminder: 'Invoice reminder',
  accept_dispute: 'Accept dispute',
  dispute_response_draft: 'Dispute response draft',
};

export const STATUS_STYLE: Record<ProposedAction['status'], string> = {
  pending: 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200',
  approved: 'bg-sky-100 text-sky-900',
  executed: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200',
  rejected: 'bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200',
  failed: 'bg-rose-100 text-rose-900 dark:bg-rose-900/40 dark:text-rose-200',
};
