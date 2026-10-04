import { checkExportAuth, periodFrom } from '@/lib/export/auth';
import { loadReportModel } from '@/lib/export/load';
import { reportFileName } from '@/lib/export/report-model';
import { buildWorkbook } from '@/lib/export/xlsx';

export const runtime = 'nodejs';

/** GET /api/export/xlsx?days=30 → Excel workbook (summary + all data as Excel tables). */
export async function GET(req: Request) {
  const denied = checkExportAuth(req);
  if (denied) return denied;
  const model = await loadReportModel(periodFrom(req));
  const buf = await buildWorkbook(model);
  return new Response(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${reportFileName(model, 'xlsx')}"`,
      'Cache-Control': 'no-store',
    },
  });
}
