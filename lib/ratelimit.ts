/** Tiny in-memory limiter: protects the hosted demo's LLM budget from abuse. */
import { config } from './config';

const KEY = Symbol.for('merchantpilot.ratelimit');
interface State {
  hits: Map<string, number[]>;
  day: string;
  dayCount: number;
}
type G = typeof globalThis & { [KEY]?: State };

const WINDOW = 10 * 60_000;

export function clientIp(req: Request): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    req.headers.get('cf-connecting-ip') ||
    'local'
  );
}

export function checkLlmLimit(ip: string): { ok: true } | { ok: false; reason: string } {
  const g = globalThis as G;
  const today = new Date().toISOString().slice(0, 10);
  const s = (g[KEY] ??= { hits: new Map(), day: today, dayCount: 0 });
  if (s.day !== today) {
    s.day = today;
    s.dayCount = 0;
  }
  if (s.dayCount >= config.llm.dailyTurnCap) return { ok: false, reason: 'Daily AI budget for this demo reached. Try again tomorrow.' };
  const now = Date.now();
  const list = (s.hits.get(ip) ?? ([] as number[])).filter((t: number) => now - t < WINDOW);
  if (list.length >= config.llm.turnsPerWindow) return { ok: false, reason: 'Too many AI requests. Please wait a few minutes.' };
  list.push(now);
  s.hits.set(ip, list);
  s.dayCount++;
  return { ok: true };
}
