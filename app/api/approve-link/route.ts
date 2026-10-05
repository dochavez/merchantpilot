import { ActionValidationError, decideAction } from '@/lib/actions';
import { verifyApproval } from '@/lib/signing';
import { getStore } from '@/lib/store';

export const dynamic = 'force-dynamic';

/** GET ?t= → what the link would do (for the confirmation page). Never changes anything. */
export async function GET(req: Request) {
  try {
    const claim = verifyApproval(new URL(req.url).searchParams.get('t') ?? '');
    const action = await getStore().getAction(claim.a);
    if (!action) return Response.json({ error: 'This action no longer exists.' }, { status: 404 });
    return Response.json({ decision: claim.d, approver: claim.u, action });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}

/** POST { t } → performs the decision, through the same rules and audit trail as the app. */
export async function POST(req: Request) {
  const { t } = (await req.json().catch(() => ({}))) as { t?: string };
  try {
    const claim = verifyApproval(t ?? '');
    const action = await decideAction(claim.a, claim.d, claim.u);
    return Response.json({ action });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: e instanceof ActionValidationError ? 409 : 400 });
  }
}
