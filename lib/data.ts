/**
 * Single entry point for the merchant dataset. Live mode caches PayPal responses briefly so the
 * dashboard and agent tools don't hammer the sandbox; demo mode reads the mutable demo store.
 */
import { dataMode } from './config';
import { getDemoStore } from './demo/store';
import { loadLiveDataset } from './paypal/live-data';
import type { Dataset } from './types';

const KEY = Symbol.for('merchantpilot.liveCache');
const REMINDED = Symbol.for('merchantpilot.liveReminders');
type R = typeof globalThis & { [REMINDED]?: Map<string, string> };

/** PayPal's invoice list doesn't expose reminder history, so we remember the ones we sent. */
export function markInvoiceReminded(invoiceId: string) {
  const g = globalThis as R;
  (g[REMINDED] ??= new Map()).set(invoiceId, new Date().toISOString());
}

type G = typeof globalThis & { [KEY]?: { at: number; data: Promise<Dataset> } };
const TTL_MS = 60_000;

export async function getDataset(opts: { fresh?: boolean } = {}): Promise<Dataset> {
  if (dataMode() === 'demo') return getDemoStore();
  const g = globalThis as G;
  const c = g[KEY];
  if (!opts.fresh && c && Date.now() - c.at < TTL_MS) return c.data;
  const data = loadLiveDataset().then((ds) => {
    const reminded = (globalThis as R)[REMINDED];
    if (reminded) for (const inv of ds.invoices) inv.lastReminderAt = reminded.get(inv.invoiceId) ?? inv.lastReminderAt;
    return ds;
  });
  g[KEY] = { at: Date.now(), data };
  data.catch(() => {
    if (g[KEY]?.data === data) delete g[KEY];
  });
  return data;
}

export function invalidateDataset() {
  delete (globalThis as G)[KEY];
}
