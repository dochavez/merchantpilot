/**
 * npm run seed:sandbox
 * Fills YOUR PayPal sandbox business account with realistic activity so live mode has a story:
 *   - captured card payments for coffee products (some get refunded)
 *   - wholesale invoices with product line items: some overdue, some not yet due, some paid
 *   Subscriptions need a buyer approval each: see `npm run sandbox:subscription`.
 *
 * Disputes cannot be created by the seller via API; see docs/SETUP.es.md ("Crear disputas").
 * Safe to run more than once. Uses only sandbox endpoints.
 */
import './_env';
import { config, hasPayPalCredentials } from '../lib/config';
import { paypalPost } from '../lib/paypal/rest';

if (!hasPayPalCredentials()) {
  console.error('Set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET in .env.local first.');
  process.exit(1);
}
if (!config.paypal.baseUrl.includes('sandbox')) {
  console.error('Refusing to seed a non-sandbox PayPal environment.');
  process.exit(1);
}

// npm run seed:sandbox -- --payments 100 --refunds 21 [--invoices 3 | --no-invoices]
// Only invoices:  npm run seed:sandbox -- --payments 0 --invoices 30
// Tip: PayPal records each payment with TODAY's date (it cannot be back-dated). For nicer trend
// charts run a smaller batch on several days, e.g. `npm run seed:sandbox -- --payments 15 --refunds 3 --no-invoices`.
function arg(name: string, fallback: number) {
  const i = process.argv.indexOf(`--${name}`);
  const v = i >= 0 ? Number(process.argv[i + 1]) : NaN;
  return Number.isFinite(v) && v >= 0 ? v : fallback;
}
const N_PAYMENTS = Math.min(arg('payments', 100), 300);
const N_REFUNDS = Math.min(arg('refunds', Math.round(N_PAYMENTS * 0.21)), N_PAYMENTS);
const N_INVOICES = process.argv.includes('--no-invoices') ? 0 : Math.min(arg('invoices', 3), 60);
const WITH_INVOICES = N_INVOICES > 0;

// Same catalogue (and weights) as the demo dataset, so live and demo charts look alike.
const PRODUCTS = [
  { name: 'Ceramic Pour-Over Kit', price: 64, weight: 14 },
  { name: 'Burr Grinder Pro', price: 189, weight: 6 },
  { name: 'Single-Origin Beans 1kg', price: 32, weight: 30 },
  { name: 'Gooseneck Kettle', price: 79, weight: 10 },
  { name: 'Espresso Tamper Set', price: 45, weight: 8 },
  { name: 'Cold Brew Tower', price: 149, weight: 4 },
  { name: 'Barista Course (online)', price: 120, weight: 5 },
  { name: 'Paper Filters x200', price: 12, weight: 23 },
];
const BUYERS = ['Ana López', 'Carlos Pérez', 'Emily Carter', 'James Miller', 'Lucía Gómez', 'Sofía Herrera', 'Michael Brown', 'Diego Ramírez', 'Olivia Wilson', 'Mateo Castillo', 'Grace Lee', 'Valentina Ruiz'];
const COUNTRIES = [
  ['US', 'San Jose', 'CA', '95131', '2211 N First St'],
  ['US', 'Austin', 'TX', '78701', '500 Congress Ave'],
  ['MX', 'Ciudad de México', 'CMX', '06600', 'Av. Reforma 222'],
  ['US', 'Miami', 'FL', '33131', '1001 Brickell Bay Dr'],
  ['CA', 'Toronto', 'ON', 'M5V 2T6', '100 King St W'],
] as const;

// Deterministic pseudo-random so two runs look alike but not identical between batches.
let seed = Date.now() % 100_000;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
function weighted<T extends { weight: number }>(xs: readonly T[]): T {
  const total = xs.reduce((a, x) => a + x.weight, 0);
  let r = rnd() * total;
  for (const x of xs) if ((r -= x.weight) <= 0) return x;
  return xs[xs.length - 1];
}
const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rnd() * xs.length)];
/** Card holder / shipping names: plain ASCII letters only (PayPal rejects accents in some fields). */
const deaccent = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const ascii = (t: string) => deaccent(t).replace(/[^A-Za-z .'-]/g, '');
let shippingSupported = true;


// Sandbox test card. Generate your own at developer.paypal.com → Testing tools → Credit card generator
// and put it in SANDBOX_CARD_NUMBER / SANDBOX_CARD_EXPIRY (YYYY-MM). Requires card processing on the app.
/** PayPal wants YYYY-MM; the card generator shows MM/YYYY. Accept MM/YYYY, MM/YY, MM-YYYY or YYYY-MM. */
function normalizeExpiry(raw: string): string {
  const t = raw.trim();
  let m = t.match(/^(\d{4})[-/](\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}`;
  m = t.match(/^(\d{1,2})\s*[-/]\s*(\d{2}|\d{4})$/);
  if (m) return `${m[2].length === 2 ? '20' + m[2] : m[2]}-${m[1].padStart(2, '0')}`;
  return t;
}

const TEST_CARD = {
  number: process.env.SANDBOX_CARD_NUMBER || '4032035809742661',
  expiry: normalizeExpiry(process.env.SANDBOX_CARD_EXPIRY || '2030-12'),
  name: 'Sandbox Buyer',
  security_code: process.env.SANDBOX_CARD_CVV || '123',
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const rid = () => crypto.randomUUID();

async function cardPayment(item: string, price: number, qty = 1, buyer = 'Sandbox Buyer', country: readonly string[] = COUNTRIES[0]) {
  const value = (price * qty).toFixed(2);
  const name = ascii(buyer) || 'Sandbox Buyer';
  const body = (withShipping: boolean) => ({
    intent: 'CAPTURE',
    purchase_units: [
      {
        description: item,
        amount: { currency_code: 'USD', value, breakdown: { item_total: { currency_code: 'USD', value } } },
        items: [{ name: item, quantity: String(qty), unit_amount: { currency_code: 'USD', value: price.toFixed(2) }, category: 'PHYSICAL_GOODS' }],
        ...(withShipping
          ? {
              shipping: {
                name: { full_name: name },
                address: { address_line_1: deaccent(country[4]), admin_area_2: deaccent(country[1]), admin_area_1: country[2], postal_code: country[3], country_code: country[0] },
              },
            }
          : {}),
      },
    ],
    payment_source: { card: { ...TEST_CARD, name } },
  });
  let order: any;
  try {
    order = await paypalPost('/v2/checkout/orders', body(shippingSupported), { 'PayPal-Request-Id': rid(), Prefer: 'return=representation' });
  } catch (e) {
    // Some sandbox apps reject the shipping block; fall back to the payload that always worked.
    const msg = (e as Error).message;
    // Only fall back when PayPal complains about the shipping block itself.
    if (!shippingSupported || !/field=\/purchase_units\/\d+\/shipping/.test(msg)) throw e;
    console.log(`\n  shipping details rejected (${msg.split('[')[1] ?? 'no detail'}); continuing without country data`);
    shippingSupported = false;
    order = await paypalPost('/v2/checkout/orders', body(false), { 'PayPal-Request-Id': rid(), Prefer: 'return=representation' });
  }
  let capture = order.purchase_units?.[0]?.payments?.captures?.[0];
  if (!capture && order.status === 'APPROVED') {
    const cap = await paypalPost(`/v2/checkout/orders/${order.id}/capture`, {}, { 'PayPal-Request-Id': rid() });
    capture = cap.purchase_units?.[0]?.payments?.captures?.[0];
  }
  if (!capture) throw new Error(`Order ${order.id} status ${order.status}; card capture not available`);
  return capture.id as string;
}

async function refund(captureId: string, amount?: string) {
  return paypalPost(`/v2/payments/captures/${captureId}/refund`, amount ? { amount: { currency_code: 'USD', value: amount } } : {}, { 'PayPal-Request-Id': rid() });
}

function isoDate(daysFromToday: number) {
  return new Date(Date.now() + daysFromToday * 86_400_000).toISOString().slice(0, 10);
}

type Line = { name: string; qty: number; price: number };

/** 1-3 catalogue products with wholesale quantities that add up to roughly `target` USD. */
function invoiceLines(target: number): Line[] {
  const n = 1 + Math.floor(rnd() * 3);
  const pool = [...PRODUCTS].sort(() => rnd() - 0.5).slice(0, n);
  let remaining = target;
  return pool.map((p, i) => {
    const share = i === pool.length - 1 ? remaining : remaining * (0.35 + rnd() * 0.3);
    const qty = Math.max(1, Math.round(share / p.price));
    remaining = Math.max(p.price, remaining - qty * p.price);
    return { name: p.name, qty, price: p.price };
  });
}

async function invoice(recipient: { name: string; email: string }, targetAmount: number, invoiceDaysAgo: number, termDays: number) {
  const lines = invoiceLines(targetAmount);
  const total = lines.reduce((s, l) => s + l.qty * l.price, 0);
  const reference = lines.map((l) => `${l.name} ×${l.qty}`).join(', ').slice(0, 120);
  const inv = await paypalPost(
    '/v2/invoicing/invoices',
    {
      detail: {
        currency_code: 'USD',
        invoice_date: isoDate(-invoiceDaysAgo),
        payment_term: { due_date: isoDate(-invoiceDaysAgo + termDays) },
        reference,
        note: 'Wholesale coffee order – thank you!',
      },
      invoicer: { business_name: 'Altura Coffee Supply' },
      primary_recipients: [{ billing_info: { business_name: recipient.name, email_address: recipient.email } }],
      items: lines.map((l) => ({ name: l.name, quantity: String(l.qty), unit_amount: { currency_code: 'USD', value: l.price.toFixed(2) }, unit_of_measure: 'QUANTITY' })),
    },
    { Prefer: 'return=representation' },
  );
  const id = inv.id ?? String(inv.href ?? '').split('/').pop();
  await paypalPost(`/v2/invoicing/invoices/${id}/send`, { send_to_recipient: true, send_to_invoicer: false });
  return { id: id as string, total };
}

/** Records an off-PayPal payment so the invoice shows as paid (MARKED_AS_PAID). */
async function markPaid(id: string, amount: number, daysAgo: number) {
  await paypalPost(`/v2/invoicing/invoices/${id}/payments`, { method: 'BANK_TRANSFER', payment_date: isoDate(-daysAgo), amount: { currency_code: 'USD', value: amount.toFixed(2) }, note: 'Paid by bank transfer' });
}

async function main() {
  console.log('Seeding PayPal sandbox…\n');

  console.log(`Plan: ${N_PAYMENTS} payments, ${N_REFUNDS} refunds, ${N_INVOICES} invoices`);
  const captures: { id: string; item: string; price: number; qty: number }[] = [];
  let failures = 0;
  for (let i = 0; i < N_PAYMENTS; i++) {
    const p = weighted(PRODUCTS);
    const qty = p.price < 40 && rnd() < 0.4 ? 2 + Math.floor(rnd() * 3) : 1;
    const country = rnd() < 0.6 ? COUNTRIES[Math.floor(rnd() * 2)] : pick(COUNTRIES);
    try {
      const id = await cardPayment(p.name, p.price, qty, pick(BUYERS), country);
      captures.push({ id, item: p.name, price: p.price, qty });
      process.stdout.write('.');
    } catch (e) {
      failures++;
      console.log(`\n  payment skipped: ${(e as Error).message}`);
      if (captures.length === 0 && failures >= 3) {
        console.log('  → Stopping after 3 failed payments. Send the error above (with field=...) to fix it.');
        break;
      }
      await sleep(1000);
    }
    if (i % 10 === 9) await sleep(500); // be gentle with sandbox rate limits
  }
  console.log(`\n✔ ${captures.length} payments`);

  // Refunds tell the "damaged Pour-Over Kit batch" story: ~45% of the refunds are full refunds of
  // pour-over kits, the rest are partial refunds spread over other products.
  const kits = captures.filter((c) => c.item.startsWith('Ceramic'));
  const others = captures.filter((c) => !c.item.startsWith('Ceramic'));
  const kitRefunds = Math.min(kits.length, Math.round(N_REFUNDS * 0.45));
  const plan = [...kits.slice(0, kitRefunds).map((c) => ({ c, full: true })), ...others.filter((_, i) => i % 3 === 0).slice(0, N_REFUNDS - kitRefunds).map((c) => ({ c, full: rnd() < 0.3 }))];
  let refunds = 0;
  for (const { c, full } of plan) {
    try {
      await refund(c.id, full ? undefined : ((c.price * c.qty) / 2).toFixed(2));
      refunds++;
      process.stdout.write('r');
    } catch (e) {
      console.log(`\n  refund skipped: ${(e as Error).message}`);
    }
    await sleep(300);
  }
  console.log(`\n✔ ${refunds} refunds (${Math.min(kitRefunds, refunds)} pour-over kits)`);
  if (!WITH_INVOICES) {
    console.log('\nNote: Transaction Search can take up to 3 hours to show new sandbox activity.');
    return;
  }

  const clients = [
    { name: 'Café Lumbre', email: 'sb-cafe-lumbre@example.com' },
    { name: 'Northside Roasters', email: 'sb-northside@example.com' },
    { name: 'Hotel Central Plaza', email: 'sb-hotel-central@example.com' },
    { name: 'Campus Coffee Co-op', email: 'sb-campus-coop@example.com' },
    { name: 'La Esquina Bakery', email: 'sb-esquina-bakery@example.com' },
    { name: 'Volcán Coworking', email: 'sb-volcan-cowork@example.com' },
    { name: 'Bean & Leaf Bistro', email: 'sb-bean-leaf@example.com' },
    { name: 'Hostal Santa Clara', email: 'sb-santa-clara@example.com' },
    { name: 'Riverside Deli', email: 'sb-riverside-deli@example.com' },
    { name: 'Pacific Office Park', email: 'sb-pacific-office@example.com' },
    { name: 'Mercado Verde', email: 'sb-mercado-verde@example.com' },
    { name: 'Summit Hotel Group', email: 'sb-summit-hotels@example.com' },
  ];
  // Mix: ~45% overdue (a few very late), ~30% not due yet, ~25% already paid.
  // The first three keep the original story: 34, 12 and 6 days overdue.
  const FIXED = [
    { daysAgo: 64, amount: 850, kind: 'open' },
    { daysAgo: 42, amount: 1460, kind: 'open' },
    { daysAgo: 36, amount: 2070, kind: 'open' },
  ] as const;
  let invoices = 0;
  let paid = 0;
  for (let i = 0; i < N_INVOICES; i++) {
    const c = clients[i % clients.length];
    let daysAgo: number;
    let amount: number;
    let kind: 'open' | 'paid';
    if (i < FIXED.length) ({ daysAgo, amount, kind } = FIXED[i]);
    else {
      const r = rnd();
      kind = r < 0.25 ? 'paid' : 'open';
      daysAgo = r < 0.25 ? 20 + Math.floor(rnd() * 60) : r < 0.7 ? 35 + Math.floor(rnd() * 55) : 2 + Math.floor(rnd() * 25);
      amount = Math.round((180 + rnd() * 3000) / 5) * 5;
    }
    try {
      const { id, total } = await invoice(c, amount, daysAgo, 30);
      invoices++;
      if (kind === 'paid') {
        await markPaid(id, total, Math.max(0, daysAgo - 25 - Math.floor(rnd() * 10)));
        paid++;
      }
      process.stdout.write(kind === 'paid' ? '$' : 'i');
    } catch (e) {
      console.log(`\n  invoice skipped: ${(e as Error).message}`);
    }
    await sleep(400);
  }
  console.log('');
  console.log(`✔ ${invoices} invoices sent (${paid} marked as paid, ${invoices - paid} open – those past their due date show as overdue)`);
  console.log('\nNote: Transaction Search can take up to 3 hours to show new sandbox activity.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
