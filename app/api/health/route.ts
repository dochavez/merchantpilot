import { dataMode, hasPayPalCredentials, llmModelId, llmProvider } from '@/lib/config';

export const dynamic = 'force-dynamic';

/** Used by Render's health check and by the landing page status pills. Never exposes secrets. */
export async function GET() {
  return Response.json({
    ok: true,
    dataMode: dataMode(),
    paypalConfigured: hasPayPalCredentials(),
    llmProvider: llmProvider(),
    llmModel: llmModelId() ?? null,
    agStudioLicensed: Boolean(process.env.NEXT_PUBLIC_AG_STUDIO_LICENSE_KEY),
    time: new Date().toISOString(),
  });
}
