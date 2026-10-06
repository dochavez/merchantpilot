/**
 * Business registry: the primary business (env PayPal keys or demo), two built-in demo businesses
 * that show the portfolio features, and PayPal sandbox apps the owner adds (secrets encrypted).
 */
import { PRIMARY_BUSINESS, runInBusiness, type Business } from './business-context';
import { decrypt, encrypt } from './crypto';
import { DEMO_MERCHANT } from './demo/generate';
import { getStore } from './store';

interface StoredBusiness {
  id: string;
  name: string;
  clientId: string;
  secretBox: string;
  createdAt: string;
}

const DEMOS: Business[] = [
  { id: 'cafe', name: 'Altura Café Antigua (demo)', kind: 'demo', profile: 'cafe', description: 'In-person café in Antigua Guatemala' },
  { id: 'academy', name: 'Altura Barista Academy (demo)', kind: 'demo', profile: 'academy', description: 'Online barista courses (digital goods)' },
];

function envHasPayPal() {
  return Boolean(process.env.PAYPAL_CLIENT_ID && (process.env.PAYPAL_CLIENT_SECRET || process.env.PAYPAL_SECRET)) && !['1', 'true'].includes(process.env.FORCE_DEMO ?? '');
}

export function primaryBusiness(): Business {
  return {
    ...PRIMARY_BUSINESS,
    name: envHasPayPal() ? (process.env.MERCHANT_NAME ?? 'My PayPal business') : DEMO_MERCHANT,
    description: envHasPayPal() ? 'PayPal sandbox (live data)' : 'Online coffee-gear shop',
  };
}

async function stored(): Promise<StoredBusiness[]> {
  return (await getStore().getGlobal<StoredBusiness[]>('businesses')) ?? [];
}

export async function listBusinesses(opts: { withCreds?: boolean } = {}): Promise<Business[]> {
  const custom = (await stored()).map<Business>((s) => ({
    id: s.id,
    name: s.name,
    kind: 'paypal',
    description: 'PayPal sandbox app',
    createdAt: s.createdAt,
    ...(opts.withCreds ? { creds: { clientId: s.clientId, clientSecret: decrypt(s.secretBox) } } : {}),
  }));
  const demos = ['1', 'true'].includes(process.env.HIDE_DEMO_BUSINESSES ?? '') ? [] : DEMOS;
  return [primaryBusiness(), ...custom, ...demos];
}

export async function resolveBusiness(id: string | null | undefined): Promise<Business> {
  if (!id || id === 'primary') return primaryBusiness();
  const demo = DEMOS.find((d) => d.id === id);
  if (demo) return demo;
  const s = (await stored()).find((x) => x.id === id);
  if (!s) return primaryBusiness();
  try {
    return { id: s.id, name: s.name, kind: 'paypal', createdAt: s.createdAt, creds: { clientId: s.clientId, clientSecret: decrypt(s.secretBox) } };
  } catch {
    return primaryBusiness();
  }
}

export async function addBusiness(input: { name: string; clientId: string; clientSecret: string }): Promise<Business> {
  const name = input.name.trim().slice(0, 60);
  const clientId = input.clientId.trim();
  const clientSecret = input.clientSecret.trim();
  if (!name || !clientId || !clientSecret) throw new Error('Name, Client ID and Secret are required');
  const id = 'b' + Math.random().toString(36).slice(2, 8);
  const business: Business = { id, name, kind: 'paypal', creds: { clientId, clientSecret } };
  // Validate the keys before saving (gets an OAuth token from the PayPal sandbox).
  const { getAccessToken } = await import('./paypal/rest');
  await runInBusiness(business, () => getAccessToken());
  const list = await stored();
  list.push({ id, name, clientId, secretBox: encrypt(clientSecret), createdAt: new Date().toISOString() });
  await getStore().setGlobal('businesses', list);
  return { id, name, kind: 'paypal' };
}

export async function removeBusiness(id: string) {
  await getStore().setGlobal('businesses', (await stored()).filter((b) => b.id !== id));
}

/** Read the selected business from ?business=, the X-Business header or the mp_business cookie. */
export function businessIdFrom(req: Request): string | null {
  const q = new URL(req.url).searchParams.get('business');
  if (q) return q;
  const h = req.headers.get('x-business');
  if (h) return h;
  const m = /(?:^|;\s*)mp_business=([^;]+)/.exec(req.headers.get('cookie') ?? '');
  return m ? decodeURIComponent(m[1]) : null;
}

/** Route wrapper: runs the handler inside the selected business context. */
export function withBusiness<A extends unknown[]>(fn: (req: Request, ...rest: A) => Promise<Response>) {
  return async (req: Request, ...rest: A): Promise<Response> => {
    const business = await resolveBusiness(businessIdFrom(req));
    return runInBusiness(business, () => fn(req, ...rest));
  };
}
