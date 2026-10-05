/**
 * Live (sandbox) executions that the PayPal Agent Toolkit doesn't cover, called only after the
 * merchant approves in the Action Center.
 */
import { buildEvidencePdf, evidenceNotes } from '../export/evidence-pdf';
import type { Dataset, PaymentPlanPayload, SubmitDisputeEvidencePayload } from '../types';
import { paypalGet, paypalPost, paypalPostMultipart, paypalPut } from './rest';

/** Disputes API: provide-evidence (notes + PDF pack). Falls back to send-message if PayPal refuses the evidence call. */
export async function submitDisputeEvidenceLive(ds: Dataset, data: SubmitDisputeEvidencePayload) {
  const notes = evidenceNotes(ds, data);
  const pdf = await buildEvidencePdf(ds, data, ds.merchantName);
  const form = new FormData();
  form.append('input', new Blob([JSON.stringify({ evidences: [{ evidence_type: 'OTHER', notes }] })], { type: 'application/json' }));
  form.append('file1', new Blob([new Uint8Array(pdf)], { type: 'application/pdf' }), `evidence-${data.disputeId}.pdf`);
  try {
    const r = await paypalPostMultipart(`/v1/customer/disputes/${data.disputeId}/provide-evidence`, form);
    return { via: 'provide-evidence', attachments: 1, links: r?.links?.length ?? 0 };
  } catch (e) {
    // e.g. the dispute is not in a state that accepts evidence: still get the statement to PayPal/the buyer.
    await paypalPost(`/v1/customer/disputes/${data.disputeId}/send-message`, { message: notes.slice(0, 2000) });
    return { via: 'send-message', note: `Evidence upload refused (${(e as Error).message.slice(0, 160)}); the statement was sent as a dispute message instead.` };
  }
}

/** Invoicing API: allow partial payments with a minimum amount, then remind the customer with the plan. */
export async function enablePaymentPlanLive(data: PaymentPlanPayload & { minimumAmountDue: number }) {
  const inv = await paypalGet(`/v2/invoicing/invoices/${data.invoiceId}`);
  const currency = inv.amount?.currency_code ?? inv.detail?.currency_code ?? 'USD';
  const payUrl: string | undefined = inv.detail?.metadata?.recipient_view_url;
  const { metadata: _metadata, ...detail } = inv.detail ?? {};
  const body = {
    id: inv.id,
    status: inv.status,
    detail,
    invoicer: inv.invoicer,
    primary_recipients: inv.primary_recipients,
    additional_recipients: inv.additional_recipients,
    items: inv.items,
    amount: inv.amount,
    configuration: {
      ...(inv.configuration ?? {}),
      partial_payment: { allow_partial_payment: true, minimum_amount_due: { currency_code: currency, value: data.minimumAmountDue.toFixed(2) } },
    },
  };
  await paypalPut(`/v2/invoicing/invoices/${data.invoiceId}?send_to_recipient=false&send_to_invoicer=false`, body);
  const note =
    (data.note ? data.note + '\n\n' : '') +
    `You can now pay this invoice in ${data.installments} payments of at least ${data.minimumAmountDue.toFixed(2)} ${currency}.` +
    (payUrl ? ` Pay here: ${payUrl}` : '');
  await paypalPost(`/v2/invoicing/invoices/${data.invoiceId}/remind`, { subject: 'Flexible payment option for your invoice', note: note.slice(0, 4000), send_to_invoicer: false });
  return { partialPayments: true, minimumAmountDue: data.minimumAmountDue, payUrl: payUrl ?? null };
}
