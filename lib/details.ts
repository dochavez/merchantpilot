/**
 * Drill-down details for anything clickable in the dashboard: invoice, dispute, transaction,
 * customer. Each returns the record, its related records and the audit trail entries about it.
 */
import { disputeContext } from './analytics';
import type { Dataset, ProposedAction } from './types';

const r2 = (n: number) => Math.round(n * 100) / 100;
export type DetailKind = 'invoice' | 'dispute' | 'transaction' | 'customer';

function customerSummary(ds: Dataset, key: string) {
  const k = key.toLowerCase();
  const tx = ds.transactions.filter((t) => (t.customerEmail && t.customerEmail.toLowerCase() === k) || (t.customerName && t.customerName.toLowerCase() === k));
  const invoices = ds.invoices.filter((i) => i.recipientEmail.toLowerCase() === k || i.recipientName.toLowerCase() === k);
  if (!tx.length && !invoices.length) return null;
  const email = tx.find((t) => t.customerEmail)?.customerEmail ?? invoices[0]?.recipientEmail ?? '';
  const name = tx.find((t) => t.customerName)?.customerName ?? invoices[0]?.recipientName ?? key;
  const pays = tx.filter((t) => t.type === 'Payment');
  const refunds = tx.filter((t) => t.type === 'Refund');
  const disputes = ds.disputes.filter((d) => email && d.customerEmail === email);
  const spend = r2(pays.reduce((s, t) => s + t.gross, 0));
  const refunded = r2(-refunds.reduce((s, t) => s + t.gross, 0));
  // Spend percentile among all customers, for a simple segment.
  const spendBy = new Map<string, number>();
  for (const t of ds.transactions) if (t.type === 'Payment' && t.customerEmail) spendBy.set(t.customerEmail, (spendBy.get(t.customerEmail) ?? 0) + t.gross);
  const all = [...spendBy.values()].sort((a, b) => a - b);
  const rank = all.length ? all.filter((v) => v <= spend).length / all.length : 0;
  const products = new Map<string, number>();
  for (const p of pays) products.set(p.item, (products.get(p.item) ?? 0) + 1);
  const flags: string[] = [];
  if (spend > 0 && refunded / spend > 0.2) flags.push(`High refund ratio (${Math.round((refunded / spend) * 100)}% of spend)`);
  if (disputes.length) flags.push(`${disputes.length} dispute(s)`);
  if (invoices.some((i) => i.daysOverdue > 0)) flags.push('Has overdue invoices');
  return {
    name,
    email,
    segment: invoices.length && !pays.length ? 'Wholesale (invoiced)' : rank >= 0.9 ? 'VIP (top 10% spend)' : pays.length >= 3 ? 'Repeat customer' : pays.length ? 'Occasional' : 'Invoiced',
    orders: pays.length,
    lifetimeSpend: spend,
    refunds: refunds.length,
    refundedAmount: refunded,
    averageOrder: pays.length ? r2(spend / pays.length) : 0,
    firstOrder: pays[0]?.date ?? null,
    lastOrder: pays.at(-1)?.date ?? null,
    countries: [...new Set(tx.map((t) => t.country).filter(Boolean))],
    topProducts: [...products.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([item, n]) => ({ item, orders: n })),
    invoicesTotal: r2(invoices.reduce((s, i) => s + i.amount, 0)),
    invoicesOverdue: r2(invoices.filter((i) => i.daysOverdue > 0).reduce((s, i) => s + i.amount, 0)),
    flags,
    recent: [...tx].sort((a, b) => b.datetime.localeCompare(a.datetime)).slice(0, 8),
    disputes,
    invoices,
  };
}

const about = (actions: ProposedAction[], pred: (a: ProposedAction) => boolean) => actions.filter(pred).map((a) => ({ id: a.id, title: a.title, status: a.status, createdAt: a.createdAt, decidedBy: a.decidedBy }));

export function getDetails(ds: Dataset, actions: ProposedAction[], kind: DetailKind, id: string) {
  const key = id.trim();
  switch (kind) {
    case 'invoice': {
      const inv = ds.invoices.find((i) => i.invoiceId === key || i.invoiceNumber === key);
      if (!inv) return null;
      const others = ds.invoices.filter((i) => i.recipientEmail === inv.recipientEmail && i.invoiceId !== inv.invoiceId);
      return {
        kind,
        invoice: inv,
        timeline: [
          { at: inv.invoiceDate, what: 'Invoice issued' },
          { at: inv.dueDate, what: inv.daysOverdue > 0 ? `Due – now ${inv.daysOverdue} days overdue` : 'Due date' },
          ...(inv.lastReminderAt ? [{ at: inv.lastReminderAt.slice(0, 10), what: 'Reminder sent' }] : []),
          ...(inv.paymentPlan ? [{ at: inv.paymentPlan.offeredAt.slice(0, 10), what: `Payment plan offered: ${inv.paymentPlan.installments} payments of ${inv.paymentPlan.minimumAmountDue}` }] : []),
        ],
        customer: { name: inv.recipientName, email: inv.recipientEmail, otherInvoices: others.length, otherUnpaid: r2(others.filter((i) => i.status !== 'PAID' && i.status !== 'MARKED_AS_PAID').reduce((s, i) => s + i.amount, 0)), paidOnTime: others.filter((i) => i.status === 'PAID').length },
        actions: about(actions, (a) => (a.kind === 'invoice_reminder' || a.kind === 'payment_plan') && a.data.invoiceId === inv.invoiceId),
      };
    }
    case 'dispute': {
      const ctx = disputeContext(ds, key);
      if (!ctx) return null;
      return { kind, ...ctx, actions: about(actions, (a) => 'disputeId' in a.data && (a.data as { disputeId: string }).disputeId === key), evidencePack: `/api/disputes/${key}/evidence-pack` };
    }
    case 'transaction': {
      const tx = ds.transactions.find((t) => t.transactionId === key);
      if (!tx) return null;
      const original = tx.relatedTransactionId ? ds.transactions.find((t) => t.transactionId === tx.relatedTransactionId) : undefined;
      const related = ds.transactions.filter((t) => t.relatedTransactionId === tx.transactionId);
      const refunded = r2(-related.filter((t) => t.type === 'Refund').reduce((s, t) => s + t.gross, 0));
      return {
        kind,
        transaction: tx,
        original: original ?? null,
        related,
        refundable: tx.type === 'Payment' ? r2(tx.gross - refunded) : 0,
        dispute: ds.disputes.find((d) => d.transactionId === tx.transactionId) ?? null,
        customer: tx.customerEmail ? customerSummary(ds, tx.customerEmail) : null,
        actions: about(actions, (a) => a.kind === 'refund' && a.data.captureId === tx.transactionId),
      };
    }
    case 'customer': {
      const c = customerSummary(ds, key);
      return c ? { kind, customer: c, actions: about(actions, (a) => a.title.toLowerCase().includes(c.name.toLowerCase())) } : null;
    }
  }
}
