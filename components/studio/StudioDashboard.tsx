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

const licenseKey = process.env.NEXT_PUBLIC_AG_STUDIO_LICENSE_KEY;
if (licenseKey) AgStudioLicenseManager.setLicenseKey(licenseKey);

const STUDIO_MODULES = [AgStudioAiModule];
const STATE_KEY = 'merchantpilot.studioState.v3';

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
const WIDGETS = (w: any) => ({
  ...w,
  widgets: [...w.widgets, moneyAtStakeWidget, cashflowForecastWidget],
  menu: [...w.menu, { label: 'MerchantPilot', widgetIds: ['money-at-stake', 'cashflow-forecast'] }],
});

function loadSavedState(): AgReportState | undefined {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    return raw ? (JSON.parse(raw) as AgReportState) : undefined;
  } catch {
    return undefined;
  }
}

export interface StudioDashboardProps {
  dataset: Dataset;
  onApi?: (api: AgStudioApi) => void;
}

export default function StudioDashboard({ dataset, onApi }: StudioDashboardProps) {
  const adapter = useMemo(() => createServerLlmAdapter(), []);
  const data = useMemo(() => toStudioData(dataset), [dataset]);
  const [initialState] = useState<AgReportState | undefined>(() => loadSavedState() ?? (INITIAL_REPORT as unknown as AgReportState));
  const apiRef = useRef<AgStudioApi | null>(null);

  const ai = useCallback((params: { api: AgStudioApi }) => buildHarness(params.api, adapter), [adapter]);

  // Persist the merchant's dashboard layout per browser.
  const onStateUpdated = useCallback(() => {
    const api = apiRef.current;
    if (!api) return;
    try {
      localStorage.setItem(STATE_KEY, JSON.stringify(api.getState()));
    } catch {
      /* storage unavailable: fine */
    }
  }, []);

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
      const box = host.querySelector<HTMLTextAreaElement>('.ag-studio-ai-panel textarea, textarea[placeholder^="Ask"]');
      if (!box || !prompt) return;
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set?.call(box, prompt);
      box.dispatchEvent(new Event('input', { bubbles: true }));
      box.focus();
      box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
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
    <div ref={hostRef} style={{ height: '100%', width: '100%' }}>
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
        if (process.env.NODE_ENV !== 'production') (window as any).__studioApi = e.api;
        onApi?.(e.api);
      }}
      onStateUpdated={onStateUpdated}
      onErrorRaised={(e: any) => console.warn('[AG Studio]', e)}
    />
    </div>
  );
}

export function clearSavedDashboard() {
  try {
    localStorage.removeItem(STATE_KEY);
  } catch {
    /* ignore */
  }
}
