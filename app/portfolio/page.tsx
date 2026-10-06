'use client';

/**
 * Portfolio: every business the owner runs on PayPal, side by side. Health score (with reasons),
 * consolidated totals, cross-business insights, an AI briefing, an AG Grid comparison table and
 * AG Charts comparisons. One click opens a business's dashboard.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { AgGridReact } from 'ag-grid-react';
import { AllCommunityModule as GridModules, ModuleRegistry as GridRegistry, themeQuartz } from 'ag-grid-community';
import { AgCharts, AllCommunityModule as ChartModules, ModuleRegistry as ChartRegistry } from 'ag-charts-community';
import type { BusinessSnapshot, Portfolio } from '@/lib/portfolio';
import { selectBusiness } from '@/components/business-client';

GridRegistry.registerModules([GridModules]);
ChartRegistry.registerModules([ChartModules]);

const money = (n: number | undefined, c = 'USD') => new Intl.NumberFormat('en-US', { style: 'currency', currency: c, maximumFractionDigits: 0 }).format(n ?? 0);
const GRADE: Record<string, string> = { A: '#059669', B: '#0070E0', C: '#D97706', D: '#DC2626' };

function HealthRing({ score, grade }: { score: number; grade: string }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  return (
    <svg width="68" height="68" viewBox="0 0 68 68" aria-label={`Health ${score} of 100`}>
      <circle cx="34" cy="34" r={r} stroke="#E2E8F0" strokeWidth="7" fill="none" />
      <circle cx="34" cy="34" r={r} stroke={GRADE[grade]} strokeWidth="7" fill="none" strokeDasharray={`${(score / 100) * c} ${c}`} strokeLinecap="round" transform="rotate(-90 34 34)" />
      <text x="34" y="33" textAnchor="middle" fontSize="16" fontWeight="700" fill="currentColor">{score}</text>
      <text x="34" y="47" textAnchor="middle" fontSize="10" fill={GRADE[grade]} fontWeight="700">{grade}</text>
    </svg>
  );
}

function Spark({ data }: { data: { weekStart: string; sales: number }[] }) {
  if (data.length < 2) return <div className="h-8 text-[10px] text-[var(--muted)]">not enough history</div>;
  const max = Math.max(...data.map((d) => d.sales), 1);
  const pts = data.map((d, i) => `${(i / (data.length - 1)) * 120},${30 - (d.sales / max) * 28}`).join(' ');
  return (
    <svg width="120" height="32" viewBox="0 0 120 32" aria-label="Weekly sales trend">
      <polyline points={pts} fill="none" stroke="#0070E0" strokeWidth="2" />
    </svg>
  );
}

function CompareChart({ businesses }: { businesses: BusinessSnapshot[] }) {
  const el = useRef<HTMLDivElement | null>(null);
  const chart = useRef<any>(null);
  useEffect(() => {
    if (!el.current) return;
    const data = businesses.filter((b) => b.kpis).map((b) => ({ name: b.name.replace(' (demo)', ''), sales: b.kpis!.grossSales, net: b.kpis!.netRevenue, stake: b.moneyAtStake ?? 0 }));
    const options: any = {
      container: el.current,
      data,
      background: { visible: false },
      title: { text: 'Last 30 days by business', fontSize: 13 },
      series: [
        { type: 'bar', xKey: 'name', yKey: 'sales', yName: 'Gross sales', fill: '#0070E0' },
        { type: 'bar', xKey: 'name', yKey: 'net', yName: 'Net revenue', fill: '#10B981' },
        { type: 'bar', xKey: 'name', yKey: 'stake', yName: 'Money at stake', fill: '#DC2626' },
      ],
      axes: { x: { type: 'category', position: 'bottom' }, y: { type: 'number', position: 'left', label: { formatter: ({ value }: any) => money(value) } } },
      legend: { position: 'bottom' },
    };
    if (chart.current) chart.current.update(options);
    else chart.current = AgCharts.create(options);
  }, [businesses]);
  useEffect(
    () => () => {
      chart.current?.destroy?.();
      chart.current = null;
    },
    [],
  );
  return <div ref={el} style={{ height: 300 }} />;
}

export default function PortfolioPage() {
  const [p, setP] = useState<Portfolio | null>(null);
  const [summary, setSummary] = useState<{ summary: string; byAi: boolean } | null>(null);
  const [lang, setLang] = useState<'en' | 'es'>('en');

  useEffect(() => {
    void fetch('/api/portfolio', { cache: 'no-store' })
      .then((r) => r.json())
      .then(setP);
  }, []);
  useEffect(() => {
    void Promise.resolve().then(() => setSummary(null));
    void fetch(`/api/portfolio/summary?lang=${lang}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then(setSummary);
  }, [lang]);

  const rows = useMemo(
    () =>
      (p?.businesses ?? []).map((b) => ({
        id: b.id,
        business: b.name,
        mode: b.mode,
        health: b.health?.score ?? null,
        grade: b.health?.grade ?? '',
        sales: b.kpis?.grossSales ?? null,
        change: b.kpis?.salesChangePct ?? null,
        orders: b.kpis?.orders ?? null,
        aov: b.kpis?.averageOrderValue ?? null,
        refundRate: b.kpis?.refundRatePct ?? null,
        net: b.kpis?.netRevenue ?? null,
        stake: b.moneyAtStake ?? null,
        upside: b.forecast30?.upside ?? null,
        pending: b.pendingApprovals ?? null,
        issue: b.error ?? b.topFindings?.[0]?.title ?? '—',
      })),
    [p],
  );
  const cur = p?.totals.currency ?? 'USD';
  const m = (v: any) => (v.value === null ? '—' : money(v.value, cur));
  const cols: any[] = [
    { field: 'business', pinned: 'left', minWidth: 210, cellRenderer: (v: any) => <button className="text-left font-semibold text-[var(--accent)] underline" onClick={() => selectBusiness(v.data.id)}>{v.value}</button> },
    { field: 'health', headerName: 'Health', width: 95, sort: 'asc', cellStyle: (v: any) => ({ color: GRADE[v.data.grade], fontWeight: 700 }) },
    { field: 'sales', headerName: 'Sales 30d', valueFormatter: m, width: 120 },
    { field: 'change', headerName: 'vs prev', width: 95, valueFormatter: (v: any) => (v.value === null ? '—' : `${v.value > 0 ? '+' : ''}${v.value}%`), cellStyle: (v: any) => ({ color: (v.value ?? 0) < 0 ? '#DC2626' : '#047857' }) },
    { field: 'orders', headerName: 'Orders', width: 90 },
    { field: 'aov', headerName: 'Avg ticket', valueFormatter: (v: any) => (v.value === null ? '—' : new Intl.NumberFormat('en-US', { style: 'currency', currency: cur }).format(v.value)), width: 105 },
    { field: 'refundRate', headerName: 'Refund %', width: 100, valueFormatter: (v: any) => (v.value === null ? '—' : `${v.value}%`) },
    { field: 'net', headerName: 'Net revenue', valueFormatter: m, width: 125 },
    { field: 'stake', headerName: 'Money at stake', valueFormatter: m, width: 130, cellStyle: { color: '#B91C1C', fontWeight: 600 } },
    { field: 'upside', headerName: '30d upside', valueFormatter: m, width: 115, cellStyle: { color: '#047857' } },
    { field: 'pending', headerName: 'Approvals', width: 105 },
    { field: 'issue', headerName: 'Top issue', flex: 1, minWidth: 260 },
  ];

  return (
    <div className="min-h-dvh bg-[var(--bg)]">
      <header className="flex items-center gap-3 border-b border-[var(--line)] bg-[var(--panel)] px-4 py-2">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <span className="grid h-7 w-7 place-items-center rounded-md bg-[var(--accent)] text-xs font-bold text-white">MP</span>
          <span className="hidden sm:inline">MerchantPilot</span>
        </Link>
        <span className="text-sm font-medium">Portfolio</span>
        <div className="ml-auto flex items-center gap-2">
          <a className="rounded-md border border-[var(--line)] px-2.5 py-1 text-xs hover:bg-[var(--hover)]" href={`/api/export/portfolio-pdf?lang=${lang}`} data-testid="portfolio-pdf">
            PDF report
          </a>
          <Link className="rounded-md bg-[var(--accent)] px-2.5 py-1 text-xs font-semibold text-white" href="/dashboard">
            Back to dashboard
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-[1400px] space-y-4 p-4">
        {!p && <p className="text-sm text-[var(--muted)]">Loading all businesses…</p>}
        {p && (
          <>
            <section className="grid grid-cols-2 gap-3 md:grid-cols-5" data-testid="portfolio-totals">
              {[
                ['Businesses', String(p.businesses.length)],
                ['Sales (30d, all)', money(p.totals.sales30, cur)],
                ['Net revenue (30d)', money(p.totals.netRevenue30, cur)],
                ['Money at stake', money(p.totals.moneyAtStake, cur)],
                ['Average health', `${p.totals.averageHealth}/100`],
              ].map(([k, v]) => (
                <div key={k} className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-3">
                  <div className="text-[11px] uppercase tracking-wide text-[var(--muted)]">{k}</div>
                  <div className="mt-1 text-xl font-bold">{v}</div>
                </div>
              ))}
            </section>

            <section className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold">Owner briefing {summary?.byAi ? '· written by AI from the numbers below' : ''}</h2>
                <button className="rounded border border-[var(--line)] px-2 py-0.5 text-[11px]" onClick={() => setLang((l) => (l === 'en' ? 'es' : 'en'))}>
                  {lang === 'en' ? 'Español' : 'English'}
                </button>
              </div>
              <p className="mt-2 text-sm leading-relaxed" data-testid="portfolio-summary">{summary?.summary ?? 'Writing the briefing…'}</p>
              <ul className="mt-3 grid gap-1 text-xs text-[var(--muted)] md:grid-cols-2">
                {p.insights.map((i) => (
                  <li key={i}>• {i}</li>
                ))}
              </ul>
            </section>

            <section className="grid gap-3 md:grid-cols-3" data-testid="business-cards">
              {p.businesses.map((b) => (
                <article key={b.id} className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
                  <div className="flex items-start gap-3">
                    {b.health ? <HealthRing score={b.health.score} grade={b.health.grade} /> : <div className="h-[68px] w-[68px] rounded-full bg-[var(--hover)]" />}
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate text-sm font-semibold">{b.name}</h3>
                      <p className="text-[11px] text-[var(--muted)]">
                        {b.description} · {b.mode === 'live' ? 'live PayPal' : 'demo'}
                      </p>
                      {b.kpis && (
                        <p className="mt-1 text-lg font-bold">
                          {money(b.kpis.grossSales, b.currency)}{' '}
                          <span className={`text-xs ${((b.kpis.salesChangePct ?? 0) < 0 ? 'text-rose-600' : 'text-emerald-600')}`}>
                            {b.kpis.salesChangePct !== null ? `${b.kpis.salesChangePct > 0 ? '+' : ''}${b.kpis.salesChangePct}%` : ''}
                          </span>
                        </p>
                      )}
                    </div>
                  </div>
                  {b.error ? (
                    <p className="mt-3 text-xs text-rose-600">Could not load: {b.error}</p>
                  ) : (
                    <>
                      <div className="mt-2">
                        <Spark data={b.weekly ?? []} />
                      </div>
                      <dl className="mt-2 grid grid-cols-3 gap-2 text-[11px]">
                        <div>
                          <dt className="text-[var(--muted)]">Refunds</dt>
                          <dd className="font-semibold">{b.kpis?.refundRatePct}%</dd>
                        </div>
                        <div>
                          <dt className="text-[var(--muted)]">At stake</dt>
                          <dd className="font-semibold text-rose-700">{money(b.moneyAtStake, b.currency)}</dd>
                        </div>
                        <div>
                          <dt className="text-[var(--muted)]">30d upside</dt>
                          <dd className="font-semibold text-emerald-700">{money(b.forecast30?.upside, b.currency)}</dd>
                        </div>
                      </dl>
                      <ul className="mt-2 space-y-0.5 text-[11px]">
                        {b.health?.reasons.slice(0, 3).map((r) => (
                          <li key={r} className="text-[var(--muted)]">
                            {r}
                          </li>
                        ))}
                      </ul>
                      {b.topFindings?.[0] && <p className="mt-2 rounded bg-[var(--hover)] px-2 py-1 text-[11px]">⚑ {b.topFindings[0].title}</p>}
                    </>
                  )}
                  <button className="mt-3 w-full rounded-md bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-white" onClick={() => selectBusiness(b.id)}>
                    Open dashboard
                  </button>
                </article>
              ))}
            </section>

            <section className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-3" data-testid="portfolio-grid">
              <h2 className="mb-2 text-sm font-semibold">Compare (sortable, AG Grid)</h2>
              <div style={{ height: 60 + rows.length * 42 }}>
                <AgGridReact theme={themeQuartz.withParams({ accentColor: '#0070E0', fontFamily: 'inherit' })} rowData={rows} columnDefs={cols} defaultColDef={{ sortable: true, resizable: true }} />
              </div>
            </section>

            <section className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-3">
              <CompareChart businesses={p.businesses} />
            </section>
          </>
        )}
      </main>
    </div>
  );
}
