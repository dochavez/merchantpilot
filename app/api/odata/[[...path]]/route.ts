/**
 * OData v4 feed for Power BI, Excel ("Get Data → From OData feed"), Tableau, etc.
 *   GET /api/odata                 service document (list of tables)
 *   GET /api/odata/$metadata       schema (EDMX)
 *   GET /api/odata/Transactions    rows  (supports $select, $top, $skip, $count; ?days= for KPIs)
 * Refreshable: every refresh reads current PayPal data through the same model as the dashboard.
 */
import { checkExportAuth, periodFrom } from '@/lib/export/auth';
import { ENTITIES, edmx, findEntity, projectRows } from '@/lib/export/entities';
import { loadReportModel } from '@/lib/export/load';

export const runtime = 'nodejs';

const HEADERS = { 'OData-Version': '4.0', 'Cache-Control': 'no-store' };

function baseUrl(req: Request) {
  const u = new URL(req.url);
  const proto = req.headers.get('x-forwarded-proto') ?? u.protocol.replace(':', '');
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? u.host;
  return `${proto}://${host}/api/odata`;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...HEADERS, 'Content-Type': 'application/json;odata.metadata=minimal;charset=utf-8' } });
}

function odataError(code: string, message: string, status: number) {
  return json({ error: { code, message } }, status);
}

export async function GET(req: Request, ctx: RouteContext<'/api/odata/[[...path]]'>) {
  const denied = checkExportAuth(req);
  if (denied) return denied;
  const { path = [] } = await ctx.params;
  const base = baseUrl(req);
  const seg = decodeURIComponent(path[0] ?? '');

  if (!seg) {
    return json({ '@odata.context': `${base}/$metadata`, value: ENTITIES.map((e) => ({ name: e.name, kind: 'EntitySet', url: e.name })) });
  }
  if (seg === '$metadata') {
    return new Response(edmx(), { headers: { ...HEADERS, 'Content-Type': 'application/xml;charset=utf-8' } });
  }
  const entity = findEntity(seg);
  if (!entity || path.length > 1) return odataError('NotFound', `Unknown resource "${path.join('/')}". Available: ${ENTITIES.map((e) => e.name).join(', ')}`, 404);

  const q = new URL(req.url).searchParams;
  for (const unsupported of ['$filter', '$orderby', '$expand', '$apply', '$search']) {
    // Fail loudly instead of silently returning unfiltered data; Power BI then filters locally.
    if (q.has(unsupported)) return odataError('NotImplemented', `${unsupported} is not supported by this feed; load the table and filter it in Power BI / Excel.`, 501);
  }
  let cols = entity.columns;
  const select = q.get('$select');
  if (select) {
    const wanted = select.split(',').map((x) => x.trim());
    cols = entity.columns.filter((c) => wanted.includes(c.name));
    if (!cols.length) return odataError('BadRequest', `Unknown $select columns: ${select}`, 400);
  }
  const model = await loadReportModel(periodFrom(req));
  let rows = projectRows(entity, model, cols);
  const total = rows.length;
  const skip = Math.max(0, Number(q.get('$skip') ?? 0) || 0);
  const top = q.has('$top') ? Math.max(0, Number(q.get('$top')) || 0) : undefined;
  rows = rows.slice(skip, top === undefined ? undefined : skip + top);
  return json({
    '@odata.context': `${base}/$metadata#${entity.name}${select ? `(${cols.map((c) => c.name).join(',')})` : ''}`,
    ...(q.get('$count') === 'true' ? { '@odata.count': total } : {}),
    value: rows,
  });
}
