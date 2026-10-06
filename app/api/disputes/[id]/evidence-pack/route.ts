import { getStore } from '@/lib/store';
import { getDataset } from '@/lib/data';
import { buildEvidencePdf } from '@/lib/export/evidence-pdf';
import { withBusiness } from '@/lib/businesses';

export const runtime = 'nodejs';

/** GET /api/disputes/{id}/evidence-pack[?action=act_x] → the PDF that is (or will be) submitted to PayPal. */
async function GET_handler(req: Request, ctx: RouteContext<'/api/disputes/[id]/evidence-pack'>) {
  const { id } = await ctx.params;
  const actionId = new URL(req.url).searchParams.get('action');
  const action = actionId ? await getStore().getAction(actionId) : undefined;
  const data = action && action.kind === 'submit_dispute_evidence' && action.data.disputeId === id ? action.data : { disputeId: id };
  const ds = await getDataset();
  try {
    const pdf = await buildEvidencePdf(ds, data, ds.merchantName);
    return new Response(new Uint8Array(pdf), {
      headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="evidence-${id}.pdf"`, 'Cache-Control': 'no-store' },
    });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 404 });
  }
}

export const GET = withBusiness(GET_handler);
