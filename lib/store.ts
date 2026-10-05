/**
 * Persistence for the Action Center (audit trail), approval policies and reminder history.
 *
 *  - DATABASE_URL set  → PostgreSQL (Render Postgres). Tables are created automatically.
 *  - otherwise          → in-memory (local dev / tests); data is lost on restart.
 *
 * Rows are namespaced by data mode ("live" / "demo") so resetting the demo never touches the
 * real sandbox audit trail.
 */
import type { Pool } from 'pg';
import { dataMode } from './config';
import type { ProposedAction } from './types';

export interface Store {
  readonly kind: 'postgres' | 'memory';
  listActions(): Promise<ProposedAction[]>;
  getAction(id: string): Promise<ProposedAction | undefined>;
  saveAction(a: ProposedAction): Promise<void>;
  clearActions(): Promise<void>;
  getSetting<T>(key: string): Promise<T | undefined>;
  setSetting<T>(key: string, value: T): Promise<void>;
}

const ns = () => dataMode();
const byNewest = (a: ProposedAction, b: ProposedAction) => b.createdAt.localeCompare(a.createdAt);
const clone = <T,>(x: T): T => (x === undefined ? x : JSON.parse(JSON.stringify(x)));

/* ------------------------------------------------------------------ memory */
class MemoryStore implements Store {
  readonly kind = 'memory' as const;
  private actions = new Map<string, Map<string, ProposedAction>>();
  private settings = new Map<string, unknown>();
  private bucket() {
    let b = this.actions.get(ns());
    if (!b) this.actions.set(ns(), (b = new Map()));
    return b;
  }
  async listActions() {
    return [...this.bucket().values()].map(clone).sort(byNewest);
  }
  async getAction(id: string) {
    return clone(this.bucket().get(id));
  }
  async saveAction(a: ProposedAction) {
    this.bucket().set(a.id, clone(a));
  }
  async clearActions() {
    this.bucket().clear();
  }
  async getSetting<T>(key: string) {
    return clone(this.settings.get(`${ns()}:${key}`) as T | undefined);
  }
  async setSetting<T>(key: string, value: T) {
    this.settings.set(`${ns()}:${key}`, clone(value));
  }
}

/* ------------------------------------------------------------------ postgres */
class PostgresStore implements Store {
  readonly kind = 'postgres' as const;
  private ready: Promise<void>;
  constructor(private pool: Pool) {
    this.ready = pool
      .query(
        `CREATE TABLE IF NOT EXISTS mp_actions (
           mode text NOT NULL, id text NOT NULL, created_at timestamptz NOT NULL, data jsonb NOT NULL,
           PRIMARY KEY (mode, id));
         CREATE INDEX IF NOT EXISTS mp_actions_created ON mp_actions (mode, created_at DESC);
         CREATE TABLE IF NOT EXISTS mp_settings (
           mode text NOT NULL, key text NOT NULL, value jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now(),
           PRIMARY KEY (mode, key));`,
      )
      .then(() => undefined);
    this.ready.catch((e) => console.error('[store] migration failed:', e.message));
  }
  async listActions() {
    await this.ready;
    const r = await this.pool.query('SELECT data FROM mp_actions WHERE mode = $1 ORDER BY created_at DESC LIMIT 500', [ns()]);
    return r.rows.map((x) => x.data as ProposedAction);
  }
  async getAction(id: string) {
    await this.ready;
    const r = await this.pool.query('SELECT data FROM mp_actions WHERE mode = $1 AND id = $2', [ns(), id]);
    return r.rows[0]?.data as ProposedAction | undefined;
  }
  async saveAction(a: ProposedAction) {
    await this.ready;
    await this.pool.query(
      `INSERT INTO mp_actions (mode, id, created_at, data) VALUES ($1, $2, $3, $4)
       ON CONFLICT (mode, id) DO UPDATE SET data = EXCLUDED.data`,
      [ns(), a.id, a.createdAt, JSON.stringify(a)],
    );
  }
  async clearActions() {
    await this.ready;
    await this.pool.query('DELETE FROM mp_actions WHERE mode = $1', [ns()]);
  }
  async getSetting<T>(key: string) {
    await this.ready;
    const r = await this.pool.query('SELECT value FROM mp_settings WHERE mode = $1 AND key = $2', [ns(), key]);
    return r.rows[0]?.value as T | undefined;
  }
  async setSetting<T>(key: string, value: T) {
    await this.ready;
    await this.pool.query(
      `INSERT INTO mp_settings (mode, key, value, updated_at) VALUES ($1, $2, $3, now())
       ON CONFLICT (mode, key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
      [ns(), key, JSON.stringify(value)],
    );
  }
}

/* ------------------------------------------------------------------ factory */
const KEY = Symbol.for('merchantpilot.store');
type G = typeof globalThis & { [KEY]?: Store };

function sslFor(url: string) {
  if (process.env.PGSSLMODE === 'disable') return false;
  // Render's *external* URLs need TLS; internal URLs (inside Render's network) don't.
  return /render\.com|sslmode=require/.test(url) ? { rejectUnauthorized: false } : false;
}

export function getStore(): Store {
  const g = globalThis as G;
  if (g[KEY]) return g[KEY]!;
  const url = process.env.DATABASE_URL;
  if (url) {
    // Lazy require keeps `pg` out of client bundles and lets tests run without a database.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Pool } = require('pg') as typeof import('pg');
    const pool = new Pool({ connectionString: url, ssl: sslFor(url), max: 5, connectionTimeoutMillis: 5000, idleTimeoutMillis: 30000 });
    pool.on('error', (e) => console.error('[store] pg error:', e.message));
    g[KEY] = new PostgresStore(pool);
  } else {
    g[KEY] = new MemoryStore();
  }
  return g[KEY]!;
}

/** Tests only. */
export function resetStoreForTests() {
  delete (globalThis as G)[KEY];
}
