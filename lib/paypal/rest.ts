/**
 * Minimal PayPal REST client (OAuth2 client-credentials + JSON fetch) used for read paths.
 * Write paths (refunds, reminders, disputes) go through the official PayPal Agent Toolkit
 * (see ./toolkit.ts) so the AI actions use PayPal's own agent tooling.
 */
import { config } from '../config';

interface TokenCache {
  token: string;
  expiresAt: number;
}

const KEY = Symbol.for('merchantpilot.paypalToken');
type G = typeof globalThis & { [KEY]?: TokenCache };

export class PayPalApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public body: unknown,
  ) {
    super(message);
  }
}

export async function getAccessToken(): Promise<string> {
  const g = globalThis as G;
  const cached = g[KEY];
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;

  const { clientId, clientSecret, baseUrl } = config.paypal;
  if (!clientId || !clientSecret) throw new Error('PayPal credentials are not configured');

  const res = await fetch(`${baseUrl}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
    cache: 'no-store',
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new PayPalApiError(`PayPal OAuth failed (${res.status}): ${body.error_description ?? body.error ?? 'unknown'}`, res.status, body);
  }
  g[KEY] = { token: body.access_token, expiresAt: Date.now() + (body.expires_in ?? 3000) * 1000 };
  return body.access_token;
}

export async function paypalGet<T = any>(path: string, query?: Record<string, string | number | boolean | undefined>): Promise<T> {
  const token = await getAccessToken();
  const url = new URL(config.paypal.baseUrl + path);
  for (const [k, v] of Object.entries(query ?? {})) if (v !== undefined) url.searchParams.set(k, String(v));
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    cache: 'no-store',
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const msg = body?.message ?? body?.name ?? body?.error_description ?? res.statusText;
    throw new PayPalApiError(`PayPal GET ${path} failed (${res.status}): ${msg}`, res.status, body);
  }
  return body as T;
}

export async function paypalPost<T = any>(path: string, payload: unknown, headers: Record<string, string> = {}): Promise<T> {
  const token = await getAccessToken();
  const res = await fetch(config.paypal.baseUrl + path, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(payload),
    cache: 'no-store',
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const msg = body?.message ?? body?.name ?? res.statusText;
    const detail = Array.isArray(body?.details) && body.details[0] ? ` [${body.details[0].issue ?? ''}: ${body.details[0].description ?? ''}]` : '';
    throw new PayPalApiError(`PayPal POST ${path} failed (${res.status}): ${msg}${detail}`, res.status, body);
  }
  return body as T;
}
