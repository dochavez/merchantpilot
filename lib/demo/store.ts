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
