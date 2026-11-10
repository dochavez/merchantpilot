import Image from 'next/image';
import Link from 'next/link';
import { dataMode, hasPayPalCredentials, llmModelId, llmProvider } from '@/lib/config';

export const dynamic = 'force-dynamic';

const STEPS = [
  { t: 'Ask', d: '“Why are my refunds up?” MerchantPilot reads your PayPal transactions, disputes, invoices and subscriptions and finds the cause with deterministic analytics.' },
  { t: 'See', d: 'It asks AG Studio’s built-in agents to add the chart that proves it, live on your dashboard. Click any invoice, customer or dispute for the full story.' },
  { t: 'Approve', d: 'Refunds, reminders, payment plans and dispute responses are queued as cards. You approve; the PayPal Agent Toolkit executes. Your rules decide what runs alone.' },
];

const FEATURES = [
  { icon: '✋', t: 'Human in the loop', d: 'Approve or reject on a card in the chat, the Action Center or a signed link in the morning brief. Rules: auto-approve small refunds, two approvers above a threshold, a daily money-out cap. Every decision lands in an audit trail.' },
  { icon: '💸', t: 'Money at stake + forecast', d: 'Overdue invoices and open disputes in one number, and a 30-90 day cash-flow forecast with what-if toggles: what is fixing the refund spike or chasing invoices worth?' },
  { icon: '⚖️', t: 'Disputes that win', d: 'Deadlines first, a PDF evidence pack built from your own data, and submission through PayPal’s Disputes API after you approve.' },
  { icon: '🧾', t: 'Collections', d: 'Friendly reminders and PayPal partial-payment plans for late invoices, with duplicate-reminder protection. Invoices show the products on them.' },
  { icon: '🔁', t: 'Recurring revenue', d: 'PayPal Subscriptions: MRR, churn vs last month, subscriptions suspended after failed renewals (MRR at risk) and which plan is losing subscribers.' },
  { icon: '🏪', t: 'Many businesses, one owner', d: 'Switch between stores or completely different businesses. The portfolio scores each one 0-100 with the reason for every point lost and writes an owner briefing.' },
  { icon: '🔔', t: 'Real time + voice', d: 'Signed PayPal webhooks become alerts with an “Ask AI” button. Talk to it in Spanish or English and hear the answer.' },
  { icon: '📤', t: 'Everywhere you work', d: 'Executive PDF, Excel, a live Power BI / Excel OData feed, QuickBooks and Xero CSVs, and an MCP server so Claude, Cursor or any AI app can use it too.' },
];

const PAYPAL = [
  ['Transaction Search', 'sales, refunds, fees, chargebacks, recurring payments'],
  ['Disputes', 'list, context, accept, submit evidence'],
  ['Invoicing', 'overdue invoices, reminders, partial-payment plans, line items'],
  ['Subscriptions', 'plans, subscribers, failed renewals'],
  ['Orders & Payments', 'refunds of captured payments'],
  ['Webhooks', 'signature-verified real-time alerts'],
  ['PayPal Agent Toolkit', 'executes the approved actions'],
];

const SHOTS = [
  { src: '/screenshots/dashboard.png', alt: 'AG Studio dashboard with money at stake, recurring revenue, forecast and the AI assistant', caption: 'The dashboard: AG Studio widgets, custom MerchantPilot widgets and the AI assistant.' },
  { src: '/screenshots/approval.png', alt: 'A refund proposal card with Approve and Reject buttons inside the chat', caption: 'Nothing moves money until you click Approve.' },
  { src: '/screenshots/portfolio.png', alt: 'Portfolio page comparing three businesses with health scores', caption: 'Portfolio: every business scored, compared and explained.' },
  { src: '/screenshots/drawer.png', alt: 'Invoice detail drawer showing products, timeline and AI actions', caption: 'Click anything for the details: invoice products, customer value, dispute evidence.' },
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
    <main className="mx-auto max-w-5xl px-4 py-12 sm:py-16">
      <div className="flex items-center gap-2">
        <span className="grid h-9 w-9 place-items-center rounded-lg bg-[var(--accent)] text-sm font-bold text-white">MP</span>
        <span className="text-lg font-semibold">MerchantPilot</span>
        <span className="ml-auto text-xs text-[var(--muted)]">PayPal AI Hackathon 2026</span>
      </div>

      <h1 className="mt-8 text-3xl font-semibold leading-tight sm:text-5xl">
        Your PayPal money, explained.
        <br />
        <span className="text-[var(--accent)]">And handled, with your OK.</span>
      </h1>
      <p className="mt-4 max-w-3xl text-base text-[var(--muted)] sm:text-lg">
        An AI finance copilot for small merchants. It explains what changed in your PayPal account, shows it on a live AG Studio dashboard and prepares the fixes – refunds, invoice reminders, payment plans, dispute responses – for you to approve.
      </p>
      <div className="mt-6 flex flex-wrap gap-2">
        <Pill ok={mode === 'live'} label={mode === 'live' ? 'PayPal sandbox connected' : 'Demo data (no PayPal keys)'} />
        <Pill ok={provider !== 'none'} label={provider !== 'none' ? `AI: ${llmModelId()}` : 'AI model not configured'} />
        <Pill ok={hasPayPalCredentials()} label="PayPal Agent Toolkit" />
      </div>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link href="/dashboard" className="rounded-lg bg-[var(--accent)] px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90" data-testid="open-dashboard">
          Open the dashboard →
        </Link>
        <Link href="/portfolio" className="rounded-lg border border-[var(--line)] px-5 py-2.5 text-sm font-medium hover:bg-[var(--hover)]">
          Portfolio of businesses
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

      <section className="mt-14">
        <h2 className="text-xl font-semibold">See it</h2>
        <div className="mt-4 grid gap-5 md:grid-cols-2">
          {SHOTS.map((s) => (
            <figure key={s.src} className="overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)]">
              <a href={s.src} target="_blank" rel="noreferrer" title="Open full size">
                <Image src={s.src} alt={s.alt} width={1600} height={1000} className="h-auto w-full" sizes="(min-width: 768px) 480px, 100vw" />
              </a>
              <figcaption className="px-4 py-2.5 text-xs text-[var(--muted)]">{s.caption}</figcaption>
            </figure>
          ))}
        </div>
      </section>

      <section className="mt-14">
        <h2 className="text-xl font-semibold">What it does</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f) => (
            <div key={f.t} className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
              <div className="text-xl" aria-hidden>
                {f.icon}
              </div>
              <div className="mt-1 font-semibold">{f.t}</div>
              <p className="mt-1 text-sm text-[var(--muted)]">{f.d}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-14 grid gap-6 md:grid-cols-2">
        <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-6">
          <h2 className="text-lg font-semibold">Built on PayPal</h2>
          <ul className="mt-3 space-y-1.5 text-sm">
            {PAYPAL.map(([api, use]) => (
              <li key={api}>
                <b>{api}</b> <span className="text-[var(--muted)]">– {use}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-6">
          <h2 className="text-lg font-semibold">Trust by design</h2>
          <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-[var(--muted)]">
            <li>The AI explains numbers; it never invents them. Totals come from deterministic code.</li>
            <li>The AI can only <i>propose</i> money-moving actions. Execution happens on the server after approval.</li>
            <li>Webhook alerts are created only from signature-verified events, from fixed templates.</li>
            <li>Approve links are signed and single-use; added PayPal secrets are stored encrypted.</li>
            <li>Sandbox or clearly labelled demo data only. No real money moves.</li>
          </ul>
        </div>
      </section>

      <section id="judges" className="mt-14 rounded-xl border border-[var(--line)] bg-[var(--panel)] p-6">
        <h2 className="text-lg font-semibold">Judge quick start (3 minutes)</h2>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm">
          <li>
            Open the <Link className="text-[var(--accent)] underline" href="/dashboard">dashboard</Link>. The AI Assistant is the panel to the right of the canvas.
          </li>
          <li>Click the starter <b>“Why are refunds up?”</b>. MerchantPilot queries the data, explains the cause and asks Studio to add a chart that proves it.</li>
          <li>
            Click <b>“Chase overdue invoices”</b>. A reminder card appears in the chat: press <b>Approve</b> and watch it execute (and land in the Action Center audit trail).
          </li>
          <li>Click an invoice number or a customer in a table to open the detail drawer. In <b>Cash-flow forecast</b>, toggle the scenarios.</li>
          <li>
            Open the business menu (top left) → <b>Portfolio overview</b> to compare three businesses, or try <b>“How is my recurring revenue?”</b>.
          </li>
          <li>
            <b>Export</b> → PDF executive report or Power BI feed. <b>Reset demo</b> restores the original data at any time.
          </li>
        </ol>
        <p className="mt-4 text-xs text-[var(--muted)]">Everything runs on the PayPal sandbox or on clearly labelled demo data. No real money moves.</p>
      </section>

      <footer className="mt-12 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-[var(--line)] pt-6 text-xs text-[var(--muted)]">
        <span>MerchantPilot · Next.js + AG Studio + Vercel AI SDK + PayPal Agent Toolkit</span>
        <a className="underline" href="https://github.com/dochavez/merchantpilot">Source on GitHub</a>
        <a className="underline" href="/api/health">Health</a>
      </footer>
    </main>
  );
}
