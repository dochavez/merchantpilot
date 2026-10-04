import { checkExportAuth, periodFrom } from '@/lib/export/auth';
import { ENTITIES, findEntity, toCsv } from '@/lib/export/entities';
import { loadReportModel } from '@/lib/export/load';
import { reportFileName } from '@/lib/export/report-model';

export const runtime = 'nodejs';

/** GET /api/export/csv/Transactions (or Disputes, Invoices, Products, …) → UTF-8 CSV. */
export async function GET(req: Request, ctx: RouteContext<'/api/export/csv/[entity]'>) {
  const denied = checkExportAuth(req);
  if (denied) return denied;
  const { entity: name } = await ctx.params;
  const entity = findEntity(name.replace(/\.csv$/i, ''));
  if (!entity) return Response.json({ error: `Unknown table. Use one of: ${ENTITIES.map((e) => e.name).join(', ')}` }, { status: 404 });
  const model = await loadReportModel(periodFrom(req));
  return new Response(toCsv(entity, model), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${reportFileName(model, `${entity.name.toLowerCase()}.csv`)}"`,
      'Cache-Control': 'no-store',
    },
  });
}
