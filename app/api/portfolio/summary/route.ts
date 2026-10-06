import { buildPortfolio } from '@/lib/portfolio';
import { portfolioSummary } from '@/lib/portfolio-summary';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/** GET /api/portfolio/summary?lang=es – AI-written owner briefing across all businesses. */
export async function GET(req: Request) {
  const lang = new URL(req.url).searchParams.get('lang') === 'es' ? 'es' : 'en';
  return Response.json(await portfolioSummary(await buildPortfolio(), lang), { headers: { 'Cache-Control': 'no-store' } });
}
