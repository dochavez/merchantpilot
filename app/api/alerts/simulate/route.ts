import { addAlert } from '@/lib/alerts';
import { dataMode } from '@/lib/config';
import { demoNewDispute } from '@/lib/demo/store';

export const dynamic = 'force-dynamic';

/** Demo only: simulate PayPal sending CUSTOMER.DISPUTE.CREATED (adds a real dispute to the demo data). */
export async function POST() {
  if (dataMode() !== 'demo') return Response.json({ error: 'Simulation is only available with demo data. In live mode alerts come from verified PayPal webhooks.' }, { status: 403 });
  const d = demoNewDispute();
  const alert = await addAlert({
    type: 'CUSTOMER.DISPUTE.CREATED',
    severity: 'high',
    title: `New dispute ${d.disputeId}`,
    detail: `${d.reason.replaceAll('_', ' ').toLowerCase()} · ${d.amount.toFixed(2)} ${d.currency}`,
    prompt: `A new PayPal dispute ${d.disputeId} was just opened. Look it up, tell me if I should fight or accept it and why, and prepare the best action for my approval.`,
    source: 'simulated',
  });
  return Response.json({ alert, dispute: d });
}
