/**
 * Loads the merchant's real sandbox data from PayPal and normalizes it to the shared row shapes.
 * Each source fails independently: a missing permission (e.g. Transaction Search not enabled on the
 * REST app) becomes a warning instead of breaking the dashboard.
 */
import { paypalGet } from './rest';
import type { Dataset, DisputeRow, DisputeStatus, InvoiceRow, InvoiceStatus, TransactionRow, TxStatus, TxType } from '../types';

const DAY = 86_400_000;

export function txTypeFromEventCode(code: string, amount: number): TxType {
  if (!code) return 'Other';
  const group = code.slice(0, 3);
  if (group === 'T00') return amount < 0 ? 'Payout' : 'Payment';
  if (group === 'T03' || group === 'T04') return 'Transfer';
  if (group === 'T01') return 'Fee';
  if (group === 'T11') return 'Refund';
  if (group === 'T12' || group === 'T17') return 'Chargeback';
  return 'Other';
}

export function txStatusFromCode(s: string | undefined): TxStatus {
  switch (s) {
    case 'P':
      return 'Pending';
    case 'D':
      return 'Denied';
    case 'V':
      return 'Reversed';
    case 'F':
      return 'Partially refunded';
    default:
      return 'Completed';
  }
}

const num = (v: unknown) => (v === undefined || v === null || v === '' ? 0 : Number(v));

export function normalizeTransaction(t: any): TransactionRow {
  const info = t.transaction_info ?? {};
  const payer = t.payer_info ?? {};
  const gross = num(info.transaction_amount?.value);
  const fee = num(info.fee_amount?.value);
  const name =
    payer.payer_name?.alternate_full_name ??
    [payer.payer_name?.given_name, payer.payer_name?.surname].filter(Boolean).join(' ') ??
    '';
  const datetime = info.transaction_initiation_date ?? new Date().toISOString();
  return {
    transactionId: info.transaction_id,
    date: datetime.slice(0, 10),
    datetime,
    eventCode: info.transaction_event_code ?? '',
    type: txTypeFromEventCode(info.transaction_event_code ?? '', gross),
    status: txStatusFromCode(info.transaction_status),
    gross,
    fee,
    net: Math.round((gross + fee) * 100) / 100,
    currency: info.transaction_amount?.currency_code ?? 'USD',
    customerEmail: payer.email_address ?? '',
    customerName: name || t.shipping_info?.name || '',
    country: t.shipping_info?.address?.country_code ?? payer.country_code ?? '',
    instrument: info.instrument_sub_type ?? info.instrument_type ?? 'PayPal',
    item: t.cart_info?.item_details?.[0]?.item_name ?? info.transaction_subject ?? info.transaction_note ?? '',
    relatedTransactionId: info.paypal_reference_id,
    invoiceId: info.invoice_id,
  };
}

export async function fetchLiveTransactions(days = 90): Promise<TransactionRow[]> {
  const rows: TransactionRow[] = [];
  const end = new Date();
  // Transaction Search allows at most 31 days per request.
  for (let windowEnd = end.getTime(); windowEnd > end.getTime() - days * DAY; windowEnd -= 31 * DAY) {
    const windowStart = Math.max(windowEnd - 31 * DAY + 1000, end.getTime() - days * DAY);
    let page = 1;
    let totalPages = 1;
    do {
      const body = await paypalGet('/v1/reporting/transactions', {
        start_date: new Date(windowStart).toISOString().replace(/\.\d{3}Z$/, 'Z'),
        end_date: new Date(windowEnd).toISOString().replace(/\.\d{3}Z$/, 'Z'),
        fields: 'all',
        page_size: 500,
        page,
      });
      for (const t of body.transaction_details ?? []) rows.push(normalizeTransaction(t));
      totalPages = body.total_pages ?? 1;
      page++;
    } while (page <= totalPages && page <= 10);
  }
  rows.sort((a, b) => a.datetime.localeCompare(b.datetime));
  return rows;
}

export function normalizeDisputeStatus(s: string): DisputeStatus {
  const known: DisputeStatus[] = ['OPEN', 'WAITING_FOR_SELLER_RESPONSE', 'WAITING_FOR_BUYER_RESPONSE', 'UNDER_REVIEW', 'RESOLVED'];
  return (known as string[]).includes(s) ? (s as DisputeStatus) : 'OTHER';
}

export function normalizeDispute(d: any, now = Date.now()): DisputeRow {
  const due = d.seller_response_due_date ?? d.buyer_response_due_date ?? '';
  const status = normalizeDisputeStatus(d.status);
  return {
    disputeId: d.dispute_id,
    transactionId: d.disputed_transactions?.[0]?.seller_transaction_id ?? d.disputed_transactions?.[0]?.buyer_transaction_id ?? '',
    reason: d.reason ?? 'OTHER',
    status,
    stage: d.dispute_life_cycle_stage ?? '',
    amount: num(d.dispute_amount?.value),
    currency: d.dispute_amount?.currency_code ?? 'USD',
    createdDate: (d.create_time ?? '').slice(0, 10),
    responseDueDate: due ? due.slice(0, 10) : '',
    daysToRespond: due && status !== 'RESOLVED' ? Math.max(0, Math.ceil((Date.parse(due) - now) / DAY)) : 0,
    customerEmail: d.disputed_transactions?.[0]?.buyer?.email ?? '',
    item: d.disputed_transactions?.[0]?.items?.[0]?.item_name ?? '',
    outcome: d.dispute_outcome?.outcome_code,
  };
}

export async function fetchLiveDisputes(): Promise<DisputeRow[]> {
  const body = await paypalGet('/v1/customer/disputes', { page_size: 50 });
  return (body.items ?? []).map((d: any) => normalizeDispute(d));
}

export function normalizeInvoice(inv: any, now = Date.now()): InvoiceRow {
  const detail = inv.detail ?? {};
  const billing = inv.primary_recipients?.[0]?.billing_info ?? {};
  const due = detail.payment_term?.due_date ?? '';
  const status = (inv.status ?? 'OTHER') as InvoiceStatus;
  const unpaid = status === 'SENT' || status === 'UNPAID' || status === 'PARTIALLY_PAID';
  return {
    invoiceId: inv.id,
    invoiceNumber: detail.invoice_number ?? inv.id,
    status,
    recipientEmail: billing.email_address ?? '',
    recipientName: billing.business_name ?? [billing.name?.given_name, billing.name?.surname].filter(Boolean).join(' '),
    amount: num(inv.amount?.value),
    currency: inv.amount?.currency_code ?? detail.currency_code ?? 'USD',
    invoiceDate: detail.invoice_date ?? '',
    dueDate: due,
    daysOverdue: unpaid && due ? Math.max(0, Math.floor((now - Date.parse(due)) / DAY)) : 0,
  };
}

export async function fetchLiveInvoices(): Promise<InvoiceRow[]> {
  const rows: InvoiceRow[] = [];
  for (let page = 1; page <= 5; page++) {
    const body = await paypalGet('/v2/invoicing/invoices', { page, page_size: 100, total_required: true });
    const items = body.items ?? [];
    rows.push(...items.map((i: any) => normalizeInvoice(i)));
    if (items.length < 100 || (body.total_pages && page >= body.total_pages)) break;
  }
  return rows;
}

export async function loadLiveDataset(): Promise<Dataset> {
  const warnings: string[] = [];
  const settle = async <T,>(label: string, p: Promise<T[]>): Promise<T[]> => {
    try {
      return await p;
    } catch (e) {
      warnings.push(`${label}: ${(e as Error).message}`);
      return [];
    }
  };
  const [transactions, disputes, invoices] = await Promise.all([
    settle('Transactions', fetchLiveTransactions()),
    settle('Disputes', fetchLiveDisputes()),
    settle('Invoices', fetchLiveInvoices()),
  ]);
  return {
    mode: 'live',
    merchantName: process.env.MERCHANT_NAME ?? 'Your PayPal sandbox business',
    currency: transactions[0]?.currency ?? 'USD',
    generatedAt: new Date().toISOString(),
    transactions,
    disputes,
    invoices,
    warnings,
  };
}
