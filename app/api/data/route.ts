import { getDataset } from '@/lib/data';
import { withBusiness } from '@/lib/businesses';

export const dynamic = 'force-dynamic';

async function GET_handler(req: Request) {
  const fresh = new URL(req.url).searchParams.get('fresh') === '1';
  try {
    const ds = await getDataset({ fresh });
    return Response.json(ds, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
}

export const GET = withBusiness(GET_handler);
