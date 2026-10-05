import { MAX_AUTO_REFUND, cleanApprover, getPolicy, savePolicy } from '@/lib/policies';

export const dynamic = 'force-dynamic';

/** GET current approval rules; PUT { policy, approver } to change them (logged with who/when). */
export async function GET() {
  return Response.json({ policy: await getPolicy(), limits: { maxAutoRefund: MAX_AUTO_REFUND } }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function PUT(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body.policy !== 'object') return Response.json({ error: 'policy object required' }, { status: 400 });
  const policy = await savePolicy(body.policy, cleanApprover(body.approver));
  return Response.json({ policy });
}
