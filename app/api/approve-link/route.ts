import { ActionValidationError, decideAction } from '@/lib/actions';
import { verifyApproval } from '@/lib/signing';
import { getStore } from '@/lib/store';
import { resolveBusiness, withBusiness } from '@/lib/businesses';
import { runInBusiness } from '@/lib/business-context';

export const dynamic = 'force-dynamic';

/** GET ?t= → what the link would do (for the confirmation page). Never changes anything. */
async function GET_handler(req: Request) {
  try {
    const claim = verifyApproval(new URL(req.url).searchParams.get('t') ?? '');
    // The link belongs to the business it was created for, whatever business the browser has selected.
    const action = await runInBusiness(await resolveBusiness(claim.b), () => getStore().getAction(claim.a));
    if (!action) return Response.json({ error: 'This action no longer exists.' }, { status: 404 });
    return Response.json({ decision: claim.d, approver: claim.u, action });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}

/** POST { t } → performs the decision, through the same rules and audit trail as the app. */
async function POST_handler(req: Request) {
  const { t } = (await req.json().catch(() => ({}))) as { t?: string };
  try {
    const claim = verifyApproval(t ?? '');
    const action = await runInBusiness(await resolveBusiness(claim.b), () => decideAction(claim.a, claim.d, claim.u));
    return Response.json({ action });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: e instanceof ActionValidationError ? 409 : 400 });
  }
}

export const GET = withBusiness(GET_handler);
export const POST = withBusiness(POST_handler);
