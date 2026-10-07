/**
 * npm run sandbox:buyer-order [-- options]
 * Creates a PayPal order that a SANDBOX BUYER ACCOUNT approves (or cancels) in the browser, then captures it.
 * Card payments from seed:sandbox have no buyer account, so they can't be disputed; this one can:
 * afterwards log in to https://www.sandbox.paypal.com as that buyer → Activity → the payment →
 * "Report a problem" to open a real sandbox dispute.
 *
 * Options (test scenarios):
 *   --item kettle|grinder|beans|tower|course   product (default kettle)
 *   --amount 12.50                              custom price (edge cases: tiny or large amounts)
 *   --decline                                   sandbox negative test: the capture is declined (INSTRUMENT_DECLINED)
 *
 * PayPal sends the buyer back to a small page served by this script on http://localhost:4599, so the
 * script knows right away whether the buyer paid or walked away (cancelled checkout).
 */
import './_env';
import { config, hasPayPalCredentials } from '../lib/config';
import { paypalGet, paypalPost } from '../lib/paypal/rest';
import { CANCEL_URL, listenForReturn, RETURN_URL } from './_return-server';

if (!hasPayPalCredentials() || !config.paypal.baseUrl.includes('sandbox')) {
  console.error('Needs sandbox PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET in .env.local.');
  process.exit(1);
}

const CATALOG: Record<string, [string, number, string]> = {
  kettle: ['Gooseneck Kettle', 79, 'PHYSICAL_GOODS'],
  grinder: ['Burr Grinder Pro', 189, 'PHYSICAL_GOODS'],
  beans: ['Single-Origin Beans 1kg', 32, 'PHYSICAL_GOODS'],
  tower: ['Cold Brew Tower', 149, 'PHYSICAL_GOODS'],
  course: ['Barista Course (online)', 120, 'DIGITAL_GOODS'],
};
const opt = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const key = process.argv.includes('--grinder') ? 'grinder' : (opt('item') ?? 'kettle').toLowerCase();
const [itemName, basePrice, category] = CATALOG[key] ?? CATALOG.kettle;
const amountArg = Number(opt('amount'));
const price = Number.isFinite(amountArg) && amountArg > 0 ? amountArg : basePrice;
const DECLINE = process.argv.includes('--decline');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const value = price.toFixed(2);
  const ret = await listenForReturn('MerchantPilot is capturing the payment now…');
  const order = await paypalPost(
    '/v2/checkout/orders',
    {
      intent: 'CAPTURE',
      purchase_units: [
        {
          description: itemName,
          amount: { currency_code: 'USD', value, breakdown: { item_total: { currency_code: 'USD', value } } },
          items: [{ name: itemName, quantity: '1', unit_amount: { currency_code: 'USD', value }, category }],
        },
      ],
      payment_source: {
        paypal: {
          experience_context: {
            brand_name: 'Altura Coffee Supply',
            user_action: 'PAY_NOW',
            shipping_preference: category === 'DIGITAL_GOODS' ? 'NO_SHIPPING' : 'GET_FROM_FILE',
            return_url: RETURN_URL,
            cancel_url: CANCEL_URL,
          },
        },
      },
    },
    { 'PayPal-Request-Id': crypto.randomUUID(), Prefer: 'return=representation' },
  );
  const approve = order.links?.find((l: any) => l.rel === 'payer-action' || l.rel === 'approve')?.href;
  console.log(`\nOrder ${order.id} for ${itemName} (${value} USD) created.${DECLINE ? '  [--decline: the capture will be refused]' : ''}\n`);
  console.log('1. Open this link and log in with your SANDBOX PERSONAL (buyer) account:');
  console.log(`   ${approve}\n`);
  console.log('   (Developer Dashboard → Testing Tools → Sandbox Accounts → the "Personal" account → View/edit for email & password)');
  console.log('2. Click "Pay" – or "Cancel and return to Altura Coffee Supply" to test a cancelled checkout.\n');
  console.log('Waiting for the buyer (up to 10 minutes)…');

  let cancelled = false;
  void ret.wait.then((o) => (cancelled = o === 'cancelled'));
  try {
    for (let i = 0; i < 200; i++) {
      await sleep(3000);
      if (cancelled) {
        console.log('\n✖ Checkout cancelled by the buyer. Nothing was charged; the order expires on its own.');
        console.log('  Expected in MerchantPilot: no new sale, no alert, no change in KPIs.');
        return;
      }
      const o = await paypalGet(`/v2/checkout/orders/${order.id}`);
      if (o.status === 'APPROVED') {
        try {
          const cap = await paypalPost(
            `/v2/checkout/orders/${order.id}/capture`,
            {},
            { 'PayPal-Request-Id': crypto.randomUUID(), ...(DECLINE ? { 'PayPal-Mock-Response': JSON.stringify({ mock_application_codes: 'INSTRUMENT_DECLINED' }) } : {}) },
          );
          const capture = cap.purchase_units?.[0]?.payments?.captures?.[0];
          console.log(`\n✔ Captured ${capture?.id} (${capture?.status}).`);
          console.log(`\nRefund test: in MerchantPilot ask "Refund capture ${capture?.id}" (or a partial amount) and approve the card.`);
          console.log('Dispute test: log in to https://www.sandbox.paypal.com as the same buyer → Activity → this payment →');
          console.log('"Report a problem" → "I didn\'t receive it". It shows up in MerchantPilot within a few minutes.');
        } catch (e) {
          console.log(`\n✖ Capture declined: ${(e as Error).message}`);
          console.log('  Expected in MerchantPilot: no sale and no alert (PayPal never moved the money).');
        }
        return;
      }
      if (o.status === 'COMPLETED') return console.log('Already completed.');
      process.stdout.write('.');
    }
    console.log('\nTimed out. Run the script again when you are ready.');
  } finally {
    ret.close();
  }
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
