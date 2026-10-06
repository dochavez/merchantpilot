/**
 * Which business (PayPal account) the current request is about. MerchantPilot can manage several
 * businesses: the primary one (env PayPal keys), built-in demo businesses, and PayPal sandbox apps
 * the owner adds. Everything server-side (data, actions, rules, alerts, PayPal credentials) reads
 * the business from this request-scoped context, so one code path serves every business.
 *
 * Kept dependency-free so config.ts can import it.
 */
import { AsyncLocalStorage } from 'node:async_hooks';

export interface BusinessCreds {
  clientId: string;
  clientSecret: string;
  baseUrl?: string;
}

export interface Business {
  id: string;
  name: string;
  /** primary = env PayPal keys (or demo when none); demo = built-in demo profile; paypal = owner-added PayPal app */
  kind: 'primary' | 'demo' | 'paypal';
  profile?: string;
  description?: string;
  creds?: BusinessCreds;
  createdAt?: string;
}

const KEY = Symbol.for('merchantpilot.businessALS');
type G = typeof globalThis & { [KEY]?: AsyncLocalStorage<Business> };
const als = ((globalThis as G)[KEY] ??= new AsyncLocalStorage<Business>());

export const PRIMARY_BUSINESS: Business = { id: 'primary', name: 'Primary business', kind: 'primary', profile: 'supply' };

export function currentBusiness(): Business {
  return als.getStore() ?? PRIMARY_BUSINESS;
}

export function runInBusiness<T>(business: Business, fn: () => T): T {
  return als.run(business, fn);
}
