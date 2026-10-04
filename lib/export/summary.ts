/**
 * Executive summary for reports. Deterministic by default; when an LLM is configured the model
 * rewrites it in plain language from the SAME numbers (it is told never to compute or invent).
 */
import { generateText } from 'ai';
import { llmProvider } from '../config';
import { resolveModel } from '../llm/run';
import type { ReportModel } from './report-model';

const fmt = (n: number, c: string) => new Intl.NumberFormat('en-US', { style: 'currency', currency: c, maximumFractionDigits: 0 }).format(n);

export function deterministicSummary(m: ReportModel): string {
  const k = m.kpis;
  const c = m.currency;
  const parts: string[] = [];
  const change = k.salesChangePct === null ? '' : ` (${k.salesChangePct >= 0 ? '+' : ''}${k.salesChangePct}% vs the previous ${m.periodDays} days)`;
  parts.push(`In the last ${m.periodDays} days you sold ${fmt(k.grossSales, c)} across ${k.orders} orders${change}, keeping ${fmt(k.netRevenue, c)} after refunds and PayPal fees.`);
  if (k.refundRatePct > 0) parts.push(`Refunds were ${fmt(k.refunds, c)}, a ${k.refundRatePct}% refund rate (previously ${k.refundRatePrevPct}%).`);
  if (m.moneyAtStake > 0)
    parts.push(`${fmt(m.moneyAtStake, c)} is still recoverable: ${fmt(k.overdueInvoiceTotal, c)} in ${k.overdueInvoices} overdue invoice(s) and ${fmt(k.amountAtRiskInDisputes, c)} in ${k.openDisputes} open dispute(s).`);
  const top = m.findings.slice(0, 2).map((f) => f.title);
  if (top.length) parts.push(`Top priorities: ${top.join('; ')}.`);
  return parts.join(' ');
}

export async function executiveSummary(m: ReportModel, opts: { ai?: boolean; lang?: string } = {}): Promise<{ text: string; byAi: boolean }> {
  const base = deterministicSummary(m);
  const provider = llmProvider();
  if (opts.ai === false || provider === 'none' || provider === 'mock') return { text: base, byAi: false };
  const model = resolveModel();
  if (!model) return { text: base, byAi: false };
  try {
    const facts = {
      periodDays: m.periodDays,
      currency: m.currency,
      kpis: m.kpis,
      moneyAtStake: m.moneyAtStake,
      findings: m.findings.slice(0, 5).map((f) => ({ severity: f.severity, title: f.title, detail: f.detail, nextStep: f.suggestedActions[0] })),
      topProducts: m.products.slice(0, 5),
    };
    const { text } = await generateText({
      model,
      maxOutputTokens: 400,
      abortSignal: AbortSignal.timeout(15_000),
      system:
        'You write the executive summary of a monthly PayPal report for a small-business owner. 4-6 short sentences, plain text only (no markdown, no bullets, no emoji). ' +
        'Use ONLY numbers that appear in the facts, copied exactly; never calculate new numbers. Explain what happened, why it matters, and the 2 most valuable next steps.' +
        (opts.lang === 'es' ? ' Write in Spanish.' : ' Write in English.'),
      prompt: JSON.stringify(facts),
    });
    const clean = text.replace(/[*#_`]/g, '').trim();
    return clean.length > 40 ? { text: clean, byAi: true } : { text: base, byAi: false };
  } catch {
    return { text: base, byAi: false };
  }
}
