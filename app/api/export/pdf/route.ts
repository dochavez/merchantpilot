import { checkExportAuth, periodFrom } from '@/lib/export/auth';
import { loadReportModel } from '@/lib/export/load';
import { buildPdf } from '@/lib/export/pdf';
import { reportFileName } from '@/lib/export/report-model';
import { executiveSummary } from '@/lib/export/summary';

export const runtime = 'nodejs';
export const maxDuration = 60;

/** GET /api/export/pdf?days=30&ai=1&lang=en → executive PDF report. */
export async function GET(req: Request) {
  const denied = checkExportAuth(req);
  if (denied) return denied;
  const url = new URL(req.url);
  const model = await loadReportModel(periodFrom(req));
  const summary = await executiveSummary(model, { ai: url.searchParams.get('ai') !== '0', lang: url.searchParams.get('lang') ?? 'en' });
  const buf = await buildPdf(model, summary);
  return new Response(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${url.searchParams.get('inline') ? 'inline' : 'attachment'}; filename="${reportFileName(model, 'pdf')}"`,
      'Cache-Control': 'no-store',
    },
  });
}
