/**
 * Single entry point for the merchant dataset. Live mode caches PayPal responses briefly so the
 * dashboard and agent tools don't hammer the sandbox; demo mode reads the mutable demo store.
 */
import { dataMode } from './config';
import { getDemoStore } from './demo/store';
import { loadLiveDataset } from './paypal/live-data';
import { getStore } from './store';
import type { Dataset } from './types';

const KEY = Symbol.for('merchantpilot.liveCache');

/** PayPal's invoice list doesn't expose reminder history, so we remember the ones we sent (persisted). */
export async function markInvoiceReminded(invoiceId: string) {
  const store = getStore();
  const map = (await store.getSetting<Record<string, string>>('invoiceReminders')) ?? {};
  map[invoiceId] = new Date().toISOString();
  await store.setSetting('invoiceReminders', map);
}

type G = typeof globalThis & { [KEY]?: { at: number; data: Promise<Dataset> } };
const TTL_MS = 60_000;

export async function getDataset(opts: { fresh?: boolean } = {}): Promise<Dataset> {
  if (dataMode() === 'demo') return getDemoStore();
  const g = globalThis as G;
  const c = g[KEY];
  if (!opts.fresh && c && Date.now() - c.at < TTL_MS) return c.data;
  const data = loadLiveDataset().then(async (ds) => {
    const reminded = (await getStore().getSetting<Record<string, string>>('invoiceReminders').catch(() => undefined)) ?? {};
    for (const inv of ds.invoices) inv.lastReminderAt = reminded[inv.invoiceId] ?? inv.lastReminderAt;
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
