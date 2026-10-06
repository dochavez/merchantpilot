/**
 * Multi-business portfolio: one snapshot per business (KPIs, health score with reasons, money at
 * stake, 30-day forecast upside, top issue, weekly trend) plus consolidated totals and
 * cross-business insights. Deterministic – the AI only explains it.
 */
import { listActions } from './actions';
import { detectAnomalies, overview } from './analytics';
import { runInBusiness, type Business } from './business-context';
import { listBusinesses } from './businesses';
import { dataMode } from './config';
import { getDataset } from './data';
import { forecastCashflow } from './forecast';

const DAY = 86_400_000;
const r2 = (n: number) => Math.round(n * 100) / 100;

export interface Health {
  score: number;
  grade: 'A' | 'B' | 'C' | 'D';
  reasons: string[];
}

export interface BusinessSnapshot {
  id: string;
  name: string;
  kind: Business['kind'];
  mode: 'live' | 'demo';
  description?: string;
  currency: string;
  kpis?: ReturnType<typeof overview>;
  health?: Health;
  moneyAtStake?: number;
  forecast30?: { doNothing: number; withActions: number; upside: number };
  topFindings?: { title: string; severity: string }[];
  weekly?: { weekStart: string; sales: number }[];
  pendingApprovals?: number;
  error?: string;
}

export interface Portfolio {
  generatedAt: string;
  businesses: BusinessSnapshot[];
  totals: { sales30: number; netRevenue30: number; moneyAtStake: number; pendingApprovals: number; averageHealth: number; currency: string; mixedCurrencies: boolean };
  insights: string[];
}

export function healthScore(k: ReturnType<typeof overview>, findings: { severity: string }[], moneyAtStake: number): Health {
  let score = 100;
  const reasons: string[] = [];
  const hit = (pts: number, why: string) => {
    score -= pts;
    reasons.push(`−${pts} ${why}`);
  };
  if (k.salesChangePct !== null && k.salesChangePct < -10) hit(15, `sales down ${Math.abs(k.salesChangePct)}% vs previous 30 days`);
  else if (k.salesChangePct !== null && k.salesChangePct < 0) hit(5, `sales slightly down (${k.salesChangePct}%)`);
  if (k.refundRatePct > 5) hit(15, `high refund rate (${k.refundRatePct}%)`);
  else if (k.refundRatePct > 2.5) hit(7, `refund rate above 2.5% (${k.refundRatePct}%)`);
  const disputeShare = k.grossSales ? (k.amountAtRiskInDisputes / k.grossSales) * 100 : 0;
  if (disputeShare > 2) hit(15, `${r2(disputeShare)}% of sales at risk in disputes`);
  else if (disputeShare > 1) hit(7, `${r2(disputeShare)}% of sales at risk in disputes`);
  const overdueShare = k.grossSales ? (k.overdueInvoiceTotal / k.grossSales) * 100 : k.overdueInvoiceTotal > 0 ? 100 : 0;
  if (overdueShare > 10) hit(15, `overdue invoices = ${r2(overdueShare)}% of monthly sales`);
  else if (overdueShare > 3) hit(7, `overdue invoices = ${r2(overdueShare)}% of monthly sales`);
  if (k.disputesDueWithin5Days > 0) hit(10, `${k.disputesDueWithin5Days} dispute deadline(s) within 5 days`);
  const highs = findings.filter((f) => f.severity === 'high').length;
  if (highs > 2) hit(5, `${highs} high-severity issues`);
  if (k.orders === 0) hit(20, 'no sales in the last 30 days');
  score = Math.max(0, Math.min(100, score));
  const grade = score >= 85 ? 'A' : score >= 70 ? 'B' : score >= 50 ? 'C' : 'D';
  if (!reasons.length) reasons.push('No significant risks detected');
  void moneyAtStake;
  return { score, grade, reasons };
}

export async function snapshot(b: Business): Promise<BusinessSnapshot> {
  return runInBusiness(b, async () => {
    const base: BusinessSnapshot = { id: b.id, name: b.name, kind: b.kind, mode: dataMode(), description: b.description, currency: 'USD' };
    try {
      const ds = await getDataset();
      const now = Date.now();
      const k = overview(ds, 30, now);
      const findings = detectAnomalies(ds, now);
      const moneyAtStake = r2(k.overdueInvoiceTotal + k.amountAtRiskInDisputes);
      const fc = forecastCashflow(ds, { days: 30, scenario: { fixRefundSpike: true, collectOverdue: true, fightDisputes: true }, now });
      const weeks = new Map<string, number>();
      for (const t of ds.transactions) {
        if (t.type !== 'Payment' || Date.parse(t.date) < now - 56 * DAY) continue;
        const d = new Date(`${t.date}T00:00:00Z`);
        const ws = new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * DAY).toISOString().slice(0, 10);
        weeks.set(ws, (weeks.get(ws) ?? 0) + t.gross);
      }
      return {
        ...base,
        name: ds.merchantName || b.name,
        currency: ds.currency,
        kpis: k,
        health: healthScore(k, findings, moneyAtStake),
        moneyAtStake,
        forecast30: { doNothing: fc.baseline.net, withActions: fc.withScenario.net, upside: fc.upside },
        topFindings: findings.slice(0, 3).map((f) => ({ title: f.title, severity: f.severity })),
        weekly: [...weeks.entries()].sort(([a], [c]) => a.localeCompare(c)).map(([weekStart, sales]) => ({ weekStart, sales: r2(sales) })),
        pendingApprovals: (await listActions()).filter((a) => a.status === 'pending').length,
      };
    } catch (e) {
      return { ...base, error: (e as Error).message.slice(0, 200) };
    }
  });
}

export function portfolioInsights(list: BusinessSnapshot[]): string[] {
  const ok = list.filter((b) => b.kpis && b.health);
  if (ok.length < 2) return ok.length ? [`${ok[0].name}: health ${ok[0].health!.score}/100.`] : [];
  const fmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: ok[0].currency, maximumFractionDigits: 0 }).format(n);
  const total = ok.reduce((s, b) => s + b.kpis!.grossSales, 0);
  const out: string[] = [];
  const worst = [...ok].sort((a, b) => a.health!.score - b.health!.score)[0];
  out.push(`${worst.name} needs attention first: health ${worst.health!.score}/100 (${worst.health!.reasons[0].replace(/^−\d+ /, '')}).`);
  const stake = [...ok].sort((a, b) => (b.moneyAtStake ?? 0) - (a.moneyAtStake ?? 0))[0];
  if ((stake.moneyAtStake ?? 0) > 0) out.push(`Biggest recoverable amount: ${fmt(stake.moneyAtStake!)} at ${stake.name} (overdue invoices + open disputes).`);
  const growth = ok.filter((b) => b.kpis!.salesChangePct !== null).sort((a, b) => b.kpis!.salesChangePct! - a.kpis!.salesChangePct!);
  if (growth.length >= 2) {
    const g = growth[0];
    const l = growth[growth.length - 1];
    out.push(`Momentum: ${g.name} ${g.kpis!.salesChangePct! >= 0 ? '+' : ''}${g.kpis!.salesChangePct}% vs ${l.name} ${l.kpis!.salesChangePct! >= 0 ? '+' : ''}${l.kpis!.salesChangePct}% (last 30 days vs previous).`);
  }
  const refunds = [...ok].sort((a, b) => b.kpis!.refundRatePct - a.kpis!.refundRatePct)[0];
  if (refunds.kpis!.refundRatePct > 2.5) out.push(`Highest refund rate: ${refunds.name} at ${refunds.kpis!.refundRatePct}% – check its top refunded product.`);
  if (total > 0) {
    const top = [...ok].sort((a, b) => b.kpis!.grossSales - a.kpis!.grossSales)[0];
    const share = Math.round((top.kpis!.grossSales / total) * 100);
    out.push(`${top.name} brings ${share}% of your revenue${share >= 60 ? ' – high concentration risk if it slows down' : ''}.`);
  }
  const upside = ok.reduce((s, b) => s + (b.forecast30?.upside ?? 0), 0);
  if (upside > 0) out.push(`Acting on the open issues across all businesses is worth about ${fmt(upside)} in the next 30 days.`);
  return out;
}

export async function buildPortfolio(): Promise<Portfolio> {
  const businesses = await Promise.all((await listBusinesses({ withCreds: true })).map(snapshot));
  const ok = businesses.filter((b) => b.kpis);
  const currencies = new Set(ok.map((b) => b.currency));
  return {
    generatedAt: new Date().toISOString(),
    businesses,
    totals: {
      sales30: r2(ok.reduce((s, b) => s + b.kpis!.grossSales, 0)),
      netRevenue30: r2(ok.reduce((s, b) => s + b.kpis!.netRevenue, 0)),
      moneyAtStake: r2(ok.reduce((s, b) => s + (b.moneyAtStake ?? 0), 0)),
      pendingApprovals: ok.reduce((s, b) => s + (b.pendingApprovals ?? 0), 0),
      averageHealth: ok.length ? Math.round(ok.reduce((s, b) => s + b.health!.score, 0) / ok.length) : 0,
      currency: ok[0]?.currency ?? 'USD',
      mixedCurrencies: currencies.size > 1,
    },
    insights: portfolioInsights(businesses),
  };
}
