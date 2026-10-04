/**
 * One report model shared by every export (Excel, PDF, OData/Power BI, CSV), so all of them show
 * exactly the same numbers as the dashboard and the agent. Pure and deterministic.
 */
import { detectAnomalies, overview, type Finding } from '../analytics';
import type { Dataset, ProposedAction } from '../types';

const DAY = 86_400_000;
const r2 = (n: number) => Math.round(n * 100) / 100;

export interface WeeklyPoint {
  weekStart: string;
  sales: number;
  refunds: number;
  orders: number;
  refundRatePct: number;
}
export interface ProductRow {
  item: string;
  orders: number;
  sales: number;
  refundCount: number;
  refunds: number;
  refundRatePct: number;
}
export interface CountryRow {
  country: string;
  orders: number;
  sales: number;
  openDisputes: number;
}
export interface ReportModel {
  merchantName: string;
  mode: Dataset['mode'];
  currency: string;
  generatedAt: string;
  periodDays: number;
  kpis: ReturnType<typeof overview>;
  findings: Finding[];
  weekly: WeeklyPoint[];
  products: ProductRow[];
  countries: CountryRow[];
  actions: ProposedAction[];
  /** Money the merchant can still act on: overdue invoices + open disputes. */
  moneyAtStake: number;
  dataset: Dataset;
}

function weekStart(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7; // Monday = 0
  return new Date(d.getTime() - dow * DAY).toISOString().slice(0, 10);
}

export function buildReportModel(ds: Dataset, actions: ProposedAction[], periodDays = 30, now = Date.now()): ReportModel {
  const kpis = overview(ds, periodDays, now);
  const findings = detectAnomalies(ds, now);
  const since = now - 90 * DAY;
  const recent = ds.transactions.filter((t) => Date.parse(t.datetime ?? t.date) > since);

  const weeks = new Map<string, WeeklyPoint>();
  for (const t of recent) {
    if (t.type !== 'Payment' && t.type !== 'Refund') continue;
    const k = weekStart(t.date);
    const w = weeks.get(k) ?? { weekStart: k, sales: 0, refunds: 0, orders: 0, refundRatePct: 0 };
    if (t.type === 'Payment') {
      w.sales += t.gross;
      w.orders += 1;
    } else w.refunds += -t.gross;
    weeks.set(k, w);
  }
  const weekly = [...weeks.values()]
    .sort((a, b) => a.weekStart.localeCompare(b.weekStart))
    .map((w) => ({ ...w, sales: r2(w.sales), refunds: r2(w.refunds), refundRatePct: w.sales ? r2((w.refunds / w.sales) * 100) : 0 }));

  const prods = new Map<string, ProductRow>();
  for (const t of recent) {
    if (!t.item || (t.type !== 'Payment' && t.type !== 'Refund')) continue;
    const p = prods.get(t.item) ?? { item: t.item, orders: 0, sales: 0, refundCount: 0, refunds: 0, refundRatePct: 0 };
    if (t.type === 'Payment') {
      p.orders += 1;
      p.sales += t.gross;
    } else {
      p.refundCount += 1;
      p.refunds += -t.gross;
    }
    prods.set(t.item, p);
  }
  const products = [...prods.values()]
    .map((p) => ({ ...p, sales: r2(p.sales), refunds: r2(p.refunds), refundRatePct: p.sales ? r2((p.refunds / p.sales) * 100) : 0 }))
    .sort((a, b) => b.sales - a.sales);

  const byTx = new Map(ds.transactions.map((t) => [t.transactionId, t]));
  const ctry = new Map<string, CountryRow>();
  for (const t of recent) {
    if (t.type !== 'Payment') continue;
    const k = t.country || '—';
    const c = ctry.get(k) ?? { country: k, orders: 0, sales: 0, openDisputes: 0 };
    c.orders += 1;
    c.sales += t.gross;
    ctry.set(k, c);
  }
  for (const d of ds.disputes) {
    if (d.status === 'RESOLVED') continue;
    const k = byTx.get(d.transactionId)?.country || '—';
    const c = ctry.get(k) ?? { country: k, orders: 0, sales: 0, openDisputes: 0 };
    c.openDisputes += 1;
    ctry.set(k, c);
  }
  const countries = [...ctry.values()].map((c) => ({ ...c, sales: r2(c.sales) })).sort((a, b) => b.sales - a.sales);

  return {
    merchantName: ds.merchantName,
    mode: ds.mode,
    currency: ds.currency,
    generatedAt: new Date(now).toISOString(),
    periodDays,
    kpis,
    findings,
    weekly,
    products,
    countries,
    actions,
    moneyAtStake: r2(kpis.overdueInvoiceTotal + kpis.amountAtRiskInDisputes),
    dataset: ds,
  };
}

export function reportFileName(m: ReportModel, ext: string) {
  const slug = m.merchantName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'merchant';
  return `merchantpilot-${slug}-${m.generatedAt.slice(0, 10)}.${ext}`;
}
