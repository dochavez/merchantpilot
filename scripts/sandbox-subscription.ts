/**
 * npm run sandbox:subscription [-- options]
 * Creates (once) the "Altura Coffee Club" product and its plans in YOUR PayPal sandbox, then a
 * subscription that a SANDBOX PERSONAL (buyer) account approves in the browser. PayPal charges the
 * first cycle right away, so MerchantPilot gets recurring revenue (MRR), subscribers and churn data.
 *
 * Options:
 *   --plan monthly|biweekly|office|trial    which plan (default monthly)
 *   --cancel                                cancel right after it activates (tests churn + alerts)
 *   --suspend                               suspend right after it activates (tests "MRR at risk")
 *   --plans-only                            only create the product and plans
 *
 * Sellers cannot create active subscriptions without the buyer's approval (PayPal rule), so each
 * subscription needs one click in the browser. Run the script several times with different plans and
 * buyers to build up data.
 */
import './_env';
import { config, hasPayPalCredentials } from '../lib/config';
import { paypalGet, paypalPost } from '../lib/paypal/rest';
import { CANCEL_URL, listenForReturn, RETURN_URL } from './_return-server';

if (!hasPayPalCredentials() || !config.paypal.baseUrl.includes('sandbox')) {
  console.error('Needs sandbox PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET in .env.local.');
  process.exit(1);
}

const PRODUCT_NAME = 'Altura Coffee Club';
type PlanDef = { key: string; name: string; price: string; unit: 'WEEK' | 'MONTH'; count: number; trialDays?: number };
const PLANS: PlanDef[] = [
  { key: 'monthly', name: 'Coffee Club – Monthly 1kg', price: '29.00', unit: 'MONTH', count: 1 },
  { key: 'biweekly', name: 'Coffee Club – Bi-weekly 500g', price: '17.00', unit: 'WEEK', count: 2 },
  { key: 'office', name: 'Office Coffee Plan', price: '149.00', unit: 'MONTH', count: 1 },
  { key: 'trial', name: 'Coffee Club – Monthly (7-day free trial)', price: '29.00', unit: 'MONTH', count: 1, trialDays: 7 },
];

const opt = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const rid = () => ({ 'PayPal-Request-Id': crypto.randomUUID(), Prefer: 'return=representation' });

async function ensureProduct(): Promise<string> {
  const list = await paypalGet('/v1/catalogs/products', { page_size: 20, total_required: true });
  const found = (list.products ?? []).find((p: any) => p.name === PRODUCT_NAME);
  if (found) return found.id;
  const p = await paypalPost('/v1/catalogs/products', { name: PRODUCT_NAME, description: 'Coffee subscriptions by Altura Coffee Supply', type: 'PHYSICAL' }, rid());
  console.log(`✔ Product created: ${p.id}`);
  return p.id;
}

async function ensurePlans(productId: string): Promise<Map<string, string>> {
  const list = await paypalGet('/v1/billing/plans', { product_id: productId, page_size: 20, total_required: true });
  const byName = new Map<string, string>((list.plans ?? []).filter((p: any) => p.status === 'ACTIVE').map((p: any) => [p.name, p.id]));
  const ids = new Map<string, string>();
  for (const def of PLANS) {
    let id = byName.get(def.name);
    if (!id) {
      const regular = { frequency: { interval_unit: def.unit, interval_count: def.count }, tenure_type: 'REGULAR', total_cycles: 0, pricing_scheme: { fixed_price: { value: def.price, currency_code: 'USD' } } };
      const cycles = def.trialDays
        ? [{ frequency: { interval_unit: 'DAY', interval_count: def.trialDays }, tenure_type: 'TRIAL', sequence: 1, total_cycles: 1 }, { ...regular, sequence: 2 }]
        : [{ ...regular, sequence: 1 }];
      const plan = await paypalPost(
        '/v1/billing/plans',
        {
          product_id: productId,
          name: def.name,
          status: 'ACTIVE',
          billing_cycles: cycles,
          payment_preferences: { auto_bill_outstanding: true, setup_fee_failure_action: 'CONTINUE', payment_failure_threshold: 2 },
        },
        rid(),
      );
      id = plan.id as string;
      console.log(`✔ Plan created: ${def.name} → ${id}`);
    }
    ids.set(def.key, id!);
  }
  return ids;
}

async function main() {
  const productId = await ensureProduct();
  const plans = await ensurePlans(productId);
  console.log(`\nPlans ready (${PRODUCT_NAME}):`);
  for (const def of PLANS) console.log(`  ${def.key.padEnd(9)} ${def.name} – ${def.price} USD every ${def.count > 1 ? def.count + ' ' : ''}${def.unit.toLowerCase()}${def.count > 1 ? 's' : ''}  (${plans.get(def.key)})`);
  if (process.argv.includes('--plans-only')) return;

  const key = (opt('plan') ?? 'monthly').toLowerCase();
  const def = PLANS.find((p) => p.key === key) ?? PLANS[0];
  const ret = await listenForReturn('MerchantPilot is activating the subscription…');
  const sub = await paypalPost(
    '/v1/billing/subscriptions',
    {
      plan_id: plans.get(def.key),
      custom_id: `merchantpilot-${def.key}`,
      application_context: { brand_name: 'Altura Coffee Supply', user_action: 'SUBSCRIBE_NOW', shipping_preference: 'NO_SHIPPING', return_url: RETURN_URL, cancel_url: CANCEL_URL },
    },
    rid(),
  );
  const approve = sub.links?.find((l: any) => l.rel === 'approve')?.href;
  console.log(`\nSubscription ${sub.id} for "${def.name}" created (status ${sub.status}).\n`);
  console.log('1. Open this link and log in with your SANDBOX PERSONAL (buyer) account:');
  console.log(`   ${approve}\n`);
  console.log('2. Click "Agree & Subscribe" – or cancel to test an abandoned sign-up.\n');
  console.log('Waiting for the buyer (up to 10 minutes)…');

  let cancelled = false;
  void ret.wait.then((o) => (cancelled = o === 'cancelled'));
  try {
    for (let i = 0; i < 200; i++) {
      await sleep(3000);
      if (cancelled) return console.log('\n✖ Sign-up cancelled by the buyer. Nothing was charged; the subscription stays APPROVAL_PENDING and expires.');
      const s = await paypalGet(`/v1/billing/subscriptions/${sub.id}`);
      if (s.status === 'ACTIVE' || s.status === 'APPROVED') {
        console.log(`\n✔ ${sub.id} is ${s.status}. Next billing: ${s.billing_info?.next_billing_time?.slice(0, 10) ?? '—'}${def.trialDays ? ` (free trial for ${def.trialDays} days)` : ''}.`);
        if (process.argv.includes('--cancel')) {
          await paypalPost(`/v1/billing/subscriptions/${sub.id}/cancel`, { reason: 'Churn test from MerchantPilot seed' });
          console.log('✖ Cancelled on purpose (--cancel): expect a "Subscription cancelled" alert in MerchantPilot.');
        } else if (process.argv.includes('--suspend')) {
          await paypalPost(`/v1/billing/subscriptions/${sub.id}/suspend`, { reason: 'Suspension test from MerchantPilot seed' });
          console.log('⏸ Suspended on purpose (--suspend): it counts as "MRR at risk" in MerchantPilot.');
        }
        console.log('\nIn MerchantPilot: with the webhook events BILLING.SUBSCRIPTION.* it appears within a minute.');
        console.log(`Without them, ask the AI: "Show subscription ${sub.id}" (it reads it from PayPal and keeps tracking it).`);
        return;
      }
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
