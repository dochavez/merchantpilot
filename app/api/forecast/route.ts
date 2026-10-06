import { getDataset } from '@/lib/data';
import { forecastCashflow, scenarioFromQuery } from '@/lib/forecast';
import { withBusiness } from '@/lib/businesses';

export const dynamic = 'force-dynamic';

/** GET /api/forecast?days=60&fixRefundSpike=1&collectOverdue=1&fightDisputes=1&salesChangePct=10 */
async function GET_handler(req: Request) {
  const q = new URL(req.url).searchParams;
  const f = forecastCashflow(await getDataset(), { days: Number(q.get('days')) || 60, scenario: scenarioFromQuery(q) });
  return Response.json(f, { headers: { 'Cache-Control': 'no-store' } });
}

export const GET = withBusiness(GET_handler);
