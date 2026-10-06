import { buildPortfolio } from '@/lib/portfolio';

export const dynamic = 'force-dynamic';

/** GET /api/portfolio – every business side by side + totals + insights. */
export async function GET() {
  return Response.json(await buildPortfolio(), { headers: { 'Cache-Control': 'no-store' } });
}
