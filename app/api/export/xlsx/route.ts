import { checkExportAuth, periodFrom } from '@/lib/export/auth';
import { loadReportModel } from '@/lib/export/load';
import { reportFileName } from '@/lib/export/report-model';
import { buildWorkbook } from '@/lib/export/xlsx';
import { withBusiness } from '@/lib/businesses';

export const runtime = 'nodejs';

/** GET /api/export/xlsx?days=30[&mode=full] → Excel workbook. Default: 4 sheets; mode=full: all 10. */
async function GET_handler(req: Request) {
  const denied = checkExportAuth(req);
  if (denied) return denied;
  const model = await loadReportModel(periodFrom(req));
  const mode = new URL(req.url).searchParams.get('mode') === 'full' ? 'full' : 'simple';
  const buf = await buildWorkbook(model, mode);
  return new Response(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${reportFileName(model, 'xlsx')}"`,
      'Cache-Control': 'no-store',
    },
  });
}

export const GET = withBusiness(GET_handler);
