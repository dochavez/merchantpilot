'use client';

/**
 * Custom AG Studio widget: "Recurring revenue".
 * PayPal Subscriptions at a glance: MRR/ARR, active subscribers, churn vs the previous period,
 * subscriptions suspended after failed renewals (MRR at risk), renewals due this week and each
 * plan's share of MRR. Numbers come from the deterministic model in lib/analytics.ts
 * (/api/subscriptions); the buttons hand the situation to MerchantPilot's AI.
 */
import { useEffect, useState } from 'react';
import type { AgWidgetParams } from 'ag-studio';
import type { AgWidgetDefinition } from 'ag-studio-react';
import { ASK_AI_EVENT } from './MoneyAtStakeWidget';

type Plan = { planName: string; active: number; mrr: number; churnedInPeriod: number; churnedPrevPeriod: number; suspended: number };
type Metrics = {
  hasSubscriptions: boolean;
  currency: string;
  periodDays: number;
  mrr: number;
  arr: number;
  activeSubscribers: number;
  newSubscribers: number;
  churnedSubscribers: number;
  churnRatePct: number;
  churnRatePrevPct: number;
  suspendedSubscribers: number;
  mrrAtRisk: number;
  renewalsNext7Days: { count: number; amount: number };
  plans: Plan[];
};

const PLAN_COLORS = ['#0070E0', '#10B981', '#7C3AED', '#F59E0B', '#0EA5E9'];

function RecurringRevenueWidget(params: AgWidgetParams) {
  const { widgetApi } = params;
  const [m, setM] = useState<Metrics | null>(null);

  useEffect(() => {
    let alive = true;
    widgetApi.setDisplayState('loading', { prominent: m === null });
    void fetch('/api/subscriptions?days=30', { cache: 'no-store' })
      .then((r) => r.json())
      .then((data: Metrics) => {
        if (!alive) return;
        setM(data);
        widgetApi.setDisplayState(data.hasSubscriptions ? 'displayed' : 'noData');
      })
      .catch(() => alive && widgetApi.setDisplayState('noData'));
    return () => {
      alive = false;
    };
    // params changes when Studio refreshes data → refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  if (!m?.hasSubscriptions) return null;
  const money = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: m.currency || 'USD', maximumFractionDigits: 0 }).format(n);
  const churnUp = m.churnRatePct > m.churnRatePrevPct;
  const ask = (prompt: string) => window.dispatchEvent(new CustomEvent(ASK_AI_EVENT, { detail: prompt }));
  const worst = [...m.plans].sort((a, b) => b.churnedInPeriod - b.churnedPrevPeriod - (a.churnedInPeriod - a.churnedPrevPeriod))[0];
  const stat = (label: string, value: string, sub?: React.ReactNode, color = '#0F172A') => (
    <div style={{ minWidth: 78 }}>
      <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.4, color: '#64748B' }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: '#64748B' }}>{sub}</div>}
    </div>
  );

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', height: '100%', gap: '6px 24px', padding: '0 10px 2px', fontSize: 12, color: '#334155' }} data-testid="recurring-revenue">
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 14px', alignContent: 'flex-start', flex: '1 1 360px' }}>
        {stat('MRR', money(m.mrr), `ARR ${money(m.arr)}`, '#0070E0')}
        {stat('Subscribers', String(m.activeSubscribers), `+${m.newSubscribers} / −${m.churnedSubscribers} in 30d`)}
        {stat('Churn (30d)', `${m.churnRatePct}%`, <span style={{ color: churnUp ? '#B91C1C' : '#047857', fontWeight: 600 }}>{churnUp ? '▲' : '▼'} from {m.churnRatePrevPct}%</span>, churnUp ? '#B91C1C' : '#0F172A')}
        {stat('MRR at risk', money(m.mrrAtRisk), `${m.suspendedSubscribers} suspended`, m.mrrAtRisk > 0 ? '#B91C1C' : '#0F172A')}
        {stat('Renewals 7d', String(m.renewalsNext7Days.count), money(m.renewalsNext7Days.amount))}
      </div>
      <div style={{ flex: '1 1 300px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', height: 10, borderRadius: 5, overflow: 'hidden', background: '#F1F5F9' }}>
          {m.plans.map((p, i) => (p.mrr > 0 && m.mrr > 0 ? <div key={p.planName} title={`${p.planName}: ${money(p.mrr)}`} style={{ width: `${(p.mrr / m.mrr) * 100}%`, background: PLAN_COLORS[i % PLAN_COLORS.length] }} /> : null))}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {m.plans.map((p, i) => {
            const spike = p.churnedInPeriod >= 3 && p.churnedInPeriod >= 2 * Math.max(1, p.churnedPrevPeriod);
            return (
              <div key={p.planName} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: PLAN_COLORS[i % PLAN_COLORS.length], flex: 'none' }} />
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.planName}</span>
                <b style={{ color: '#0F172A' }}>{money(p.mrr)}</b>
                <span style={{ width: 92, textAlign: 'right', color: spike ? '#B91C1C' : '#64748B', fontWeight: spike ? 700 : 400 }}>
                  {p.active} subs · −{p.churnedInPeriod}
                </span>
              </div>
            );
          })}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 'auto' }}>
          {m.mrrAtRisk > 0 && (
            <button
              onClick={() => ask(`${m.suspendedSubscribers} subscriptions are suspended after failed payments (${money(m.mrrAtRisk)}/month at risk). List them, write the message to update the payment method and tell me how much MRR it recovers.`)}
              style={{ background: '#0070E0', color: '#fff', border: 0, borderRadius: 6, padding: '4px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
              data-testid="recover-subscribers"
            >
              ✨ Recover at-risk MRR
            </button>
          )}
          {worst && worst.churnedInPeriod > worst.churnedPrevPeriod && (
            <button
              onClick={() => ask(`Cancellations of "${worst.planName}" went from ${worst.churnedPrevPeriod} to ${worst.churnedInPeriod} in the last 30 days. Why might that be, and what win-back offer should I send? Add a chart of cancellations by week.`)}
              style={{ background: '#fff', color: '#0F172A', border: '1px solid #E2E8F0', borderRadius: 6, padding: '4px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
            >
              Why are they cancelling?
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export const recurringRevenueWidget: AgWidgetDefinition = {
  id: 'recurring-revenue',
  label: 'Recurring revenue',
  icon: '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32" fill="none"><path d="M24 11a9 9 0 1 0 1.5 7" stroke="var(--ag-text-color,#5b5b5c)" stroke-width="2" fill="none"/><path d="M25 6v6h-6" stroke="#0070E0" stroke-width="2" fill="none"/><text x="16" y="20" font-size="9" text-anchor="middle" fill="#0070E0" font-family="Arial" font-weight="bold">$</text></svg>',
  form: ({ createDefaults }: any) => createDefaults({}),
  comp: RecurringRevenueWidget,
  defaultSize: { width: 800, height: 170 },
  minSize: { width: 4, height: 3 },
  ai: {
    label: 'Recurring revenue',
    description: 'PayPal Subscriptions summary: MRR, ARR, active subscribers, churn vs previous period, MRR at risk from failed renewals, renewals due in 7 days and each plan\'s share of MRR.',
    usage: 'Use when the merchant asks about subscriptions, MRR, churn or recurring revenue. Needs no data mapping.',
    configuration: 'No fields required. Title it "Recurring revenue (PayPal Subscriptions)".',
  },
} as any;
