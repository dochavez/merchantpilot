import { subscriptionMetrics } from '@/lib/analytics';
import { withBusiness } from '@/lib/businesses';
import { getDataset } from '@/lib/data';

export const dynamic = 'force-dynamic';

/** GET /api/subscriptions?days=30 → recurring revenue KPIs (MRR, churn, at risk, per plan). */
async function GET_handler(req: Request) {
  const d = Number(new URL(req.url).searchParams.get('days'));
  const days = Number.isFinite(d) && d >= 7 && d <= 90 ? Math.round(d) : 30;
  return Response.json(subscriptionMetrics(await getDataset(), days), { headers: { 'Cache-Control': 'no-store' } });
}

export const GET = withBusiness(GET_handler);
