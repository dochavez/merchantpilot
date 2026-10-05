import { listAlerts } from '@/lib/alerts';
import { dataMode } from '@/lib/config';

export const dynamic = 'force-dynamic';

/** GET /api/alerts?after=<ISO time> – newest first. Polled by the dashboard every few seconds. */
export async function GET(req: Request) {
  const after = new URL(req.url).searchParams.get('after') ?? undefined;
  return Response.json({ alerts: await listAlerts(after), canSimulate: dataMode() === 'demo', now: new Date().toISOString() }, { headers: { 'Cache-Control': 'no-store' } });
}
