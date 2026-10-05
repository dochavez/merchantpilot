'use client';

/** Header "Morning brief" button: preview the daily brief, share it on WhatsApp, or email it. */
import { useState } from 'react';

export default function BriefButton() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [html, setHtml] = useState('');
  const [emailOk, setEmailOk] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const show = async () => {
    setOpen(true);
    setStatus(null);
    setNonce((n) => n + 1);
    const b = await fetch('/api/brief', { cache: 'no-store' }).then((r) => r.json());
    setText(b.text);
    setHtml(b.html);
    setEmailOk(b.emailConfigured);
  };
  const send = async () => {
    setStatus('Sending…');
    const b = await fetch('/api/brief/send', { method: 'POST' }).then((r) => r.json());
    setStatus(b.sent ? 'Sent ✓' : b.reason ?? b.error ?? 'Not sent');
  };

  return (
    <>
      <button className="rounded-md border border-[var(--line)] px-2.5 py-1 text-xs hover:bg-[var(--hover)]" onClick={show} data-testid="open-brief">
        ☀ Brief
      </button>
      {open && (
        <div className="fixed inset-0 z-[70] grid place-items-center bg-black/40 p-4" onClick={() => setOpen(false)}>
          <div className="flex max-h-[90vh] w-full max-w-xl flex-col rounded-xl bg-[var(--panel)] p-4 shadow-2xl" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Morning brief">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-base font-semibold">Morning brief</h2>
                <p className="text-xs text-[var(--muted)]">What your team gets every morning by email or WhatsApp – with one-tap approval links.</p>
              </div>
              <button className="text-[var(--muted)]" onClick={() => setOpen(false)} aria-label="Close">
                ✕
              </button>
            </div>
            <iframe key={nonce} srcDoc={html || '<p style="font-family:Arial;padding:16px;color:#64748B">Loading…</p>'} sandbox="allow-popups allow-popups-to-escape-sandbox" className="mt-3 h-[60vh] w-full rounded-lg border border-[var(--line)] bg-white" title="Brief preview" />
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <a
                className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white"
                href={`https://wa.me/?text=${encodeURIComponent(text)}`}
                target="_blank"
                rel="noreferrer"
              >
                Share on WhatsApp
              </a>
              <button className="rounded-md border border-[var(--line)] px-3 py-1.5 text-xs" onClick={() => void navigator.clipboard?.writeText(text).then(() => setStatus('Copied ✓'))}>
                Copy as text
              </button>
              <button className="rounded-md border border-[var(--line)] px-3 py-1.5 text-xs disabled:opacity-50" onClick={send} disabled={!emailOk} title={emailOk ? '' : 'Set RESEND_API_KEY and BRIEF_EMAIL_TO on the server'}>
                Send test email
              </button>
              {status && <span className="text-xs text-[var(--muted)]">{status}</span>}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
