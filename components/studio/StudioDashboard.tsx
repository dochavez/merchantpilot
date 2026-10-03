'use client';

/**
 * AG Studio dashboard wired to PayPal data and MerchantPilot's agents.
 * Loaded client-only (no SSR) because Studio renders into the DOM.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AgStudio } from 'ag-studio-react';
import { AgStudioAiModule, AgStudioLicenseManager } from 'ag-studio';
import type { AgStudioApi, AgReportState } from 'ag-studio';
import type { Dataset } from '@/lib/types';
import { createServerLlmAdapter } from './llm-adapter';
import { buildHarness } from './paypal-agent';
import { toStudioData } from './data-sources';
import { INITIAL_REPORT } from './initial-report';

const licenseKey = process.env.NEXT_PUBLIC_AG_STUDIO_LICENSE_KEY;
if (licenseKey) AgStudioLicenseManager.setLicenseKey(licenseKey);

const STUDIO_MODULES = [AgStudioAiModule];
const STATE_KEY = 'merchantpilot.studioState.v1';

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
  const [initialState] = useState<AgReportState | undefined>(() => loadSavedState() ?? (INITIAL_REPORT as AgReportState | undefined));
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

  return (
    <AgStudio
      style={{ height: '100%', width: '100%' }}
      mode="edit"
      modules={STUDIO_MODULES}
      data={data as any}
      initialState={initialState as any}
      ai={ai as any}
      panels={{ edit: { left: ['data', 'edit', 'filters'], right: ['ai'] } }}
      onApiReady={(e: any) => {
        apiRef.current = e.api;
        if (process.env.NODE_ENV !== 'production') (window as any).__studioApi = e.api;
        onApi?.(e.api);
      }}
      onStateUpdated={onStateUpdated}
      onErrorRaised={(e: any) => console.warn('[AG Studio]', e)}
    />
  );
}

export function clearSavedDashboard() {
  try {
    localStorage.removeItem(STATE_KEY);
  } catch {
    /* ignore */
  }
}
