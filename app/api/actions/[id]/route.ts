import { ActionValidationError, decideAction } from '@/lib/actions';

/** POST { decision: 'approve' | 'reject', approver?: string } – the ONLY path that executes money-moving actions. */
export async function POST(req: Request, ctx: RouteContext<'/api/actions/[id]'>) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const decision = body?.decision;
  if (decision !== 'approve' && decision !== 'reject') {
    return Response.json({ error: 'decision must be "approve" or "reject"' }, { status: 400 });
  }
  try {
    const action = await decideAction(id, decision, body?.approver);
    return Response.json({ action }, { status: action.status === 'failed' ? 502 : 200 });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: e instanceof ActionValidationError ? 409 : 500 });
  }
}
