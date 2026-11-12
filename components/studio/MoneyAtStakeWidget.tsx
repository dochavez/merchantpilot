'use client';

/**
 * Custom AG Studio widget: "Money at stake".
 * Drop any money measures on it (e.g. overdue invoices, open disputes, refunds) and it shows the
 * recoverable total, a stacked breakdown and a one-click "Recover it with AI" button that asks
 * MerchantPilot to act. It uses Studio's data engine, so page filters and cross-filters apply.
 */
import { useEffect, useState } from 'react';
import type { AgWidgetParams } from 'ag-studio';
import type { AgWidgetDefinition } from 'ag-studio-react';

export const ASK_AI_EVENT = 'merchantpilot:ask';
const COLORS = ['#DC2626', '#F59E0B', '#7C3AED', '#0EA5E9', '#10B981'];

type Part = { key: string; label: string; value: number };
const cleanLabel = (s: string) => s.replace(/\s*\((sum|total)\)$/i, '');

function MoneyAtStakeWidget(params: AgWidgetParams) {
  const { dataMapping, widgetApi } = params;
  const fields = ((dataMapping as Record<string, any>).values ?? []) as any[];
  const [parts, setParts] = useState<Part[] | null>(null);
  const [currency, setCurrency] = useState('USD');
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let alive = true;
    let settled = false;
    if (!fields.length) {
      widgetApi.setDisplayState('incompleteDataMapping');
      return;
    }
    widgetApi.setDisplayState('loading', { prominent: parts === null });
    // Studio's data engine can drop a query issued while it is still starting up: ask again if
    // nothing came back after a few seconds.
    const watchdog = setTimeout(() => {
      if (alive && !settled && retry < 5) setRetry((r) => r + 1);
    }, 4000);
    void Promise.all(
      fields.map((f, i) =>
        widgetApi
          .getData({ fields: [f] }, { queryId: `stake-${i}${retry ? `-r${retry}` : ""}` })
          .then((r) => ({ key: f.key, label: cleanLabel(widgetApi.getFieldName(f)), value: Number(r.results.rows?.[0]?.[f.key] ?? 0) || 0 }))
          .catch(() => ({ key: f.key, label: cleanLabel(widgetApi.getFieldName(f)), value: 0 })),
      ),
    ).then((res) => {
      settled = true;
      if (!alive) return;
      setParts(res);
      const fmt = widgetApi.formatFieldValue(fields[0], 1) ?? '';
      if (/€/.test(String(fmt))) setCurrency('EUR');
      widgetApi.setDisplayState(res.some((p) => p.value) ? 'displayed' : 'noData');
    });
    return () => {
      alive = false;
      clearTimeout(watchdog);
    };
    // Re-query whenever Studio hands us new params (data refresh, filters, mapping changes).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, retry]);

  if (!parts) return <div data-testid="money-at-stake-loading" style={{ padding: '4px 10px', fontSize: 12, color: '#64748B' }}>Calculating…</div>;
  const total = parts.reduce((s, p) => s + Math.max(0, p.value), 0);
  const money = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n);
  const ask = () => {
    const list = parts.filter((p) => p.value > 0).map((p) => `${p.label}: ${money(p.value)}`).join(', ');
    window.dispatchEvent(
      new CustomEvent(ASK_AI_EVENT, {
        detail: `I have ${money(total)} at stake (${list}). Prioritise what to recover first and prepare the actions for my approval.`,
      }),
    );
  };

  return (
    <div style={{ display: 'flex', height: '100%', flexDirection: 'column', justifyContent: 'center', gap: 8, padding: '4px 10px', fontFamily: 'inherit' }} data-testid="money-at-stake">
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontSize: 30, fontWeight: 700, color: '#B91C1C', fontVariantNumeric: 'tabular-nums' }}>{money(total)}</span>
        <button
          onClick={ask}
          style={{ background: '#0070E0', color: '#fff', border: 0, borderRadius: 6, padding: '5px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
          data-testid="recover-with-ai"
        >
          ✨ Recover it with AI
        </button>
      </div>
      <div style={{ display: 'flex', height: 10, borderRadius: 5, overflow: 'hidden', background: '#F1F5F9' }}>
        {parts.map((p, i) => (p.value > 0 && total > 0 ? <div key={p.key} title={`${p.label}: ${money(p.value)}`} style={{ width: `${(p.value / total) * 100}%`, background: COLORS[i % COLORS.length] }} /> : null))}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px', fontSize: 12, color: '#475569' }}>
        {parts.map((p, i) => (
          <span key={p.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: COLORS[i % COLORS.length] }} />
            {p.label} <b style={{ color: '#0F172A' }}>{money(p.value)}</b>
            {total > 0 && <span>({Math.round((Math.max(0, p.value) / total) * 100)}%)</span>}
          </span>
        ))}
      </div>
    </div>
  );
}

const dataMapping = {
  values: {
    type: 'fieldset' as const,
    supportedRoles: ['numeric' as const],
    requires: { cardinality: 'one' as const },
    required: true,
    intent: 'value' as const,
    aiDescription: 'Money amounts that are still recoverable, each summed (e.g. invoices.overdueAmount, disputes.openAmount).',
  },
};

export const moneyAtStakeWidget: AgWidgetDefinition = {
  id: 'money-at-stake',
  label: 'Money at stake',
  icon: '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32" fill="none"><rect x="4" y="13" width="24" height="6" rx="3" fill="#F1F5F9" stroke="var(--ag-text-color,#5b5b5c)"/><rect x="4" y="13" width="12" height="6" rx="3" fill="#DC2626"/><rect x="15" y="13" width="6" height="6" fill="#F59E0B"/><text x="16" y="10" font-size="8" text-anchor="middle" fill="var(--ag-text-color,#5b5b5c)" font-family="Arial" font-weight="bold">$</text></svg>',
  dataMapping,
  form: ({ createDefaults }: any) => createDefaults({ dataMappingItems: [{ key: 'values', label: 'Amounts at stake' }] }),
  comp: MoneyAtStakeWidget,
  defaultSize: { width: 420, height: 140 },
  minSize: { width: 2, height: 2 },
  ai: {
    label: 'Money at stake',
    description: 'Big recoverable total with a stacked bar and legend of each money measure, plus a "Recover it with AI" button.',
    usage: 'Use to show how much money the merchant can still recover or protect (overdue invoices, open disputes, refunds at risk). Not for trends over time.',
    configuration: 'Map 2-4 sum-aggregated currency measures to "values", e.g. invoices.overdueAmount and disputes.openAmount. Title it "Money at stake".',
  },
} as any;
