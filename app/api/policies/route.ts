import { MAX_AUTO_REFUND, cleanApprover, getPolicy, savePolicy } from '@/lib/policies';
import { withBusiness } from '@/lib/businesses';

export const dynamic = 'force-dynamic';

/** GET current approval rules; PUT { policy, approver } to change them (logged with who/when). */
async function GET_handler() {
  return Response.json({ policy: await getPolicy(), limits: { maxAutoRefund: MAX_AUTO_REFUND } }, { headers: { 'Cache-Control': 'no-store' } });
}

async function PUT_handler(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body.policy !== 'object') return Response.json({ error: 'policy object required' }, { status: 400 });
  const policy = await savePolicy(body.policy, cleanApprover(body.approver));
  return Response.json({ policy });
}

export const GET = withBusiness(GET_handler);
export const PUT = withBusiness(PUT_handler);
