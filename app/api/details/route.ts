import { listActions } from '@/lib/actions';
import { withBusiness } from '@/lib/businesses';
import { getDataset } from '@/lib/data';
import { getDetails, type DetailKind } from '@/lib/details';
import { fetchLiveInvoiceItems } from '@/lib/paypal/live-data';
import { summarizeItems } from '@/lib/demo/recurring';

export const dynamic = 'force-dynamic';

/** GET /api/details?kind=invoice|dispute|transaction|customer|subscription&id=… */
async function GET_handler(req: Request) {
  const q = new URL(req.url).searchParams;
  const kind = q.get('kind') as DetailKind;
  const id = q.get('id') ?? '';
  if (!['invoice', 'dispute', 'transaction', 'customer', 'subscription'].includes(kind) || !id) return Response.json({ error: 'kind and id are required' }, { status: 400 });
  const ds = await getDataset();
  const d: any = getDetails(ds, await listActions(), kind, id);
  // Live invoices: the list endpoint has no line items, so read the full invoice on demand.
  if (d?.kind === 'invoice' && ds.mode === 'live' && !d.invoice.items?.length) {
    try {
      const items = await fetchLiveInvoiceItems(d.invoice.invoiceId);
      d.invoice = { ...d.invoice, items, itemsSummary: d.invoice.itemsSummary || summarizeItems(items) };
    } catch {
      /* keep the invoice without items */
    }
  }
  return d ? Response.json(d, { headers: { 'Cache-Control': 'no-store' } }) : Response.json({ error: `${kind} ${id} not found` }, { status: 404 });
}

export const GET = withBusiness(GET_handler);
