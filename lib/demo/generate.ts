/**
 * Deterministic demo dataset for "Altura Coffee Supply", a fictional online coffee-gear shop.
 *
 * It is used when no PayPal sandbox credentials are configured, so the app (and the hosted judge
 * demo) always has a realistic 90-day history to analyse. The data contains a story the agent can
 * discover on its own:
 *   1. Refunds spike in the last ~10 days, concentrated on the "Ceramic Pour-Over Kit"
 *      (a damaged shipping batch).
 *   2. A cluster of ITEM_NOT_RECEIVED disputes from Mexico + Guatemala (a carrier problem).
 *   3. Three wholesale invoices are overdue, one by more than a month.
 *
 * Dates are anchored to `today` so the demo always looks current.
 */
import type { DisputeRow, InvoiceRow, TransactionRow, Dataset } from '../types';

/* ------------------------------------------------------------------------------ tiny utilities */

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ALNUM = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789';

export function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function dayString(d: Date) {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, days: number) {
  return new Date(d.getTime() + days * 86_400_000);
}

/* --------------------------------------------------------------------------------- catalogue */

export const DEMO_MERCHANT = 'Altura Coffee Supply (demo)';

const PRODUCTS = [
  { name: 'Ceramic Pour-Over Kit', price: 64, weight: 14 },
  { name: 'Burr Grinder Pro', price: 189, weight: 6 },
  { name: 'Single-Origin Beans 1kg', price: 32, weight: 30 },
  { name: 'Gooseneck Kettle', price: 79, weight: 10 },
  { name: 'Espresso Tamper Set', price: 45, weight: 8 },
  { name: 'Cold Brew Tower', price: 149, weight: 4 },
  { name: 'Barista Course (online)', price: 120, weight: 5 },
  { name: 'Paper Filters x200', price: 12, weight: 23 },
] as const;

const COUNTRIES = [
  { code: 'US', weight: 48 },
  { code: 'CA', weight: 10 },
  { code: 'GB', weight: 9 },
  { code: 'MX', weight: 11 },
  { code: 'GT', weight: 8 },
  { code: 'DE', weight: 7 },
  { code: 'ES', weight: 7 },
] as const;

const FIRST = ['Ana', 'Luis', 'Maya', 'Noah', 'Sofía', 'Liam', 'Valeria', 'Ethan', 'Camila', 'Diego', 'Emma', 'Mateo', 'Olivia', 'Lucas', 'Isabella', 'Hugo', 'Chloe', 'Pablo', 'Grace', 'Iván'];
const LAST = ['García', 'Smith', 'Lopez', 'Chen', 'Martínez', 'Brown', 'Hernández', 'Müller', 'Rossi', 'Wilson', 'Pérez', 'Taylor', 'Ramírez', 'Clark', 'Morales', 'Evans'];
const INSTRUMENTS = ['PayPal Wallet', 'PayPal Wallet', 'PayPal Wallet', 'Credit Card', 'Debit Card', 'Venmo', 'Pay Later'];

const WHOLESALE = [
  { name: 'Café Lumbre', email: 'pagos@cafelumbre.example' },
  { name: 'Northside Roasters', email: 'ap@northside.example' },
  { name: 'Bean & Leaf Bistro', email: 'billing@beanleaf.example' },
  { name: 'Hotel Antigua Central', email: 'cuentas@hotelantigua.example' },
  { name: 'Campus Coffee Co-op', email: 'treasurer@campuscoop.example' },
];

/* ------------------------------------------------------------------------------- generator */

export interface GenerateOptions {
  today?: Date;
  days?: number;
  seed?: number;
}

export function generateDemoDataset(opts: GenerateOptions = {}): Dataset {
  const rand = mulberry32(opts.seed ?? 20261112);
  const today = opts.today ?? new Date();
  const days = opts.days ?? 90;

  const pick = <T,>(arr: readonly T[]) => arr[Math.floor(rand() * arr.length)];
  const weighted = <T extends { weight: number }>(arr: readonly T[]) => {
    const total = arr.reduce((s, x) => s + x.weight, 0);
    let r = rand() * total;
    for (const x of arr) {
      r -= x.weight;
      if (r <= 0) return x;
    }
    return arr[arr.length - 1];
  };
  const id = (len = 17) => Array.from({ length: len }, () => ALNUM[Math.floor(rand() * ALNUM.length)]).join('');
  const fee = (gross: number) => round2(gross * 0.0349 + 0.49);

  const transactions: TransactionRow[] = [];
  const disputes: DisputeRow[] = [];

  const start = addDays(today, -days + 1);
  for (let d = 0; d < days; d++) {
    const day = addDays(start, d);
    const daysAgo = days - 1 - d;
    const dow = day.getUTCDay();
    // Weekly seasonality + slow growth trend.
    const base = 22 + d * 0.12 + (dow === 0 || dow === 6 ? 9 : 0);
    const orders = Math.max(5, Math.round(base + (rand() - 0.5) * 10));

    for (let o = 0; o < orders; o++) {
      const product = weighted(PRODUCTS);
      const qty = product.price < 20 ? 1 + Math.floor(rand() * 3) : 1;
      const gross = round2(product.price * qty * (rand() < 0.15 ? 0.9 : 1));
      const country = weighted(COUNTRIES).code;
      const first = pick(FIRST);
      const last = pick(LAST);
      const email = `${first}.${last}${Math.floor(rand() * 90 + 10)}`
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase() + '@example.com';
      const ts = new Date(day.getTime() + Math.floor(rand() * 86_400_000));
      const f = fee(gross);
      const txId = id();
      const pending = daysAgo === 0 && rand() < 0.2;
      transactions.push({
        transactionId: txId,
        date: dayString(ts),
        datetime: ts.toISOString(),
        eventCode: 'T0006',
        type: 'Payment',
        status: pending ? 'Pending' : 'Completed',
        gross,
        fee: -f,
        net: round2(gross - f),
        currency: 'USD',
        customerEmail: email,
        customerName: `${first} ${last}`,
        country,
        instrument: pick(INSTRUMENTS),
        item: product.name,
      });

      // ---- refunds: 2% baseline, pour-over kit spikes in the last 10 days (damaged batch)
      const spike = product.name === 'Ceramic Pour-Over Kit' && daysAgo <= 10 && daysAgo >= 1;
      const refundP = spike ? 0.45 : 0.02;
      if (!pending && rand() < refundP) {
        const lag = 1 + Math.floor(rand() * 3);
        const rts = new Date(Math.min(ts.getTime() + lag * 86_400_000, today.getTime() - 3_600_000));
        const partial = !spike && rand() < 0.3;
        const amount = partial ? round2(gross * 0.5) : gross;
        transactions.push({
          transactionId: id(),
          date: dayString(rts),
          datetime: rts.toISOString(),
          eventCode: 'T1107',
          type: 'Refund',
          status: 'Completed',
          gross: -amount,
          fee: partial ? 0 : round2(f - 0.49),
          net: round2(-amount + (partial ? 0 : f - 0.49)),
          currency: 'USD',
          customerEmail: email,
          customerName: `${first} ${last}`,
          country,
          instrument: 'PayPal Wallet',
          item: product.name,
          relatedTransactionId: txId,
        });
        const original = transactions.find((t) => t.transactionId === txId);
        if (original) original.status = partial ? 'Partially refunded' : 'Completed';
      }

      // ---- disputes: carrier problem to MX/GT in the last 16 days + a few historical ones
      const carrierIssue = (country === 'MX' || country === 'GT') && daysAgo >= 4 && daysAgo <= 16 && product.price >= 40;
      const disputeP = carrierIssue ? 0.18 : spike ? 0.06 : 0.0025;
      if (!pending && rand() < disputeP) {
        const reason = carrierIssue
          ? 'MERCHANDISE_OR_SERVICE_NOT_RECEIVED'
          : spike
            ? 'MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED'
            : pick(['UNAUTHORISED', 'MERCHANDISE_OR_SERVICE_NOT_RECEIVED', 'CREDIT_NOT_PROCESSED']);
        const created = addDays(ts, 2 + Math.floor(rand() * 3));
        const createdDate = created > today ? today : created;
        const resolved = daysAgo > 30;
        const due = addDays(createdDate, 20);
        const daysToRespond = Math.max(0, Math.ceil((due.getTime() - today.getTime()) / 86_400_000));
        disputes.push({
          disputeId: 'PP-D-' + Math.floor(rand() * 9_000_000 + 1_000_000),
          transactionId: txId,
          reason,
          status: resolved ? 'RESOLVED' : rand() < 0.75 ? 'WAITING_FOR_SELLER_RESPONSE' : 'UNDER_REVIEW',
          stage: resolved ? 'CHARGEBACK' : reason === 'UNAUTHORISED' ? 'CHARGEBACK' : 'INQUIRY',
          amount: gross,
          currency: 'USD',
          createdDate: dayString(createdDate),
          responseDueDate: dayString(due),
          daysToRespond: resolved ? 0 : daysToRespond,
          customerEmail: email,
          item: product.name,
          outcome: resolved ? pick(['RESOLVED_SELLER_FAVOUR', 'RESOLVED_BUYER_FAVOUR', 'RESOLVED_SELLER_FAVOUR']) : undefined,
        });
      }
    }

    // Weekly payout to bank every Monday.
    if (dow === 1 && d > 0) {
      const ts = new Date(day.getTime() + 9 * 3_600_000);
      transactions.push({
        transactionId: id(),
        date: dayString(ts),
        datetime: ts.toISOString(),
        eventCode: 'T0400',
        type: 'Transfer',
        status: 'Completed',
        gross: -round2(3800 + rand() * 1600),
        fee: 0,
        net: 0,
        currency: 'USD',
        customerEmail: '',
        customerName: 'Bank withdrawal',
        country: 'US',
        instrument: 'Bank',
        item: 'Withdrawal to bank',
      });
      const last = transactions[transactions.length - 1];
      last.net = last.gross;
    }
  }

  // ---- wholesale invoices
  const invoices: InvoiceRow[] = [];
  let n = 1040;
  for (let i = 0; i < 14; i++) {
    const client = WHOLESALE[i % WHOLESALE.length];
    const invoiceDate = addDays(today, -Math.floor(5 + rand() * 80));
    const dueDate = addDays(invoiceDate, 30);
    const overdueDays = Math.floor((today.getTime() - dueDate.getTime()) / 86_400_000);
    let status: InvoiceRow['status'];
    if (overdueDays < 0) status = rand() < 0.4 ? 'PAID' : 'SENT';
    else status = rand() < 0.7 ? 'PAID' : 'SENT';
    invoices.push({
      invoiceId: 'INV2-' + id(4) + '-' + id(4) + '-' + id(4) + '-' + id(4),
      invoiceNumber: `ALT-${n++}`,
      status,
      recipientEmail: client.email,
      recipientName: client.name,
      amount: round2(450 + rand() * 2600),
      currency: 'USD',
      invoiceDate: dayString(invoiceDate),
      dueDate: dayString(dueDate),
      daysOverdue: status === 'SENT' ? Math.max(0, overdueDays) : 0,
    });
  }
  // Guarantee the story: exactly three overdue invoices, one >30 days.
  const overdue = invoices.filter((x) => x.daysOverdue > 0);
  const forced = [34, 12, 6];
  for (let i = overdue.length; i < 3; i++) {
    const inv = invoices.find((x) => x.status === 'PAID' && !overdue.includes(x));
    if (!inv) break;
    overdue.push(inv);
  }
  overdue.slice(0, 3).forEach((inv, i) => {
    const due = addDays(today, -forced[i]);
    inv.status = 'SENT';
    inv.dueDate = dayString(due);
    inv.invoiceDate = dayString(addDays(due, -30));
    inv.daysOverdue = forced[i];
  });
  overdue.slice(3).forEach((inv) => {
    inv.status = 'PAID';
    inv.daysOverdue = 0;
  });

  // Chargeback rows for disputes lost historically (money actually reversed).
  for (const d of disputes) {
    if (d.outcome === 'RESOLVED_BUYER_FAVOUR') {
      const tx = transactions.find((t) => t.transactionId === d.transactionId);
      if (!tx) continue;
      tx.status = 'Reversed';
      transactions.push({
        ...tx,
        transactionId: id(),
        eventCode: 'T1201',
        type: 'Chargeback',
        status: 'Completed',
        gross: -tx.gross,
        fee: -15,
        net: round2(-tx.gross - 15),
        date: d.createdDate,
        datetime: d.createdDate + 'T12:00:00.000Z',
        relatedTransactionId: tx.transactionId,
      });
    }
  }

  transactions.sort((a, b) => a.datetime.localeCompare(b.datetime));
  disputes.sort((a, b) => b.createdDate.localeCompare(a.createdDate));
  invoices.sort((a, b) => b.invoiceDate.localeCompare(a.invoiceDate));

  return {
    mode: 'demo',
    merchantName: DEMO_MERCHANT,
    currency: 'USD',
    generatedAt: today.toISOString(),
    transactions,
    disputes,
    invoices,
    warnings: [],
  };
}
