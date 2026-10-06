'use client';

/** In-chat download card for create_report (rendered via AG Studio's aiToolDisplay). */
import type { AgAiToolDetailParams } from 'ag-studio';

const META: Record<string, { badge: string; cls: string; title: string; sub: string }> = {
  pdf: { badge: 'PDF', cls: 'bg-rose-100 text-rose-700', title: 'Executive report', sub: 'KPIs, charts, priorities, AI summary and audit trail' },
  xlsx: { badge: 'XLSX', cls: 'bg-emerald-100 text-emerald-700', title: 'Excel workbook', sub: 'Summary, Transactions, Disputes, Invoices (4 sheets)' },
  csv: { badge: 'CSV', cls: 'bg-sky-100 text-sky-700', title: 'CSV table', sub: 'Opens in Excel, Google Sheets or any BI tool' },
  quickbooks: { badge: 'QBO', cls: 'bg-lime-100 text-lime-800', title: 'QuickBooks Online import', sub: 'Bank-statement CSV: sales, refunds and PayPal fees as separate lines' },
  xero: { badge: 'XERO', cls: 'bg-cyan-100 text-cyan-800', title: 'Xero bank statement import', sub: 'Date, amount, payee, description, reference – fees as separate lines' },
  powerbi: { badge: 'BI', cls: 'bg-amber-100 text-amber-800', title: 'Live Power BI / Excel connection', sub: 'Refreshable OData feed with 10 tables (incl. 90-day forecast)' },
};

export default function ReportCard(props: AgAiToolDetailParams) {
  if (!props.result?.success) return null;
  let r: { format: string; url: string; periodDays: number };
  try {
    r = JSON.parse(props.result.response);
  } catch {
    return null;
  }
  const meta = META[r.format] ?? META.pdf;
  const feed = typeof window !== 'undefined' ? `${window.location.origin}/api/odata` : '/api/odata';
  return (
    <article className="my-1 rounded-lg border border-[var(--line)] bg-[var(--card)] p-3 text-left shadow-sm" data-testid="chat-report">
      <div className="flex items-center gap-2">
        <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${meta.cls}`}>{meta.badge}</span>
        <span className="text-sm font-medium">{meta.title}</span>
        {r.format !== 'powerbi' && <span className="ml-auto text-[11px] text-[var(--muted)]">last {r.periodDays} days</span>}
      </div>
      <p className="mt-1 text-xs text-[var(--muted)]">{meta.sub}</p>
      {r.format === 'powerbi' ? (
        <div className="mt-2 space-y-2">
          <code className="block break-all rounded bg-[var(--hover)] px-2 py-1 text-[11px]">{feed}</code>
          <div className="flex gap-2">
            <a className="rounded-md bg-amber-400 px-3 py-1.5 text-xs font-semibold text-black" href="/api/export/pbids">
              Open in Power BI (.pbids)
            </a>
            <button className="rounded-md border border-[var(--line)] px-3 py-1.5 text-xs" onClick={() => void navigator.clipboard?.writeText(feed)}>
              Copy feed URL
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-2 flex gap-2">
          <a className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90" href={r.url} data-testid="chat-report-download">
            Download
          </a>
          {r.format === 'pdf' && (
            <a className="rounded-md border border-[var(--line)] px-3 py-1.5 text-xs" href={`${r.url}&inline=1`} target="_blank" rel="noreferrer">
              Open
            </a>
          )}
        </div>
      )}
    </article>
  );
}
