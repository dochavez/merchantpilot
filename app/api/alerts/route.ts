import { listAlerts } from '@/lib/alerts';
import { dataMode } from '@/lib/config';
import { withBusiness } from '@/lib/businesses';

export const dynamic = 'force-dynamic';

/** GET /api/alerts?after=<ISO time> – newest first. Polled by the dashboard every few seconds. */
async function GET_handler(req: Request) {
  const after = new URL(req.url).searchParams.get('after') ?? undefined;
  return Response.json({ alerts: await listAlerts(after), canSimulate: dataMode() === 'demo', now: new Date().toISOString() }, { headers: { 'Cache-Control': 'no-store' } });
}

export const GET = withBusiness(GET_handler);
