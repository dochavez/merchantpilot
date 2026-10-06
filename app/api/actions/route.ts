import { listActions } from '@/lib/actions';
import { withBusiness } from '@/lib/businesses';

export const dynamic = 'force-dynamic';

async function GET_handler() {
  return Response.json({ actions: await listActions() }, { headers: { 'Cache-Control': 'no-store' } });
}

export const GET = withBusiness(GET_handler);
