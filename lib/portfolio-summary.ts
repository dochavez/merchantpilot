/** AI-written owner briefing across all businesses (numbers copied from the portfolio; deterministic fallback). */
import { generateText } from 'ai';
import { llmProvider } from './config';
import { resolveModel } from './llm/run';
import type { Portfolio } from './portfolio';

export async function portfolioSummary(p: Portfolio, lang: 'en' | 'es' = 'en'): Promise<{ summary: string; byAi: boolean }> {
  const fallback = p.insights.join(' ');
  const model = llmProvider() === 'mock' || llmProvider() === 'none' ? null : resolveModel();
  if (!model) return { summary: fallback, byAi: false };
  try {
    const facts = {
      totals: p.totals,
      businesses: p.businesses
        .filter((b) => b.kpis)
        .map((b) => ({ name: b.name, health: b.health, sales30: b.kpis!.grossSales, salesChangePct: b.kpis!.salesChangePct, refundRatePct: b.kpis!.refundRatePct, moneyAtStake: b.moneyAtStake, forecastUpside30: b.forecast30?.upside, topFindings: b.topFindings })),
      insights: p.insights,
    };
    const { text } = await generateText({
      model,
      maxOutputTokens: 450,
      abortSignal: AbortSignal.timeout(20_000),
      system:
        'You brief a business owner who runs several businesses on PayPal. 5-7 short sentences, plain text (no markdown, no emoji). Use ONLY numbers present in the facts, copied exactly; never compute new numbers. Say which business needs attention first and why, where the money is, and the 3 highest-value next steps across the portfolio.' +
        (lang === 'es' ? ' Write in Spanish.' : ' Write in English.'),
      prompt: JSON.stringify(facts),
    });
    const clean = text.replace(/[*#_`]/g, '').trim();
    return clean.length > 40 ? { summary: clean, byAi: true } : { summary: fallback, byAi: false };
  } catch {
    return { summary: fallback, byAi: false };
  }
}
