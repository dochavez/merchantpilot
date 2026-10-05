'use client';

/**
 * Custom AG Studio widget: "Cash-flow forecast & what-if".
 * Shows projected cumulative net cash for the next 30/60/90 days (AG Charts), an 80% band, and a
 * scenario line driven by toggles: fix the refund spike, chase overdue invoices, fight disputes,
 * change sales. Numbers come from the deterministic model in lib/forecast.ts (/api/forecast).
 */
import { useEffect, useRef, useState } from 'react';
import type { AgWidgetParams } from 'ag-studio';
import type { AgWidgetDefinition } from 'ag-studio-react';
import { AgCharts, AllCommunityModule, ModuleRegistry } from 'ag-charts-community';
import type { Forecast } from '@/lib/forecast';
import { ASK_AI_EVENT } from './MoneyAtStakeWidget';

ModuleRegistry.registerModules([AllCommunityModule]);

const money = (n: number, c = 'USD') => new Intl.NumberFormat('en-US', { style: 'currency', currency: c, maximumFractionDigits: 0 }).format(n);

function CashflowForecastWidget(params: AgWidgetParams) {
  const { widgetApi } = params;
  const [days, setDays] = useState(60);
  const [fix, setFix] = useState(true);
  const [chase, setChase] = useState(true);
  const [fight, setFight] = useState(false);
  const [salesPct, setSalesPct] = useState(0);
  const [view, setView] = useState<'upside' | 'total'>('upside');
  const [f, setF] = useState<Forecast | null>(null);
  const chartEl = useRef<HTMLDivElement | null>(null);
  const chart = useRef<any>(null);

  useEffect(() => {
    let alive = true;
    const q = new URLSearchParams({ days: String(days), fixRefundSpike: fix ? '1' : '0', collectOverdue: chase ? '1' : '0', fightDisputes: fight ? '1' : '0', salesChangePct: String(salesPct) });
    widgetApi.setDisplayState('loading', { prominent: f === null });
    void fetch(`/api/forecast?${q}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((data: Forecast) => {
        if (!alive) return;
        setF(data);
        widgetApi.setDisplayState('displayed');
      })
      .catch(() => alive && widgetApi.setDisplayState('noData'));
    return () => {
      alive = false;
    };
    // params changes when Studio refreshes data → refetch too.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days, fix, chase, fight, salesPct, params]);

  useEffect(() => {
    if (!f || !chartEl.current) return;
    const data = f.points.map((p) => ({ ...p, date: new Date(`${p.date}T00:00:00Z`) }));
    const fmt = (v: number) => money(v, f.currency);
    const upsideData = data.map((p) => ({ date: p.date, upside: Math.round((p.scenario - p.baseline) * 100) / 100 }));
    const tip = (label: string, key: string) => ({ renderer: ({ datum }: any) => ({ heading: datum.date.toISOString().slice(0, 10), data: [{ label, value: fmt(datum[key]) }] }) });
    const options: any = {
      container: chartEl.current,
      data: view === 'upside' ? upsideData : data,
      background: { visible: false },
      padding: { top: 6, right: 12, bottom: 4, left: 4 },
      legend: { position: 'bottom', item: { label: { fontSize: 11 } } },
      series:
        view === 'upside'
          ? [{ type: 'area', xKey: 'date', yKey: 'upside', yName: 'Extra cash from your actions (cumulative)', fill: '#10B981', fillOpacity: 0.25, stroke: '#059669', strokeWidth: 2, marker: { enabled: false }, tooltip: tip('Extra cash', 'upside') }]
          : [
              { type: 'line', xKey: 'date', yKey: 'high', yName: '80% range', stroke: '#CBD5E1', strokeWidth: 1, lineDash: [4, 4], marker: { enabled: false }, tooltip: { enabled: false } },
              { type: 'line', xKey: 'date', yKey: 'low', yName: 'low', stroke: '#CBD5E1', strokeWidth: 1, lineDash: [4, 4], marker: { enabled: false }, showInLegend: false, tooltip: { enabled: false } },
              { type: 'line', xKey: 'date', yKey: 'baseline', yName: 'Do nothing', stroke: '#64748B', strokeWidth: 2, marker: { enabled: false }, tooltip: tip('Do nothing', 'baseline') },
              { type: 'line', xKey: 'date', yKey: 'scenario', yName: 'With your actions', stroke: '#0070E0', strokeWidth: 3, marker: { enabled: false }, tooltip: tip('With your actions', 'scenario') },
            ],
      axes: {
        x: { type: 'time', position: 'bottom', label: { fontSize: 10, format: '%b %d' }, gridLine: { enabled: false } },
        y: { type: 'number', position: 'left', label: { fontSize: 10, formatter: ({ value }: any) => fmt(value) } },
      },
    };
    if (chart.current) chart.current.update(options);
    else chart.current = AgCharts.create(options);
  }, [f, view]);

  useEffect(() => () => chart.current?.destroy?.(), []);

  const toggle = (label: string, on: boolean, set: (v: boolean) => void, id: string) => (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, cursor: 'pointer', whiteSpace: 'nowrap' }}>
      <input type="checkbox" checked={on} onChange={(e) => set(e.target.checked)} data-testid={id} /> {label}
    </label>
  );

  const ask = () => {
    if (!f) return;
    window.dispatchEvent(
      new CustomEvent(ASK_AI_EVENT, {
        detail: `My ${f.days}-day cash forecast is ${money(f.baseline.net, f.currency)} if I do nothing and ${money(f.withScenario.net, f.currency)} with these actions (${[fix && 'fix refund spike', chase && 'chase overdue invoices', fight && 'fight disputes', salesPct && `sales ${salesPct > 0 ? '+' : ''}${salesPct}%`].filter(Boolean).join(', ') || 'none'}). Explain the biggest drivers and prepare the actions that capture this upside for my approval.`,
      }),
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 6, padding: '2px 8px 4px', fontSize: 12, color: '#334155' }} data-testid="cashflow-forecast">
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px 14px' }}>
        <select value={days} onChange={(e) => setDays(Number(e.target.value))} style={{ border: '1px solid #E2E8F0', borderRadius: 6, padding: '2px 4px', fontSize: 12 }} aria-label="Horizon">
          {[30, 60, 90].map((d) => (
            <option key={d} value={d}>
              next {d} days
            </option>
          ))}
        </select>
        {toggle('Fix refund spike', fix, setFix, 'sc-fix')}
        {toggle('Chase late invoices', chase, setChase, 'sc-chase')}
        {toggle('Fight disputes with evidence', fight, setFight, 'sc-fight')}
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          Sales
          <input type="range" min={-30} max={30} step={5} value={salesPct} onChange={(e) => setSalesPct(Number(e.target.value))} style={{ width: 90 }} aria-label="Sales change" />
          <b style={{ minWidth: 34 }}>{salesPct > 0 ? '+' : ''}{salesPct}%</b>
        </label>
      </div>
      {f && (
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '4px 18px' }}>
          <span>
            Do nothing: <b style={{ color: '#0F172A' }}>{money(f.baseline.net, f.currency)}</b>
          </span>
          <span>
            With your actions: <b style={{ color: '#0070E0', fontSize: 15 }}>{money(f.withScenario.net, f.currency)}</b>
          </span>
          <span style={{ color: f.upside >= 0 ? '#047857' : '#B91C1C', fontWeight: 700 }} data-testid="forecast-upside">
            {f.upside >= 0 ? '+' : ''}
            {money(f.upside, f.currency)} upside
          </span>
          <span style={{ marginLeft: 'auto', display: 'inline-flex', border: '1px solid #E2E8F0', borderRadius: 6, overflow: 'hidden' }}>
            {(['upside', 'total'] as const).map((v) => (
              <button key={v} onClick={() => setView(v)} style={{ border: 0, padding: '3px 8px', fontSize: 11, cursor: 'pointer', background: view === v ? '#0F172A' : 'transparent', color: view === v ? '#fff' : '#334155' }}>
                {v === 'upside' ? 'Extra cash' : 'Total cash'}
              </button>
            ))}
          </span>
          <button onClick={ask} style={{ background: '#0070E0', color: '#fff', border: 0, borderRadius: 6, padding: '4px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            ✨ Make it happen
          </button>
        </div>
      )}
      {f && f.upside !== 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }} data-testid="upside-breakdown">
          {f.levers
            .map((l) => [l.label, l.upside] as const)
            .filter(([, v]) => Math.abs(v as number) >= 1)
            .map(([label, v]) => (
              <span key={label as string} style={{ background: (v as number) >= 0 ? '#ECFDF5' : '#FEF2F2', color: (v as number) >= 0 ? '#047857' : '#B91C1C', borderRadius: 999, padding: '2px 8px', fontSize: 11, fontWeight: 600 }}>
                {label}: {(v as number) >= 0 ? '+' : ''}
                {money(v as number, f.currency)}
              </span>
            ))}
        </div>
      )}
      <div ref={chartEl} style={{ flex: 1, minHeight: 120 }} />
      {f && f.historyDays < 21 && <div style={{ fontSize: 11, color: '#B45309' }}>Only {f.historyDays} days of history – rough estimate.</div>}
    </div>
  );
}

export const cashflowForecastWidget: AgWidgetDefinition = {
  id: 'cashflow-forecast',
  label: 'Cash-flow forecast',
  icon: '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32" fill="none"><path d="M4 24 L11 18 L16 20 L22 12" stroke="var(--ag-text-color,#5b5b5c)" stroke-width="2"/><path d="M22 12 L28 7" stroke="#0070E0" stroke-width="2.5" stroke-dasharray="3 2"/><path d="M22 12 L28 14" stroke="#94A3B8" stroke-width="1.5" stroke-dasharray="3 2"/></svg>',
  form: ({ createDefaults }: any) => createDefaults({}),
  comp: CashflowForecastWidget,
  defaultSize: { width: 800, height: 320 },
  minSize: { width: 4, height: 4 },
  ai: {
    label: 'Cash-flow forecast',
    description: 'Projected cumulative net cash for the next 30-90 days with an 80% band, a "do nothing" line and a scenario line driven by what-if toggles.',
    usage: 'Use when the merchant asks about future cash, runway or the value of fixing a problem. Needs no data mapping.',
    configuration: 'No fields required. Title it "Cash-flow forecast & what-if".',
  },
} as any;
