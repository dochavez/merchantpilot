/**
 * npm run sandbox:buyer-order
 * Creates a PayPal order that a SANDBOX BUYER ACCOUNT must approve in the browser, then captures it.
 * Card payments from seed:sandbox have no buyer account, so they can't be disputed; this one can:
 * afterwards log in to https://www.sandbox.paypal.com as that buyer → Activity → the payment →
 * "Report a problem" to open a real sandbox dispute.
 */
import './_env';
import { config, hasPayPalCredentials } from '../lib/config';
import { paypalGet, paypalPost } from '../lib/paypal/rest';

if (!hasPayPalCredentials() || !config.paypal.baseUrl.includes('sandbox')) {
  console.error('Needs sandbox PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET in .env.local.');
  process.exit(1);
}

const item = process.argv.includes('--grinder') ? ['Burr Grinder Pro', 189] : ['Gooseneck Kettle', 79];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const value = (item[1] as number).toFixed(2);
  const order = await paypalPost(
    '/v2/checkout/orders',
    {
      intent: 'CAPTURE',
      purchase_units: [
        {
          description: item[0],
          amount: { currency_code: 'USD', value, breakdown: { item_total: { currency_code: 'USD', value } } },
          items: [{ name: item[0], quantity: '1', unit_amount: { currency_code: 'USD', value }, category: 'PHYSICAL_GOODS' }],
        },
      ],
      payment_source: {
        paypal: {
          experience_context: {
            brand_name: 'Altura Coffee Supply',
            user_action: 'PAY_NOW',
            shipping_preference: 'GET_FROM_FILE',
            return_url: 'https://example.com/merchantpilot-approved',
            cancel_url: 'https://example.com/merchantpilot-cancelled',
          },
        },
      },
    },
    { 'PayPal-Request-Id': crypto.randomUUID(), Prefer: 'return=representation' },
  );
  const approve = order.links?.find((l: any) => l.rel === 'payer-action' || l.rel === 'approve')?.href;
  console.log(`\nOrder ${order.id} for ${item[0]} (${value} USD) created.\n`);
  console.log('1. Open this link and log in with your SANDBOX PERSONAL (buyer) account:');
  console.log(`   ${approve}\n`);
  console.log('   (Developer Dashboard → Testing Tools → Sandbox Accounts → the "Personal" account → View/edit for email & password)');
  console.log('2. Click "Pay" / "Complete purchase". You will land on example.com – that is expected, come back here.\n');
  console.log('Waiting for approval (up to 10 minutes)…');

  for (let i = 0; i < 120; i++) {
    await sleep(5000);
    const o = await paypalGet(`/v2/checkout/orders/${order.id}`);
    if (o.status === 'APPROVED') {
      const cap = await paypalPost(`/v2/checkout/orders/${order.id}/capture`, {}, { 'PayPal-Request-Id': crypto.randomUUID() });
      const capture = cap.purchase_units?.[0]?.payments?.captures?.[0];
      console.log(`\n✔ Captured ${capture?.id} (${capture?.status}).`);
      console.log('\nTo open a dispute: log in to https://www.sandbox.paypal.com as the same buyer → Activity → this payment →');
      console.log('"Report a problem" → "I didn\'t receive it". It shows up in MerchantPilot within a few minutes (Disputes API).');
      return;
    }
    if (o.status === 'COMPLETED') return console.log('Already completed.');
    process.stdout.write('.');
  }
  console.log('\nTimed out. Run the script again when you are ready to approve.');
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
