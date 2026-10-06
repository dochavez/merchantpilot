/** Portfolio PDF: consolidated view + one section per business (same visual language as the report). */
import PDFDocument from 'pdfkit';
import type { Portfolio } from '../portfolio';

const C = { brand: '#0070E0', navy: '#003087', ink: '#0F172A', muted: '#64748B', line: '#E2E8F0', soft: '#F1F5F9', red: '#DC2626', green: '#059669', amber: '#D97706' };
const GRADE: Record<string, string> = { A: C.green, B: C.brand, C: C.amber, D: C.red };
const M = 44;
const W = 612 - 2 * M;
const t = (s: unknown) =>
  String(s ?? '')
    .replace(/−/g, '-')
    .replace(/[^\x09\x0A\x0D\x20-\x7E -ÿ–—•…]/g, '');

export async function buildPortfolioPdf(p: Portfolio, summary: { text: string; byAi: boolean }): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'LETTER', margin: M, bufferPages: true, info: { Title: 'MerchantPilot – portfolio report', Author: 'MerchantPilot' } });
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((r) => doc.on('end', () => r(Buffer.concat(chunks))));
  const cur = p.totals.currency;
  const money = (n?: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: cur, maximumFractionDigits: 0 }).format(n ?? 0);
  const section = (title: string) => {
    doc.moveDown(0.5);
    doc.font('Helvetica-Bold').fontSize(13).fillColor(C.ink).text(t(title), M, doc.y);
    doc.moveTo(M, doc.y + 3).lineTo(M + W, doc.y + 3).lineWidth(1).strokeColor(C.line).stroke();
    doc.y += 10;
  };

  doc.rect(0, 0, 612, 90).fill(C.navy);
  doc.font('Helvetica-Bold').fontSize(20).fillColor('#FFFFFF').text('Portfolio report', M, 28);
  doc.font('Helvetica').fontSize(10).fillColor('#C7D7FE').text(t(`${p.businesses.length} businesses · last 30 days · ${p.generatedAt.slice(0, 10)} · MerchantPilot`), M, 56);
  doc.y = 108;

  // totals cards
  const cards: [string, string][] = [
    ['SALES (ALL)', money(p.totals.sales30)],
    ['NET REVENUE', money(p.totals.netRevenue30)],
    ['MONEY AT STAKE', money(p.totals.moneyAtStake)],
    ['AVG HEALTH', `${p.totals.averageHealth}/100`],
  ];
  const cw = (W - 30) / 4;
  cards.forEach(([k, v], i) => {
    const x = M + i * (cw + 10);
    doc.roundedRect(x, doc.y, cw, 52, 6).fillAndStroke('#FFFFFF', C.line);
    doc.font('Helvetica').fontSize(8).fillColor(C.muted).text(k, x + 10, doc.y + 9, { width: cw - 20 });
    doc.font('Helvetica-Bold').fontSize(15).fillColor(k === 'MONEY AT STAKE' ? C.red : C.ink).text(t(v), x + 10, doc.y + 22, { width: cw - 20 });
  });
  doc.y += 70;

  section('Owner briefing');
  doc.font('Helvetica').fontSize(10.5).fillColor(C.ink).text(t(summary.text), M, doc.y, { width: W, lineGap: 3 });
  doc.font('Helvetica-Oblique').fontSize(8).fillColor(C.muted).text(summary.byAi ? 'Written by MerchantPilot AI from the figures in this report.' : 'Generated from the figures in this report.', M, doc.y + 4);

  section('Businesses compared');
  const cols = [150, 50, 75, 50, 55, 75, W - 455];
  const head = ['Business', 'Health', 'Sales 30d', 'vs prev', 'Refunds', 'At stake', 'Top issue'];
  const row = (cells: string[], y: number, header = false, color?: string) => {
    if (header) doc.rect(M, y, W, 18).fill(C.soft);
    let x = M;
    cells.forEach((c, i) => {
      doc
        .font(header ? 'Helvetica-Bold' : 'Helvetica')
        .fontSize(8.5)
        .fillColor(header ? C.muted : i === 1 && color ? color : C.ink)
        .text(t(c), x + 4, y + 5, { width: cols[i] - 8, lineBreak: false, ellipsis: true });
      x += cols[i];
    });
    doc.moveTo(M, y + 18).lineTo(M + W, y + 18).lineWidth(0.5).strokeColor(C.line).stroke();
  };
  let y = doc.y;
  row(head, y, true);
  y += 18;
  for (const b of p.businesses) {
    row(
      [
        b.name,
        b.health ? `${b.health.score} ${b.health.grade}` : '—',
        b.kpis ? money(b.kpis.grossSales) : '—',
        b.kpis?.salesChangePct !== null && b.kpis ? `${b.kpis.salesChangePct! > 0 ? '+' : ''}${b.kpis.salesChangePct}%` : '—',
        b.kpis ? `${b.kpis.refundRatePct}%` : '—',
        money(b.moneyAtStake),
        b.error ?? b.topFindings?.[0]?.title ?? '—',
      ],
      y,
      false,
      b.health ? GRADE[b.health.grade] : undefined,
    );
    y += 18;
  }
  doc.y = y + 8;

  section('Insights across your businesses');
  for (const i of p.insights) {
    doc.font('Helvetica').fontSize(10).fillColor(C.ink).text(t(`• ${i}`), M, doc.y, { width: W, lineGap: 2 });
    doc.y += 3;
  }

  for (const b of p.businesses) {
    doc.addPage();
    doc.rect(0, 0, 612, 6).fill(b.health ? GRADE[b.health.grade] : C.brand);
    doc.font('Helvetica-Bold').fontSize(16).fillColor(C.ink).text(t(b.name), M, 30);
    doc.font('Helvetica').fontSize(9).fillColor(C.muted).text(t(`${b.description ?? ''} · ${b.mode === 'live' ? 'live PayPal data' : 'demo data'}`), M, doc.y + 2);
    if (b.error || !b.kpis || !b.health) {
      doc.moveDown().font('Helvetica').fontSize(10).fillColor(C.red).text(t(`Could not load this business: ${b.error ?? 'no data'}`));
      continue;
    }
    doc.moveDown(0.6);
    const k = b.kpis;
    const kv: [string, string][] = [
      ['Health', `${b.health.score}/100 (${b.health.grade})`],
      ['Gross sales (30d)', `${money(k.grossSales)} (${k.salesChangePct ?? 0}% vs prev.)`],
      ['Orders / avg ticket', `${k.orders} / ${new Intl.NumberFormat('en-US', { style: 'currency', currency: cur }).format(k.averageOrderValue)}`],
      ['Refund rate', `${k.refundRatePct}% (prev. ${k.refundRatePrevPct}%)`],
      ['Net revenue', money(k.netRevenue)],
      ['Open disputes', `${k.openDisputes} (${money(k.amountAtRiskInDisputes)} at risk)`],
      ['Overdue invoices', `${k.overdueInvoices} (${money(k.overdueInvoiceTotal)})`],
      ['30-day forecast', `${money(b.forecast30?.doNothing)} doing nothing · ${money(b.forecast30?.withActions)} acting (+${money(b.forecast30?.upside)})`],
      ['Pending approvals', String(b.pendingApprovals ?? 0)],
    ];
    for (const [a, v] of kv) {
      const yy = doc.y;
      doc.font('Helvetica').fontSize(9.5).fillColor(C.muted).text(t(a), M, yy, { width: 150 });
      doc.font('Helvetica').fontSize(9.5).fillColor(C.ink).text(t(v), M + 155, yy, { width: W - 155 });
      doc.y = Math.max(doc.y, yy + 15);
    }
    section('Why this health score');
    for (const r of b.health.reasons) doc.font('Helvetica').fontSize(9.5).fillColor(C.ink).text(t(`• ${r}`), M, doc.y, { width: W });
    section('Top issues');
    for (const f of b.topFindings ?? []) doc.font('Helvetica-Bold').fontSize(9.5).fillColor(f.severity === 'high' ? C.red : C.amber).text(t(`${f.severity.toUpperCase()} · ${f.title}`), M, doc.y, { width: W });
  }

  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    doc.page.margins.bottom = 0;
    doc.font('Helvetica').fontSize(7.5).fillColor(C.muted).text(`MerchantPilot · portfolio report · page ${i + 1} of ${range.count}`, M, 792 - 28, { width: W, align: 'center', lineBreak: false });
  }
  doc.end();
  return done;
}
