import { dataMode, hasPayPalCredentials, llmModelId, llmProvider } from '@/lib/config';
import { getStore } from '@/lib/store';
import { withBusiness } from '@/lib/businesses';

export const dynamic = 'force-dynamic';

/** Used by Render's health check and by the landing page status pills. Never exposes secrets. */
async function GET_handler() {
  // Health must stay green even if the database is briefly unreachable; report it instead.
  const store = getStore();
  const storage = await Promise.race([
    store
      .getSetting('healthcheck')
      .then(() => store.kind)
      .catch((e: Error) => `${store.kind}-error: ${e.message.slice(0, 80)}`),
    new Promise<string>((r) => setTimeout(() => r(`${store.kind}-timeout`), 3000)),
  ]);
  return Response.json({
    storage,
    ok: true,
    dataMode: dataMode(),
    paypalConfigured: hasPayPalCredentials(),
    llmProvider: llmProvider(),
    llmModel: llmModelId() ?? null,
    agStudioLicensed: Boolean(process.env.NEXT_PUBLIC_AG_STUDIO_LICENSE_KEY),
    time: new Date().toISOString(),
  });
}

export const GET = withBusiness(GET_handler);
