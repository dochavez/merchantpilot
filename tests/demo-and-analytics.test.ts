import { describe, expect, it } from 'vitest';
import { generateDemoDataset } from '@/lib/demo/generate';
import { detectAnomalies, disputeContext, findTransactions, overview } from '@/lib/analytics';

const today = new Date('2026-10-20T15:00:00Z');
const ds = generateDemoDataset({ today });

describe('demo dataset', () => {
  it('is deterministic for a given day', () => {
    const again = generateDemoDataset({ today });
    expect(again.transactions.length).toBe(ds.transactions.length);
    expect(again.transactions[10]).toEqual(ds.transactions[10]);
  });

  it('has 90 days of realistic rows', () => {
    expect(ds.transactions.length).toBeGreaterThan(2000);
    const days = new Set(ds.transactions.map((t) => t.date));
    expect(days.size).toBeGreaterThanOrEqual(88);
    for (const t of ds.transactions.slice(0, 200)) {
      expect(t.transactionId).toMatch(/^[A-Z0-9]{17}$/);
      expect(Number.isFinite(t.gross)).toBe(true);
    }
  });

  it('contains the three storylines', () => {
    expect(ds.invoices.filter((i) => i.daysOverdue > 0).map((i) => i.daysOverdue).sort((a, b) => b - a)).toEqual([34, 12, 6]);
    const open = ds.disputes.filter((d) => d.status !== 'RESOLVED');
    expect(open.length).toBeGreaterThanOrEqual(4);
  });
});

describe('analytics', () => {
  const now = today.getTime();

  it('computes an overview', () => {
    const o = overview(ds, 30, now);
    expect(o.grossSales).toBeGreaterThan(10_000);
    expect(o.refundRatePct).toBeGreaterThan(o.refundRatePrevPct);
    expect(o.overdueInvoices).toBe(3);
  });

  it('detects the refund spike, dispute cluster and overdue invoices', () => {
    const f = detectAnomalies(ds, now);
    const ids = f.map((x) => x.id);
    expect(ids).toContain('refund-spike:Ceramic Pour-Over Kit');
    expect(ids).toContain('overdue-invoices');
    expect(ids.some((id) => id.startsWith('dispute-cluster:MERCHANDISE_OR_SERVICE_NOT_RECEIVED'))).toBe(true);
    expect(f[0].severity).toBe('high');
  });

  it('filters transactions and builds dispute context', () => {
    const r = findTransactions(ds, { item: 'pour-over', type: 'Refund', limit: 5 });
    expect(r.returned).toBeLessThanOrEqual(5);
    expect(r.transactions.every((t) => t.type === 'Refund' && t.item.includes('Pour-Over'))).toBe(true);
    const ctx = disputeContext(ds, ds.disputes[0].disputeId);
    expect(ctx?.transaction?.transactionId).toBe(ds.disputes[0].transactionId);
    expect(ctx?.recommendedEvidence.length).toBeGreaterThan(0);
  });
});
