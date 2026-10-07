'use client';

/**
 * Drill-down drawer: click an invoice #, dispute ID, transaction ID or customer anywhere in the
 * dashboard grids to see the full record, related records, history and one-click AI actions.
 */
import { useCallback, useEffect, useState } from 'react';
import { ASK_AI_EVENT } from './studio/MoneyAtStakeWidget';

export const OPEN_DETAIL_EVENT = 'merchantpilot:open-detail';
export type DetailKind = 'invoice' | 'dispute' | 'transaction' | 'customer' | 'subscription';

export function openDetail(kind: DetailKind, id: string) {
  window.dispatchEvent(new CustomEvent(OPEN_DETAIL_EVENT, { detail: { kind, id } }));
}

const money = (n: number | undefined | null, c = 'USD') => (n === null || n === undefined ? '—' : new Intl.NumberFormat('en-US', { style: 'currency', currency: c }).format(n));

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 border-b border-[var(--line)] py-1.5 text-xs">
      <span className="text-[var(--muted)]">{k}</span>
      <span className="text-right font-medium">{v ?? '—'}</span>
    </div>
  );
}

function Link_({ kind, id, children }: { kind: DetailKind; id?: string; children?: React.ReactNode }) {
  if (!id) return <>—</>;
  return (
    <button className="text-[var(--accent)] underline" onClick={() => openDetail(kind, id)} data-testid={`link-${kind}`}>
      {children ?? id}
    </button>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-4">
      <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">{title}</h3>
      {children}
    </section>
  );
}

function Ask({ label, prompt }: { label: string; prompt: string }) {
  return (
    <button className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90" onClick={() => window.dispatchEvent(new CustomEvent(ASK_AI_EVENT, { detail: prompt }))}>
      ✨ {label}
    </button>
  );
}

function Actions({ actions }: { actions: any[] }) {
  if (!actions?.length) return <p className="text-xs text-[var(--muted)]">No AI actions yet.</p>;
  return (
    <ul className="space-y-1">
      {actions.map((a) => (
        <li key={a.id} className="rounded border border-[var(--line)] px-2 py-1 text-xs">
          <span className="font-medium">{a.title}</span>
          <span className="ml-1 text-[var(--muted)]">
            · {a.status}
            {a.decidedBy ? ` by ${a.decidedBy}` : ''} · {a.createdAt.slice(0, 10)}
          </span>
        </li>
      ))}
    </ul>
  );
}

function TxList({ rows }: { rows: any[] }) {
  return (
    <table className="w-full text-xs">
      <tbody>
        {rows.map((t) => (
          <tr key={t.transactionId} className="border-b border-[var(--line)]">
            <td className="py-1">{t.date}</td>
            <td className="py-1">{t.type}</td>
            <td className="max-w-[140px] truncate py-1">{t.item}</td>
            <td className={`py-1 text-right ${t.gross < 0 ? 'text-rose-600' : ''}`}>{money(t.gross, t.currency)}</td>
            <td className="py-1 pl-2 text-right">
              <Link_ kind="transaction" id={t.transactionId}>
                open
              </Link_>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function CustomerBlock({ c }: { c: any }) {
  if (!c) return null;
  return (
    <>
      <Row k="Customer" v={<Link_ kind="customer" id={c.email || c.name}>{c.name}</Link_>} />
      <Row k="Segment" v={c.segment} />
      <Row k="Orders / lifetime spend" v={`${c.orders} / ${money(c.lifetimeSpend)}`} />
      <Row k="Refunds" v={`${c.refunds} (${money(c.refundedAmount)})`} />
      {c.flags?.length > 0 && <p className="mt-1 rounded bg-amber-50 px-2 py-1 text-[11px] text-amber-900">⚑ {c.flags.join(' · ')}</p>}
    </>
  );
}

function Body({ d }: { d: any }) {
  if (d.kind === 'invoice') {
    const i = d.invoice;
    return (
      <>
        <div className="flex items-baseline justify-between">
          <span className="text-2xl font-bold">{money(i.amount, i.currency)}</span>
          <span className={`rounded px-2 py-0.5 text-[11px] font-semibold ${i.daysOverdue > 0 ? 'bg-rose-100 text-rose-800' : i.status === 'PAID' ? 'bg-emerald-100 text-emerald-800' : 'bg-zinc-100 text-zinc-700'}`}>
            {i.daysOverdue > 0 ? `${i.daysOverdue} days overdue` : i.status}
          </span>
        </div>
        <Section title="Invoice">
          <Row k="Number" v={i.invoiceNumber} />
          <Row k="PayPal invoice ID" v={<span className="font-mono text-[10px]">{i.invoiceId}</span>} />
          <Row k="Issued / due" v={`${i.invoiceDate} → ${i.dueDate}`} />
          <Row k="Last reminder" v={i.lastReminderAt ? i.lastReminderAt.slice(0, 16).replace('T', ' ') : 'never'} />
          <Row k="Payment plan" v={i.paymentPlan ? `${i.paymentPlan.installments} × ${money(i.paymentPlan.minimumAmountDue, i.currency)}` : 'none'} />
        </Section>
        {i.items?.length > 0 && (
          <Section title="Products on this invoice">
            <table className="w-full text-xs" data-testid="invoice-items">
              <thead>
                <tr className="text-left text-[10px] uppercase text-[var(--muted)]">
                  <th className="py-1 font-medium">Item</th>
                  <th className="py-1 text-right font-medium">Qty</th>
                  <th className="py-1 text-right font-medium">Unit</th>
                  <th className="py-1 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {i.items.map((l: any, n: number) => (
                  <tr key={n} className="border-t border-[var(--line)]">
                    <td className="py-1 pr-2">{l.name}</td>
                    <td className="py-1 text-right">{l.quantity}</td>
                    <td className="py-1 text-right">{money(l.unitPrice, i.currency)}</td>
                    <td className={`py-1 text-right ${l.total < 0 ? 'text-emerald-700' : ''}`}>{money(l.total, i.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>
        )}
        <Section title="Customer">
          <Row k="Name" v={<Link_ kind="customer" id={i.recipientEmail || i.recipientName}>{i.recipientName}</Link_>} />
          <Row k="Email" v={i.recipientEmail} />
          <Row k="Other invoices" v={`${d.customer.otherInvoices} (${d.customer.paidOnTime} paid, ${money(d.customer.otherUnpaid, i.currency)} unpaid)`} />
        </Section>
        <Section title="Timeline">
          <ul className="space-y-1 text-xs">
            {d.timeline.map((t: any) => (
              <li key={t.what}>
                <span className="text-[var(--muted)]">{t.at}</span> · {t.what}
              </li>
            ))}
          </ul>
        </Section>
        <Section title="AI actions about this invoice">
          <Actions actions={d.actions} />
        </Section>
        {i.status !== 'PAID' && (
          <div className="mt-4 flex flex-wrap gap-2">
            <Ask label="Prepare a reminder" prompt={`Prepare a friendly, specific payment reminder for invoice ${i.invoiceNumber} (${i.recipientName}).`} />
            <Ask label="Offer a payment plan" prompt={`Offer invoice ${i.invoiceNumber} (${i.recipientName}) as a payment plan in 3 installments and prepare it for my approval.`} />
          </div>
        )}
      </>
    );
  }
  if (d.kind === 'dispute') {
    const x = d.dispute;
    return (
      <>
        <div className="flex items-baseline justify-between">
          <span className="text-2xl font-bold">{money(x.amount, x.currency)}</span>
          <span className={`rounded px-2 py-0.5 text-[11px] font-semibold ${x.status === 'RESOLVED' ? 'bg-zinc-100' : x.daysToRespond <= 5 ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-900'}`}>
            {x.status === 'RESOLVED' ? x.outcome ?? 'Resolved' : `${x.daysToRespond} days to respond`}
          </span>
        </div>
        <Section title="Dispute">
          <Row k="ID" v={x.disputeId} />
          <Row k="Reason" v={x.reason.replaceAll('_', ' ').toLowerCase()} />
          <Row k="Status / stage" v={`${x.status} · ${x.stage}`} />
          <Row k="Opened / respond by" v={`${x.createdDate} → ${x.responseDueDate}`} />
          <Row k="Product" v={x.item} />
          <Row k="Transaction" v={<Link_ kind="transaction" id={x.transactionId} />} />
          {x.evidenceSubmittedAt && <Row k="Evidence submitted" v={x.evidenceSubmittedAt.slice(0, 16).replace('T', ' ')} />}
        </Section>
        {d.customer && (
          <Section title="Customer">
            <Row k="Customer" v={<Link_ kind="customer" id={d.customer.email}>{d.customer.name}</Link_>} />
            <Row k="Country" v={d.customer.country} />
            <Row k="Lifetime orders / spend" v={`${d.customer.lifetimeOrders} / ${money(d.customer.lifetimeSpend)}`} />
            <Row k="Lifetime refunds" v={d.customer.lifetimeRefunds} />
          </Section>
        )}
        <Section title="Recommended evidence">
          <ul className="list-disc pl-4 text-xs">
            {d.recommendedEvidence.map((e: string) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
          <a className="mt-1 inline-block text-xs text-[var(--accent)] underline" href={d.evidencePack} target="_blank" rel="noreferrer">
            📄 Preview evidence pack (PDF)
          </a>
        </Section>
        <Section title="AI actions about this dispute">
          <Actions actions={d.actions} />
        </Section>
        {x.status !== 'RESOLVED' && (
          <div className="mt-4 flex flex-wrap gap-2">
            <Ask label="Fight it with evidence" prompt={`Review dispute ${x.disputeId} and prepare an evidence pack to fight it for my approval.`} />
            <Ask label="Should I accept it?" prompt={`Should I accept dispute ${x.disputeId}? Explain using the data, and prepare the action if accepting is the better choice.`} />
          </div>
        )}
      </>
    );
  }
  if (d.kind === 'subscription') {
    const x = d.subscription;
    const tone = x.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-800' : x.status === 'SUSPENDED' ? 'bg-rose-100 text-rose-800' : 'bg-zinc-100 text-zinc-700';
    const every = `${x.intervalCount > 1 ? x.intervalCount + ' ' : ''}${x.interval.toLowerCase()}${x.intervalCount > 1 ? 's' : ''}`;
    return (
      <>
        <div className="flex items-baseline justify-between">
          <span className="text-2xl font-bold">
            {money(x.amount, x.currency)} <span className="text-sm font-normal text-[var(--muted)]">/ {every}</span>
          </span>
          <span className={`rounded px-2 py-0.5 text-[11px] font-semibold ${tone}`}>{x.status}</span>
        </div>
        <Section title="Subscription">
          <Row k="ID" v={<span className="font-mono text-[10px]">{x.subscriptionId}</span>} />
          <Row k="Plan" v={x.planName} />
          <Row k="Monthly value (MRR)" v={money(d.monthlyValue, x.currency)} />
          <Row k="Started / tenure" v={`${x.startDate} · ${d.tenureMonths} months`} />
          {x.nextBillingDate && <Row k="Next billing" v={x.nextBillingDate} />}
          {x.lastPaymentDate && <Row k="Last payment" v={`${x.lastPaymentDate} · ${money(x.lastPaymentAmount ?? x.amount, x.currency)}`} />}
          {x.failedPayments > 0 && <Row k="Failed payments" v={<span className="font-semibold text-rose-700">{x.failedPayments}</span>} />}
          {x.cancelledDate && <Row k="Cancelled" v={x.cancelledDate} />}
          <Row k="Paid in the last 90 days" v={money(d.paidInPeriod, x.currency)} />
        </Section>
        <Section title="Subscriber">
          {d.customer ? <CustomerBlock c={d.customer} /> : <Row k="Subscriber" v={`${x.subscriberName} · ${x.subscriberEmail}`} />}
        </Section>
        {d.payments.length > 0 && (
          <Section title="Recurring payments">
            <TxList rows={d.payments} />
          </Section>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          {x.status === 'SUSPENDED' && <Ask label="Recover this subscriber" prompt={`Subscription ${x.subscriptionId} (${x.planName}, ${x.subscriberEmail}) is suspended after ${x.failedPayments} failed payment(s). Write the message to update the payment method and tell me how much MRR it recovers.`} />}
          {x.status === 'CANCELLED' && <Ask label="Win them back" prompt={`Subscriber ${x.subscriberName} cancelled ${x.planName} on ${x.cancelledDate}. Using the data, suggest a win-back offer and write the message.`} />}
          {x.status === 'ACTIVE' && <Ask label="Upsell idea" prompt={`Suggest an upsell or plan upgrade for subscriber ${x.subscriberName} on ${x.planName}, using their purchase history.`} />}
        </div>
      </>
    );
  }
  if (d.kind === 'transaction') {
    const t = d.transaction;
    return (
      <>
        <div className="flex items-baseline justify-between">
          <span className={`text-2xl font-bold ${t.gross < 0 ? 'text-rose-600' : ''}`}>{money(t.gross, t.currency)}</span>
          <span className="rounded bg-zinc-100 px-2 py-0.5 text-[11px] font-semibold text-zinc-700">
            {t.type} · {t.status}
          </span>
        </div>
        <Section title="Transaction">
          <Row k="ID" v={<span className="font-mono text-[10px]">{t.transactionId}</span>} />
          <Row k="Date" v={t.datetime.replace('T', ' ').slice(0, 16)} />
          <Row k="Product" v={t.item} />
          {t.subscriptionId && <Row k="Subscription" v={<Link_ kind="subscription" id={t.subscriptionId} />} />}
          <Row k="Fee / net" v={`${money(t.fee, t.currency)} / ${money(t.net, t.currency)}`} />
          <Row k="Payment method" v={t.instrument} />
          <Row k="Country" v={t.country} />
          {d.original && <Row k="Original payment" v={<Link_ kind="transaction" id={d.original.transactionId} />} />}
          {t.type === 'Payment' && <Row k="Still refundable" v={money(d.refundable, t.currency)} />}
          {d.dispute && <Row k="Dispute" v={<Link_ kind="dispute" id={d.dispute.disputeId} />} />}
        </Section>
        {d.related.length > 0 && (
          <Section title="Refunds / chargebacks on this payment">
            <TxList rows={d.related} />
          </Section>
        )}
        <Section title="Customer">
          <CustomerBlock c={d.customer} />
        </Section>
        <Section title="AI actions about this payment">
          <Actions actions={d.actions} />
        </Section>
        {t.type === 'Payment' && d.refundable > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            <Ask label="Should I refund it?" prompt={`Should I refund transaction ${t.transactionId} (${t.item}, ${t.gross} ${t.currency})? Explain with the data and prepare the refund for my approval if it makes sense.`} />
          </div>
        )}
      </>
    );
  }
  const c = d.customer;
  return (
    <>
      <div className="flex items-baseline justify-between">
        <span className="text-2xl font-bold">{money(c.lifetimeSpend)}</span>
        <span className="rounded bg-violet-100 px-2 py-0.5 text-[11px] font-semibold text-violet-800">{c.segment}</span>
      </div>
      <p className="text-xs text-[var(--muted)]">{c.email}</p>
      {c.flags.length > 0 && <p className="mt-2 rounded bg-amber-50 px-2 py-1 text-[11px] text-amber-900">⚑ {c.flags.join(' · ')}</p>}
      <Section title="Customer value">
        <Row k="Orders" v={c.orders} />
        <Row k="Average order" v={money(c.averageOrder)} />
        <Row k="First / last order" v={`${c.firstOrder ?? '—'} → ${c.lastOrder ?? '—'}`} />
        <Row k="Refunds" v={`${c.refunds} (${money(c.refundedAmount)})`} />
        <Row k="Countries" v={c.countries.join(', ')} />
        {c.invoicesTotal > 0 && <Row k="Invoiced / overdue" v={`${money(c.invoicesTotal)} / ${money(c.invoicesOverdue)}`} />}
      </Section>
      {c.topProducts.length > 0 && (
        <Section title="Top products">
          <ul className="text-xs">
            {c.topProducts.map((p: any) => (
              <li key={p.item}>
                {p.item} · {p.orders} order(s)
              </li>
            ))}
          </ul>
        </Section>
      )}
      {c.recent.length > 0 && (
        <Section title="Recent activity">
          <TxList rows={c.recent} />
        </Section>
      )}
      {c.disputes.length > 0 && (
        <Section title="Disputes">
          {c.disputes.map((x: any) => (
            <Row key={x.disputeId} k={x.reason.replaceAll('_', ' ').toLowerCase()} v={<Link_ kind="dispute" id={x.disputeId} />} />
          ))}
        </Section>
      )}
      {c.subscriptions?.length > 0 && (
        <Section title="Subscriptions">
          {c.subscriptions.map((x: any) => (
            <Row key={x.subscriptionId} k={`${x.planName} · ${x.status}`} v={<Link_ kind="subscription" id={x.subscriptionId}>{money(x.amount, x.currency)}</Link_>} />
          ))}
        </Section>
      )}
      {c.invoices.length > 0 && (
        <Section title="Invoices">
          {c.invoices.map((i: any) => (
            <Row key={i.invoiceId} k={`${i.invoiceNumber} · ${i.status}`} v={<Link_ kind="invoice" id={i.invoiceNumber}>{money(i.amount, i.currency)}</Link_>} />
          ))}
        </Section>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        <Ask label="How do I keep this customer?" prompt={`Summarize customer ${c.name} (${c.email || 'no email'}) using the data and suggest how to keep or recover them.`} />
      </div>
    </>
  );
}

const TITLE: Record<DetailKind, string> = { invoice: 'Invoice', dispute: 'Dispute', transaction: 'Transaction', customer: 'Customer', subscription: 'Subscription' };

export default function DetailDrawer() {
  const [stack, setStack] = useState<{ kind: DetailKind; id: string }[]>([]);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const top = stack.at(-1);

  const load = useCallback(async (kind: DetailKind, id: string) => {
    setData(null);
    setError(null);
    const r = await fetch(`/api/details?kind=${kind}&id=${encodeURIComponent(id)}`, { cache: 'no-store' });
    const b = await r.json();
    if (b.error) setError(b.error);
    else setData(b);
  }, []);

  useEffect(() => {
    const on = (e: Event) => {
      const { kind, id } = (e as CustomEvent).detail ?? {};
      if (!kind || !id) return;
      setStack((s) => [...s, { kind, id }]);
      void load(kind, id);
    };
    window.addEventListener(OPEN_DETAIL_EVENT, on);
    return () => window.removeEventListener(OPEN_DETAIL_EVENT, on);
  }, [load]);

  const open = stack.length > 0;
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setStack([]);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (!top) return null;
  const back = () => {
    const next = stack.slice(0, -1);
    setStack(next);
    const prev = next.at(-1);
    if (prev) void load(prev.kind, prev.id);
  };
  return (
    <div className="fixed inset-0 z-[65] flex justify-end bg-black/20" onClick={() => setStack([])}>
      <aside className="h-full w-[min(460px,96vw)] overflow-y-auto bg-[var(--panel)] p-5 shadow-2xl" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={`${TITLE[top.kind]} details`} data-testid="detail-drawer">
        <div className="mb-3 flex items-center gap-2">
          {stack.length > 1 && (
            <button className="rounded border border-[var(--line)] px-2 py-0.5 text-xs" onClick={back}>
              ← Back
            </button>
          )}
          <h2 className="flex-1 truncate text-base font-semibold">
            {TITLE[top.kind]} <span className="font-normal text-[var(--muted)]">{top.id}</span>
          </h2>
          <button className="text-[var(--muted)]" onClick={() => setStack([])} aria-label="Close details">
            ✕
          </button>
        </div>
        {error && <p className="text-sm text-rose-600">{error}</p>}
        {!error && !data && <p className="text-sm text-[var(--muted)]">Loading…</p>}
        {data && <Body d={data} />}
      </aside>
    </div>
  );
}
