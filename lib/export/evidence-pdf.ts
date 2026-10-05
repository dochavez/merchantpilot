/**
 * Dispute evidence pack (PDF): everything PayPal's reviewer needs on one document – case summary,
 * the disputed transaction, customer history, timeline, the seller statement and an evidence
 * checklist. Attached to the "provide evidence" call when the merchant approves.
 */
import PDFDocument from 'pdfkit';
import { disputeContext } from '../analytics';
import type { Dataset } from '../types';

const C = { brand: '#0070E0', navy: '#003087', ink: '#0F172A', muted: '#64748B', line: '#E2E8F0', soft: '#F1F5F9' };
const M = 48;
const t = (s: unknown) =>
  String(s ?? '')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^\x09\x0A\x0D\x20-\x7E -ÿ–—•…€]/g, '');

export interface EvidencePackInput {
  disputeId: string;
  message?: string;
  evidence?: string[];
}

export function evidencePackFacts(ds: Dataset, input: EvidencePackInput) {
  const ctx = disputeContext(ds, input.disputeId);
  if (!ctx) throw new Error(`Dispute ${input.disputeId} not found`);
  const { dispute: d, transaction: tx, customer } = ctx;
  const priorDisputes = ds.disputes.filter((x) => x.customerEmail && x.customerEmail === d.customerEmail && x.disputeId !== d.disputeId);
  const refundsOnTx = tx ? ds.transactions.filter((x) => x.type === 'Refund' && x.relatedTransactionId === tx.transactionId) : [];
  const checklist = [...new Set([...(input.evidence ?? []), ...ctx.recommendedEvidence])];
  return { d, tx, customer, priorDisputes, refundsOnTx, checklist, message: input.message ?? '' };
}

export async function buildEvidencePdf(ds: Dataset, input: EvidencePackInput, merchantName: string): Promise<Buffer> {
  const f = evidencePackFacts(ds, input);
  const doc = new PDFDocument({ size: 'LETTER', margin: M, info: { Title: `Seller response – ${f.d.disputeId}`, Author: merchantName } });
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((r) => doc.on('end', () => r(Buffer.concat(chunks))));
  const W = 612 - 2 * M;
  const money = (n: number, c = f.d.currency) => new Intl.NumberFormat('en-US', { style: 'currency', currency: c }).format(n);

  doc.rect(0, 0, 612, 84).fill(C.navy);
  doc.font('Helvetica-Bold').fontSize(18).fillColor('#FFFFFF').text('Seller response & evidence', M, 26);
  doc.font('Helvetica').fontSize(10).fillColor('#C7D7FE').text(t(`${merchantName} · PayPal dispute ${f.d.disputeId} · prepared ${new Date().toISOString().slice(0, 10)}`), M, 52);
  doc.y = 104;

  const section = (title: string) => {
    doc.moveDown(0.6);
    doc.font('Helvetica-Bold').fontSize(12).fillColor(C.ink).text(t(title), M, doc.y);
    doc.moveTo(M, doc.y + 2).lineTo(M + W, doc.y + 2).lineWidth(1).strokeColor(C.line).stroke();
    doc.y += 8;
  };
  const kv = (rows: [string, string][]) => {
    for (const [k, v] of rows) {
      const y = doc.y;
      doc.font('Helvetica').fontSize(9.5).fillColor(C.muted).text(t(k), M, y, { width: 150 });
      doc.font('Helvetica').fontSize(9.5).fillColor(C.ink).text(t(v || '—'), M + 155, y, { width: W - 155 });
      doc.y = Math.max(doc.y, y + 14);
    }
  };

  section('1. Case summary');
  kv([
    ['Dispute ID', f.d.disputeId],
    ['Reason', f.d.reason.replaceAll('_', ' ').toLowerCase()],
    ['Amount', money(f.d.amount)],
    ['Opened', f.d.createdDate],
    ['Response due', f.d.responseDueDate],
    ['Status', f.d.status],
  ]);

  section('2. Disputed transaction');
  kv(
    f.tx
      ? [
          ['Transaction ID', f.tx.transactionId],
          ['Date', f.tx.datetime.replace('T', ' ').slice(0, 16) + ' UTC'],
          ['Item', f.tx.item],
          ['Amount paid', money(f.tx.gross, f.tx.currency)],
          ['Payment method', f.tx.instrument],
          ['Buyer', `${f.tx.customerName} <${f.tx.customerEmail}>`],
          ['Ship-to country', f.tx.country],
          ['Refunds already issued', f.refundsOnTx.length ? f.refundsOnTx.map((r) => money(-r.gross, r.currency)).join(', ') : 'None'],
        ]
      : [['Transaction', 'Not found in the last 90 days of Transaction Search data']],
  );

  section('3. Customer history with us');
  kv(
    f.customer
      ? [
          ['Orders', String(f.customer.lifetimeOrders)],
          ['Total spend', money(f.customer.lifetimeSpend)],
          ['Refunds', String(f.customer.lifetimeRefunds)],
          ['Other disputes', f.priorDisputes.length ? f.priorDisputes.map((x) => `${x.disputeId} (${x.status})`).join(', ') : 'None'],
        ]
      : [['History', 'No other orders found']],
  );

  section('4. Seller statement');
  doc.font('Helvetica').fontSize(10).fillColor(C.ink).text(t(f.message || 'See evidence below.'), M, doc.y, { width: W, lineGap: 2 });

  section('5. Evidence checklist');
  for (const e of f.checklist) {
    doc.font('Helvetica').fontSize(10).fillColor(C.ink).text(t(`[  ]  ${e}`), M + 6, doc.y, { width: W - 6 });
    doc.y += 2;
  }

  section('6. Declaration');
  doc
    .font('Helvetica')
    .fontSize(9.5)
    .fillColor(C.muted)
    .text(
      t(`I confirm the information above is accurate to the best of my knowledge and was taken from my PayPal account records. Prepared with MerchantPilot and approved by the merchant before submission.`),
      M,
      doc.y,
      { width: W },
    );

  doc.font('Helvetica').fontSize(7.5).fillColor(C.muted).text('MerchantPilot · evidence pack', M, 792 - 30, { width: W, align: 'center', lineBreak: false });
  doc.end();
  return done;
}

/** Text version for PayPal's "notes" field (max 2000 chars). */
export function evidenceNotes(ds: Dataset, input: EvidencePackInput): string {
  const f = evidencePackFacts(ds, input);
  const lines = [
    f.message,
    f.tx ? `Transaction ${f.tx.transactionId} on ${f.tx.date}: ${f.tx.item}, ${f.tx.gross} ${f.tx.currency}, shipped to ${f.tx.country}.` : '',
    f.customer ? `Customer history: ${f.customer.lifetimeOrders} orders, ${f.customer.lifetimeRefunds} refunds.` : '',
    `Evidence: ${f.checklist.join('; ')}. Full evidence pack attached (PDF).`,
  ];
  return lines.filter(Boolean).join('\n').slice(0, 2000);
}
