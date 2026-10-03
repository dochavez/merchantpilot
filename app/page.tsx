import Link from 'next/link';
import { dataMode, hasPayPalCredentials, llmModelId, llmProvider } from '@/lib/config';

export const dynamic = 'force-dynamic';

const STEPS = [
  { t: 'Ask', d: '“Why are my refunds up?” MerchantPilot reads your PayPal transactions, disputes and invoices and finds the cause.' },
  { t: 'See', d: 'It asks AG Studio’s built-in agents to build the chart that proves it, live on your dashboard.' },
  { t: 'Approve', d: 'Refunds, invoice reminders and dispute actions are queued for you. One click executes them through the PayPal Agent Toolkit.' },
];

function Pill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${ok ? 'bg-emerald-100 text-emerald-800' : 'bg-zinc-200 text-zinc-700'}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${ok ? 'bg-emerald-500' : 'bg-zinc-400'}`} />
      {label}
    </span>
  );
}

export default function Home() {
  const mode = dataMode();
  const provider = llmProvider();
  return (
    <main className="mx-auto max-w-4xl px-4 py-12 sm:py-20">
      <div className="flex items-center gap-2">
        <span className="grid h-9 w-9 place-items-center rounded-lg bg-[var(--accent)] text-sm font-bold text-white">MP</span>
        <span className="text-lg font-semibold">MerchantPilot</span>
      </div>
      <h1 className="mt-8 text-3xl font-semibold leading-tight sm:text-5xl">
        Your PayPal money, explained.
        <br />
        <span className="text-[var(--accent)]">And handled, with your OK.</span>
      </h1>
      <p className="mt-4 max-w-2xl text-base text-[var(--muted)] sm:text-lg">
        An AI copilot for small merchants. It explains what changed in your PayPal account, shows it on a live AG Studio dashboard and prepares the fixes for you to approve.
      </p>
      <div className="mt-6 flex flex-wrap gap-2">
        <Pill ok={mode === 'live'} label={mode === 'live' ? 'PayPal sandbox connected' : 'Demo data (no PayPal keys)'} />
        <Pill ok={provider !== 'none'} label={provider !== 'none' ? `AI: ${llmModelId()}` : 'AI model not configured'} />
        <Pill ok={hasPayPalCredentials()} label="PayPal Agent Toolkit" />
      </div>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link href="/dashboard" className="rounded-lg bg-[var(--accent)] px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90">
          Open the dashboard →
        </Link>
        <a href="#judges" className="rounded-lg border border-[var(--line)] px-5 py-2.5 text-sm font-medium hover:bg-[var(--hover)]">
          Judge quick start
        </a>
      </div>

      <ol className="mt-14 grid gap-4 sm:grid-cols-3">
        {STEPS.map((s, i) => (
          <li key={s.t} className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-5">
            <div className="text-xs font-semibold text-[var(--accent)]">Step {i + 1}</div>
            <div className="mt-1 text-lg font-semibold">{s.t}</div>
            <p className="mt-1 text-sm text-[var(--muted)]">{s.d}</p>
          </li>
        ))}
      </ol>

      <section id="judges" className="mt-14 rounded-xl border border-[var(--line)] bg-[var(--panel)] p-6">
        <h2 className="text-lg font-semibold">Judge quick start (60 seconds)</h2>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm">
          <li>
            Open the <Link className="text-[var(--accent)] underline" href="/dashboard">dashboard</Link> and the AI panel on the right of the canvas.
          </li>
          <li>Click the starter “Why are refunds up?”. Watch MerchantPilot query PayPal data and ask Studio to add a chart.</li>
          <li>Ask “Chase overdue invoices”. Reminders appear in the Action Center; click Approve.</li>
          <li>Use “Reset demo” in the header any time to restore the original data.</li>
        </ol>
        <p className="mt-4 text-xs text-[var(--muted)]">
          Everything runs on the PayPal sandbox or on clearly labelled demo data. No real money moves.
        </p>
      </section>
    </main>
  );
}
