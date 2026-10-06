import { listActions } from '@/lib/actions';
import { withBusiness } from '@/lib/businesses';
import { getDataset } from '@/lib/data';
import { getDetails, type DetailKind } from '@/lib/details';

export const dynamic = 'force-dynamic';

/** GET /api/details?kind=invoice|dispute|transaction|customer&id=… */
async function GET_handler(req: Request) {
  const q = new URL(req.url).searchParams;
  const kind = q.get('kind') as DetailKind;
  const id = q.get('id') ?? '';
  if (!['invoice', 'dispute', 'transaction', 'customer'].includes(kind) || !id) return Response.json({ error: 'kind and id are required' }, { status: 400 });
  const d = getDetails(await getDataset(), await listActions(), kind, id);
  return d ? Response.json(d, { headers: { 'Cache-Control': 'no-store' } }) : Response.json({ error: `${kind} ${id} not found` }, { status: 404 });
}

export const GET = withBusiness(GET_handler);
