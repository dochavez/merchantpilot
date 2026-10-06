/**
 * Deterministic analytics over the dataset. The LLM never does arithmetic on raw rows: tools call
 * these functions and the agent explains the numbers. This keeps answers correct and auditable.
 */
import type { Dataset, DisputeRow, TransactionRow } from './types';

const DAY = 86_400_000;
const r2 = (n: number) => Math.round(n * 100) / 100;
const pct = (n: number) => Math.round(n * 1000) / 10;

function inLastDays(t: { datetime?: string; date?: string }, days: number, now: number, offsetDays = 0) {
  const ts = Date.parse(t.datetime ?? t.date ?? '');
  return ts <= now - offsetDays * DAY && ts > now - (offsetDays + days) * DAY;
}

export function overview(ds: Dataset, days = 30, now = Date.now()) {
  const cur = ds.transactions.filter((t) => inLastDays(t, days, now));
  const prev = ds.transactions.filter((t) => inLastDays(t, days, now, days));
  const sum = (rows: TransactionRow[], type: string, field: 'gross' | 'fee' | 'net' = 'gross') =>
    r2(rows.filter((t) => t.type === type).reduce((s, t) => s + t[field], 0));
  const sales = sum(cur, 'Payment');
  const salesPrev = sum(prev, 'Payment');
  const refunds = -sum(cur, 'Refund');
  const refundsPrev = -sum(prev, 'Refund');
  const chargebacks = -sum(cur, 'Chargeback');
  const fees = -r2(cur.filter((t) => t.type === 'Payment').reduce((s, t) => s + t.fee, 0));
  const orders = cur.filter((t) => t.type === 'Payment').length;
  const openDisputes = ds.disputes.filter((d) => d.status !== 'RESOLVED');
  const overdue = ds.invoices.filter((i) => i.daysOverdue > 0);
  return {
    periodDays: days,
    currency: ds.currency,
    grossSales: sales,
    grossSalesPrevPeriod: salesPrev,
    salesChangePct: salesPrev ? pct((sales - salesPrev) / salesPrev) : null,
    orders,
    averageOrderValue: orders ? r2(sales / orders) : 0,
    refunds,
    refundsPrevPeriod: refundsPrev,
    refundRatePct: sales ? pct(refunds / sales) : 0,
    refundRatePrevPct: salesPrev ? pct(refundsPrev / salesPrev) : 0,
    chargebacks,
    paypalFees: fees,
    netRevenue: r2(sales - refunds - chargebacks - fees),
    openDisputes: openDisputes.length,
    amountAtRiskInDisputes: r2(openDisputes.reduce((s, d) => s + d.amount, 0)),
    disputesDueWithin5Days: openDisputes.filter((d) => d.daysToRespond <= 5).length,
    overdueInvoices: overdue.length,
    overdueInvoiceTotal: r2(overdue.reduce((s, i) => s + i.amount, 0)),
  };
}

export interface Finding {
  id: string;
  severity: 'high' | 'medium' | 'low';
  title: string;
  detail: string;
  evidence: Record<string, unknown>;
  suggestedActions: string[];
}

export function detectAnomalies(ds: Dataset, now = Date.now()): Finding[] {
  const findings: Finding[] = [];
  const pays = ds.transactions.filter((t) => t.type === 'Payment');
  const refunds = ds.transactions.filter((t) => t.type === 'Refund');

  // 1. Refund-rate spike by item: last 10 days vs the 60 days before.
  const items = [...new Set(pays.map((p) => p.item))];
  for (const item of items) {
    const recentPays = pays.filter((p) => p.item === item && inLastDays(p, 10, now));
    const basePays = pays.filter((p) => p.item === item && inLastDays(p, 60, now, 10));
    const recentRef = refunds.filter((r) => r.item === item && inLastDays(r, 10, now));
    const baseRef = refunds.filter((r) => r.item === item && inLastDays(r, 60, now, 10));
    if (recentPays.length < 8 || recentRef.length < 5) continue;
    const recentRate = recentRef.length / recentPays.length;
    const baseRate = basePays.length ? baseRef.length / basePays.length : 0;
    if (recentRate >= 0.1 && recentRate > baseRate * 3) {
      const amount = r2(recentRef.reduce((s, r) => s - r.gross, 0));
      findings.push({
        id: `refund-spike:${item}`,
        severity: recentRate > 0.2 ? 'high' : 'medium',
        title: `Refund spike on "${item}"`,
        detail: `${pct(recentRate)}% of "${item}" orders were refunded in the last 10 days vs ${pct(baseRate)}% before (${recentRef.length} refunds, ${amount} ${ds.currency}).`,
        evidence: {
          item,
          recentOrders: recentPays.length,
          recentRefunds: recentRef.length,
          recentRefundRatePct: pct(recentRate),
          baselineRefundRatePct: pct(baseRate),
          refundedAmount: amount,
        },
        suggestedActions: [
          'Check the latest shipping batch / supplier for this item',
          'Proactively refund or replace open complaints for this item',
          'Pause promotion of this item until fixed',
        ],
      });
    }
  }

  // 2. Dispute clusters by reason + country among open disputes.
  const open = ds.disputes.filter((d) => d.status !== 'RESOLVED');
  const byTx = new Map(ds.transactions.map((t) => [t.transactionId, t]));
  const groups = new Map<string, DisputeRow[]>();
  for (const d of open) {
    const country = byTx.get(d.transactionId)?.country ?? '??';
    const key = `${d.reason}|${country}`;
    groups.set(key, [...(groups.get(key) ?? []), d]);
  }
  const reasonGroups = new Map<string, { countries: Set<string>; disputes: DisputeRow[] }>();
  for (const [key, list] of groups) {
    const [reason, country] = key.split('|');
    const g = reasonGroups.get(reason) ?? { countries: new Set(), disputes: [] };
    g.countries.add(country);
    g.disputes.push(...list);
    reasonGroups.set(reason, g);
  }
  for (const [reason, g] of reasonGroups) {
    if (g.disputes.length < 3) continue;
    const amount = r2(g.disputes.reduce((s, d) => s + d.amount, 0));
    findings.push({
      id: `dispute-cluster:${reason}`,
      severity: g.disputes.length >= 5 ? 'high' : 'medium',
      title: `${g.disputes.length} open "${reason.replaceAll('_', ' ').toLowerCase()}" disputes`,
      detail: `Concentrated in ${[...g.countries].join(', ')}; ${amount} ${ds.currency} at risk. Nearest deadline in ${Math.min(...g.disputes.map((d) => d.daysToRespond))} days.`,
      evidence: { reason, countries: [...g.countries], disputeIds: g.disputes.map((d) => d.disputeId), amountAtRisk: amount },
      suggestedActions:
        reason === 'MERCHANDISE_OR_SERVICE_NOT_RECEIVED'
          ? ['Attach tracking numbers as evidence', 'Contact the carrier for these destinations', 'Refund buyers whose packages are confirmed lost']
          : ['Review each dispute and respond before the deadline', 'Accept claims that are clearly valid to avoid chargeback fees'],
    });
  }

  // 3. Deadlines.
  const urgent = open.filter((d) => d.daysToRespond <= 5);
  if (urgent.length) {
    findings.push({
      id: 'dispute-deadlines',
      severity: 'high',
      title: `${urgent.length} dispute(s) need a response within 5 days`,
      detail: urgent.map((d) => `${d.disputeId} (${d.daysToRespond}d, ${d.amount} ${d.currency})`).join(', '),
      evidence: { disputeIds: urgent.map((d) => d.disputeId) },
      suggestedActions: ['Respond or accept before the deadline; missing it means automatic loss'],
    });
  }

  // 4. Overdue invoices.
  const overdue = ds.invoices.filter((i) => i.daysOverdue > 0).sort((a, b) => b.daysOverdue - a.daysOverdue);
  if (overdue.length) {
    const total = r2(overdue.reduce((s, i) => s + i.amount, 0));
    findings.push({
      id: 'overdue-invoices',
      severity: overdue[0].daysOverdue > 30 ? 'high' : 'medium',
      title: `${overdue.length} overdue invoice(s) worth ${total} ${ds.currency}`,
      detail: overdue.map((i) => `${i.invoiceNumber} – ${i.recipientName} – ${i.daysOverdue} days late`).join('; '),
      evidence: { invoiceIds: overdue.map((i) => i.invoiceId), total },
      suggestedActions: ['Send a friendly payment reminder', 'Offer a payment plan for the oldest invoice'],
    });
  }

  // 5. Sales momentum: last 14 days vs the 14 before.
  const s14 = pays.filter((p) => inLastDays(p, 14, now)).reduce((s, p) => s + p.gross, 0);
  const p14 = pays.filter((p) => inLastDays(p, 14, now, 14)).reduce((s, p) => s + p.gross, 0);
  if (p14 > 500 && s14 < p14 * 0.92) {
    const drop = pct((p14 - s14) / p14);
    const byItem = [...new Set(pays.map((p) => p.item))]
      .map((item) => {
        const a = pays.filter((p) => p.item === item && inLastDays(p, 14, now)).reduce((s, p) => s + p.gross, 0);
        const b = pays.filter((p) => p.item === item && inLastDays(p, 14, now, 14)).reduce((s, p) => s + p.gross, 0);
        return { item, change: r2(a - b) };
      })
      .sort((x, y) => x.change - y.change);
    findings.push({
      id: 'sales-decline',
      severity: drop >= 15 ? 'high' : 'medium',
      title: `Sales down ${drop}% in the last 14 days`,
      detail: `${r2(s14)} ${ds.currency} vs ${r2(p14)} before. Biggest drops: ${byItem
        .slice(0, 3)
        .map((x) => `${x.item} (${x.change})`)
        .join(', ')}.`,
      evidence: { last14: r2(s14), previous14: r2(p14), dropPct: drop, byItem: byItem.slice(0, 5) },
      suggestedActions: ['Check opening hours / stock of the products that dropped', 'Run a promotion on the slowest weekday', 'Ask returning customers for feedback'],
    });
  }

  const rank = { high: 0, medium: 1, low: 2 } as const;
  return findings.sort((a, b) => rank[a.severity] - rank[b.severity]);
}

export interface TxFilter {
  customerEmail?: string;
  item?: string;
  type?: string;
  status?: string;
  country?: string;
  fromDate?: string;
  toDate?: string;
  limit?: number;
}

export function findTransactions(ds: Dataset, f: TxFilter) {
  const lc = (s?: string) => s?.toLowerCase();
  let rows = ds.transactions.filter(
    (t) =>
      (!f.customerEmail || lc(t.customerEmail)?.includes(lc(f.customerEmail)!)) &&
      (!f.item || lc(t.item)?.includes(lc(f.item)!)) &&
      (!f.type || lc(t.type) === lc(f.type)) &&
      (!f.status || lc(t.status) === lc(f.status)) &&
      (!f.country || lc(t.country) === lc(f.country)) &&
      (!f.fromDate || t.date >= f.fromDate) &&
      (!f.toDate || t.date <= f.toDate),
  );
  const total = rows.length;
  rows = [...rows].sort((a, b) => b.datetime.localeCompare(a.datetime)).slice(0, Math.min(f.limit ?? 25, 100));
  return { total, returned: rows.length, transactions: rows };
}

export function disputeContext(ds: Dataset, disputeId: string) {
  const d = ds.disputes.find((x) => x.disputeId === disputeId);
  if (!d) return null;
  const tx = ds.transactions.find((t) => t.transactionId === d.transactionId);
  const history = tx ? ds.transactions.filter((t) => t.customerEmail && t.customerEmail === tx.customerEmail) : [];
  const evidence: string[] = [];
  if (d.reason === 'MERCHANDISE_OR_SERVICE_NOT_RECEIVED') evidence.push('Carrier tracking number and delivery scan', 'Shipping address matches PayPal address');
  if (d.reason === 'MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED') evidence.push('Product listing photos/description at time of sale', 'Return/replacement offer sent to buyer');
  if (d.reason === 'UNAUTHORISED') evidence.push('IP / device match with previous orders', 'Delivery confirmation with signature');
  if (d.reason === 'CREDIT_NOT_PROCESSED') evidence.push('Refund receipt or proof that return was not received');
  return {
    dispute: d,
    transaction: tx ?? null,
    customer: tx
      ? {
          email: tx.customerEmail,
          name: tx.customerName,
          country: tx.country,
          lifetimeOrders: history.filter((t) => t.type === 'Payment').length,
          lifetimeRefunds: history.filter((t) => t.type === 'Refund').length,
          lifetimeSpend: r2(history.filter((t) => t.type === 'Payment').reduce((s, t) => s + t.gross, 0)),
        }
      : null,
    recommendedEvidence: evidence,
  };
}
