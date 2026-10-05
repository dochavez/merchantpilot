'use client';

/**
 * Header "Export" menu: Excel workbook, PDF executive report (AI summary), CSV tables and a live
 * connection for Power BI / Excel through the OData feed.
 */
import { useEffect, useRef, useState } from 'react';

const CSV_TABLES = ['Transactions', 'Disputes', 'Invoices', 'Products', 'Countries', 'WeeklyTrend', 'Findings', 'Actions'];

export default function ExportMenu() {
  const [open, setOpen] = useState(false);
  const [bi, setBi] = useState(false);
  const [mcp, setMcp] = useState(false);
  const [days, setDays] = useState(30);
  const [lang, setLang] = useState<'en' | 'es'>('en');
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const item = 'flex w-full items-start gap-2 rounded-md px-3 py-2 text-left text-xs hover:bg-[var(--hover)]';
  return (
    <div className="relative" ref={ref}>
      <button
        className="rounded-md border border-[var(--line)] px-2.5 py-1 text-xs hover:bg-[var(--hover)]"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        data-testid="export-menu"
      >
        Export ▾
      </button>
      {open && (
        <div className="absolute right-0 z-[60] mt-1 w-80 rounded-lg border border-[var(--line)] bg-[var(--panel)] p-1.5 shadow-xl">
          <div className="flex items-center gap-2 px-3 pb-2 pt-1 text-[11px] text-[var(--muted)]">
            Period
            <select className="rounded border border-[var(--line)] bg-transparent px-1 py-0.5" value={days} onChange={(e) => setDays(Number(e.target.value))}>
              {[7, 30, 60, 90].map((d) => (
                <option key={d} value={d}>
                  last {d} days
                </option>
              ))}
            </select>
            Report language
            <select className="rounded border border-[var(--line)] bg-transparent px-1 py-0.5" value={lang} onChange={(e) => setLang(e.target.value as 'en' | 'es')}>
              <option value="en">EN</option>
              <option value="es">ES</option>
            </select>
          </div>
          <a className={item} href={`/api/export/pdf?days=${days}&lang=${lang}`} onClick={() => setOpen(false)}>
            <span className="mt-0.5 rounded bg-rose-100 px-1 text-[10px] font-bold text-rose-700">PDF</span>
            <span>
              <b>Executive report</b>
              <br />
              <span className="text-[var(--muted)]">KPIs, charts, priorities, AI-written summary, audit trail</span>
            </span>
          </a>
          <a className={item} href={`/api/export/xlsx?days=${days}`} onClick={() => setOpen(false)}>
            <span className="mt-0.5 rounded bg-emerald-100 px-1 text-[10px] font-bold text-emerald-700">XLSX</span>
            <span>
              <b>Excel workbook</b>
              <br />
              <span className="text-[var(--muted)]">Summary + 9 sheets as Excel tables, ready for pivots</span>
            </span>
          </a>
          <button
            className={item}
            onClick={() => {
              setBi(true);
              setOpen(false);
            }}
          >
            <span className="mt-0.5 rounded bg-amber-100 px-1 text-[10px] font-bold text-amber-800">BI</span>
            <span>
              <b>Connect Power BI / Excel (live)</b>
              <br />
              <span className="text-[var(--muted)]">Refreshable OData feed – no copy &amp; paste</span>
            </span>
          </button>
          <button
            className={item}
            onClick={() => {
              setMcp(true);
              setOpen(false);
            }}
            data-testid="open-mcp"
          >
            <span className="mt-0.5 rounded bg-violet-100 px-1 text-[10px] font-bold text-violet-800">MCP</span>
            <span>
              <b>Use from Claude, Cursor & other AI apps</b>
              <br />
              <span className="text-[var(--muted)]">MCP server: ask and queue actions from any assistant</span>
            </span>
          </button>
          <details className="px-3 py-1 text-xs">
            <summary className="cursor-pointer py-1 text-[var(--muted)]">Accounting (QuickBooks / Xero)</summary>
            <div className="flex flex-wrap gap-1 py-1">
              <a className="rounded border border-[var(--line)] px-1.5 py-0.5 hover:bg-[var(--hover)]" href={`/api/export/accounting?format=quickbooks&days=${Math.max(days, 30)}`}>
                QuickBooks Online
              </a>
              <a className="rounded border border-[var(--line)] px-1.5 py-0.5 hover:bg-[var(--hover)]" href={`/api/export/accounting?format=xero&days=${Math.max(days, 30)}`}>
                Xero
              </a>
              <a className="rounded border border-[var(--line)] px-1.5 py-0.5 hover:bg-[var(--hover)]" href="/api/export/accounting?format=summary">
                Monthly summary
              </a>
            </div>
          </details>
          <details className="px-3 py-1 text-xs">
            <summary className="cursor-pointer py-1 text-[var(--muted)]">CSV tables</summary>
            <div className="flex flex-wrap gap-1 py-1">
              {CSV_TABLES.map((t) => (
                <a key={t} className="rounded border border-[var(--line)] px-1.5 py-0.5 hover:bg-[var(--hover)]" href={`/api/export/csv/${t}?days=${days}`}>
                  {t}
                </a>
              ))}
            </div>
          </details>
        </div>
      )}
      {bi && <BiDialog onClose={() => setBi(false)} />}
      {mcp && <McpDialog onClose={() => setMcp(false)} />}
    </div>
  );
}

function BiDialog({ onClose }: { onClose: () => void }) {
  const feed = typeof window === 'undefined' ? '/api/odata' : `${window.location.origin}/api/odata`;
  const [copied, setCopied] = useState(false);
  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-xl bg-[var(--panel)] p-5 text-sm shadow-2xl" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Connect Power BI or Excel">
        <div className="flex items-start justify-between">
          <h2 className="text-base font-semibold">Connect Power BI or Excel</h2>
          <button className="text-[var(--muted)]" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <p className="mt-1 text-xs text-[var(--muted)]">
          A live OData feed with 10 tables (Transactions, Disputes, Invoices, WeeklyTrend, Products, Countries, Findings, Actions, Forecast, Kpis). Every refresh reads your current PayPal data.
        </p>
        <label className="mt-4 block text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">Feed URL</label>
        <div className="mt-1 flex gap-2">
          <input readOnly value={feed} className="min-w-0 flex-1 rounded-md border border-[var(--line)] bg-[var(--card)] px-2 py-1.5 font-mono text-xs" onFocus={(e) => e.target.select()} />
          <button
            className="rounded-md bg-[var(--accent)] px-3 text-xs font-semibold text-white"
            onClick={() => {
              void navigator.clipboard?.writeText(feed).then(() => setCopied(true));
            }}
          >
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-[var(--line)] p-3">
            <div className="text-xs font-semibold">Power BI Desktop</div>
            <a className="mt-2 inline-block rounded-md bg-amber-400 px-2.5 py-1 text-xs font-semibold text-black hover:opacity-90" href="/api/export/pbids">
              Download .pbids (1-click)
            </a>
            <p className="mt-2 text-[11px] text-[var(--muted)]">Or: Get data → OData feed → paste the URL → pick the tables → Load.</p>
          </div>
          <div className="rounded-lg border border-[var(--line)] p-3">
            <div className="text-xs font-semibold">Excel (Microsoft 365)</div>
            <p className="mt-2 text-[11px] text-[var(--muted)]">Data → Get Data → From Other Sources → From OData Feed → paste the URL. Use Refresh All to update.</p>
          </div>
        </div>
        <p className="mt-3 text-[11px] text-[var(--muted)]">
          If the owner set <code>EXPORT_API_KEY</code>, choose <b>Basic</b> authentication: any user name, the key as password.
        </p>
      </div>
    </div>
  );
}

function McpDialog({ onClose }: { onClose: () => void }) {
  const url = typeof window === 'undefined' ? '/api/mcp' : `${window.location.origin}/api/mcp`;
  const config = JSON.stringify(
    { mcpServers: { merchantpilot: { command: 'npx', args: ['-y', 'mcp-remote', url, '--header', 'Authorization:${AUTH_HEADER}'], env: { AUTH_HEADER: 'Bearer <your MCP_API_KEY>' } } } },
    null,
    2,
  );
  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-xl bg-[var(--panel)] p-5 text-sm shadow-2xl" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="MCP server">
        <div className="flex items-start justify-between">
          <h2 className="text-base font-semibold">MerchantPilot as an MCP server</h2>
          <button className="text-[var(--muted)]" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <p className="mt-1 text-xs text-[var(--muted)]">
          16 tools (KPIs, anomalies, disputes, invoices, forecast, proposals, reports). Proposals still need your approval: each one comes back with a signed approve link.
        </p>
        <label className="mt-3 block text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">Endpoint (Streamable HTTP)</label>
        <code className="mt-1 block break-all rounded bg-[var(--hover)] px-2 py-1.5 text-xs">{url}</code>
        <label className="mt-3 block text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">Claude Desktop → Settings → Developer → Edit config</label>
        <pre className="mt-1 max-h-48 overflow-auto rounded bg-[var(--hover)] p-2 text-[11px] leading-snug">{config}</pre>
        <button className="mt-2 rounded-md bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-white" onClick={() => void navigator.clipboard?.writeText(config)}>
          Copy config
        </button>
        <p className="mt-3 text-[11px] text-[var(--muted)]">
          The key is <code>MCP_API_KEY</code> in Render → Environment (required with live PayPal data; the demo is open). Test it with <code>npx @modelcontextprotocol/inspector</code>.
        </p>
      </div>
    </div>
  );
}
