/**
 * Normalized shapes shared by the server (PayPal + demo data) and the client (AG Studio data
 * sources, Action Center). Dates are ISO strings on the wire; the client converts them to Date.
 */

export type TxType = 'Payment' | 'Refund' | 'Chargeback' | 'Payout' | 'Fee' | 'Transfer' | 'Other';
export type TxStatus = 'Completed' | 'Pending' | 'Denied' | 'Reversed' | 'Partially refunded';

export interface TransactionRow {
  transactionId: string;
  /** YYYY-MM-DD (merchant local day) */
  date: string;
  /** Full ISO timestamp */
  datetime: string;
  eventCode: string;
  type: TxType;
  status: TxStatus;
  gross: number;
  fee: number;
  net: number;
  currency: string;
  customerEmail: string;
  customerName: string;
  country: string;
  instrument: string;
  item: string;
  /** For refunds/chargebacks: the payment they reverse */
  relatedTransactionId?: string;
  invoiceId?: string;
}

export type DisputeStatus =
  | 'OPEN'
  | 'WAITING_FOR_SELLER_RESPONSE'
  | 'WAITING_FOR_BUYER_RESPONSE'
  | 'UNDER_REVIEW'
  | 'RESOLVED'
  | 'OTHER';

export interface DisputeRow {
  disputeId: string;
  transactionId: string;
  reason: string;
  status: DisputeStatus;
  stage: string;
  amount: number;
  currency: string;
  createdDate: string;
  responseDueDate: string;
  daysToRespond: number;
  customerEmail: string;
  item: string;
  outcome?: string;
}

export type InvoiceStatus =
  | 'DRAFT'
  | 'SENT'
  | 'SCHEDULED'
  | 'PAID'
  | 'MARKED_AS_PAID'
  | 'CANCELLED'
  | 'REFUNDED'
  | 'PARTIALLY_PAID'
  | 'UNPAID'
  | 'PAYMENT_PENDING'
  | 'OTHER';

export interface InvoiceRow {
  invoiceId: string;
  invoiceNumber: string;
  status: InvoiceStatus;
  recipientEmail: string;
  recipientName: string;
  amount: number;
  currency: string;
  invoiceDate: string;
  dueDate: string;
  daysOverdue: number;
  lastReminderAt?: string;
}

export interface Dataset {
  mode: 'live' | 'demo';
  merchantName: string;
  currency: string;
  generatedAt: string;
  transactions: TransactionRow[];
  disputes: DisputeRow[];
  invoices: InvoiceRow[];
  /** Non-fatal problems while loading live data (e.g. Transaction Search not enabled). */
  warnings: string[];
}

/* ------------------------------------------------------------------ actions (human in the loop) */

export type ActionKind = 'refund' | 'invoice_reminder' | 'accept_dispute' | 'dispute_response_draft';
export type ActionStatus = 'pending' | 'approved' | 'executed' | 'rejected' | 'failed';

export interface RefundPayload {
  captureId: string;
  amount?: number;
  currency?: string;
  noteToPayer?: string;
}
export interface InvoiceReminderPayload {
  invoiceId: string;
  subject?: string;
  note?: string;
}
export interface AcceptDisputePayload {
  disputeId: string;
  note: string;
}
export interface DisputeResponseDraftPayload {
  disputeId: string;
  message: string;
  evidence: string[];
}

export type ActionPayload =
  | { kind: 'refund'; data: RefundPayload }
  | { kind: 'invoice_reminder'; data: InvoiceReminderPayload }
  | { kind: 'accept_dispute'; data: AcceptDisputePayload }
  | { kind: 'dispute_response_draft'; data: DisputeResponseDraftPayload };

export type ProposedAction = ActionPayload & {
  id: string;
  title: string;
  /** Why the agent recommends this – shown to the merchant before approving. */
  rationale: string;
  /** Money impact, negative = money leaves the merchant. */
  impact?: { amount: number; currency: string };
  status: ActionStatus;
  createdAt: string;
  decidedAt?: string;
  result?: string;
  error?: string;
  /** Which system executed it */
  executedVia?: 'paypal-agent-toolkit' | 'demo-store' | 'none';
  /** Approval policy outcome (see lib/policies.ts). */
  requiredApprovals?: number;
  approvals?: { by: string; at: string }[];
  decidedBy?: string;
  autoApproved?: boolean;
  policyNotes?: string[];
};

export interface ApprovalPolicy {
  /** Refunds up to this amount execute without a click (0 = off). Capped at 100. */
  autoApproveRefundsUpTo: number;
  /** Invoice reminders execute without a click. */
  autoApproveInvoiceReminders: boolean;
  /** Money-out actions above this amount need two different approvers (0 = off). */
  dualApprovalAbove: number;
  /** Max money out (refunds + accepted disputes) per UTC day (0 = off). */
  dailyRefundLimit: number;
  updatedAt?: string;
  updatedBy?: string;
}
