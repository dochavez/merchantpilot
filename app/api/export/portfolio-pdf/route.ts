import { checkExportAuth } from '@/lib/export/auth';
import { buildPortfolioPdf } from '@/lib/export/portfolio-pdf';
import { buildPortfolio } from '@/lib/portfolio';
import { portfolioSummary } from '@/lib/portfolio-summary';

export const runtime = 'nodejs';
export const maxDuration = 60;

/** GET /api/export/portfolio-pdf?lang=es – consolidated PDF across all businesses (AI briefing with fallback). */
export async function GET(req: Request) {
  const denied = checkExportAuth(req);
  if (denied) return denied;
  const url = new URL(req.url);
  const p = await buildPortfolio();
  const s = await portfolioSummary(p, url.searchParams.get('lang') === 'es' ? 'es' : 'en');
  const pdf = await buildPortfolioPdf(p, { text: s.summary, byAi: s.byAi });
  return new Response(new Uint8Array(pdf), {
    headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="merchantpilot-portfolio-${p.generatedAt.slice(0, 10)}.pdf"`, 'Cache-Control': 'no-store' },
  });
}
