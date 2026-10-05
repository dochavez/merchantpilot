/**
 * Excel workbook export: an executive summary plus every dataset as a native, filterable Excel
 * table (ready for pivot tables), with currency formats, data bars and deadline highlighting.
 */
import ExcelJS from 'exceljs';
import type { ReportModel } from './report-model';

const BRAND = 'FF0070E0';
const INK = 'FF0F172A';
const MUTED = 'FF64748B';
const RED = 'FFFDE2E1';
const AMBER = 'FFFEF3C7';

type Col = { header: string; key: string; width?: number; fmt?: 'money' | 'pct' | 'int' | 'date' };

function moneyFmt(currency: string) {
  return currency === 'USD' ? '"$"#,##0.00' : `#,##0.00 "${currency}"`;
}

function addTableSheet(
  wb: ExcelJS.Workbook,
  name: string,
  cols: Col[],
  rows: Record<string, unknown>[],
  currency: string,
  opts: { highlight?: (r: Record<string, unknown>) => string | undefined; dataBar?: string[] } = {},
) {
  const ws = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
  const safeRows = rows.length ? rows : [Object.fromEntries(cols.map((c) => [c.key, null]))];
  ws.addTable({
    name: name.replace(/[^A-Za-z0-9]/g, '') + 'Table',
    ref: 'A1',
    headerRow: true,
    style: { theme: 'TableStyleMedium2', showRowStripes: true },
    columns: cols.map((c) => ({ name: c.header, filterButton: true })),
    rows: safeRows.map((r) => cols.map((c) => (r[c.key] ?? null) as ExcelJS.CellValue)),
  });
  cols.forEach((c, i) => {
    const col = ws.getColumn(i + 1);
    col.width = c.width ?? Math.max(12, c.header.length + 4);
    if (c.fmt === 'money') col.numFmt = moneyFmt(currency);
    if (c.fmt === 'pct') col.numFmt = '0.0"%"';
    if (c.fmt === 'int') col.numFmt = '#,##0';
  });
  if (opts.highlight && rows.length) {
    rows.forEach((r, i) => {
      const fill = opts.highlight!(r);
      if (!fill) return;
      ws.getRow(i + 2).eachCell((cell) => (cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } }));
    });
  }
  for (const key of opts.dataBar ?? []) {
    const idx = cols.findIndex((c) => c.key === key);
    if (idx < 0 || !rows.length) continue;
    const letter = ws.getColumn(idx + 1).letter;
    ws.addConditionalFormatting({
      ref: `${letter}2:${letter}${rows.length + 1}`,
      rules: [{ type: 'dataBar', priority: 1, cfvo: [{ type: 'min' }, { type: 'max' }], color: { argb: BRAND } } as any],
    });
  }
  return ws;
}

export async function buildWorkbook(m: ReportModel): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'MerchantPilot';
  wb.created = new Date(m.generatedAt);
  const cur = m.currency;
  const k = m.kpis;

  /* ---------------------------------------------------------------- Summary */
  const s = wb.addWorksheet('Summary', { views: [{ showGridLines: false }] });
  s.columns = [{ width: 50 }, { width: 18 }, { width: 18 }, { width: 14 }, { width: 60 }];
  s.mergeCells('A1:E1');
  s.getCell('A1').value = `${m.merchantName} — PayPal business report`;
  s.getCell('A1').font = { size: 18, bold: true, color: { argb: INK } };
  s.mergeCells('A2:E2');
  s.getCell('A2').value = `Last ${m.periodDays} days vs previous ${m.periodDays} · generated ${m.generatedAt.slice(0, 16).replace('T', ' ')} UTC · ${m.mode === 'live' ? 'live PayPal data (sandbox)' : 'demo data'} · by MerchantPilot`;
  s.getCell('A2').font = { size: 10, color: { argb: MUTED } };

  const kpiRows: [string, number | null, number | null, 'money' | 'int' | 'pct'][] = [
    ['Gross sales', k.grossSales, k.grossSalesPrevPeriod, 'money'],
    ['Orders', k.orders, null, 'int'],
    ['Average order value', k.averageOrderValue, null, 'money'],
    ['Refunds', k.refunds, k.refundsPrevPeriod, 'money'],
    ['Refund rate (%)', k.refundRatePct, k.refundRatePrevPct, 'pct'],
    ['Chargebacks', k.chargebacks, null, 'money'],
    ['PayPal fees', k.paypalFees, null, 'money'],
    ['Net revenue', k.netRevenue, null, 'money'],
    ['Open disputes', k.openDisputes, null, 'int'],
    ['Amount at risk in disputes', k.amountAtRiskInDisputes, null, 'money'],
    ['Overdue invoices', k.overdueInvoices, null, 'int'],
    ['Overdue invoice total', k.overdueInvoiceTotal, null, 'money'],
  ];
  const head = s.getRow(4);
  head.values = ['KPI', 'This period', 'Previous', 'Change'];
  head.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  [1, 2, 3, 4].forEach((c) => (head.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND } }));
  kpiRows.forEach(([label, v, prev, fmt], i) => {
    const row = s.getRow(5 + i);
    row.getCell(1).value = label;
    row.getCell(2).value = v;
    row.getCell(3).value = prev;
    if (prev !== null && v !== null) row.getCell(4).value = { formula: `IF(C${5 + i}=0,"",B${5 + i}/C${5 + i}-1)` };
    const nf = fmt === 'money' ? moneyFmt(cur) : fmt === 'pct' ? '0.0"%"' : '#,##0';
    row.getCell(2).numFmt = nf;
    row.getCell(3).numFmt = nf;
    row.getCell(4).numFmt = '+0.0%;-0.0%;0.0%';
    row.getCell(1).border = { bottom: { style: 'hair', color: { argb: 'FFE2E8F0' } } };
  });
  const stakeRow = 5 + kpiRows.length + 1;
  s.getCell(`A${stakeRow}`).value = 'Money you can still act on';
  s.getCell(`A${stakeRow}`).font = { bold: true, size: 12 };
  s.getCell(`B${stakeRow}`).value = m.moneyAtStake;
  s.getCell(`B${stakeRow}`).numFmt = moneyFmt(cur);
  s.getCell(`B${stakeRow}`).font = { bold: true, size: 12, color: { argb: 'FFB91C1C' } };
  s.getCell(`E${stakeRow}`).value = 'Overdue invoices + open disputes';
  s.getCell(`E${stakeRow}`).font = { color: { argb: MUTED } };

  const fRow = stakeRow + 2;
  s.getCell(`A${fRow}`).value = 'What needs your attention';
  s.getCell(`A${fRow}`).font = { bold: true, size: 12 };
  m.findings.slice(0, 8).forEach((f, i) => {
    const r = s.getRow(fRow + 1 + i);
    r.getCell(1).value = f.title;
    r.getCell(2).value = f.severity.toUpperCase();
    r.getCell(2).font = { bold: true, color: { argb: f.severity === 'high' ? 'FFB91C1C' : 'FFB45309' } };
    s.mergeCells(`C${fRow + 1 + i}:E${fRow + 1 + i}`);
    r.getCell(3).value = f.suggestedActions[0] ?? '';
    r.getCell(3).alignment = { wrapText: true, vertical: 'top' };
  });

  /* ---------------------------------------------------------------- Detail sheets */
  addTableSheet(
    wb,
    'Findings',
    [
      { header: 'Severity', key: 'severity', width: 10 },
      { header: 'Finding', key: 'title', width: 50 },
      { header: 'Detail', key: 'detail', width: 80 },
      { header: 'Suggested actions', key: 'actions', width: 70 },
    ],
    m.findings.map((f) => ({ severity: f.severity, title: f.title, detail: f.detail, actions: f.suggestedActions.join(' · ') })),
    cur,
    { highlight: (r) => (r.severity === 'high' ? RED : undefined) },
  );
  addTableSheet(
    wb,
    'Weekly',
    [
      { header: 'Week starting', key: 'weekStart', width: 14 },
      { header: 'Sales', key: 'sales', fmt: 'money', width: 14 },
      { header: 'Refunds', key: 'refunds', fmt: 'money', width: 14 },
      { header: 'Orders', key: 'orders', fmt: 'int' },
      { header: 'Refund rate %', key: 'refundRatePct', fmt: 'pct', width: 14 },
    ],
    m.weekly as any,
    cur,
    { dataBar: ['sales'] },
  );
  addTableSheet(
    wb,
    'Products',
    [
      { header: 'Product', key: 'item', width: 30 },
      { header: 'Orders', key: 'orders', fmt: 'int' },
      { header: 'Sales', key: 'sales', fmt: 'money', width: 14 },
      { header: 'Refunds (#)', key: 'refundCount', fmt: 'int' },
      { header: 'Refunds', key: 'refunds', fmt: 'money', width: 14 },
      { header: 'Refund rate %', key: 'refundRatePct', fmt: 'pct', width: 14 },
    ],
    m.products as any,
    cur,
    { dataBar: ['sales', 'refundRatePct'] },
  );
  addTableSheet(
    wb,
    'Countries',
    [
      { header: 'Country', key: 'country' },
      { header: 'Orders', key: 'orders', fmt: 'int' },
      { header: 'Sales', key: 'sales', fmt: 'money', width: 14 },
      { header: 'Open disputes', key: 'openDisputes', fmt: 'int', width: 14 },
    ],
    m.countries as any,
    cur,
    { dataBar: ['sales'] },
  );
  addTableSheet(
    wb,
    'Transactions',
    [
      { header: 'Date', key: 'date', width: 12 },
      { header: 'Transaction ID', key: 'transactionId', width: 22 },
      { header: 'Type', key: 'type' },
      { header: 'Status', key: 'status', width: 16 },
      { header: 'Product', key: 'item', width: 28 },
      { header: 'Customer', key: 'customerName', width: 22 },
      { header: 'Email', key: 'customerEmail', width: 28 },
      { header: 'Country', key: 'country', width: 10 },
      { header: 'Gross', key: 'gross', fmt: 'money', width: 13 },
      { header: 'Fee', key: 'fee', fmt: 'money', width: 11 },
      { header: 'Net', key: 'net', fmt: 'money', width: 13 },
      { header: 'Currency', key: 'currency', width: 10 },
      { header: 'Related transaction', key: 'relatedTransactionId', width: 22 },
    ],
    [...m.dataset.transactions].sort((a, b) => b.datetime.localeCompare(a.datetime)) as any,
    cur,
  );
  addTableSheet(
    wb,
    'Disputes',
    [
      { header: 'Dispute ID', key: 'disputeId', width: 20 },
      { header: 'Status', key: 'status', width: 26 },
      { header: 'Reason', key: 'reason', width: 34 },
      { header: 'Amount', key: 'amount', fmt: 'money', width: 13 },
      { header: 'Opened', key: 'createdDate', width: 12 },
      { header: 'Respond by', key: 'responseDueDate', width: 12 },
      { header: 'Days to respond', key: 'daysToRespond', fmt: 'int', width: 15 },
      { header: 'Product', key: 'item', width: 26 },
      { header: 'Customer email', key: 'customerEmail', width: 28 },
      { header: 'Transaction ID', key: 'transactionId', width: 22 },
    ],
    m.dataset.disputes as any,
    cur,
    { highlight: (r) => (r.status !== 'RESOLVED' && Number(r.daysToRespond) <= 5 ? RED : r.status !== 'RESOLVED' ? AMBER : undefined) },
  );
  addTableSheet(
    wb,
    'Invoices',
    [
      { header: 'Invoice #', key: 'invoiceNumber', width: 14 },
      { header: 'Customer', key: 'recipientName', width: 26 },
      { header: 'Email', key: 'recipientEmail', width: 28 },
      { header: 'Status', key: 'status', width: 12 },
      { header: 'Amount', key: 'amount', fmt: 'money', width: 13 },
      { header: 'Invoice date', key: 'invoiceDate', width: 12 },
      { header: 'Due date', key: 'dueDate', width: 12 },
      { header: 'Days overdue', key: 'daysOverdue', fmt: 'int', width: 13 },
      { header: 'Last reminder', key: 'lastReminderAt', width: 20 },
    ],
    m.dataset.invoices as any,
    cur,
    { highlight: (r) => (Number(r.daysOverdue) > 30 ? RED : Number(r.daysOverdue) > 0 ? AMBER : undefined) },
  );
  addTableSheet(
    wb,
    'Audit trail',
    [
      { header: 'Proposed at', key: 'createdAt', width: 20 },
      { header: 'Action', key: 'kind', width: 22 },
      { header: 'Title', key: 'title', width: 50 },
      { header: 'Status', key: 'status', width: 11 },
      { header: 'Decided at', key: 'decidedAt', width: 20 },
      { header: 'Decided by', key: 'decidedBy', width: 24 },
      { header: 'Policy', key: 'policy', width: 40 },
      { header: 'Executed via', key: 'executedVia', width: 22 },
      { header: 'AI rationale', key: 'rationale', width: 60 },
      { header: 'Result / error', key: 'outcome', width: 40 },
    ],
    m.actions.map((a) => ({ ...a, outcome: a.error ?? a.result ?? '', policy: (a.policyNotes ?? []).join(' · ') })) as any,
    cur,
  );

  const about = wb.addWorksheet('About');
  about.columns = [{ width: 110 }];
  [
    'About this report',
    '',
    '• Every number is computed deterministically from your PayPal data (Transaction Search, Disputes and Invoicing APIs). The AI explains numbers; it never invents them.',
    '• Refunds and fees are shown as positive amounts in the Summary; transaction rows keep PayPal\'s sign (refunds negative).',
    '• "Money you can still act on" = overdue invoices + amount at risk in open disputes.',
    '• Audit trail lists every action the AI proposed and what the merchant decided. Nothing moves money without human approval.',
    '• Want this live in Power BI or Excel? Use the OData feed shown in MerchantPilot → Export → "Connect Power BI / Excel".',
  ].forEach((t, i) => {
    const c = about.getCell(`A${i + 1}`);
    c.value = t;
    c.alignment = { wrapText: true };
    if (i === 0) c.font = { bold: true, size: 14 };
  });

  return Buffer.from(await wb.xlsx.writeBuffer());
}
