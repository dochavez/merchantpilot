'use client';

/** Real-time alerts: bell + toasts fed by PayPal webhooks (polled), each with a one-click "Ask AI". */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Alert } from '@/lib/alerts';
import { ACTION_EXECUTED_EVENT } from './studio/actions-client';
import { ASK_AI_EVENT } from './studio/MoneyAtStakeWidget';

const SEV: Record<Alert['severity'], string> = { high: 'bg-rose-500', medium: 'bg-amber-500', low: 'bg-emerald-500' };

export default function AlertsBell() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [toasts, setToasts] = useState<Alert[]>([]);
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [canSimulate, setCanSimulate] = useState(false);
  const since = useRef<string | null>(null);

  const poll = useCallback(async () => {
    const first = since.current === null;
    const r = await fetch(`/api/alerts${first ? '' : `?after=${encodeURIComponent(since.current!)}`}`, { cache: 'no-store' }).then((x) => x.json()).catch(() => null);
    if (!r) return;
    setCanSimulate(r.canSimulate);
    const fresh: Alert[] = r.alerts ?? [];
    if (first) {
      setAlerts(fresh);
      since.current = r.now;
      // Alerts from the last 30 minutes count as unread, so a sale that arrived before the page opened is still noticed.
      const recent = fresh.filter((a) => Date.now() - new Date(a.at).getTime() < 30 * 60_000).length;
      if (recent) setUnread(recent);
      return;
    }
    if (!fresh.length) return;
    since.current = fresh[0].at;
    setAlerts((a) => [...fresh, ...a].slice(0, 50));
    setToasts((t) => [...fresh, ...t].slice(0, 3));
    setUnread((u) => u + fresh.length);
    window.dispatchEvent(new CustomEvent(ACTION_EXECUTED_EVENT)); // reload PayPal data
    for (const a of fresh) setTimeout(() => setToasts((t) => t.filter((x) => x.id !== a.id)), 20_000);
  }, []);

  useEffect(() => {
    void Promise.resolve().then(poll);
    const t = setInterval(poll, 8000);
    return () => clearInterval(t);
  }, [poll]);

  const ask = (a: Alert) => {
    if (!a.prompt) return;
    window.dispatchEvent(new CustomEvent(ASK_AI_EVENT, { detail: a.prompt }));
    setToasts((t) => t.filter((x) => x.id !== a.id));
    setOpen(false);
  };
  const simulate = async () => {
    await fetch('/api/alerts/simulate', { method: 'POST' });
    await poll();
  };

  return (
    <>
      <div className="relative">
        <button
          className="relative rounded-md border border-[var(--line)] px-2.5 py-1 text-xs hover:bg-[var(--hover)]"
          onClick={() => {
            setOpen((o) => !o);
            setUnread(0);
          }}
          aria-label="Alerts"
          data-testid="alerts-bell"
        >
          🔔
          {unread > 0 && <span className="absolute -right-1.5 -top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-rose-600 px-1 text-[10px] font-bold text-white">{unread}</span>}
        </button>
        {open && (
          <div className="absolute right-0 z-[60] mt-1 w-80 rounded-lg border border-[var(--line)] bg-[var(--panel)] p-2 shadow-xl">
            <div className="flex items-center justify-between px-1 pb-2">
              <b className="text-xs">Live PayPal alerts</b>
              {canSimulate && (
                <button className="rounded border border-[var(--line)] px-1.5 py-0.5 text-[11px] hover:bg-[var(--hover)]" onClick={simulate} data-testid="simulate-alert">
                  Simulate new dispute
                </button>
              )}
            </div>
            {alerts.length === 0 && <p className="px-1 pb-2 text-[11px] text-[var(--muted)]">No alerts yet. New disputes, refunds, sales and paid invoices appear here in real time (PayPal webhooks).</p>}
            <ul className="max-h-80 space-y-1 overflow-y-auto">
              {alerts.map((a) => (
                <li key={a.id} className="rounded-md p-1.5 text-xs hover:bg-[var(--hover)]">
                  <div className="flex items-center gap-1.5">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${SEV[a.severity]}`} />
                    <span className="flex-1 font-medium">{a.title}</span>
                    <span className="text-[10px] text-[var(--muted)]">{a.at.slice(11, 16)}</span>
                  </div>
                  {a.detail && <div className="pl-3.5 text-[11px] text-[var(--muted)]">{a.detail}</div>}
                  {a.prompt && (
                    <button className="ml-3.5 mt-1 text-[11px] font-semibold text-[var(--accent)]" onClick={() => ask(a)}>
                      ✨ Ask AI
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      <div className="pointer-events-none fixed bottom-4 left-1/2 z-[80] flex w-[min(420px,92vw)] -translate-x-1/2 flex-col gap-2">
        {toasts.map((a) => (
          <div key={a.id} className="pointer-events-auto rounded-lg border border-[var(--line)] bg-[var(--panel)] p-3 shadow-2xl" role="status" data-testid="alert-toast">
            <div className="flex items-start gap-2">
              <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${SEV[a.severity]}`} />
              <div className="flex-1">
                <div className="text-sm font-semibold">{a.title}</div>
                {a.detail && <div className="text-xs text-[var(--muted)]">{a.detail}</div>}
              </div>
              <button className="text-[var(--muted)]" onClick={() => setToasts((t) => t.filter((x) => x.id !== a.id))} aria-label="Dismiss">
                ✕
              </button>
            </div>
            {a.prompt && (
              <button className="mt-2 rounded-md bg-[var(--accent)] px-3 py-1 text-xs font-semibold text-white" onClick={() => ask(a)} data-testid="alert-ask-ai">
                ✨ Ask AI what to do
              </button>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
