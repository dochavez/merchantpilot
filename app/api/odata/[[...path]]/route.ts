/**
 * OData v4 feed for Power BI, Excel ("Get Data → From OData feed"), Tableau, etc.
 *   GET /api/odata                 service document (list of tables)
 *   GET /api/odata/$metadata       schema (EDMX)
 *   GET /api/odata/Transactions    rows  (supports $select, $top, $skip, $count; ?days= for KPIs)
 *   GET /api/odata/all/...         same, for ALL businesses stacked (BusinessId column, composite keys)
 * Every table carries BusinessId + BusinessName; the extra "Businesses" table has health scores.
 * Refreshable: every refresh reads current PayPal data through the same model as the dashboard.
 */
import { checkExportAuth, periodFrom } from '@/lib/export/auth';
import { feedEdmx, feedEntities, feedRows, findFeedEntity } from '@/lib/export/feed';
import { withBusiness } from '@/lib/businesses';

export const runtime = 'nodejs';

const HEADERS = { 'OData-Version': '4.0', 'Cache-Control': 'no-store' };

function baseUrl(req: Request, multi: boolean) {
  const u = new URL(req.url);
  const proto = req.headers.get('x-forwarded-proto') ?? u.protocol.replace(':', '');
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? u.host;
  return `${proto}://${host}/api/odata${multi ? '/all' : ''}`;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...HEADERS, 'Content-Type': 'application/json;odata.metadata=minimal;charset=utf-8' } });
}

function odataError(code: string, message: string, status: number) {
  return json({ error: { code, message } }, status);
}

async function GET_handler(req: Request, ctx: RouteContext<'/api/odata/[[...path]]'>) {
  const denied = checkExportAuth(req);
  if (denied) return denied;
  const { path: raw = [] } = await ctx.params;
  const multi = raw[0]?.toLowerCase() === 'all';
  const path = multi ? raw.slice(1) : raw;
  const base = baseUrl(req, multi);
  const seg = decodeURIComponent(path[0] ?? '');
  const entities = feedEntities(multi);

  if (!seg) {
    return json({ '@odata.context': `${base}/$metadata`, value: entities.map((e) => ({ name: e.def.name, kind: 'EntitySet', url: e.def.name })) });
  }
  if (seg === '$metadata') {
    return new Response(feedEdmx(multi), { headers: { ...HEADERS, 'Content-Type': 'application/xml;charset=utf-8' } });
  }
  const entity = findFeedEntity(multi, seg);
  if (!entity || path.length > 1) return odataError('NotFound', `Unknown resource "${path.join('/')}". Available: ${entities.map((e) => e.def.name).join(', ')}`, 404);

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
  let rows = await feedRows(multi, entity, periodFrom(req), cols);
  const total = rows.length;
  const skip = Math.max(0, Number(q.get('$skip') ?? 0) || 0);
  const top = q.has('$top') ? Math.max(0, Number(q.get('$top')) || 0) : undefined;
  rows = rows.slice(skip, top === undefined ? undefined : skip + top);
  return json({
    '@odata.context': `${base}/$metadata#${entity.def.name}${select ? `(${cols.map((c) => c.name).join(',')})` : ''}`,
    ...(q.get('$count') === 'true' ? { '@odata.count': total } : {}),
    value: rows,
  });
}

export const GET = withBusiness(GET_handler);
