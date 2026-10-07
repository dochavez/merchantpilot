/**
 * Real-time alerts: verified PayPal webhooks (or demo simulations) become alerts the dashboard shows
 * as toasts with a one-click "Ask AI". Prompts are built from our own templates and IDs – never from
 * free text in the event – so a webhook can't inject instructions into the agent.
 */
import { getStore } from './store';

export interface Alert {
  id: string;
  at: string;
  type: string;
  severity: 'high' | 'medium' | 'low';
  title: string;
  detail?: string;
  /** Prompt for "Ask AI" (template-built). */
  prompt?: string;
  source: 'paypal-webhook' | 'simulated';
}

const KEY = 'alerts';
const safeId = (s: unknown) => String(s ?? '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40);
const amt = (a: any) => (a?.value ? `${Number(a.value).toFixed(2)} ${safeId(a.currency_code)}` : '');

export async function listAlerts(after?: string): Promise<Alert[]> {
  const all = (await getStore().getSetting<Alert[]>(KEY)) ?? [];
  return after ? all.filter((a) => a.at > after) : all;
}

export async function addAlert(a: Omit<Alert, 'id' | 'at'>): Promise<Alert> {
  const alert: Alert = { ...a, id: 'al_' + Math.random().toString(36).slice(2, 10), at: new Date().toISOString() };
  const all = (await getStore().getSetting<Alert[]>(KEY)) ?? [];
  await getStore().setSetting(KEY, [alert, ...all].slice(0, 50));
  return alert;
}

export function alertFromWebhook(event: any): Omit<Alert, 'id' | 'at'> | null {
  const type = safeId(String(event?.event_type ?? '').replace(/\./g, '_')).replace(/_/g, '.');
  const r = event?.resource ?? {};
  switch (event?.event_type) {
    case 'CUSTOMER.DISPUTE.CREATED': {
      const id = safeId(r.dispute_id);
      return {
        type,
        severity: 'high',
        title: `New dispute ${id}`,
        detail: `${String(r.reason ?? '').replaceAll('_', ' ').toLowerCase().slice(0, 60)} · ${amt(r.dispute_amount)}`,
        prompt: `A new PayPal dispute ${id} was just opened. Look it up, tell me if I should fight or accept it and why, and prepare the best action for my approval.`,
        source: 'paypal-webhook',
      };
    }
    case 'CUSTOMER.DISPUTE.UPDATED':
    case 'CUSTOMER.DISPUTE.RESOLVED': {
      const id = safeId(r.dispute_id);
      return { type, severity: 'medium', title: `Dispute ${id} ${event.event_type.endsWith('RESOLVED') ? 'resolved' : 'updated'}`, detail: safeId(r.status), source: 'paypal-webhook' };
    }
    case 'PAYMENT.CAPTURE.REFUNDED':
    case 'PAYMENT.CAPTURE.REVERSED':
      return {
        type,
        severity: 'medium',
        title: `${event.event_type.endsWith('REVERSED') ? 'Payment reversed' : 'Refund issued'} ${amt(r.amount)}`,
        prompt: 'A refund or reversal just happened. Check whether refunds are spiking and on which product.',
        source: 'paypal-webhook',
      };
    case 'PAYMENT.CAPTURE.COMPLETED':
      return { type, severity: 'low', title: `New sale ${amt(r.amount)}`, source: 'paypal-webhook' };
    case 'BILLING.SUBSCRIPTION.ACTIVATED':
      return { type, severity: 'low', title: `New subscriber ${safeId(r.id)}`, detail: safeId(r.plan_id), source: 'paypal-webhook' };
    case 'BILLING.SUBSCRIPTION.CANCELLED':
      return {
        type,
        severity: 'medium',
        title: `Subscription cancelled ${safeId(r.id)}`,
        detail: safeId(r.plan_id),
        prompt: `Subscription ${safeId(r.id)} was just cancelled. Check whether cancellations of its plan are rising and suggest a win-back offer.`,
        source: 'paypal-webhook',
      };
    case 'BILLING.SUBSCRIPTION.SUSPENDED':
    case 'BILLING.SUBSCRIPTION.PAYMENT.FAILED':
      return {
        type,
        severity: 'high',
        title: `${event.event_type.endsWith('FAILED') ? 'Subscription payment failed' : 'Subscription suspended'} ${safeId(r.id)}`,
        detail: amt(r.billing_info?.last_failed_payment?.amount ?? r.billing_info?.outstanding_balance),
        prompt: `Subscription ${safeId(r.id)} has a failed or suspended payment. How much recurring revenue is at risk and what should I do to recover it?`,
        source: 'paypal-webhook',
      };
    case 'PAYMENT.SALE.COMPLETED':
      return { type, severity: 'low', title: `Subscription payment ${amt(r.amount ? { value: r.amount.total, currency_code: r.amount.currency } : undefined)}`, detail: safeId(r.billing_agreement_id), source: 'paypal-webhook' };
    case 'INVOICING.INVOICE.PAID':
      return { type, severity: 'low', title: `Invoice ${safeId(r.invoice?.detail?.invoice_number ?? r.id)} paid`, source: 'paypal-webhook' };
    default:
      return type ? { type, severity: 'low', title: `PayPal event: ${type}`, source: 'paypal-webhook' } : null;
  }
}
