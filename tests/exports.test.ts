import { describe, expect, it, afterEach } from 'vitest';
import ExcelJS from 'exceljs';
import { getDemoStore } from '@/lib/demo/store';
import { buildReportModel } from '@/lib/export/report-model';
import { buildWorkbook } from '@/lib/export/xlsx';
import { buildPdf } from '@/lib/export/pdf';
import { deterministicSummary } from '@/lib/export/summary';
import { ENTITIES, edmx, findEntity, projectRows, toCsv } from '@/lib/export/entities';
import { checkExportAuth } from '@/lib/export/auth';

const model = () => buildReportModel(getDemoStore(), [], 30);

describe('report model', () => {
  it('matches the dashboard KPIs and sums weekly/product data consistently', () => {
    const m = model();
    expect(m.moneyAtStake).toBeCloseTo(m.kpis.overdueInvoiceTotal + m.kpis.amountAtRiskInDisputes, 2);
    const weeklyOrders = m.weekly.reduce((s, w) => s + w.orders, 0);
    const productOrders = m.products.reduce((s, p) => s + p.orders, 0);
    expect(weeklyOrders).toBe(productOrders);
    expect(m.findings.length).toBeGreaterThan(0);
  });
});

describe('Excel export', () => {
  it('builds a simple 4-sheet workbook by default', async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await buildWorkbook(model())) as any);
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Summary', 'Transactions', 'Disputes', 'Invoices']);
  });
  it('builds the full workbook with native tables', async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await buildWorkbook(model(), 'full')) as any);
    const names = wb.worksheets.map((w) => w.name);
    expect(names).toEqual(expect.arrayContaining(['Summary', 'Findings', 'Transactions', 'Disputes', 'Invoices', 'Audit trail']));
    expect(wb.getWorksheet('Transactions')!.rowCount).toBe(getDemoStore().transactions.length + 1);
  });
});

describe('PDF export', () => {
  it('renders a multi-page PDF', async () => {
    const m = model();
    const pdf = await buildPdf(m, { text: deterministicSummary(m) + ' 🔴 emoji is stripped', byAi: false });
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(5000);
  });
});

describe('BI entities', () => {
  it('exposes every entity in valid EDMX with a key column', () => {
    const x = edmx();
    for (const e of ENTITIES) {
      expect(x).toContain(`<EntitySet Name="${e.name}"`);
      expect(e.columns.some((c) => c.name === e.key)).toBe(true);
    }
    expect(x.match(/<EntityType /g)?.length).toBe(ENTITIES.length);
  });

  it('keys are unique so Power BI can load each table', () => {
    const m = model();
    for (const e of ENTITIES) {
      const keys = projectRows(e, m).map((r) => r[e.key]);
      expect(new Set(keys).size, e.name).toBe(keys.length);
    }
  });

  it('writes CSV with header and escaping', () => {
    const csv = toCsv(findEntity('products')!, model());
    expect(csv.charCodeAt(0)).toBe(0xfeff); // BOM so Excel opens UTF-8 (accents) correctly
    const lines = csv.slice(1).trim().split('\r\n');
    expect(lines[0]).toBe('Product,Orders,Sales,RefundCount,Refunds,RefundRatePct');
    expect(lines.length).toBeGreaterThan(3);
  });
});

describe('export auth', () => {
  afterEach(() => delete process.env.EXPORT_API_KEY);
  it('is open without a key and enforced with one', () => {
    expect(checkExportAuth(new Request('http://x/api/odata'))).toBeNull();
    process.env.EXPORT_API_KEY = 's3cret';
    expect(checkExportAuth(new Request('http://x/api/odata'))?.status).toBe(401);
    expect(checkExportAuth(new Request('http://x/api/odata?key=s3cret'))).toBeNull();
    expect(checkExportAuth(new Request('http://x/api/odata', { headers: { authorization: 'Basic ' + Buffer.from('powerbi:s3cret').toString('base64') } }))).toBeNull();
    expect(checkExportAuth(new Request('http://x/api/odata', { headers: { authorization: 'Basic ' + Buffer.from('powerbi:nope').toString('base64') } }))?.status).toBe(401);
  });
});
