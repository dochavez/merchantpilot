/**
 * Cash-flow forecast + what-if simulator. Deterministic and explainable (every driver is listed),
 * so the AI can explain it and the merchant can trust it.
 *
 * Model (per day, next N days):
 *  - sales: weekday averages of the last 8 weeks × a damped trend (last 4 weeks vs previous 4)
 *  - PayPal fees: recent fee ratio of sales
 *  - refunds: recent refund rate (last 14 days) – or the older baseline if the spike is fixed
 *  - invoices: unpaid invoices collected with a probability that falls with days overdue
 *  - disputes: open disputes lost with a probability, booked ~10 days after the response deadline
 *  - band: ±1.28σ (80%) of daily sales noise, widening with √t
 */
import type { Dataset } from './types';

const DAY = 86_400_000;
const r2 = (n: number) => Math.round(n * 100) / 100;

export interface Scenario {
  /** Refund rate goes back to its pre-spike baseline (e.g. the damaged batch is fixed). */
  fixRefundSpike?: boolean;
  /** Merchant chases overdue invoices (reminders / payment plans): higher, faster collection. */
  collectOverdue?: boolean;
  /** Merchant fights disputes with evidence: lower loss rate. */
  fightDisputes?: boolean;
  /** Sales up/down, e.g. +10 for a promotion, -20 for pausing a product. */
  salesChangePct?: number;
}

export interface ForecastPoint {
  date: string;
  baseline: number;
  scenario: number;
  low: number;
  high: number;
}

export interface ForecastTotals {
  sales: number;
  fees: number;
  refunds: number;
  invoicesCollected: number;
  disputeLosses: number;
  net: number;
}

export interface Forecast {
  currency: string;
  days: number;
  startDate: string;
  scenario: Scenario;
  points: ForecastPoint[];
  baseline: ForecastTotals;
  withScenario: ForecastTotals;
  /** withScenario.net − baseline.net */
  upside: number;
  drivers: string[];
  historyDays: number;
}

interface Inputs {
  weekday: number[];
  trendPerDay: number;
  feeRatio: number;
  refundRateRecent: number;
  refundRateBaseline: number;
  sigmaDay: number;
  historyDays: number;
  trendRatio: number;
}

function dayKey(ms: number) {
  return new Date(ms).toISOString().slice(0, 10);
}

function inputs(ds: Dataset, now: number): Inputs {
  const today = Date.parse(dayKey(now));
  const start = today - 56 * DAY;
  const sales = new Map<string, number>();
  let fees = 0;
  let salesSum = 0;
  let refRecent = 0;
  let salesRecent = 0;
  let refOld = 0;
  let salesOld = 0;
  let first = Infinity;
  for (const t of ds.transactions) {
    const ts = Date.parse(t.date);
    if (!(ts >= start && ts < today)) continue;
    first = Math.min(first, ts);
    const recent = ts >= today - 14 * DAY;
    if (t.type === 'Payment') {
      sales.set(t.date, (sales.get(t.date) ?? 0) + t.gross);
      fees += t.fee;
      salesSum += t.gross;
      if (recent) salesRecent += t.gross;
      else salesOld += t.gross;
    } else if (t.type === 'Refund') {
      if (recent) refRecent += -t.gross;
      else refOld += -t.gross;
    }
  }
  const historyDays = Number.isFinite(first) ? Math.round((today - first) / DAY) : 0;

  // Weekday averages over the days we actually have.
  const sums = Array(7).fill(0);
  const counts = Array(7).fill(0);
  for (let d = Math.max(start, Number.isFinite(first) ? first : today); d < today; d += DAY) {
    const k = dayKey(d);
    const wd = new Date(d).getUTCDay();
    sums[wd] += sales.get(k) ?? 0;
    counts[wd] += 1;
  }
  const weekday = sums.map((s, i) => (counts[i] ? s / counts[i] : 0));

  // Noise: residual std of daily sales vs weekday average.
  const res: number[] = [];
  for (let d = Math.max(start, Number.isFinite(first) ? first : today); d < today; d += DAY) {
    res.push((sales.get(dayKey(d)) ?? 0) - weekday[new Date(d).getUTCDay()]);
  }
  const sigmaDay = res.length > 1 ? Math.sqrt(res.reduce((s, x) => s + x * x, 0) / (res.length - 1)) : 0;

  // Trend: last 28 vs previous 28 days, damped and clamped.
  let last28 = 0;
  let prev28 = 0;
  for (const [k, v] of sales) {
    const ts = Date.parse(k);
    if (ts >= today - 28 * DAY) last28 += v;
    else prev28 += v;
  }
  const trendRatio = prev28 > 0 && historyDays >= 42 ? Math.min(1.25, Math.max(0.8, last28 / prev28)) : 1;
  const trendPerDay = Math.pow(1 + (trendRatio - 1) / 2, 1 / 28); // half the observed momentum

  const refundRateRecent = salesRecent > 0 ? refRecent / salesRecent : 0;
  const refundRateBaseline = salesOld > 0 ? refOld / salesOld : refundRateRecent;
  return {
    weekday,
    trendPerDay,
    feeRatio: salesSum > 0 ? -fees / salesSum : 0.035,
    refundRateRecent,
    refundRateBaseline: Math.min(refundRateBaseline, refundRateRecent || refundRateBaseline),
    sigmaDay,
    historyDays,
    trendRatio,
  };
}

function collectProb(daysOverdue: number, chase: boolean) {
  if (daysOverdue <= 0) return chase ? 0.95 : 0.9;
  if (daysOverdue <= 15) return chase ? 0.9 : 0.7;
  if (daysOverdue <= 30) return chase ? 0.8 : 0.5;
  if (daysOverdue <= 60) return chase ? 0.6 : 0.3;
  return chase ? 0.35 : 0.1;
}

function run(ds: Dataset, inp: Inputs, s: Scenario, days: number, now: number) {
  const today = Date.parse(dayKey(now));
  const daily = Array.from({ length: days }, () => ({ sales: 0, fees: 0, refunds: 0, invoices: 0, disputes: 0 }));
  const salesFactor = 1 + (s.salesChangePct ?? 0) / 100;
  const refundRate = s.fixRefundSpike ? inp.refundRateBaseline : inp.refundRateRecent;

  for (let i = 0; i < days; i++) {
    const d = today + (i + 1) * DAY;
    const sales = inp.weekday[new Date(d).getUTCDay()] * Math.pow(inp.trendPerDay, i + 1) * salesFactor;
    daily[i].sales = sales;
    daily[i].fees = sales * inp.feeRatio;
    daily[i].refunds = sales * refundRate;
  }

  // Invoices: expected value spread over a collection window.
  for (const inv of ds.invoices) {
    if (!['SENT', 'UNPAID', 'PARTIALLY_PAID'].includes(inv.status)) continue;
    const p = collectProb(inv.daysOverdue, !!s.collectOverdue || !!inv.paymentPlan);
    const due = Date.parse(inv.dueDate);
    const from = inv.daysOverdue > 0 ? 1 : Math.max(1, Math.round((due - today) / DAY));
    const window = inv.daysOverdue > 0 ? (s.collectOverdue ? 7 : 21) : 7;
    for (let k = 0; k < window; k++) {
      const idx = from + k - 1;
      if (idx >= 0 && idx < days) daily[idx].invoices += (inv.amount * p) / window;
    }
  }

  // Disputes: expected loss booked ~10 days after the response deadline.
  const pLoss = s.fightDisputes ? 0.3 : 0.6;
  for (const dsp of ds.disputes) {
    if (dsp.status === 'RESOLVED') continue;
    const idx = Math.max(0, dsp.daysToRespond) + 10 - 1;
    // Evidence already submitted counts as "fought" in every scenario.
    if (idx < days) daily[idx].disputes += dsp.amount * (dsp.evidenceSubmittedAt ? 0.3 : pLoss);
  }

  const totals: ForecastTotals = { sales: 0, fees: 0, refunds: 0, invoicesCollected: 0, disputeLosses: 0, net: 0 };
  const cumulative: number[] = [];
  let acc = 0;
  for (const x of daily) {
    const net = x.sales - x.fees - x.refunds + x.invoices - x.disputes;
    acc += net;
    cumulative.push(acc);
    totals.sales += x.sales;
    totals.fees += x.fees;
    totals.refunds += x.refunds;
    totals.invoicesCollected += x.invoices;
    totals.disputeLosses += x.disputes;
  }
  totals.net = acc;
  for (const k of Object.keys(totals) as (keyof ForecastTotals)[]) totals[k] = r2(totals[k]);
  return { cumulative, totals };
}

export function forecastCashflow(ds: Dataset, opts: { days?: number; scenario?: Scenario; now?: number } = {}): Forecast {
  const now = opts.now ?? Date.now();
  const days = Math.min(120, Math.max(7, Math.round(opts.days ?? 60)));
  const scenario = opts.scenario ?? {};
  const inp = inputs(ds, now);
  const base = run(ds, inp, {}, days, now);
  const alt = run(ds, inp, scenario, days, now);
  const today = Date.parse(dayKey(now));
  const z = 1.28 * inp.sigmaDay * (1 - inp.feeRatio);
  const points = base.cumulative.map((b, i) => ({
    date: dayKey(today + (i + 1) * DAY),
    baseline: r2(b),
    scenario: r2(alt.cumulative[i]),
    low: r2(b - z * Math.sqrt(i + 1)),
    high: r2(b + z * Math.sqrt(i + 1)),
  }));

  const pct = (x: number) => `${Math.round(x * 1000) / 10}%`;
  const drivers = [
    `Sales follow your weekday pattern of the last ${Math.min(56, inp.historyDays)} days` +
      (inp.trendRatio !== 1 ? `, with half of the recent ${inp.trendRatio > 1 ? 'growth' : 'decline'} (${pct(inp.trendRatio - 1)} over 4 weeks) carried forward.` : '.'),
    `PayPal fees ≈ ${pct(inp.feeRatio)} of sales.`,
    `Refunds at ${pct(inp.refundRateRecent)} of sales (last 14 days)` +
      (inp.refundRateBaseline < inp.refundRateRecent ? `; fixing the spike brings it back to ${pct(inp.refundRateBaseline)}.` : '.'),
    'Unpaid invoices are collected with a probability that drops with lateness (70% if ≤15 days late, 50% ≤30, 30% ≤60, 10% after); chasing them raises it.',
    'Open disputes: 60% expected loss, 30% if you respond with evidence, booked ~10 days after each deadline.',
    'Shaded band = 80% range of normal day-to-day sales noise.',
  ];
  if (inp.historyDays < 21) drivers.unshift(`Only ${inp.historyDays} days of sales history: treat this forecast as rough.`);

  return {
    currency: ds.currency,
    days,
    startDate: points[0]?.date ?? dayKey(now),
    scenario,
    points,
    baseline: base.totals,
    withScenario: alt.totals,
    upside: r2(alt.totals.net - base.totals.net),
    drivers,
    historyDays: inp.historyDays,
  };
}

export function scenarioFromQuery(q: URLSearchParams): Scenario {
  const b = (k: string) => q.get(k) === '1' || q.get(k) === 'true';
  const pct = Number(q.get('salesChangePct'));
  return {
    fixRefundSpike: b('fixRefundSpike'),
    collectOverdue: b('collectOverdue'),
    fightDisputes: b('fightDisputes'),
    salesChangePct: Number.isFinite(pct) ? Math.max(-90, Math.min(200, pct)) : 0,
  };
}
