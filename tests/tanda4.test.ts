import { beforeEach, describe, expect, it, vi } from 'vitest';
import ExcelJS from 'exceljs';

vi.stubEnv('PAYPAL_CLIENT_ID', '');
vi.stubEnv('PAYPAL_CLIENT_SECRET', '');
vi.stubEnv('BRIEF_SIGNING_SECRET', 'test-secret-for-encryption');

const { runInBusiness, currentBusiness } = await import('@/lib/business-context');
const { listBusinesses, resolveBusiness } = await import('@/lib/businesses');
const { getDataset, invalidateDataset } = await import('@/lib/data');
const { resetDemoStore } = await import('@/lib/demo/store');
const { clearActions } = await import('@/lib/actions');
const { buildPortfolio, healthScore } = await import('@/lib/portfolio');
const { getDetails } = await import('@/lib/details');
const { encrypt, decrypt } = await import('@/lib/crypto');
const { feedEdmx, feedRows, findFeedEntity } = await import('@/lib/export/feed');
const { loadReportModel } = await import('@/lib/export/load');
const { buildWorkbook } = await import('@/lib/export/xlsx');

beforeEach(async () => {
  resetDemoStore();
  await clearActions();
});

describe('multi-business', () => {
  it('lists the primary business plus the two demo businesses', async () => {
    const ids = (await listBusinesses()).map((b) => b.id);
    expect(ids).toEqual(['primary', 'cafe', 'academy']);
  });

  it('keeps each business data isolated', async () => {
    const cafe = await resolveBusiness('cafe');
    const academy = await resolveBusiness('academy');
    const [a, b, c] = await Promise.all([
      getDataset(),
      runInBusiness(cafe, async () => {
        expect(currentBusiness().id).toBe('cafe');
        return getDataset();
      }),
      runInBusiness(academy, getDataset),
    ]);
    expect(a.merchantName).not.toBe(b.merchantName);
    expect(b.invoices[0].invoiceNumber.startsWith('CAF')).toBe(true);
    expect(c.invoices[0].invoiceNumber.startsWith('ACA')).toBe(true);
    expect(new Set([a, b, c].map((d) => d.transactions[0].transactionId)).size).toBe(3);
    await runInBusiness(cafe, async () => invalidateDataset());
  });

  it('falls back to the primary business for unknown ids', async () => {
    expect((await resolveBusiness('nope')).id).toBe('primary');
  });

  it('encrypts added PayPal secrets', () => {
    const box = encrypt('super-secret');
    expect(box).not.toContain('super-secret');
    expect(decrypt(box)).toBe('super-secret');
  });
});

describe('portfolio', () => {
  it('scores health with reasons and grades', () => {
    const k = { grossSales: 10000, grossSalesPrevPeriod: 10000, salesChangePct: 0, disputesDueWithin5Days: 0, refundRatePct: 1, amountAtRiskInDisputes: 0, overdueInvoiceTotal: 0, openDisputes: 0, orders: 100 } as any;
    expect(healthScore(k, [], 0).grade).toBe('A');
    const bad = healthScore({ ...k, grossSales: 6000, salesChangePct: -40, refundRatePct: 9, overdueInvoiceTotal: 3000, disputesDueWithin5Days: 2 }, [{ severity: 'high' }, { severity: 'high' }], 3000);
    expect(bad.score).toBeLessThan(50);
    expect(bad.reasons.length).toBeGreaterThan(1);
  });

  it('builds a consolidated portfolio with one snapshot per business', async () => {
    const p = await buildPortfolio();
    expect(p.businesses).toHaveLength(3);
    expect(p.totals.sales30).toBeCloseTo(p.businesses.reduce((s, b) => s + (b.kpis?.grossSales ?? 0), 0), 0);
    expect(p.businesses.every((b) => b.health && b.health.score >= 0 && b.health.score <= 100)).toBe(true);
    expect(p.insights.length).toBeGreaterThan(0);
  });
});

describe('drill-down details', () => {
  it('returns invoice, customer, transaction and dispute details', async () => {
    const ds = await getDataset();
    const inv = ds.invoices.find((i) => i.daysOverdue > 0)!;
    const d1: any = getDetails(ds, [], 'invoice', inv.invoiceNumber);
    expect(d1.invoice.invoiceId).toBe(inv.invoiceId);
    expect(d1.timeline.length).toBeGreaterThanOrEqual(2);
    const cust: any = getDetails(ds, [], 'customer', inv.recipientEmail);
    expect(cust).not.toBeNull();
    const tx = ds.transactions.find((t) => t.type === 'Payment')!;
    expect((getDetails(ds, [], 'transaction', tx.transactionId) as any)).not.toBeNull();
    expect((getDetails(ds, [], 'dispute', ds.disputes[0].disputeId) as any).evidencePack).toContain('/evidence-pack');
    expect(getDetails(ds, [], 'invoice', 'does-not-exist')).toBeNull();
  });
});

describe('Power BI portfolio feed', () => {
  it('stacks every business with BusinessId and composite keys', async () => {
    const tx = findFeedEntity(true, 'Transactions')!;
    expect(tx.keys).toEqual(['BusinessId', 'TransactionId']);
    const rows = await feedRows(true, tx, 30, tx.columns.slice(0, 3));
    expect(new Set(rows.map((r) => r.BusinessId))).toEqual(new Set(['primary', 'cafe', 'academy']));
    expect(feedEdmx(true)).toContain('<PropertyRef Name="BusinessId"/><PropertyRef Name="TransactionId"/>');
  });

  it('has a Businesses table with health scores', async () => {
    const b = findFeedEntity(true, 'Businesses')!;
    const rows = await feedRows(true, b, 30);
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => typeof r.HealthScore === 'number' && /[ABCD]/.test(String(r.HealthGrade)))).toBe(true);
  });

  it('single-business feed only returns the current business', async () => {
    const inv = findFeedEntity(false, 'Invoices')!;
    const rows = await feedRows(false, inv, 30);
    expect(new Set(rows.map((r) => r.BusinessId))).toEqual(new Set(['primary']));
  });
});

describe('simple Excel', () => {
  it('Summary sheet lists top products', async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await buildWorkbook(await loadReportModel(30))) as any);
    const values: string[] = [];
    wb.getWorksheet('Summary')!.eachRow((r) => values.push(String(r.getCell(1).value ?? '')));
    expect(values).toContain('Top products');
  });
});
