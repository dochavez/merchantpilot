/**
 * Accounting exports: PayPal activity as bank-statement CSVs that QuickBooks Online and Xero import
 * directly (PayPal treated as a bank account), with PayPal fees as their own lines, plus a monthly
 * summary an accountant can post as a journal.
 */
import type { Dataset, TransactionRow } from '../types';

const DAY = 86_400_000;
const r2 = (n: number) => Math.round(n * 100) / 100;
const esc = (v: unknown) => {
  const s = String(v ?? '');
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const csv = (rows: unknown[][]) => '﻿' + rows.map((r) => r.map(esc).join(',')).join('\r\n') + '\r\n';

function lines(ds: Dataset, days: number, now: number) {
  const since = now - days * DAY;
  const tx = ds.transactions
    .filter((t) => Date.parse(t.datetime ?? t.date) > since && t.status !== 'Pending' && t.status !== 'Denied')
    .sort((a, b) => a.datetime.localeCompare(b.datetime));
  const out: { date: string; amount: number; payee: string; description: string; reference: string }[] = [];
  const label = (t: TransactionRow) =>
    t.type === 'Payment' ? `Sale – ${t.item || 'PayPal payment'}` : t.type === 'Refund' ? `Refund – ${t.item}` : t.type === 'Chargeback' ? `Chargeback – ${t.item}` : `${t.type} – ${t.item || t.eventCode}`;
  for (const t of tx) {
    out.push({ date: t.date, amount: r2(t.gross), payee: t.customerName || t.customerEmail || 'PayPal', description: label(t), reference: t.transactionId });
    if (t.fee) out.push({ date: t.date, amount: r2(t.fee), payee: 'PayPal', description: `PayPal fee – ${t.transactionId}`, reference: t.transactionId });
  }
  return out;
}

const us = (d: string) => `${d.slice(5, 7)}/${d.slice(8, 10)}/${d.slice(0, 4)}`;
const uk = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;

/** QuickBooks Online "3-column" bank upload: Date (MM/DD/YYYY), Description, Amount. */
export function quickbooksCsv(ds: Dataset, days = 90, now = Date.now()) {
  return csv([['Date', 'Description', 'Amount'], ...lines(ds, days, now).map((l) => [us(l.date), `${l.description} (${l.payee}) ${l.reference}`, l.amount.toFixed(2)])]);
}

/** Xero bank statement import: Date (DD/MM/YYYY), Amount, Payee, Description, Reference. */
export function xeroCsv(ds: Dataset, days = 90, now = Date.now()) {
  return csv([['Date', 'Amount', 'Payee', 'Description', 'Reference'], ...lines(ds, days, now).map((l) => [uk(l.date), l.amount.toFixed(2), l.payee, l.description, l.reference])]);
}

/** Monthly summary for a journal entry: gross sales, refunds, chargebacks, fees, net. */
export function monthlySummary(ds: Dataset, days = 365, now = Date.now()) {
  const since = now - days * DAY;
  const m = new Map<string, { sales: number; refunds: number; chargebacks: number; fees: number; other: number }>();
  for (const t of ds.transactions) {
    if (Date.parse(t.datetime ?? t.date) <= since || t.status === 'Pending' || t.status === 'Denied') continue;
    const k = t.date.slice(0, 7);
    const row = m.get(k) ?? { sales: 0, refunds: 0, chargebacks: 0, fees: 0, other: 0 };
    if (t.type === 'Payment') row.sales += t.gross;
    else if (t.type === 'Refund') row.refunds += t.gross;
    else if (t.type === 'Chargeback') row.chargebacks += t.gross;
    else row.other += t.gross;
    row.fees += t.fee;
    m.set(k, row);
  }
  return [...m.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, r]) => ({ month, grossSales: r2(r.sales), refunds: r2(r.refunds), chargebacks: r2(r.chargebacks), paypalFees: r2(r.fees), other: r2(r.other), net: r2(r.sales + r.refunds + r.chargebacks + r.fees + r.other) }));
}

export function summaryCsv(ds: Dataset, days = 365, now = Date.now()) {
  const rows = monthlySummary(ds, days, now);
  return csv([['Month', 'Gross sales', 'Refunds', 'Chargebacks', 'PayPal fees', 'Other', 'Net'], ...rows.map((r) => [r.month, r.grossSales, r.refunds, r.chargebacks, r.paypalFees, r.other, r.net])]);
}
