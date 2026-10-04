/**
 * Executive PDF report (pdfkit, vector charts, standard fonts – no external assets).
 * Page 1: summary + KPIs + money at stake. Page 2: trends. Page 3: priorities, disputes, invoices.
 * Last: audit trail of AI proposals and human decisions.
 */
import PDFDocument from 'pdfkit';
import type { ReportModel } from './report-model';

const C = {
  brand: '#0070E0',
  navy: '#003087',
  ink: '#0F172A',
  muted: '#64748B',
  line: '#E2E8F0',
  soft: '#F1F5F9',
  red: '#DC2626',
  redSoft: '#FEE2E2',
  amber: '#B45309',
  amberSoft: '#FEF3C7',
  green: '#059669',
  refund: '#F59E0B',
};
const W = 612;
const H = 792;
const M = 44;
const CW = W - 2 * M;

/** Standard PDF fonts only cover WinAnsi: drop emoji and other symbols they can't draw. */
const t = (s: unknown) =>
  String(s ?? '')
    .replace(/[​-‍﻿]/g, '')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^\x09\x0A\x0D\x20-\x7E -ÿ–—•…€]/g, '');

export async function buildPdf(m: ReportModel, summary: { text: string; byAi: boolean }): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'LETTER', margin: M, bufferPages: true, info: { Title: `${m.merchantName} – PayPal business report`, Author: 'MerchantPilot' } });
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((res) => doc.on('end', () => res(Buffer.concat(chunks))));

  const money = (n: number, digits = 0) => new Intl.NumberFormat('en-US', { style: 'currency', currency: m.currency, maximumFractionDigits: digits, minimumFractionDigits: digits }).format(n);
  const k = m.kpis;

  const sectionTitle = (title: string, y?: number) => {
    if (y !== undefined) doc.y = y;
    doc.font('Helvetica-Bold').fontSize(13).fillColor(C.ink).text(t(title), M, doc.y);
    doc.moveTo(M, doc.y + 3).lineTo(M + CW, doc.y + 3).lineWidth(1).strokeColor(C.line).stroke();
    doc.y += 10;
  };
  const ensure = (h: number) => {
    if (doc.y + h > H - M - 20) doc.addPage();
  };

  /* -------------------------------------------------------------- page 1 header */
  doc.rect(0, 0, W, 96).fill(C.navy);
  doc.rect(0, 96, W, 4).fill(C.brand);
  doc.roundedRect(M, 28, 40, 40, 8).fill(C.brand);
  doc.font('Helvetica-Bold').fontSize(16).fillColor('#FFFFFF').text('MP', M, 40, { width: 40, align: 'center' });
  doc.font('Helvetica-Bold').fontSize(20).fillColor('#FFFFFF').text(t(m.merchantName), M + 54, 30, { width: CW - 54 });
  doc
    .font('Helvetica')
    .fontSize(10)
    .fillColor('#C7D7FE')
    .text(t(`PayPal business report · last ${m.periodDays} days · ${m.generatedAt.slice(0, 10)} · ${m.mode === 'live' ? 'live PayPal data (sandbox)' : 'demo data'}`), M + 54, 56, { width: CW - 54 });

  /* -------------------------------------------------------------- executive summary */
  doc.y = 120;
  sectionTitle('Executive summary');
  doc.font('Helvetica').fontSize(10.5).fillColor(C.ink).text(t(summary.text), M, doc.y, { width: CW, lineGap: 3 });
  doc.moveDown(0.3);
  doc.font('Helvetica-Oblique').fontSize(8).fillColor(C.muted).text(summary.byAi ? 'Written by MerchantPilot AI from the figures in this report.' : 'Generated from the figures in this report.', M, doc.y, { width: CW });
  doc.y += 14;

  /* -------------------------------------------------------------- KPI cards */
  const cards: { label: string; value: string; delta?: number | null; good?: 'up' | 'down' }[] = [
    { label: 'Gross sales', value: money(k.grossSales), delta: k.salesChangePct, good: 'up' },
    { label: 'Orders', value: String(k.orders) },
    { label: 'Net revenue', value: money(k.netRevenue) },
    { label: 'Avg. order value', value: money(k.averageOrderValue, 2) },
    { label: 'Refunds', value: money(k.refunds), delta: k.refundsPrevPeriod ? Math.round((k.refunds / k.refundsPrevPeriod - 1) * 1000) / 10 : null, good: 'down' },
    { label: 'Refund rate', value: `${k.refundRatePct}%`, delta: k.refundRatePrevPct ? Math.round((k.refundRatePct / k.refundRatePrevPct - 1) * 1000) / 10 : null, good: 'down' },
    { label: 'PayPal fees', value: money(k.paypalFees) },
    { label: 'Open disputes', value: String(k.openDisputes) },
  ];
  const gap = 10;
  const cw = (CW - gap * 3) / 4;
  const ch = 58;
  const y0 = doc.y;
  cards.forEach((c, i) => {
    const x = M + (i % 4) * (cw + gap);
    const y = y0 + Math.floor(i / 4) * (ch + gap);
    doc.roundedRect(x, y, cw, ch, 6).fillAndStroke('#FFFFFF', C.line);
    doc.font('Helvetica').fontSize(8.5).fillColor(C.muted).text(t(c.label.toUpperCase()), x + 10, y + 9, { width: cw - 20 });
    doc.font('Helvetica-Bold').fontSize(16).fillColor(C.ink).text(t(c.value), x + 10, y + 22, { width: cw - 20 });
    if (c.delta !== undefined && c.delta !== null) {
      const up = c.delta >= 0;
      const good = (up && c.good === 'up') || (!up && c.good === 'down');
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor(good ? C.green : C.red).text(`${up ? '+' : ''}${c.delta}% vs prev.`, x + 10, y + 42, { width: cw - 20 });
    }
  });
  doc.y = y0 + 2 * ch + gap + 16;

  /* -------------------------------------------------------------- money at stake */
  const sy = doc.y;
  doc.roundedRect(M, sy, CW, 66, 8).fill(C.redSoft);
  doc.font('Helvetica-Bold').fontSize(9).fillColor(C.red).text('MONEY YOU CAN STILL ACT ON', M + 16, sy + 12);
  doc.font('Helvetica-Bold').fontSize(24).fillColor(C.red).text(money(m.moneyAtStake), M + 16, sy + 26);
  doc
    .font('Helvetica')
    .fontSize(10)
    .fillColor(C.ink)
    .text(t(`${money(k.overdueInvoiceTotal)} in ${k.overdueInvoices} overdue invoice(s)\n${money(k.amountAtRiskInDisputes)} at risk in ${k.openDisputes} open dispute(s) · ${k.disputesDueWithin5Days} due within 5 days`), M + 230, sy + 18, {
      width: CW - 246,
      lineGap: 4,
    });
  doc.y = sy + 84;

  /* -------------------------------------------------------------- top priorities (short) */
  sectionTitle('Top priorities');
  m.findings.slice(0, 4).forEach((f) => {
    ensure(40);
    const y = doc.y;
    const sev = f.severity === 'high';
    doc.roundedRect(M, y, 52, 15, 3).fill(sev ? C.redSoft : C.amberSoft);
    doc.font('Helvetica-Bold').fontSize(7.5).fillColor(sev ? C.red : C.amber).text(f.severity.toUpperCase(), M, y + 4, { width: 52, align: 'center' });
    doc.font('Helvetica-Bold').fontSize(10).fillColor(C.ink).text(t(f.title), M + 62, y + 2, { width: CW - 62 });
    doc.font('Helvetica').fontSize(9).fillColor(C.muted).text(t(`Next step: ${f.suggestedActions[0] ?? ''}`), M + 62, doc.y + 1, { width: CW - 62 });
    doc.y += 8;
  });

  /* -------------------------------------------------------------- page 2: trends */
  doc.addPage();
  sectionTitle('Weekly sales vs refunds (last 13 weeks)', M);
  {
    const weeks = m.weekly.slice(-13);
    const x0 = M + 40;
    const top = doc.y + 6;
    const ph = 170;
    const pw = CW - 50;
    const max = Math.max(1, ...weeks.map((w) => w.sales));
    const niceMax = Math.ceil(max / 5000) * 5000 || max;
    for (let g = 0; g <= 4; g++) {
      const gy = top + ph - (ph * g) / 4;
      doc.moveTo(x0, gy).lineTo(x0 + pw, gy).lineWidth(0.5).strokeColor(C.line).stroke();
      doc.font('Helvetica').fontSize(7).fillColor(C.muted).text(money((niceMax * g) / 4), M - 6, gy - 4, { width: 42, align: 'right' });
    }
    const slot = pw / Math.max(1, weeks.length);
    const bw = Math.min(16, slot / 3);
    weeks.forEach((w, i) => {
      const cx = x0 + slot * i + slot / 2;
      const hs = (w.sales / niceMax) * ph;
      const hr = (w.refunds / niceMax) * ph;
      doc.rect(cx - bw - 1, top + ph - hs, bw, hs).fill(C.brand);
      doc.rect(cx + 1, top + ph - hr, bw, Math.max(hr, 0.5)).fill(C.refund);
      doc.font('Helvetica').fontSize(6.5).fillColor(C.muted).text(w.weekStart.slice(5), cx - 16, top + ph + 4, { width: 32, align: 'center' });
    });
    const ly = top + ph + 20;
    doc.rect(x0, ly, 8, 8).fill(C.brand);
    doc.font('Helvetica').fontSize(8).fillColor(C.ink).text('Sales', x0 + 12, ly);
    doc.rect(x0 + 60, ly, 8, 8).fill(C.refund);
    doc.text('Refunds', x0 + 72, ly);
    doc.y = ly + 26;
  }

  sectionTitle('Products: sales and refund rate (last 90 days)');
  {
    const rows = m.products.slice(0, 8);
    const maxS = Math.max(1, ...rows.map((p) => p.sales));
    const labelW = 150;
    const barW = CW - labelW - 150;
    rows.forEach((p) => {
      const y = doc.y;
      const hot = p.refundRatePct >= 10;
      doc.font('Helvetica').fontSize(9).fillColor(C.ink).text(t(p.item), M, y + 2, { width: labelW - 8, ellipsis: true, lineBreak: false });
      doc.rect(M + labelW, y + 2, Math.max(1, (p.sales / maxS) * barW), 11).fill(C.brand);
      doc.font('Helvetica').fontSize(8.5).fillColor(C.ink).text(money(p.sales), M + labelW + barW + 6, y + 3, { width: 70, lineBreak: false });
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor(hot ? C.red : C.muted).text(`${p.refundRatePct}% refunded`, M + labelW + barW + 76, y + 3, { width: 74, lineBreak: false });
      doc.y = y + 19;
    });
    doc.y += 10;
  }

  sectionTitle('Sales by country (last 90 days)');
  table(
    doc,
    ['Country', 'Orders', 'Sales', 'Open disputes'],
    m.countries.slice(0, 8).map((c) => [c.country, String(c.orders), money(c.sales), String(c.openDisputes)]),
    [120, 100, 140, CW - 360],
    { alignRight: [1, 2, 3] },
  );

  /* -------------------------------------------------------------- page 3: details */
  doc.addPage();
  sectionTitle('Everything that needs attention', M);
  m.findings.forEach((f) => {
    ensure(70);
    const sev = f.severity === 'high';
    doc.font('Helvetica-Bold').fontSize(10).fillColor(sev ? C.red : C.amber).text(t(`${f.severity.toUpperCase()} · ${f.title}`), M, doc.y, { width: CW });
    doc.font('Helvetica').fontSize(9).fillColor(C.ink).text(t(f.detail), M, doc.y + 2, { width: CW, lineGap: 1.5 });
    doc.font('Helvetica').fontSize(9).fillColor(C.muted).text(t(f.suggestedActions.map((a) => `• ${a}`).join('\n')), M + 10, doc.y + 2, { width: CW - 10, lineGap: 1.5 });
    doc.y += 10;
  });

  const openDisputes = m.dataset.disputes.filter((d) => d.status !== 'RESOLVED').sort((a, b) => a.daysToRespond - b.daysToRespond);
  ensure(80);
  sectionTitle(`Open disputes (${openDisputes.length})`);
  table(
    doc,
    ['Dispute', 'Reason', 'Amount', 'Respond in'],
    openDisputes.slice(0, 12).map((d) => [d.disputeId, d.reason.replaceAll('_', ' ').toLowerCase(), money(d.amount, 2), `${d.daysToRespond} days`]),
    [120, 230, 80, CW - 430],
    { alignRight: [2, 3], highlight: (i) => (openDisputes[i].daysToRespond <= 5 ? C.redSoft : undefined) },
  );
  if (openDisputes.length > 12) doc.font('Helvetica-Oblique').fontSize(8).fillColor(C.muted).text(`+ ${openDisputes.length - 12} more in the Excel export.`, M, doc.y + 2);

  const overdue = m.dataset.invoices.filter((i) => i.daysOverdue > 0).sort((a, b) => b.daysOverdue - a.daysOverdue);
  ensure(80);
  doc.y += 8;
  sectionTitle(`Overdue invoices (${overdue.length})`);
  table(
    doc,
    ['Invoice', 'Customer', 'Amount', 'Days late', 'Last reminder'],
    overdue.map((i) => [i.invoiceNumber, i.recipientName, money(i.amount, 2), String(i.daysOverdue), i.lastReminderAt ? i.lastReminderAt.slice(0, 10) : '—']),
    [90, 190, 90, 70, CW - 440],
    { alignRight: [2, 3], highlight: (i) => (overdue[i].daysOverdue > 30 ? C.redSoft : undefined) },
  );

  /* -------------------------------------------------------------- audit trail */
  ensure(100);
  doc.y += 8;
  sectionTitle('AI actions & approvals (audit trail)');
  if (!m.actions.length) {
    doc.font('Helvetica').fontSize(9).fillColor(C.muted).text('No actions proposed yet in this session. Every money-moving action requires the merchant\'s approval and is logged here.', M, doc.y, { width: CW });
  } else {
    table(
      doc,
      ['When', 'Action', 'Status', 'Executed via'],
      m.actions.map((a) => [a.createdAt.slice(0, 16).replace('T', ' '), a.title, a.status, a.executedVia === 'paypal-agent-toolkit' ? 'PayPal Agent Toolkit' : (a.executedVia ?? '—')]),
      [90, 270, 60, CW - 420],
    );
  }

  /* -------------------------------------------------------------- footer on every page */
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    doc.page.margins.bottom = 0;
    doc
      .font('Helvetica')
      .fontSize(7.5)
      .fillColor(C.muted)
      .text(t(`MerchantPilot · AI finance copilot for PayPal merchants · numbers computed from PayPal data, never by the AI · page ${i + 1} of ${range.count}`), M, H - 28, { width: CW, align: 'center', lineBreak: false });
  }

  doc.end();
  return done;
}

function table(
  doc: PDFKit.PDFDocument,
  headers: string[],
  rows: string[][],
  widths: number[],
  opts: { alignRight?: number[]; highlight?: (i: number) => string | undefined } = {},
) {
  const rowH = 17;
  const draw = (cells: string[], y: number, header: boolean, fill?: string) => {
    if (header) doc.rect(M, y, CW, rowH).fill(C.soft);
    else if (fill) doc.rect(M, y, CW, rowH).fill(fill);
    let x = M;
    cells.forEach((c, i) => {
      doc
        .font(header ? 'Helvetica-Bold' : 'Helvetica')
        .fontSize(8.5)
        .fillColor(header ? C.muted : C.ink)
        .text(t(c), x + 6, y + 5, { width: widths[i] - 12, align: opts.alignRight?.includes(i) ? 'right' : 'left', lineBreak: false, ellipsis: true });
      x += widths[i];
    });
    doc.moveTo(M, y + rowH).lineTo(M + CW, y + rowH).lineWidth(0.5).strokeColor(C.line).stroke();
  };
  let y = doc.y;
  draw(headers, y, true);
  y += rowH;
  rows.forEach((r, i) => {
    if (y + rowH > H - M - 20) {
      doc.addPage();
      y = M;
      draw(headers, y, true);
      y += rowH;
    }
    draw(r, y, false, opts.highlight?.(i));
    y += rowH;
  });
  doc.y = y + 6;
  doc.x = M;
}
