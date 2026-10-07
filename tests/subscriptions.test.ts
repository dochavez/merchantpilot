import { describe, expect, it, vi } from 'vitest';
import ExcelJS from 'exceljs';

vi.stubEnv('PAYPAL_CLIENT_ID', '');
vi.stubEnv('PAYPAL_CLIENT_SECRET', '');

const { generateDemoDataset } = await import('@/lib/demo/generate');
const { subscriptionMetrics, detectAnomalies, monthlyValueOf } = await import('@/lib/analytics');
const { normalizeSubscription, normalizeTransaction, invoiceItems } = await import('@/lib/paypal/live-data');
const { alertFromWebhook } = await import('@/lib/alerts');
const { getDetails } = await import('@/lib/details');
const { runAgentTool } = await import('@/lib/agent-tools');
const { findEntity, projectRows } = await import('@/lib/export/entities');
const { buildReportModel } = await import('@/lib/export/report-model');
const { buildWorkbook } = await import('@/lib/export/xlsx');

const today = new Date('2026-10-06T12:00:00Z');

describe('demo subscriptions', () => {
  const ds = generateDemoDataset({ today });
  it('has subscribers, recurring payments and consistent MRR', () => {
    expect(ds.subscriptions!.length).toBeGreaterThan(100);
    const recurring = ds.transactions.filter((t) => t.subscriptionId);
    expect(recurring.length).toBeGreaterThan(100);
    expect(recurring.every((t) => t.type === 'Payment' && t.eventCode === 'T0002')).toBe(true);
    const m = subscriptionMetrics(ds, 30, today.getTime());
    const manual = ds.subscriptions!.filter((s) => s.status === 'ACTIVE').reduce((a, s) => a + monthlyValueOf(s), 0);
    expect(m.mrr).toBeCloseTo(manual, 1);
    expect(m.arr).toBeCloseTo(m.mrr * 12, 1);
    expect(m.suspendedSubscribers).toBeGreaterThan(0);
    expect(m.mrrAtRisk).toBeGreaterThan(0);
    expect(m.plans.reduce((a, p) => a + p.active, 0)).toBe(m.activeSubscribers);
  });
  it('surfaces the subscription stories as findings', () => {
    const ids = detectAnomalies(ds, today.getTime()).map((f) => f.id);
    expect(ids).toContain('subscriptions-suspended');
    expect(ids).toContain('subscription-churn-spike');
  });
  it('normalises billing cycles to a monthly value', () => {
    expect(monthlyValueOf({ amount: 29, interval: 'MONTH', intervalCount: 1 })).toBe(29);
    expect(monthlyValueOf({ amount: 17, interval: 'WEEK', intervalCount: 2 })).toBeCloseTo(36.98, 1);
    expect(monthlyValueOf({ amount: 190, interval: 'YEAR', intervalCount: 1 })).toBeCloseTo(15.83, 1);
  });
  it('gives invoices product lines that add up to the amount', () => {
    for (const inv of ds.invoices) {
      expect(inv.items!.length).toBeGreaterThan(0);
      expect(inv.items!.reduce((a, l) => a + l.total, 0)).toBeCloseTo(inv.amount, 1);
      expect(inv.itemsSummary).toMatch(/×\d+/);
    }
  });
});

describe('live PayPal subscription shapes', () => {
  const plan = { id: 'P-1', name: 'Coffee Club – Bi-weekly 500g', billing_cycles: [{ tenure_type: 'TRIAL', frequency: { interval_unit: 'DAY', interval_count: 7 } }, { tenure_type: 'REGULAR', frequency: { interval_unit: 'WEEK', interval_count: 2 }, pricing_scheme: { fixed_price: { value: '17.00', currency_code: 'USD' } } }] };
  it('normalises GET /v1/billing/subscriptions/{id} with its plan', () => {
    const row = normalizeSubscription(
      { id: 'I-ABC123DEF456', plan_id: 'P-1', status: 'ACTIVE', start_time: '2026-09-01T10:00:00Z', subscriber: { name: { given_name: 'Ana', surname: 'López' }, email_address: 'ana@example.com' }, billing_info: { next_billing_time: '2026-10-15T10:00:00Z', last_payment: { amount: { value: '17.00', currency_code: 'USD' }, time: '2026-10-01T10:00:00Z' }, failed_payments_count: 0 } },
      plan,
    );
    expect(row).toMatchObject({ subscriptionId: 'I-ABC123DEF456', planName: 'Coffee Club – Bi-weekly 500g', interval: 'WEEK', intervalCount: 2, amount: 17, subscriberName: 'Ana López', nextBillingDate: '2026-10-15' });
    expect(row.monthlyValue).toBeCloseTo(36.98, 1);
    const susp = normalizeSubscription({ id: 'I-X', plan_id: 'P-1', status: 'SUSPENDED', billing_info: { failed_payments_count: 2 } }, plan);
    expect(susp.monthlyValue).toBe(0);
    expect(susp.failedPayments).toBe(2);
  });
  it('links recurring transactions to their subscription', () => {
    const t = normalizeTransaction({ transaction_info: { transaction_id: 'TX1', transaction_event_code: 'T0002', transaction_amount: { value: '17.00', currency_code: 'USD' }, paypal_reference_id: 'I-ABC123DEF456', paypal_reference_id_type: 'SUB' } });
    expect(t.subscriptionId).toBe('I-ABC123DEF456');
    expect(t.relatedTransactionId).toBeUndefined();
    expect(t.type).toBe('Payment');
  });
  it('reads invoice line items', () => {
    expect(invoiceItems([{ name: 'Burr Grinder Pro', quantity: '2', unit_amount: { value: '189.00' } }])).toEqual([{ name: 'Burr Grinder Pro', quantity: 2, unitPrice: 189, total: 378 }]);
  });
  it('turns subscription webhooks into alerts', () => {
    expect(alertFromWebhook({ event_type: 'BILLING.SUBSCRIPTION.SUSPENDED', resource: { id: 'I-ABC123' } })?.severity).toBe('high');
    expect(alertFromWebhook({ event_type: 'BILLING.SUBSCRIPTION.CANCELLED', resource: { id: 'I-ABC123' } })?.prompt).toContain('win-back');
    expect(alertFromWebhook({ event_type: 'BILLING.SUBSCRIPTION.ACTIVATED', resource: { id: 'I-ABC123' } })?.title).toBe('New subscriber I-ABC123');
  });
});

describe('subscriptions in the app', () => {
  const ds = generateDemoDataset({ today });
  it('drill-down shows the subscription with its payments and subscriber', () => {
    const s = ds.subscriptions!.find((x) => x.status === 'ACTIVE')!;
    const d: any = getDetails(ds, [], 'subscription', s.subscriptionId);
    expect(d.subscription.subscriptionId).toBe(s.subscriptionId);
    expect(d.payments.length).toBeGreaterThan(0);
    expect(d.customer.segment).toBe('Subscriber');
  });
  it('agent tool returns MRR and filters by status', async () => {
    const r: any = await runAgentTool('paypal_subscriptions', { status: 'SUSPENDED' });
    expect(r.mrr).toBeGreaterThan(0);
    expect(r.subscriptions.every((x: any) => x.status === 'SUSPENDED')).toBe(true);
    expect(r.matching).toBe(r.suspendedSubscribers);
  });
  it('exports subscriptions to Power BI and the full Excel workbook', async () => {
    const m = buildReportModel(ds, [], 30, today.getTime());
    expect(projectRows(findEntity('Subscriptions')!, m).length).toBe(ds.subscriptions!.length);
    expect(projectRows(findEntity('InvoiceLines')!, m).length).toBeGreaterThan(ds.invoices.length);
    expect(projectRows(findEntity('Kpis')!, m)[0].Mrr).toBeGreaterThan(0);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await buildWorkbook(m, 'full')) as any);
    expect(wb.worksheets.map((w) => w.name)).toContain('Subscriptions');
    const simple = new ExcelJS.Workbook();
    await simple.xlsx.load((await buildWorkbook(m)) as any);
    expect(simple.worksheets).toHaveLength(4);
  });
});
