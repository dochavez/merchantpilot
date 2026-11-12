'use client';

/**
 * Guided tour: a welcome screen on the first visit and a step-by-step card that drives the demo
 * (switches report pages, asks the AI, opens drawers and rules) and ticks each step off when the
 * visitor actually does it. Lets a judge or a first-time merchant see everything in ~3 minutes.
 */
import { useCallback, useEffect, useState } from 'react';
import type { Dataset } from '@/lib/types';
import { ASK_AI_EVENT } from './studio/MoneyAtStakeWidget';
import { ACTION_EXECUTED_EVENT } from './studio/actions-client';
import { OPEN_DETAIL_EVENT, openDetail } from './DetailDrawer';

import { GO_TO_PAGE_EVENT, OPEN_RULES_EVENT, START_TOUR_EVENT } from './tour-events';

const STORE = 'merchantpilot.tour.v1';

type Done = 'click' | 'executed' | 'detail';
interface Step {
  id: string;
  title: string;
  body: string;
  /** What to look at once the step has run. */
  look?: string;
  /** CSS selector of the area to highlight. */
  target?: string;
  page?: string;
  cta?: { label: string; run: (ctx: Ctx) => void };
  done: Done;
  doneText?: string;
}
interface Ctx {
  invoice?: string;
}

const goTo = (page: string) => window.dispatchEvent(new CustomEvent(GO_TO_PAGE_EVENT, { detail: page }));
const ask = (prompt: string) => window.dispatchEvent(new CustomEvent(ASK_AI_EVENT, { detail: prompt }));

const STEPS: Step[] = [
  {
    id: 'overview',
    title: 'Your money at a glance',
    body: 'This is the Overview page. Top row: sales, refunds, disputes and late invoices from PayPal. Below: “Money at stake” (what you can still recover), recurring revenue and a cash-flow forecast.',
    look: 'In the forecast, tick “Fix refund spike” to see how much extra cash that is worth.',
    target: '[data-testid="report-pages"]',
    page: 'overview',
    cta: { label: 'Show me the Overview', run: () => goTo('overview') },
    done: 'click',
  },
  {
    id: 'ask',
    title: 'Ask the AI why',
    body: 'The AI Assistant (right) reads your PayPal data with real tools. It never invents numbers: the math is done by code, the AI explains it.',
    look: 'Watch it find the cause (a damaged batch of one product) and add a chart that proves it to the dashboard.',
    target: '.ag-studio-ai-panel',
    cta: { label: 'Ask: “Why are refunds up?”', run: () => ask('Why are my refunds up? Find the cause and add a chart to the dashboard that shows it.') },
    done: 'click',
  },
  {
    id: 'approve',
    title: 'Approve an action',
    body: 'The AI can prepare money actions (refunds, reminders, payment plans, dispute replies) but never runs them alone. Each one waits for your click.',
    look: 'An approval card appears in the chat. Press Approve on it: it executes on PayPal and is logged in the Action Center.',
    target: '.ag-studio-ai-panel',
    cta: { label: 'Ask: “Chase overdue invoices”', run: () => ask('Which invoices are overdue? Prepare friendly reminders for them.') },
    done: 'executed',
    doneText: 'Executed and logged in the Action Center audit trail.',
  },
  {
    id: 'drill',
    title: 'Click anything for the story',
    body: 'The Collections page shows who owes you and for how long. Every invoice, customer or dispute in a table is a link.',
    look: 'Click an invoice number in the table (or use the button): you see its products, timeline and one-click AI actions.',
    target: '[data-testid="report-pages"]',
    page: 'collections',
    cta: { label: 'Open the most overdue invoice', run: (c) => {
        goTo('collections');
        if (c.invoice) openDetail('invoice', c.invoice);
      },
    },
    done: 'detail',
    doneText: 'That is the detail drawer: it works for invoices, customers, disputes and subscriptions.',
  },
  {
    id: 'disputes',
    title: 'Disputes before the deadline',
    body: 'Disputes & refunds groups open disputes by reason and country. The gauge shows the days left on the most urgent one.',
    look: 'Click a dispute ID in the table: MerchantPilot builds a PDF evidence pack and can submit it to PayPal after you approve.',
    target: '[data-testid="report-pages"]',
    page: 'risk',
    cta: { label: 'Show Disputes & refunds', run: () => goTo('risk') },
    done: 'click',
  },
  {
    id: 'recurring',
    title: 'Recurring revenue',
    body: 'PayPal Subscriptions turned into MRR, churn and subscriptions suspended after failed payments (revenue at risk).',
    look: 'The AI tells you which plan is losing subscribers and drafts the win-back message.',
    target: '[data-testid="report-pages"]',
    page: 'recurring',
    cta: { label: 'Ask: “How is my recurring revenue?”', run: () => {
        goTo('recurring');
        ask('How is my recurring revenue (PayPal subscriptions)? Give me MRR, churn and what is at risk, and tell me which plan needs attention.');
      },
    },
    done: 'click',
  },
  {
    id: 'rules',
    title: 'You set the rules',
    body: 'Decide what the AI may do alone: auto-approve small refunds or reminders, require two different people above an amount, cap the money that can go out per day.',
    look: 'Every decision (who, when, which rule) is kept in the Action Center audit trail.',
    target: 'aside[aria-label="Action Center"]',
    cta: { label: 'Open the approval rules', run: () => window.dispatchEvent(new CustomEvent(OPEN_RULES_EVENT)) },
    done: 'click',
  },
  {
    id: 'portfolio',
    title: 'More than one business',
    body: 'The business menu (top left) switches between businesses. “Live” is a real PayPal sandbox account; the others are demo stories. The Portfolio scores every business 0-100 and tells the owner which one needs attention first.',
    target: '[data-testid="business-switcher"]',
    cta: { label: 'Open the Portfolio', run: () => window.open('/portfolio', '_blank') },
    done: 'click',
  },
  {
    id: 'share',
    title: 'Take it with you',
    body: 'Export a PDF for your accountant or bank, Excel, a live Power BI feed, or get a morning brief with one-tap approve links. Other AI apps (Claude, Cursor) can use MerchantPilot through MCP.',
    target: '[data-testid="export-menu"]',
    cta: { label: 'Download the executive PDF', run: () => window.open('/api/export/pdf?days=30&lang=en', '_blank') },
    done: 'click',
    doneText: 'That is the whole tour. Click “Reset demo” any time to start over.',
  },
];

interface Saved {
  welcomed?: boolean;
  open?: boolean;
  step?: number;
  done?: string[];
}
function load(): Saved {
  try {
    return JSON.parse(localStorage.getItem(STORE) ?? '{}');
  } catch {
    return {};
  }
}
function save(s: Saved) {
  try {
    localStorage.setItem(STORE, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

export default function GuidedTour({ dataset }: { dataset: Dataset | null }) {
  const [s, setS] = useState<Saved | null>(null);
  const update = useCallback((patch: Saved) => setS((prev) => {
    const next = { ...(prev ?? {}), ...patch };
    save(next);
    return next;
  }), []);

  useEffect(() => {
    const saved = load();
    const forced = new URLSearchParams(window.location.search).get('tour') === '1';
    // Automated browsers (our e2e tests) skip the welcome screen unless ?tour=1 asks for the tour.
    const auto = !forced && !saved.welcomed && navigator.webdriver ? { welcomed: true, open: false } : {};
    // Defer the state update out of the effect body.
    void Promise.resolve().then(() => setS(forced ? { ...saved, welcomed: true, open: true, step: saved.step ?? 0 } : { ...saved, ...auto }));
    const start = () => update({ welcomed: true, open: true, step: 0, done: [] });
    window.addEventListener(START_TOUR_EVENT, start);
    return () => window.removeEventListener(START_TOUR_EVENT, start);
  }, [update]);

  const step = s?.open ? STEPS[Math.min(s.step ?? 0, STEPS.length - 1)] : undefined;
  const isDone = (id: string) => Boolean(s?.done?.includes(id));
  const markDone = useCallback((id: string) => setS((prev) => {
    if (!prev || prev.done?.includes(id)) return prev;
    const next = { ...prev, done: [...(prev.done ?? []), id] };
    save(next);
    return next;
  }), []);

  // Tick off steps that need the visitor to do something themselves.
  useEffect(() => {
    if (!step) return;
    const ev = step.done === 'executed' ? ACTION_EXECUTED_EVENT : step.done === 'detail' ? OPEN_DETAIL_EVENT : null;
    if (!ev) return;
    const on = () => markDone(step.id);
    window.addEventListener(ev, on);
    return () => window.removeEventListener(ev, on);
  }, [step, markDone]);

  // Open the step's report page when the step is shown.
  useEffect(() => {
    if (step?.page) {
      const t = setTimeout(() => goTo(step.page!), 300);
      return () => clearTimeout(t);
    }
  }, [step]);

  // Highlight ring around the area the step talks about.
  const [ring, setRing] = useState<DOMRect | null>(null);
  useEffect(() => {
    if (!step?.target) {
      void Promise.resolve().then(() => setRing(null));
      return;
    }
    const tick = () => {
      const el = document.querySelector(step.target!);
      const r = el?.getBoundingClientRect();
      setRing(r && r.width > 0 ? r : null);
    };
    tick();
    const id = setInterval(tick, 600);
    return () => clearInterval(id);
  }, [step]);

  if (!s) return null;
  const invoice = dataset?.invoices.filter((i) => i.daysOverdue > 0).sort((a, b) => b.daysOverdue - a.daysOverdue)[0]?.invoiceNumber;

  if (!s.welcomed) return <Welcome name={dataset?.merchantName?.replace(/\s*\((demo|sandbox)\)$/i, '')} onStart={() => update({ welcomed: true, open: true, step: 0, done: [] })} onSkip={() => update({ welcomed: true, open: false })} />;
  if (!step) return null;

  const i = Math.min(s.step ?? 0, STEPS.length - 1);
  const done = isDone(step.id);
  const go = (n: number) => update({ step: Math.max(0, Math.min(STEPS.length - 1, n)) });
  const last = i === STEPS.length - 1;

  return (
    <>
      {ring && (
        <div
          aria-hidden
          className="mp-tour-ring pointer-events-none fixed z-[70] rounded-xl"
          style={{ left: ring.left - 4, top: ring.top - 4, width: ring.width + 8, height: ring.height + 8 }}
        />
      )}
      <div className="fixed bottom-4 left-4 z-[80] w-[360px] max-w-[calc(100vw-2rem)] rounded-xl border border-[var(--line)] bg-[var(--panel)] shadow-2xl" role="dialog" aria-label="Guided tour" data-testid="tour-card">
        <div className="flex items-center gap-2 border-b border-[var(--line)] px-4 py-2">
          <span className="text-xs font-semibold text-[var(--accent)]">Guided tour · step {i + 1} of {STEPS.length}</span>
          <button className="ml-auto text-xs text-[var(--muted)] hover:underline" onClick={() => update({ open: false })} data-testid="tour-close">
            Close
          </button>
        </div>
        <div className="flex gap-1 px-4 pt-3">
          {STEPS.map((x, k) => (
            <button key={x.id} aria-label={`Step ${k + 1}: ${x.title}`} onClick={() => go(k)} className={`h-1.5 flex-1 rounded-full ${isDone(x.id) ? 'bg-emerald-500' : k === i ? 'bg-[var(--accent)]' : 'bg-[var(--line)]'}`} />
          ))}
        </div>
        <div className="px-4 pb-3 pt-2">
          <h3 className="text-base font-semibold" data-testid="tour-title">{step.title}</h3>
          <p className="mt-1 text-sm text-[var(--muted)]">{step.body}</p>
          {step.cta && (
            <button
              className="mt-3 w-full rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-semibold text-white hover:opacity-90"
              onClick={() => {
                step.cta!.run({ invoice });
                if (step.done === 'click') markDone(step.id);
              }}
              data-testid="tour-cta"
            >
              {step.cta.label}
            </button>
          )}
          {step.look && !done && <p className="mt-2 rounded-md bg-[var(--hover)] px-2.5 py-1.5 text-xs">👀 {step.look}</p>}
          {done && (
            <p className="mt-2 rounded-md bg-emerald-50 px-2.5 py-1.5 text-xs text-emerald-800" data-testid="tour-done">
              ✓ {step.doneText ?? step.look ?? 'Done.'}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 border-t border-[var(--line)] px-4 py-2">
          <button className="rounded-md px-2 py-1 text-xs text-[var(--muted)] hover:bg-[var(--hover)] disabled:opacity-40" disabled={i === 0} onClick={() => go(i - 1)}>
            ← Back
          </button>
          <button
            className={`ml-auto rounded-md px-3 py-1 text-xs font-semibold ${done ? 'bg-[var(--accent)] text-white' : 'border border-[var(--line)] hover:bg-[var(--hover)]'}`}
            onClick={() => (last ? update({ open: false }) : go(i + 1))}
            data-testid="tour-next"
          >
            {last ? 'Finish' : done ? 'Next →' : 'Skip →'}
          </button>
        </div>
      </div>
    </>
  );
}

function Welcome({ name, onStart, onSkip }: { name?: string; onStart: () => void; onSkip: () => void }) {
  return (
    <div className="fixed inset-0 z-[90] grid place-items-center bg-black/40 p-4" role="dialog" aria-label="Welcome" data-testid="tour-welcome">
      <div className="w-full max-w-lg rounded-2xl bg-[var(--panel)] p-6 shadow-2xl">
        <div className="text-xs font-semibold uppercase tracking-wide text-[var(--accent)]">Welcome to MerchantPilot</div>
        <h2 className="mt-1 text-2xl font-semibold">You run {name ?? 'a small business'}. Nobody does your numbers.</h2>
        <p className="mt-2 text-sm text-[var(--muted)]">
          This is your PayPal account seen by an AI finance copilot. Refunds jumped, a few disputes are close to their deadline, two wholesale customers are late and your coffee subscription is losing members. MerchantPilot finds it, explains it and prepares the fix. <b>You approve; nothing moves money without you.</b>
        </p>
        <ol className="mt-4 grid gap-2 text-sm sm:grid-cols-3">
          {[
            ['1 · Ask', 'the AI why your money changed'],
            ['2 · See', 'the proof on the dashboard'],
            ['3 · Approve', 'the fix, executed on PayPal'],
          ].map(([t, d]) => (
            <li key={t} className="rounded-lg border border-[var(--line)] p-2.5">
              <b className="block text-[var(--accent)]">{t}</b>
              <span className="text-xs text-[var(--muted)]">{d}</span>
            </li>
          ))}
        </ol>
        <p className="mt-3 text-xs text-[var(--muted)]">Demo data and PayPal sandbox only: no real money moves. No login needed.</p>
        <div className="mt-5 flex flex-wrap gap-2">
          <button className="rounded-lg bg-[var(--accent)] px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90" onClick={onStart} data-testid="tour-start" autoFocus>
            Start the 3-minute tour →
          </button>
          <button className="rounded-lg border border-[var(--line)] px-4 py-2.5 text-sm hover:bg-[var(--hover)]" onClick={onSkip} data-testid="tour-skip">
            Explore on my own
          </button>
        </div>
      </div>
    </div>
  );
}

export function startTour() {
  window.dispatchEvent(new CustomEvent(START_TOUR_EVENT));
}
