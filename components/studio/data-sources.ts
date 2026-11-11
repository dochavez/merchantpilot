/**
 * Maps the normalized PayPal dataset to AG Studio data sources (tables + typed fields), so both the
 * merchant and Studio's agents can build widgets on top of it.
 */
import type { Dataset } from '@/lib/types';

const toDate = (s: string) => (s ? new Date(s + (s.length === 10 ? 'T00:00:00' : '')) : null);
// Circled digits keep a natural order when charts sort categories alphabetically.
const WEEKDAYS = ['⑦ Sun', '① Mon', '② Tue', '③ Wed', '④ Thu', '⑤ Fri', '⑥ Sat'];
const REASONS: Record<string, string> = {
  MERCHANDISE_OR_SERVICE_NOT_RECEIVED: 'Not received',
  MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED: 'Not as described',
  UNAUTHORISED: 'Unauthorised',
  CREDIT_NOT_PROCESSED: 'Credit not processed',
  DUPLICATE_TRANSACTION: 'Duplicate',
  INCORRECT_AMOUNT: 'Incorrect amount',
  PAYMENT_BY_OTHER_MEANS: 'Paid by other means',
  CANCELED_RECURRING_BILLING: 'Cancelled subscription',
  PROBLEM_WITH_REMITTANCE: 'Remittance problem',
  OTHER: 'Other',
};
const reasonLabel = (r: string) => REASONS[r] ?? r.replaceAll('_', ' ').toLowerCase();
function agingBucket(i: { status: string; daysOverdue: number }) {
  if (i.status === 'PAID' || i.status === 'MARKED_AS_PAID') return '① Paid';
  if (i.daysOverdue <= 0) return '② Not due yet';
  if (i.daysOverdue <= 15) return '③ 1-15 days late';
  if (i.daysOverdue <= 30) return '④ 16-30 days late';
  if (i.daysOverdue <= 60) return '⑤ 31-60 days late';
  return '⑥ 60+ days late';
}

export function toStudioData(ds: Dataset) {
  // First payment of each customer = "New", later ones = "Returning".
  const seen = new Set<string>();
  const customerType = new Map<string, string>();
  for (const t of [...ds.transactions].sort((a, b) => a.datetime.localeCompare(b.datetime))) {
    if (t.type !== 'Payment') continue;
    const key = t.customerEmail || t.customerName;
    customerType.set(t.transactionId, key && seen.has(key) ? 'Returning' : 'New');
    if (key) seen.add(key);
  }
  const txCountry = new Map(ds.transactions.map((t) => [t.transactionId, t.country]));
  return {
    sources: [
      {
        id: 'transactions',
        name: 'PayPal transactions',
        description: 'Every PayPal transaction for the last 90 days: payments (sales), refunds, chargebacks, bank transfers. Amounts in account currency; refunds/chargebacks are negative.',
        data: ds.transactions.map((t) => ({
          transactionId: t.transactionId,
          date: toDate(t.date),
          type: t.type,
          status: t.status,
          gross: t.gross,
          fee: t.fee,
          net: t.net,
          currency: t.currency,
          customer: t.customerName,
          customerEmail: t.customerEmail,
          country: t.country,
          instrument: t.instrument,
          item: t.item,
          eventCode: t.eventCode,
          sales: t.type === 'Payment' ? t.gross : 0,
          refunds: t.type === 'Refund' ? -t.gross : 0,
          chargebacks: t.type === 'Chargeback' ? -t.gross : 0,
          orders: t.type === 'Payment' ? 1 : 0,
          refundCount: t.type === 'Refund' ? 1 : 0,
          saleType: t.type !== 'Payment' ? t.type : t.subscriptionId ? 'Subscription' : t.invoiceId ? 'Invoice' : 'One-off',
          weekday: WEEKDAYS[new Date(t.datetime).getDay()],
          customerType: customerType.get(t.transactionId) ?? '',
          subscriptionId: t.subscriptionId ?? '',
          recurringSales: t.type === 'Payment' && t.subscriptionId ? t.gross : 0,
        })),
        fields: [
          { id: 'transactionId', name: 'Transaction ID', format: 'textFormat', context: { drill: 'transaction' } },
          { id: 'date', name: 'Date', format: 'dateFormat' },
          { id: 'type', name: 'Type', format: 'textFormat', description: 'Payment, Refund, Chargeback, Transfer, Payout, Fee' },
          { id: 'status', name: 'Status', format: 'textFormat' },
          { id: 'gross', name: 'Gross amount', format: 'currencyFormat' },
          { id: 'fee', name: 'PayPal fee', format: 'currencyFormat' },
          { id: 'net', name: 'Net amount', format: 'currencyFormat' },
          { id: 'currency', name: 'Currency', format: 'textFormat' },
          { id: 'customer', name: 'Customer', format: 'textFormat', context: { drill: 'customer' } },
          { id: 'customerEmail', name: 'Customer email', format: 'textFormat', context: { drill: 'customer' } },
          { id: 'country', name: 'Country', format: 'textFormat' },
          { id: 'instrument', name: 'Payment method', format: 'textFormat' },
          { id: 'item', name: 'Product', format: 'textFormat' },
          { id: 'eventCode', name: 'PayPal event code', format: 'textFormat' },
          { id: 'sales', name: 'Sales', format: 'currencyFormat', description: 'Gross amount of Payment rows only (0 for other types)' },
          { id: 'refunds', name: 'Refunds', format: 'currencyFormat', description: 'Refunded amount as a positive number (Refund rows only)' },
          { id: 'chargebacks', name: 'Chargebacks', format: 'currencyFormat', description: 'Chargeback amount as a positive number' },
          { id: 'orders', name: 'Orders', format: 'integerFormat', description: '1 for each Payment row; sum = number of orders' },
          { id: 'refundCount', name: 'Refund count', format: 'integerFormat', description: '1 for each Refund row' },
          { id: 'saleType', name: 'Sale type', format: 'textFormat', description: 'Subscription (recurring), Invoice or One-off for sales; Refund, Chargeback, Transfer… for other rows' },
          { id: 'weekday', name: 'Weekday', format: 'textFormat', description: 'Day of the week (① Mon … ⑦ Sun, numbered so it sorts Monday first)' },
          { id: 'customerType', name: 'New vs returning', format: 'textFormat', description: 'New = first purchase of that customer, Returning = repeat purchase (Payment rows)' },
          { id: 'subscriptionId', name: 'Subscription ID', format: 'textFormat', context: { drill: 'subscription' } },
          { id: 'recurringSales', name: 'Recurring sales', format: 'currencyFormat', description: 'Gross amount of subscription payments only' },
        ],
      },
      {
        id: 'disputes',
        name: 'PayPal disputes',
        description: 'Buyer disputes and chargebacks with reason, status, amount at risk and days left to respond.',
        data: ds.disputes.map((d) => ({
          disputeId: d.disputeId,
          transactionId: d.transactionId,
          reason: d.reason,
          status: d.status,
          stage: d.stage,
          amount: d.amount,
          createdDate: toDate(d.createdDate),
          responseDueDate: toDate(d.responseDueDate),
          daysToRespond: d.daysToRespond,
          item: d.item,
          customerEmail: d.customerEmail,
          outcome: d.outcome ?? '',
          openAmount: d.status === 'RESOLVED' ? 0 : d.amount,
          isOpen: d.status === 'RESOLVED' ? 'Resolved' : 'Open',
          reasonLabel: reasonLabel(d.reason),
          country: txCountry.get(d.transactionId) ?? '',
          openDaysToRespond: d.status === 'RESOLVED' ? null : d.daysToRespond,
          disputes: 1,
        })),
        fields: [
          { id: 'disputeId', name: 'Dispute ID', format: 'textFormat', context: { drill: 'dispute' } },
          { id: 'transactionId', name: 'Transaction ID', format: 'textFormat', context: { drill: 'transaction' } },
          { id: 'reason', name: 'Reason', format: 'textFormat' },
          { id: 'status', name: 'Status', format: 'textFormat' },
          { id: 'stage', name: 'Stage', format: 'textFormat' },
          { id: 'amount', name: 'Amount at risk', format: 'currencyFormat' },
          { id: 'createdDate', name: 'Opened', format: 'dateFormat' },
          { id: 'responseDueDate', name: 'Respond by', format: 'dateFormat' },
          { id: 'daysToRespond', name: 'Days to respond', format: 'integerFormat' },
          { id: 'item', name: 'Product', format: 'textFormat' },
          { id: 'customerEmail', name: 'Customer email', format: 'textFormat', context: { drill: 'customer' } },
          { id: 'outcome', name: 'Outcome', format: 'textFormat' },
          { id: 'openAmount', name: 'Open amount at risk', format: 'currencyFormat', description: 'Amount for unresolved disputes, 0 when resolved' },
          { id: 'isOpen', name: 'Open / Resolved', format: 'textFormat' },
          { id: 'reasonLabel', name: 'Reason (short)', format: 'textFormat' },
          { id: 'country', name: 'Buyer country', format: 'textFormat' },
          { id: 'openDaysToRespond', name: 'Days left (open)', format: 'integerFormat', description: 'Days left to respond, only for open disputes (min = most urgent)' },
          { id: 'disputes', name: 'Disputes', format: 'integerFormat', description: '1 per dispute; sum = number of disputes' },
        ],
      },
      {
        id: 'invoices',
        name: 'PayPal invoices',
        description: 'Invoices sent with PayPal Invoicing (mostly wholesale customers), with status and days overdue.',
        data: ds.invoices.map((i) => ({
          invoiceId: i.invoiceId,
          invoiceNumber: i.invoiceNumber,
          status: i.status,
          customer: i.recipientName,
          customerEmail: i.recipientEmail,
          amount: i.amount,
          invoiceDate: toDate(i.invoiceDate),
          dueDate: toDate(i.dueDate),
          daysOverdue: i.daysOverdue,
          reminded: i.lastReminderAt ? 'Yes' : 'No',
          overdueAmount: i.daysOverdue > 0 ? i.amount : 0,
          items: i.itemsSummary ?? '',
          aging: agingBucket(i),
          overdueDays: i.daysOverdue > 0 ? i.daysOverdue : null,
          invoices: 1,
          itemCount: (i.items ?? []).filter((l) => l.unitPrice > 0 && !/^Shipping/.test(l.name)).reduce((a, l) => a + l.quantity, 0),
        })),
        fields: [
          { id: 'invoiceId', name: 'Invoice ID', format: 'textFormat', context: { drill: 'invoice' } },
          { id: 'invoiceNumber', name: 'Invoice #', format: 'textFormat', context: { drill: 'invoice' } },
          { id: 'status', name: 'Status', format: 'textFormat' },
          { id: 'customer', name: 'Customer', format: 'textFormat', context: { drill: 'customer' } },
          { id: 'customerEmail', name: 'Customer email', format: 'textFormat', context: { drill: 'customer' } },
          { id: 'amount', name: 'Amount', format: 'currencyFormat' },
          { id: 'invoiceDate', name: 'Invoice date', format: 'dateFormat' },
          { id: 'dueDate', name: 'Due date', format: 'dateFormat' },
          { id: 'daysOverdue', name: 'Days overdue', format: 'integerFormat' },
          { id: 'reminded', name: 'Reminder sent', format: 'textFormat' },
          { id: 'overdueAmount', name: 'Overdue amount', format: 'currencyFormat', description: 'Invoice amount when overdue, else 0' },
          { id: 'items', name: 'Products', format: 'textFormat', description: 'Products and quantities on the invoice' },
          { id: 'itemCount', name: 'Units', format: 'integerFormat', description: 'Total product units on the invoice' },
          { id: 'aging', name: 'Aging', format: 'textFormat', description: 'Paid, Not due yet, 1-15, 16-30, 31-60 or 60+ days late (numbered so it sorts in order)' },
          { id: 'overdueDays', name: 'Days late (overdue only)', format: 'integerFormat', description: 'Days overdue, blank when not overdue (avg = average lateness)' },
          { id: 'invoices', name: 'Invoices', format: 'integerFormat', description: '1 per invoice; sum = number of invoices' },
        ],
      },
      {
        id: 'invoiceLines',
        name: 'PayPal invoice products',
        description: 'One row per product line on each PayPal invoice (wholesale orders): product, quantity, line total and the invoice status.',
        data: ds.invoices.flatMap((i) =>
          (i.items ?? [])
            .filter((l) => !/^(Shipping|Wholesale discount|Discount)/.test(l.name))
            .map((l) => ({ invoiceNumber: i.invoiceNumber, customer: i.recipientName, product: l.name, quantity: l.quantity, total: l.total, status: i.status, aging: agingBucket(i), invoiceDate: toDate(i.invoiceDate) })),
        ),
        fields: [
          { id: 'invoiceNumber', name: 'Invoice #', format: 'textFormat', context: { drill: 'invoice' } },
          { id: 'customer', name: 'Customer', format: 'textFormat', context: { drill: 'customer' } },
          { id: 'product', name: 'Product', format: 'textFormat' },
          { id: 'quantity', name: 'Quantity', format: 'integerFormat' },
          { id: 'total', name: 'Line total', format: 'currencyFormat' },
          { id: 'status', name: 'Invoice status', format: 'textFormat' },
          { id: 'aging', name: 'Aging', format: 'textFormat' },
          { id: 'invoiceDate', name: 'Invoice date', format: 'dateFormat' },
        ],
      },
      {
        id: 'subscriptions',
        name: 'PayPal subscriptions',
        description:
          'Recurring billing (PayPal Subscriptions): one row per subscriber with plan, status (ACTIVE, SUSPENDED after failed payments, CANCELLED), price per cycle and monthly value (MRR contribution).',
        data: (ds.subscriptions ?? []).map((x) => ({
          subscriptionId: x.subscriptionId,
          plan: x.planName,
          status: x.status,
          subscriber: x.subscriberName,
          subscriberEmail: x.subscriberEmail,
          country: x.country ?? '',
          price: x.amount,
          billing: `${x.intervalCount > 1 ? x.intervalCount + ' ' : ''}${x.interval.toLowerCase()}${x.intervalCount > 1 ? 's' : ''}`,
          mrr: x.monthlyValue,
          startDate: toDate(x.startDate),
          nextBillingDate: x.nextBillingDate ? toDate(x.nextBillingDate) : null,
          lastPaymentDate: x.lastPaymentDate ? toDate(x.lastPaymentDate) : null,
          cancelledDate: x.cancelledDate ? toDate(x.cancelledDate) : null,
          failedPayments: x.failedPayments,
          subscribers: 1,
          activeSubscribers: x.status === 'ACTIVE' ? 1 : 0,
          churned: x.status === 'CANCELLED' || x.status === 'EXPIRED' ? 1 : 0,
          mrrAtRisk: x.status === 'SUSPENDED' ? Math.round(((x.amount * 30.4375) / ((x.interval === 'WEEK' ? 7 : x.interval === 'YEAR' ? 365.25 : x.interval === 'DAY' ? 1 : 30.4375) * (x.intervalCount || 1))) * 100) / 100 : 0,
        })),
        fields: [
          { id: 'subscriptionId', name: 'Subscription ID', format: 'textFormat', context: { drill: 'subscription' } },
          { id: 'plan', name: 'Plan', format: 'textFormat' },
          { id: 'status', name: 'Status', format: 'textFormat', description: 'ACTIVE, SUSPENDED (failed payments), CANCELLED, EXPIRED, APPROVAL_PENDING' },
          { id: 'subscriber', name: 'Subscriber', format: 'textFormat', context: { drill: 'customer' } },
          { id: 'subscriberEmail', name: 'Subscriber email', format: 'textFormat', context: { drill: 'customer' } },
          { id: 'country', name: 'Country', format: 'textFormat' },
          { id: 'price', name: 'Price per cycle', format: 'currencyFormat' },
          { id: 'billing', name: 'Billed every', format: 'textFormat' },
          { id: 'mrr', name: 'MRR', format: 'currencyFormat', description: 'Monthly recurring revenue from this subscriber (0 unless ACTIVE). Sum = total MRR' },
          { id: 'startDate', name: 'Started', format: 'dateFormat' },
          { id: 'nextBillingDate', name: 'Next billing', format: 'dateFormat' },
          { id: 'lastPaymentDate', name: 'Last payment', format: 'dateFormat' },
          { id: 'cancelledDate', name: 'Cancelled', format: 'dateFormat' },
          { id: 'failedPayments', name: 'Failed payments', format: 'integerFormat' },
          { id: 'subscribers', name: 'Subscribers', format: 'integerFormat', description: '1 per row; sum = number of subscriptions' },
          { id: 'activeSubscribers', name: 'Active subscribers', format: 'integerFormat', description: '1 when ACTIVE' },
          { id: 'churned', name: 'Churned', format: 'integerFormat', description: '1 when CANCELLED or EXPIRED' },
          { id: 'mrrAtRisk', name: 'MRR at risk', format: 'currencyFormat', description: 'Monthly value of SUSPENDED subscriptions' },
        ],
      },
    ],
  };
}
