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
import { cleanApprover, evaluatePolicy, getPolicy } from './policies';
import { getStore } from './store';
import type { ActionPayload, ProposedAction } from './types';

export async function listActions(): Promise<ProposedAction[]> {
  return getStore().listActions();
}

export async function clearActions() {
  await getStore().clearActions();
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
      if (inv.lastReminderAt && Date.now() - Date.parse(inv.lastReminderAt) < 3 * 86_400_000)
        throw new ActionValidationError(
          `MerchantPilot policy: ${inv.invoiceNumber} already got a reminder at ${inv.lastReminderAt}. Duplicate reminders are blocked for 3 days to avoid spamming the customer (this is an app rule, not a PayPal limit).`,
        );
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

  const existing = await getStore().listActions();
  const dup = existing.find((a) => a.status === 'pending' && a.kind === input.kind && JSON.stringify(a.data) === JSON.stringify(input.data));
  if (dup) return dup;

  const action: ProposedAction = {
    ...(input as ActionPayload),
    id: 'act_' + Math.random().toString(36).slice(2, 10),
    title,
    rationale: input.rationale,
    impact,
    status: 'pending',
    createdAt: new Date().toISOString(),
    approvals: [],
  };
  const decision = evaluatePolicy(action, await getPolicy(), existing);
  action.requiredApprovals = decision.requiredApprovals;
  action.policyNotes = decision.notes;
  await getStore().saveAction(action);

  if (decision.autoApprove) {
    // The merchant pre-approved this class of action in Rules: execute now, and log who allowed it.
    action.autoApproved = true;
    action.approvals = [{ by: 'Policy', at: new Date().toISOString() }];
    action.decidedBy = `Policy (${decision.notes.at(-1)?.replace('Auto-approved: ', '') ?? 'rules'})`;
    return execute(action);
  }
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

export async function decideAction(id: string, decision: 'approve' | 'reject', approverName?: string): Promise<ProposedAction> {
  const action = await getStore().getAction(id);
  if (!action) throw new ActionValidationError(`Unknown action ${id}`);
  if (action.status !== 'pending') throw new ActionValidationError(`Action already ${action.status}`);
  const approver = cleanApprover(approverName);
  const now = new Date().toISOString();

  if (decision === 'reject') {
    action.status = 'rejected';
    action.decidedAt = now;
    action.decidedBy = approver;
    await getStore().saveAction(action);
    return action;
  }

  // Re-check the rules at approval time (limits may have been reached since the proposal).
  const others = (await getStore().listActions()).filter((a) => a.id !== action.id);
  const policy = evaluatePolicy(action, await getPolicy(), others);
  if (policy.blockedReason) throw new ActionValidationError(policy.blockedReason);
  action.requiredApprovals = Math.max(action.requiredApprovals ?? 1, policy.requiredApprovals);
  action.approvals ??= [];
  if (action.approvals.some((x) => x.by.toLowerCase() === approver.toLowerCase()))
    throw new ActionValidationError(`${approver} already approved this. It needs a second, different approver (two-person rule).`);
  action.approvals.push({ by: approver, at: now });
  if (action.approvals.length < action.requiredApprovals) {
    await getStore().saveAction(action);
    return action; // still pending: waiting for the second approver
  }
  action.decidedBy = action.approvals.map((x) => x.by).join(' + ');
  return execute(action);
}

async function execute(action: ProposedAction): Promise<ProposedAction> {
  action.decidedAt = new Date().toISOString();
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
        if (live) await markInvoiceReminded(action.data.invoiceId);
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
  await getStore().saveAction(action);
  return action;
}
