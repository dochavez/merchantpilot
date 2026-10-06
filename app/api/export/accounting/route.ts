import { quickbooksCsv, summaryCsv, xeroCsv } from '@/lib/export/accounting';
import { checkExportAuth } from '@/lib/export/auth';
import { getDataset } from '@/lib/data';
import { withBusiness } from '@/lib/businesses';

export const runtime = 'nodejs';

/** GET /api/export/accounting?format=quickbooks|xero|summary&days=90 → CSV ready to import. */
async function GET_handler(req: Request) {
  const denied = checkExportAuth(req);
  if (denied) return denied;
  const q = new URL(req.url).searchParams;
  const format = q.get('format') ?? 'quickbooks';
  const days = Math.min(730, Math.max(1, Number(q.get('days')) || (format === 'summary' ? 365 : 90)));
  const ds = await getDataset();
  const body = format === 'xero' ? xeroCsv(ds, days) : format === 'summary' ? summaryCsv(ds, days) : quickbooksCsv(ds, days);
  const name = `paypal-${format}-${new Date().toISOString().slice(0, 10)}.csv`;
  return new Response(body, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${name}"`, 'Cache-Control': 'no-store' } });
}

export const GET = withBusiness(GET_handler);
