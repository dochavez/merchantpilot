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

/** The demo story of the main business: listed (and opened by default) when the primary business uses live PayPal keys. */
const SUPPLY_DEMO: Business = { id: 'supply', name: 'Altura Coffee Supply (demo)', kind: 'demo', profile: 'supply', description: 'Coffee gear, Coffee Club subscriptions, wholesale – full demo story' };

const DEMOS: Business[] = [
  { id: 'cafe', name: 'Altura Coffee Shop (demo)', kind: 'demo', profile: 'cafe', description: 'Neighbourhood coffee shop (in-store sales)' },
  { id: 'academy', name: 'Altura Barista Academy (demo)', kind: 'demo', profile: 'academy', description: 'Online barista courses (digital goods)' },
];

function envHasPayPal() {
  return Boolean(process.env.PAYPAL_CLIENT_ID && (process.env.PAYPAL_CLIENT_SECRET || process.env.PAYPAL_SECRET)) && !['1', 'true'].includes(process.env.FORCE_DEMO ?? '');
}

function demosHidden() {
  return ['1', 'true'].includes(process.env.HIDE_DEMO_BUSINESSES ?? '');
}

/** Demo businesses to show: the supply story is added only when the primary business is live. */
function demoBusinesses(): Business[] {
  if (demosHidden()) return [];
  return envHasPayPal() ? [SUPPLY_DEMO, ...DEMOS] : DEMOS;
}

/**
 * Business opened when the visitor hasn't picked one. With live PayPal keys the public URL opens the
 * demo story first (rich, stable data for judges); the live sandbox is one click away.
 * DEFAULT_BUSINESS overrides it (e.g. "primary").
 */
export function defaultBusinessId(): string {
  const env = process.env.DEFAULT_BUSINESS?.trim();
  if (env) return env;
  return envHasPayPal() && !demosHidden() ? SUPPLY_DEMO.id : 'primary';
}

/** Built-in business ids that cannot be removed. */
export const BUILT_IN_IDS = ['primary', SUPPLY_DEMO.id, ...DEMOS.map((d) => d.id)];

export function primaryBusiness(): Business {
  return {
    ...PRIMARY_BUSINESS,
    name: envHasPayPal() ? (process.env.MERCHANT_NAME ?? 'My PayPal business') : DEMO_MERCHANT,
    description: envHasPayPal() ? 'Live PayPal sandbox: real API data, webhooks and actions' : 'Online coffee-gear shop',
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
  const demos = demoBusinesses();
  // With live keys the demo story comes first (it is the default), then the live sandbox.
  return envHasPayPal() ? [...demos.slice(0, 1), primaryBusiness(), ...custom, ...demos.slice(1)] : [primaryBusiness(), ...custom, ...demos];
}

export async function resolveBusiness(id: string | null | undefined, fallback = defaultBusinessId()): Promise<Business> {
  if (!id) id = fallback;
  if (id === 'primary') return primaryBusiness();
  const demo = demoBusinesses().find((d) => d.id === id);
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

/**
 * Route wrapper: runs the handler inside the selected business context. `fallback` is the business
 * used when the request names none (API clients such as MCP default to the primary PayPal account).
 */
export function withBusiness<A extends unknown[]>(fn: (req: Request, ...rest: A) => Promise<Response>, opts: { fallback?: string } = {}) {
  return async (req: Request, ...rest: A): Promise<Response> => {
    const business = await resolveBusiness(businessIdFrom(req), opts.fallback);
    return runInBusiness(business, () => fn(req, ...rest));
  };
}
