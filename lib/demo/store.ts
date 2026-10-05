/**
 * In-memory, mutable demo store. Approved actions in demo mode change this data so the dashboard
 * visibly reacts (a refund row appears, a dispute is resolved, an invoice records a reminder).
 * Lives on globalThis so Next.js dev hot-reloads keep the state. `resetDemoStore()` restores it.
 */
import { generateDemoDataset, round2 } from './generate';
import type { Dataset, TransactionRow } from '../types';

const KEY = Symbol.for('merchantpilot.demoStore');
type G = typeof globalThis & { [KEY]?: Dataset };

export function getDemoStore(): Dataset {
  const g = globalThis as G;
  if (!g[KEY]) g[KEY] = generateDemoDataset();
  return g[KEY]!;
}

export function resetDemoStore(): Dataset {
  const g = globalThis as G;
  g[KEY] = generateDemoDataset();
  return g[KEY]!;
}

function randomId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789';
  return Array.from({ length: 17 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

export function demoRefund(captureId: string, amount?: number, note?: string) {
  const store = getDemoStore();
  const tx = store.transactions.find((t) => t.transactionId === captureId && t.type === 'Payment');
  if (!tx) throw new Error(`Capture ${captureId} not found in demo data`);
  const alreadyRefunded = store.transactions
    .filter((t) => t.type === 'Refund' && t.relatedTransactionId === captureId)
    .reduce((s, t) => s + -t.gross, 0);
  const refundable = round2(tx.gross - alreadyRefunded);
  const value = round2(amount ?? refundable);
  if (value <= 0 || value > refundable + 0.001) {
    throw new Error(`Refund amount ${value} exceeds refundable balance ${refundable}`);
  }
  const now = new Date();
  const refund: TransactionRow = {
    ...tx,
    transactionId: randomId(),
    eventCode: 'T1107',
    type: 'Refund',
    status: 'Completed',
    gross: -value,
    fee: 0,
    net: -value,
    date: now.toISOString().slice(0, 10),
    datetime: now.toISOString(),
    relatedTransactionId: captureId,
  };
  store.transactions.push(refund);
  tx.status = value < refundable ? 'Partially refunded' : tx.status;
  return { refundId: refund.transactionId, status: 'COMPLETED', amount: value, note };
}

export function demoInvoiceReminder(invoiceId: string) {
  const store = getDemoStore();
  const inv = store.invoices.find((i) => i.invoiceId === invoiceId);
  if (!inv) throw new Error(`Invoice ${invoiceId} not found in demo data`);
  if (inv.status !== 'SENT' && inv.status !== 'UNPAID' && inv.status !== 'PARTIALLY_PAID') {
    throw new Error(`Invoice ${inv.invoiceNumber} is ${inv.status}; reminders only apply to unpaid invoices`);
  }
  inv.lastReminderAt = new Date().toISOString();
  return { invoiceId, invoiceNumber: inv.invoiceNumber, remindedAt: inv.lastReminderAt };
}

export function demoAcceptDispute(disputeId: string) {
  const store = getDemoStore();
  const d = store.disputes.find((x) => x.disputeId === disputeId);
  if (!d) throw new Error(`Dispute ${disputeId} not found in demo data`);
  if (d.status === 'RESOLVED') throw new Error(`Dispute ${disputeId} is already resolved`);
  d.status = 'RESOLVED';
  d.outcome = 'RESOLVED_BUYER_FAVOUR';
  d.daysToRespond = 0;
  const tx = store.transactions.find((t) => t.transactionId === d.transactionId);
  if (tx) {
    const now = new Date();
    store.transactions.push({
      ...tx,
      transactionId: randomId(),
      eventCode: 'T1106',
      type: 'Chargeback',
      status: 'Completed',
      gross: -d.amount,
      fee: 0,
      net: -d.amount,
      date: now.toISOString().slice(0, 10),
      datetime: now.toISOString(),
      relatedTransactionId: tx.transactionId,
    });
  }
  return { disputeId, status: 'RESOLVED' };
}

export function demoSubmitEvidence(disputeId: string) {
  const d = getDemoStore().disputes.find((x) => x.disputeId === disputeId);
  if (!d) throw new Error(`Dispute ${disputeId} not found in demo data`);
  if (d.status === 'RESOLVED') throw new Error(`Dispute ${disputeId} is already resolved`);
  d.status = 'UNDER_REVIEW';
  d.stage = 'INQUIRY';
  d.daysToRespond = 0;
  d.evidenceSubmittedAt = new Date().toISOString();
  return { disputeId, status: 'UNDER_REVIEW', via: 'demo provide-evidence', attachments: 1 };
}

export function demoPaymentPlan(invoiceId: string, installments: number, minimumAmountDue: number) {
  const inv = getDemoStore().invoices.find((i) => i.invoiceId === invoiceId);
  if (!inv) throw new Error(`Invoice ${invoiceId} not found in demo data`);
  const now = new Date().toISOString();
  inv.paymentPlan = { installments, minimumAmountDue, offeredAt: now };
  inv.lastReminderAt = now;
  return { invoiceId, partialPayments: true, minimumAmountDue, payUrl: `https://www.sandbox.paypal.com/invoice/p/#${invoiceId}` };
}

/** Demo "webhook": a buyer in Mexico opens an item-not-received dispute on a recent pour-over kit order. */
export function demoNewDispute() {
  const store = getDemoStore();
  const used = new Set(store.disputes.map((d) => d.transactionId));
  const tx = [...store.transactions].reverse().find((t) => t.type === 'Payment' && t.status === 'Completed' && !used.has(t.transactionId) && t.gross >= 40) ?? store.transactions.find((t) => t.type === 'Payment')!;
  const now = new Date();
  const due = new Date(now.getTime() + 10 * 86_400_000);
  const d = {
    disputeId: 'PP-D-' + Math.floor(1_000_000 + Math.random() * 8_999_999),
    transactionId: tx.transactionId,
    reason: 'MERCHANDISE_OR_SERVICE_NOT_RECEIVED',
    status: 'WAITING_FOR_SELLER_RESPONSE' as const,
    stage: 'INQUIRY',
    amount: round2(tx.gross),
    currency: tx.currency,
    createdDate: now.toISOString().slice(0, 10),
    responseDueDate: due.toISOString().slice(0, 10),
    daysToRespond: 10,
    customerEmail: tx.customerEmail,
    item: tx.item,
  };
  store.disputes.unshift(d);
  return d;
}
