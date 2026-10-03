/**
 * PayPal webhook receiver. Verifies the signature with PayPal, then invalidates the data cache so
 * the dashboard reflects new payments, refunds and disputes within seconds.
 *
 * Configure in the PayPal Developer Dashboard -> your app -> Webhooks:
 *   URL: https://<your-app>.onrender.com/api/webhooks/paypal
 *   Events: PAYMENT.CAPTURE.*, CUSTOMER.DISPUTE.*, INVOICING.INVOICE.*
 * Then set PAYPAL_WEBHOOK_ID.
 */
import { config, hasPayPalCredentials } from '@/lib/config';
import { invalidateDataset } from '@/lib/data';
import { paypalPost } from '@/lib/paypal/rest';

const KEY = Symbol.for('merchantpilot.webhookEvents');
type G = typeof globalThis & { [KEY]?: { id: string; type: string; at: string; verified: boolean }[] };

export const dynamic = 'force-dynamic';

export async function GET() {
  return Response.json({ events: (globalThis as G)[KEY] ?? [] });
}

export async function POST(req: Request) {
  const raw = await req.text();
  let event: any;
  try {
    event = JSON.parse(raw);
  } catch {
    return Response.json({ error: 'invalid json' }, { status: 400 });
  }

  let verified = false;
  if (hasPayPalCredentials() && config.paypal.webhookId) {
    try {
      const res = await paypalPost('/v1/notifications/verify-webhook-signature', {
        auth_algo: req.headers.get('paypal-auth-algo'),
        cert_url: req.headers.get('paypal-cert-url'),
        transmission_id: req.headers.get('paypal-transmission-id'),
        transmission_sig: req.headers.get('paypal-transmission-sig'),
        transmission_time: req.headers.get('paypal-transmission-time'),
        webhook_id: config.paypal.webhookId,
        webhook_event: event,
      });
      verified = res.verification_status === 'SUCCESS';
    } catch {
      verified = false;
    }
    if (!verified) return Response.json({ error: 'signature verification failed' }, { status: 401 });
  }

  const g = globalThis as G;
  g[KEY] = [{ id: event.id, type: event.event_type, at: new Date().toISOString(), verified }, ...(g[KEY] ?? [])].slice(0, 50);
  invalidateDataset();
  return Response.json({ ok: true });
}
