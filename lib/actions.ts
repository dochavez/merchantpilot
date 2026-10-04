/**
 * Human-in-the-loop action queue.
 *
 * Agents can only PROPOSE money-moving actions. The merchant approves in the Action Center and only
 * then does the server execute them: via the PayPal Agent Toolkit in live mode, or against the demo
 * store in demo mode. Proposals are validated against real data before they are queued.
 */
import { dataMode } from './config';
import { getDataset, invalidateDataset, markInvoiceReminded } from './data';
import { demoAcceptDispute, demoInvoiceReminder, demoRefund } from './demo/store';
import { runToolkitTool } from './paypal/toolkit';
import type { ActionPayload, ProposedAction } from './types';

const KEY = Symbol.for('merchantpilot.actions');
type G = typeof globalThis & { [KEY]?: ProposedAction[] };

function store(): ProposedAction[] {
  const g = globalThis as G;
  if (!g[KEY]) g[KEY] = [];
  return g[KEY]!;
}

export function listActions(): ProposedAction[] {
  return [...store()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function clearActions() {
  (globalThis as G)[KEY] = [];
}

export class ActionValidationError extends Error {}

export async function proposeAction(input: ActionPayload & { rationale: string }): Promise<ProposedAction> {
  const ds = await getDataset();
  let title = '';
  let impact: ProposedAction['impact'];

  switch (input.kind) {
    case 'refund': {
      const tx = ds.transactions.find((t) => t.transactionId === input.data.captureId);
      if (!tx || tx.type !== 'Payment') throw new ActionValidationError(`No payment with capture/transaction id ${input.data.captureId}`);
      const refunded = ds.transactions
        .filter((t) => t.type === 'Refund' && t.relatedTransactionId === tx.transactionId)
        .reduce((s, t) => s - t.gross, 0);
      const refundable = Math.round((tx.gross - refunded) * 100) / 100;
      const amount = input.data.amount ?? refundable;
      if (amount <= 0 || amount > refundable + 0.001)
        throw new ActionValidationError(`Refund of ${amount} is not possible; refundable balance is ${refundable} ${tx.currency}`);
      input.data.currency = tx.currency;
      title = `Refund ${amount.toFixed(2)} ${tx.currency} to ${tx.customerName || tx.customerEmail} (${tx.item})`;
      impact = { amount: -amount, currency: tx.currency };
      break;
    }
    case 'invoice_reminder': {
      const inv = ds.invoices.find((i) => i.invoiceId === input.data.invoiceId || i.invoiceNumber === input.data.invoiceId);
      if (!inv) throw new ActionValidationError(`No invoice ${input.data.invoiceId}`);
      if (!['SENT', 'UNPAID', 'PARTIALLY_PAID'].includes(inv.status))
        throw new ActionValidationError(`Invoice ${inv.invoiceNumber} is ${inv.status}; only unpaid invoices can be reminded`);
      input.data.invoiceId = inv.invoiceId;
      title = `Send reminder for ${inv.invoiceNumber} to ${inv.recipientName} (${inv.amount.toFixed(2)} ${inv.currency}, ${inv.daysOverdue}d overdue)`;
      impact = { amount: inv.amount, currency: inv.currency };
      break;
    }
    case 'accept_dispute': {
      const d = ds.disputes.find((x) => x.disputeId === input.data.disputeId);
      if (!d) throw new ActionValidationError(`No dispute ${input.data.disputeId}`);
      if (d.status === 'RESOLVED') throw new ActionValidationError(`Dispute ${d.disputeId} is already resolved`);
      title = `Accept dispute ${d.disputeId} (${d.amount.toFixed(2)} ${d.currency}, ${d.reason.replaceAll('_', ' ').toLowerCase()})`;
      impact = { amount: -d.amount, currency: d.currency };
      break;
    }
    case 'dispute_response_draft': {
      const d = ds.disputes.find((x) => x.disputeId === input.data.disputeId);
      if (!d) throw new ActionValidationError(`No dispute ${input.data.disputeId}`);
      title = `Draft response for dispute ${d.disputeId}`;
      break;
    }
  }

  const dup = store().find(
    (a) => a.status === 'pending' && a.kind === input.kind && JSON.stringify(a.data) === JSON.stringify(input.data),
  );
  if (dup) return dup;

  const action: ProposedAction = {
    ...(input as ActionPayload),
    id: 'act_' + Math.random().toString(36).slice(2, 10),
    title,
    rationale: input.rationale,
    impact,
    status: 'pending',
    createdAt: new Date().toISOString(),
  };
  store().push(action);
  return action;
}

/** PayPal's accept-claim note only allows [A-Za-z0-9_-]{1,255} in the toolkit schema. */
export function toolkitSafeNote(note: string) {
  return (
    note
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^A-Za-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 255) || 'Accepted-by-merchant'
  );
}

export async function decideAction(id: string, decision: 'approve' | 'reject'): Promise<ProposedAction> {
  const action = store().find((a) => a.id === id);
  if (!action) throw new ActionValidationError(`Unknown action ${id}`);
  if (action.status !== 'pending') throw new ActionValidationError(`Action already ${action.status}`);
  action.decidedAt = new Date().toISOString();

  if (decision === 'reject') {
    action.status = 'rejected';
    return action;
  }

  action.status = 'approved';
  const live = dataMode() === 'live';
  try {
    let result: unknown;
    switch (action.kind) {
      case 'refund':
        result = live
          ? await runToolkitTool('create_refund', {
              capture_id: action.data.captureId,
              ...(action.data.amount ? { amount: { currency_code: action.data.currency ?? 'USD', value: action.data.amount.toFixed(2) } } : {}),
              ...(action.data.noteToPayer ? { note_to_payer: action.data.noteToPayer } : {}),
            })
          : demoRefund(action.data.captureId, action.data.amount, action.data.noteToPayer);
        break;
      case 'invoice_reminder':
        result = live
          ? await runToolkitTool('send_invoice_reminder', {
              invoice_id: action.data.invoiceId,
              ...(action.data.subject ? { subject: action.data.subject } : {}),
              ...(action.data.note ? { note: action.data.note } : {}),
            })
          : demoInvoiceReminder(action.data.invoiceId);
        if (live) markInvoiceReminded(action.data.invoiceId);
        break;
      case 'accept_dispute':
        result = live
          ? await runToolkitTool('accept_dispute_claim', { dispute_id: action.data.disputeId, note: toolkitSafeNote(action.data.note) })
          : demoAcceptDispute(action.data.disputeId);
        break;
      case 'dispute_response_draft':
        result = { saved: true, note: 'Draft saved for the merchant to review and submit with evidence in PayPal Resolution Center.' };
        break;
    }
    action.status = 'executed';
    action.executedVia = action.kind === 'dispute_response_draft' ? 'none' : live ? 'paypal-agent-toolkit' : 'demo-store';
    action.result = typeof result === 'string' ? result : JSON.stringify(result);
    invalidateDataset();
  } catch (e) {
    action.status = 'failed';
    action.error = (e as Error).message;
  }
  return action;
}
