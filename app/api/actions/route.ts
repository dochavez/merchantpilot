import { listActions } from '@/lib/actions';

export const dynamic = 'force-dynamic';

export async function GET() {
  return Response.json({ actions: await listActions() }, { headers: { 'Cache-Control': 'no-store' } });
}
