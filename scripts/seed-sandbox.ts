/**
 * npm run seed:sandbox
 * Fills YOUR PayPal sandbox business account with realistic activity so live mode has a story:
 *   - captured card payments for coffee products (some get refunded)
 *   - wholesale invoices: some sent and unpaid with past due dates (overdue)
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

const PRODUCTS = [
  ['Ceramic Pour-Over Kit', 64],
  ['Burr Grinder Pro', 189],
  ['Single-Origin Beans 1kg', 32],
  ['Gooseneck Kettle', 79],
  ['Cold Brew Tower', 149],
] as const;

// Sandbox test card. Generate your own at developer.paypal.com → Testing tools → Credit card generator
// and put it in SANDBOX_CARD_NUMBER / SANDBOX_CARD_EXPIRY (YYYY-MM). Requires card processing on the app.
const TEST_CARD = {
  number: process.env.SANDBOX_CARD_NUMBER || '4032035809742661',
  expiry: process.env.SANDBOX_CARD_EXPIRY || '2030-12',
  name: 'Sandbox Buyer',
  security_code: process.env.SANDBOX_CARD_CVV || '123',
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const rid = () => crypto.randomUUID();

async function cardPayment(item: string, price: number, qty = 1) {
  const value = (price * qty).toFixed(2);
  const order = await paypalPost(
    '/v2/checkout/orders',
    {
      intent: 'CAPTURE',
      purchase_units: [
        {
          description: item,
          amount: { currency_code: 'USD', value, breakdown: { item_total: { currency_code: 'USD', value } } },
          items: [{ name: item, quantity: String(qty), unit_amount: { currency_code: 'USD', value: price.toFixed(2) }, category: 'PHYSICAL_GOODS' }],
        },
      ],
      payment_source: { card: TEST_CARD },
    },
    { 'PayPal-Request-Id': rid(), Prefer: 'return=representation' },
  );
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

async function invoice(recipient: { name: string; email: string }, amount: number, invoiceDaysAgo: number, termDays: number) {
  const inv = await paypalPost(
    '/v2/invoicing/invoices',
    {
      detail: {
        currency_code: 'USD',
        invoice_date: isoDate(-invoiceDaysAgo),
        payment_term: { due_date: isoDate(-invoiceDaysAgo + termDays) },
        note: 'Wholesale coffee order – thank you!',
      },
      invoicer: { business_name: 'Altura Coffee Supply' },
      primary_recipients: [{ billing_info: { business_name: recipient.name, email_address: recipient.email } }],
      items: [{ name: 'Wholesale beans & supplies', quantity: '1', unit_amount: { currency_code: 'USD', value: amount.toFixed(2) } }],
    },
    { Prefer: 'return=representation' },
  );
  const id = inv.id ?? String(inv.href ?? '').split('/').pop();
  await paypalPost(`/v2/invoicing/invoices/${id}/send`, { send_to_recipient: true, send_to_invoicer: false });
  return id as string;
}

async function main() {
  console.log('Seeding PayPal sandbox…\n');

  let payments = 0;
  let refunds = 0;
  for (let i = 0; i < 24; i++) {
    const [item, price] = PRODUCTS[i % PRODUCTS.length];
    try {
      const captureId = await cardPayment(item, price, item.includes('Beans') ? 2 : 1);
      payments++;
      // Pour-over kits get refunded (the "damaged batch" story); a few partial refunds elsewhere.
      if (item.startsWith('Ceramic') || i % 9 === 0) {
        await sleep(300);
        await refund(captureId, item.startsWith('Ceramic') ? undefined : (price / 2).toFixed(2));
        refunds++;
      }
      process.stdout.write('.');
    } catch (e) {
      console.log(`\n  payment skipped: ${(e as Error).message}`);
      if (payments === 0 && i >= 2) {
        console.log('  → Card payments seem disabled on this sandbox app. Enable "Advanced Credit and Debit Card Payments" or create payments with a sandbox buyer (see docs).');
        break;
      }
    }
  }
  console.log(`\n✔ ${payments} payments, ${refunds} refunds`);

  const clients = [
    { name: 'Café Lumbre', email: 'sb-cafe-lumbre@example.com' },
    { name: 'Northside Roasters', email: 'sb-northside@example.com' },
    { name: 'Hotel Antigua Central', email: 'sb-hotel-antigua@example.com' },
  ];
  let invoices = 0;
  for (const [i, c] of clients.entries()) {
    try {
      // invoice issued 40/30/15 days ago with 30-day terms → 10, 0 and -15 days overdue
      await invoice(c, 850 + i * 610, [64, 42, 36][i], 30);
      invoices++;
    } catch (e) {
      console.log(`  invoice skipped: ${(e as Error).message}`);
    }
  }
  console.log(`✔ ${invoices} invoices sent`);
  console.log('\nNote: Transaction Search can take up to 3 hours to show new sandbox activity.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
