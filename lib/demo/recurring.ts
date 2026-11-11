/**
 * Demo recurring revenue (PayPal Subscriptions) and invoice line items.
 *
 * Stories the agent can discover:
 *  - supply:  "Altura Coffee Club". Healthy MRR, but cancellations of the Bi-weekly plan doubled in the
 *             last 30 days, and a handful of subscriptions are SUSPENDED after failed payments.
 *  - cafe:    a small "30 coffees" membership – steady, low churn.
 *  - academy: monthly + annual memberships; strong growth, some failed renewals.
 */
import type { InvoiceItem, InvoiceRow, SubscriptionRow, TransactionRow } from '../types';
import { mulberry32, round2 } from './generate';

interface Plan {
  id: string;
  name: string;
  price: number;
  interval: SubscriptionRow['interval'];
  intervalCount: number;
  weight: number;
  /** Monthly churn probability; `recentChurn` applies to the last 30 days (the story). */
  churn: number;
  recentChurn?: number;
}

const PLANS: Record<string, { subscribers: number; plans: Plan[]; suspended: number }> = {
  supply: {
    subscribers: 150,
    suspended: 6,
    plans: [
      { id: 'P-COFFEECLUB-MONTHLY', name: 'Coffee Club – Monthly 1kg', price: 29, interval: 'MONTH', intervalCount: 1, weight: 55, churn: 0.035 },
      { id: 'P-COFFEECLUB-BIWEEKLY', name: 'Coffee Club – Bi-weekly 500g', price: 17, interval: 'WEEK', intervalCount: 2, weight: 30, churn: 0.04, recentChurn: 0.16 },
      { id: 'P-OFFICE-PLAN', name: 'Office Coffee Plan', price: 149, interval: 'MONTH', intervalCount: 1, weight: 15, churn: 0.02 },
    ],
  },
  cafe: {
    subscribers: 20,
    suspended: 1,
    plans: [{ id: 'P-CAFE-30COFFEES', name: 'Café Membership – 30 coffees', price: 39, interval: 'MONTH', intervalCount: 1, weight: 1, churn: 0.03 }],
  },
  academy: {
    subscribers: 260,
    suspended: 9,
    plans: [
      { id: 'P-ACADEMY-MONTHLY', name: 'Academy Membership – Monthly', price: 19, interval: 'MONTH', intervalCount: 1, weight: 75, churn: 0.05 },
      { id: 'P-ACADEMY-ANNUAL', name: 'Academy Membership – Annual', price: 190, interval: 'YEAR', intervalCount: 1, weight: 25, churn: 0.01 },
    ],
  },
};

const FIRST = ['Ana', 'Luis', 'Maya', 'Noah', 'Sofía', 'Liam', 'Valeria', 'Ethan', 'Camila', 'Diego', 'Emma', 'Mateo', 'Olivia', 'Lucas', 'Isabella', 'Hugo', 'Chloe', 'Pablo', 'Grace', 'Iván', 'Elena', 'Tomás'];
const LAST = ['García', 'Smith', 'Lopez', 'Chen', 'Martínez', 'Brown', 'Hernández', 'Müller', 'Rossi', 'Wilson', 'Pérez', 'Taylor', 'Ramírez', 'Clark', 'Morales', 'Evans'];
const COUNTRIES = ['US', 'US', 'US', 'CA', 'MX', 'CL', 'GB', 'ES', 'DE', 'CO'];
const DAY = 86_400_000;
const day = (d: Date) => d.toISOString().slice(0, 10);

export function cycleDays(interval: SubscriptionRow['interval'], count: number) {
  return (interval === 'DAY' ? 1 : interval === 'WEEK' ? 7 : interval === 'MONTH' ? 30.4375 : 365.25) * count;
}

/** Monthly value of one billing cycle price. */
export function toMonthly(price: number, interval: SubscriptionRow['interval'], count: number) {
  return round2((price * 30.4375) / cycleDays(interval, count));
}

export function addSubscriptions(profile: string, seed: number, today: Date, days: number, transactions: TransactionRow[]): SubscriptionRow[] {
  const cfg = PLANS[profile];
  if (!cfg) return [];
  const rand = mulberry32(seed);
  const pick = <T,>(a: readonly T[]) => a[Math.floor(rand() * a.length)];
  const alnum = 'ABCDEFGHJKLMNPRSTUVWXYZ0123456789';
  const id = (n: number) => Array.from({ length: n }, () => alnum[Math.floor(rand() * alnum.length)]).join('');
  const weighted = () => {
    const total = cfg.plans.reduce((s, p) => s + p.weight, 0);
    let r = rand() * total;
    for (const p of cfg.plans) if ((r -= p.weight) <= 0) return p;
    return cfg.plans[0];
  };
  const windowStart = today.getTime() - days * DAY;
  const subs: SubscriptionRow[] = [];

  for (let i = 0; i < cfg.subscribers; i++) {
    const plan = weighted();
    // Start dates over the last ~14 months, more recent ones more likely (growth).
    const ageDays = Math.floor(Math.pow(rand(), 1.6) * 420) + 1;
    const start = new Date(today.getTime() - ageDays * DAY);
    const first = pick(FIRST);
    const last = pick(LAST);
    const email = `${first}.${last}.club${Math.floor(rand() * 900 + 100)}`.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase() + '@example.com';
    const cyc = cycleDays(plan.interval, plan.intervalCount);

    // Walk the billing cycles; each one may churn (monthly probability scaled to the cycle length).
    let t = start.getTime();
    let cancelledAt: number | undefined;
    const payments: number[] = [];
    while (t <= today.getTime()) {
      payments.push(t);
      const next = t + cyc * DAY;
      const recent = next > today.getTime() - 30 * DAY;
      const pMonth = recent && plan.recentChurn ? plan.recentChurn : plan.churn;
      const pCycle = 1 - Math.pow(1 - pMonth, cyc / 30.4375);
      if (next <= today.getTime() && rand() < pCycle) {
        cancelledAt = next - Math.floor(rand() * 5) * DAY;
        break;
      }
      t = next;
    }
    const lastPay = payments[payments.length - 1];
    const status: SubscriptionRow['status'] = cancelledAt ? 'CANCELLED' : 'ACTIVE';
    const subId = 'I-' + id(12);
    subs.push({
      subscriptionId: subId,
      planId: plan.id,
      planName: plan.name,
      status,
      subscriberName: `${first} ${last}`,
      subscriberEmail: email,
      country: pick(COUNTRIES),
      amount: plan.price,
      currency: 'USD',
      interval: plan.interval,
      intervalCount: plan.intervalCount,
      monthlyValue: status === 'ACTIVE' ? toMonthly(plan.price, plan.interval, plan.intervalCount) : 0,
      startDate: day(start),
      nextBillingDate: status === 'ACTIVE' ? day(new Date(lastPay + cyc * DAY)) : undefined,
      lastPaymentDate: day(new Date(lastPay)),
      lastPaymentAmount: plan.price,
      failedPayments: 0,
      cancelledDate: cancelledAt ? day(new Date(cancelledAt)) : undefined,
    });

    // Recurring charges inside the dataset window become T0002 transactions.
    for (const at of payments) {
      if (at < windowStart) continue;
      const ts = new Date(at + Math.floor(rand() * 6) * 3_600_000);
      if (ts.getTime() > today.getTime()) continue;
      const fee = round2(plan.price * 0.0349 + 0.49);
      transactions.push({
        transactionId: id(17),
        date: day(ts),
        datetime: ts.toISOString(),
        eventCode: 'T0002',
        type: 'Payment',
        status: 'Completed',
        gross: plan.price,
        fee: -fee,
        net: round2(plan.price - fee),
        currency: 'USD',
        customerEmail: email,
        customerName: `${first} ${last}`,
        country: subs[subs.length - 1].country ?? 'US',
        instrument: 'PayPal Wallet',
        item: plan.name,
        subscriptionId: subId,
      });
    }
  }

  // Failed renewals: a few active subscriptions whose last charge bounced → SUSPENDED (MRR at risk).
  // Only established subscribers (3+ cycles): their latest renewal is the one that failed.
  const active = subs.filter((s) => s.status === 'ACTIVE' && s.nextBillingDate && today.getTime() - Date.parse(s.startDate) >= 3 * cycleDays(s.interval, s.intervalCount) * DAY);
  for (let k = 0; k < cfg.suspended && active.length; k++) {
    const s = active.splice(Math.floor(rand() * active.length), 1)[0];
    s.status = 'SUSPENDED';
    s.failedPayments = 1 + Math.floor(rand() * 2);
    s.monthlyValue = 0;
    s.nextBillingDate = undefined;
    const mine = transactions.filter((t) => t.subscriptionId === s.subscriptionId).sort((a, b) => a.datetime.localeCompare(b.datetime));
    const failed = mine.pop();
    if (failed) transactions.splice(transactions.indexOf(failed), 1);
    const prev = mine.at(-1);
    s.lastPaymentDate = prev?.date ?? s.lastPaymentDate;
  }
  return subs.sort((a, b) => b.startDate.localeCompare(a.startDate));
}

/** Gives every demo invoice realistic product lines that add up to its amount. */
export function addInvoiceItems(invoices: InvoiceRow[], products: readonly { name: string; price: number }[], seed: number) {
  const rand = mulberry32(seed);
  for (const inv of invoices) {
    const lines: InvoiceItem[] = [];
    const n = 1 + Math.floor(rand() * 3);
    const pool = [...products].sort(() => rand() - 0.5).slice(0, n);
    let remaining = inv.amount;
    pool.forEach((p, i) => {
      const share = i === pool.length - 1 ? remaining : remaining * (0.35 + rand() * 0.3);
      const qty = Math.max(1, Math.round(share / p.price));
      lines.push({ name: p.name, quantity: qty, unitPrice: p.price, total: round2(qty * p.price) });
      remaining -= qty * p.price;
    });
    const subtotal = round2(lines.reduce((s, l) => s + l.total, 0));
    const diff = round2(inv.amount - subtotal);
    if (Math.abs(diff) >= 0.01) lines.push({ name: diff > 0 ? 'Shipping & handling' : 'Wholesale discount', quantity: 1, unitPrice: diff, total: diff });
    inv.items = lines;
    inv.itemsSummary = summarizeItems(lines);
  }
}

export function summarizeItems(items: InvoiceItem[]): string {
  return items
    .filter((l) => !/^(Shipping|Wholesale discount|Discount)/.test(l.name))
    .map((l) => `${l.name} ×${l.quantity}`)
    .join(', ');
}
