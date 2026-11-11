'use client';

/**
 * AG Studio dashboard wired to PayPal data and MerchantPilot's agents.
 * Loaded client-only (no SSR) because Studio renders into the DOM.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AgStudio } from 'ag-studio-react';
import { AgStudioAiModule, AgStudioLicenseManager, studioTheme } from 'ag-studio';
import type { AgStudioApi, AgReportState } from 'ag-studio';
import type { Dataset } from '@/lib/types';
import { createServerLlmAdapter } from './llm-adapter';
import { buildHarness } from './paypal-agent';
import { toStudioData } from './data-sources';
import { INITIAL_REPORT } from './initial-report';
import { AUTO_OPEN_PREFIXES, TOOL_DISPLAY } from './tool-display';
import { ASK_AI_EVENT, moneyAtStakeWidget } from './MoneyAtStakeWidget';
import { cashflowForecastWidget } from './CashflowForecastWidget';
import { recurringRevenueWidget } from './RecurringRevenueWidget';
import { currentBusinessId } from '../business-client';
import { makeDrillCell } from './DrillCell';

const licenseKey = process.env.NEXT_PUBLIC_AG_STUDIO_LICENSE_KEY;
if (licenseKey) AgStudioLicenseManager.setLicenseKey(licenseKey);

const STUDIO_MODULES = [AgStudioAiModule];
const STATE_BASE = 'merchantpilot.studioState.v5';
/** Each business keeps its own dashboard layout. */
const stateKey = () => `${STATE_BASE}:${currentBusinessId()}`;

/** MerchantPilot brand on top of Studio's theme (PayPal-like blues, Inter, softer cards). */
const BRAND_PALETTE = ['#0070E0', '#F59E0B', '#10B981', '#7C3AED', '#DC2626', '#0EA5E9', '#64748B', '#EC4899'];
const THEME = (studioTheme as any).withParams({
  accentColor: '#0070E0',
  fontFamily: { googleFont: 'Inter' },
  studioCanvasFontFamily: { googleFont: 'Inter' },
  chartFontFamily: { googleFont: 'Inter' },
  studioWidgetTitleFontFamily: { googleFont: 'Inter' },
  studioCanvasBackgroundColor: '#F5F7FB',
  studioWidgetBorderRadius: 12,
  studioWidgetTitleFontSize: 15,
  studioWidgetTitleFontWeight: 600,
  studioWidgetTitleTextColor: '#0F172A',
  studioToggleButtonActiveBackgroundColor: '#0070E0',
  studioToggleButtonActiveBorderColor: '#0070E0',
  studioToggleButtonActiveColor: '#0070E0',
  ...Object.fromEntries(BRAND_PALETTE.flatMap((c, i) => [[`chartPaletteFills${i + 1}Color`, c], [`chartPaletteStrokes${i + 1}Color`, c]])),
});

/** Register the custom widget and give it its own group in Studio's widget menu. */
const DRILL_CELLS = { invoice: makeDrillCell('invoice'), dispute: makeDrillCell('dispute'), transaction: makeDrillCell('transaction'), customer: makeDrillCell('customer'), subscription: makeDrillCell('subscription') } as const;
/** Grid columns whose field carries `context.drill` become clickable and open the detail drawer. */
const createCellRenderer = (field: any) => DRILL_CELLS[field?.context?.drill as keyof typeof DRILL_CELLS];

const WIDGETS = (w: any) => ({
  ...w,
  widgets: [...w.widgets.map((d: any) => (d.id === 'grid' ? { ...d, options: { ...(d.options ?? {}), createCellRenderer } } : d)), moneyAtStakeWidget, cashflowForecastWidget, recurringRevenueWidget],
  menu: [...w.menu, { label: 'MerchantPilot', widgetIds: ['money-at-stake', 'cashflow-forecast', 'recurring-revenue'] }],
});

function loadSavedState(): AgReportState | undefined {
  try {
    const raw = localStorage.getItem(stateKey());
    return raw ? (JSON.parse(raw) as AgReportState) : undefined;
  } catch {
    return undefined;
  }
}

/** Names for the report pages (AG Studio keeps pages in its state but has no page selector UI). */
const PAGE_NAMES: Record<string, string> = {
  overview: 'Overview',
  sales: 'Sales & customers',
  risk: 'Disputes & refunds',
  collections: 'Collections',
  recurring: 'Subscriptions',
};

export interface StudioDashboardProps {
  dataset: Dataset;
  onApi?: (api: AgStudioApi) => void;
}

export default function StudioDashboard({ dataset, onApi }: StudioDashboardProps) {
  const adapter = useMemo(() => createServerLlmAdapter(), []);
  const data = useMemo(() => toStudioData(dataset), [dataset]);
  const [initialState] = useState<AgReportState | undefined>(() => loadSavedState() ?? (INITIAL_REPORT as unknown as AgReportState));
  const apiRef = useRef<AgStudioApi | null>(null);
  const [pages, setPages] = useState<{ ids: string[]; selected: string }>(() => {
    const st = initialState as any;
    return { ids: (st?.pages ?? []).map((p: any) => p.id), selected: st?.selectedPageId ?? 'overview' };
  });
  const syncPages = useCallback(() => {
    const st = apiRef.current?.getState() as any;
    if (!st) return;
    const ids = (st.pages ?? []).map((p: any) => p.id) as string[];
    setPages((prev) => (prev.selected === st.selectedPageId && prev.ids.join() === ids.join() ? prev : { ids, selected: st.selectedPageId }));
  }, []);
  const goToPage = useCallback((id: string) => {
    const api = apiRef.current;
    if (!api) return;
    api.setState({ ...(api.getState() as any), selectedPageId: id });
    setPages((prev) => ({ ...prev, selected: id }));
  }, []);

  const ai = useCallback((params: { api: AgStudioApi }) => buildHarness(params.api, adapter), [adapter]);

  // Persist the merchant's dashboard layout per browser.
  const onStateUpdated = useCallback(() => {
    const api = apiRef.current;
    if (!api) return;
    syncPages();
    try {
      localStorage.setItem(stateKey(), JSON.stringify(api.getState()));
    } catch {
      /* storage unavailable: fine */
    }
  }, [syncPages]);

  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' && apiRef.current) (window as any).__studioApi = apiRef.current;
  });

  // Studio collapses tool rows by default; open each proposal / report row once so its Approve/Reject card
  // shows without an extra click (the merchant can still collapse it).
  const hostRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const opened = new WeakSet<Element>();
    const openProposals = () => {
      host.querySelectorAll('.ag-studio-ai-step-row-interactive:not(.ag-studio-ai-step-row-open)').forEach((row) => {
        if (opened.has(row)) return;
        const text = row.querySelector('.ag-studio-ai-step-text')?.textContent ?? '';
        if (!AUTO_OPEN_PREFIXES.some((p) => text.startsWith(p))) return;
        opened.add(row);
        (row as HTMLElement).click();
      });
    };
    // "Recover it with AI" (custom widget) → type the prompt into Studio's chat and send it.
    const onAsk = (e: Event) => {
      const prompt = String((e as CustomEvent).detail ?? '');
      if (!prompt) return;
      // If the agent is still busy the chat ignores Enter: retry until the message is accepted.
      const trySend = (attempt: number) => {
        const box = host.querySelector<HTMLTextAreaElement>('.ag-studio-ai-panel textarea, textarea[placeholder^="Ask"]');
        if (!box) return;
        if (box.value !== prompt) {
          Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set?.call(box, prompt);
          box.dispatchEvent(new Event('input', { bubbles: true }));
        }
        box.focus();
        box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
        setTimeout(() => {
          if (box.value === prompt && attempt < 20) trySend(attempt + 1);
        }, 700);
      };
      trySend(0);
    };
    window.addEventListener(ASK_AI_EVENT, onAsk);
    const obs = new MutationObserver(openProposals);
    obs.observe(host, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
    return () => {
      obs.disconnect();
      window.removeEventListener(ASK_AI_EVENT, onAsk);
    };
  }, []);

  return (
    <div ref={hostRef} style={{ height: '100%', width: '100%', display: 'flex', flexDirection: 'column' }}>
    {pages.ids.length > 1 && (
      <nav
        role="tablist"
        aria-label="Report pages"
        data-testid="report-pages"
        style={{ display: 'flex', gap: 4, padding: '6px 12px 0', borderBottom: '1px solid var(--line, #e3e6eb)', overflowX: 'auto', flex: 'none', background: 'var(--panel, #fff)' }}
      >
        {pages.ids.map((id, i) => {
          const active = id === pages.selected;
          return (
            <button
              key={id}
              role="tab"
              aria-selected={active}
              onClick={() => goToPage(id)}
              data-testid={`page-tab-${id}`}
              style={{
                border: 0,
                borderBottom: `2px solid ${active ? '#0070E0' : 'transparent'}`,
                background: 'transparent',
                padding: '6px 12px 8px',
                fontSize: 13,
                fontWeight: active ? 700 : 500,
                color: active ? '#0070E0' : 'var(--muted, #5d6573)',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {PAGE_NAMES[id] ?? `Page ${i + 1}`}
            </button>
          );
        })}
      </nav>
    )}
    <div style={{ flex: 1, minHeight: 0 }}>
    <AgStudio
      style={{ height: '100%', width: '100%' }}
      mode="edit"
      modules={STUDIO_MODULES}
      data={data as any}
      initialState={initialState as any}
      ai={ai as any}
      aiToolDisplay={TOOL_DISPLAY as any}
      theme={THEME}
      loadThemeGoogleFonts
      widgets={WIDGETS}
      panels={{ edit: { left: ['data', 'edit', 'filters'], right: ['ai'] } }}
      onApiReady={(e: any) => {
        apiRef.current = e.api;
        syncPages();
        if (process.env.NODE_ENV !== 'production') (window as any).__studioApi = e.api;
        onApi?.(e.api);
      }}
      onStateUpdated={onStateUpdated}
      onErrorRaised={(e: any) => console.warn('[AG Studio]', e)}
    />
    </div>
    </div>
  );
}

export function clearSavedDashboard() {
  try {
    localStorage.removeItem(stateKey());
  } catch {
    /* ignore */
  }
}
