'use client';

/** Header business selector: switch business, open the portfolio, add another PayPal business. */
import { useEffect, useRef, useState } from 'react';
import { selectBusiness, type BusinessInfo } from './business-client';

const KIND: Record<BusinessInfo['kind'], string> = { primary: 'Main', demo: 'Demo', paypal: 'PayPal' };

export default function BusinessSwitcher({ fallbackName, live }: { fallbackName?: string; live?: boolean }) {
  const [list, setList] = useState<BusinessInfo[]>([]);
  const [currentId, setCurrentId] = useState('primary');
  const [canAdd, setCanAdd] = useState(false);
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  const load = () =>
    fetch('/api/businesses', { cache: 'no-store' })
      .then((r) => r.json())
      .then((b) => {
        setList(b.businesses);
        setCurrentId(b.currentId);
        setCanAdd(b.canAdd);
      });
  useEffect(() => {
    void load();
  }, []);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const current = list.find((b) => b.id === currentId);
  return (
    <div className="relative min-w-0" ref={ref}>
      <button className="flex min-w-0 items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-[var(--hover)]" onClick={() => setOpen((o) => !o)} data-testid="business-switcher">
        <span className="truncate font-medium">{current?.name ?? fallbackName ?? 'Business'}</span>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${live ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>{live ? 'PayPal sandbox · live' : 'Demo data'}</span>
        <span className="text-[var(--muted)]">▾</span>
      </button>
      {open && (
        <div className="absolute left-0 z-[60] mt-1 w-80 rounded-lg border border-[var(--line)] bg-[var(--panel)] p-1.5 shadow-xl">
          <a href="/portfolio" className="flex items-center gap-2 rounded-md px-3 py-2 text-xs font-semibold text-[var(--accent)] hover:bg-[var(--hover)]" data-testid="open-portfolio">
            ▦ Portfolio overview – compare all businesses
          </a>
          <div className="my-1 border-t border-[var(--line)]" />
          {list.map((b) => (
            <button key={b.id} className={`flex w-full items-start gap-2 rounded-md px-3 py-2 text-left text-xs hover:bg-[var(--hover)] ${b.id === currentId ? 'bg-[var(--hover)]' : ''}`} onClick={() => selectBusiness(b.id)}>
              <span className="mt-0.5 w-12 shrink-0 rounded bg-[var(--hover)] px-1 text-center text-[10px] font-semibold text-[var(--muted)]">{KIND[b.kind]}</span>
              <span className="min-w-0">
                <b className="block truncate">{b.name}</b>
                <span className="text-[var(--muted)]">{b.description}</span>
              </span>
              {b.id === currentId && <span className="ml-auto text-[var(--accent)]">✓</span>}
            </button>
          ))}
          <div className="my-1 border-t border-[var(--line)]" />
          <button className="w-full rounded-md px-3 py-2 text-left text-xs hover:bg-[var(--hover)]" onClick={() => setAdding(true)} data-testid="add-business">
            + Add another PayPal business
          </button>
        </div>
      )}
      {adding && <AddBusinessDialog canAdd={canAdd} onClose={() => setAdding(false)} onAdded={(id) => selectBusiness(id)} />}
    </div>
  );
}

function AddBusinessDialog({ canAdd, onClose, onAdded }: { canAdd: boolean; onClose: () => void; onAdded: (id: string) => void }) {
  const [name, setName] = useState('');
  const [clientId, setClientId] = useState('');
  const [secret, setSecret] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    setBusy(true);
    setError(null);
    const r = await fetch('/api/businesses', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, clientId, clientSecret: secret }) });
    const b = await r.json();
    setBusy(false);
    if (b.error) setError(b.error);
    else onAdded(b.business.id);
  };
  const input = 'mt-1 w-full rounded-md border border-[var(--line)] bg-[var(--card)] px-2 py-1.5 text-sm';
  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl bg-[var(--panel)] p-5 text-sm shadow-2xl" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Add business">
        <h2 className="text-base font-semibold">Add a PayPal business</h2>
        <p className="mt-1 text-xs text-[var(--muted)]">
          Each business is a PayPal app (sandbox). Create one in the PayPal Developer Dashboard → Apps &amp; Credentials → Create App, then paste its keys. The keys are verified with PayPal and the secret is stored encrypted.
        </p>
        {!canAdd && <p className="mt-2 rounded bg-amber-50 p-2 text-xs text-amber-900">The server needs BRIEF_SIGNING_SECRET (Render sets it automatically) to store keys securely.</p>}
        <label className="mt-3 block text-xs font-semibold">Business name</label>
        <input className={input} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Altura Roastery Store #2" />
        <label className="mt-3 block text-xs font-semibold">Client ID</label>
        <input className={input} value={clientId} onChange={(e) => setClientId(e.target.value)} autoComplete="off" />
        <label className="mt-3 block text-xs font-semibold">Secret</label>
        <input className={input} type="password" value={secret} onChange={(e) => setSecret(e.target.value)} autoComplete="new-password" />
        {error && <p className="mt-2 text-xs text-rose-600">{error}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button className="rounded-md border border-[var(--line)] px-3 py-1.5 text-xs" onClick={onClose}>
            Cancel
          </button>
          <button className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50" disabled={busy || !canAdd || !name || !clientId || !secret} onClick={save}>
            {busy ? 'Verifying with PayPal…' : 'Add business'}
          </button>
        </div>
      </div>
    </div>
  );
}
