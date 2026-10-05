/**
 * How MerchantPilot's tool calls look in AG Studio's chat (`aiToolDisplay` property):
 * readable labels for every PayPal tool, and an Approve/Reject card under each proposal.
 */
import type { AgAiToolDisplay } from 'ag-studio-react';
import type { AgAiToolLabelParams } from 'ag-studio';
import ProposalCard from './ProposalCard';
import ReportCard from './ReportCard';

/** Rows whose text starts with one of these are auto-expanded by StudioDashboard so the card is visible. */
export const PROPOSAL_LABEL_PREFIX = 'Proposal:';
export const REPORT_LABEL_PREFIX = 'Report ready:';
export const AUTO_OPEN_PREFIXES = [PROPOSAL_LABEL_PREFIX, REPORT_LABEL_PREFIX];

const running = (p: AgAiToolLabelParams) => p.status !== 'done' && p.status !== 'cancelled';

function proposalInfo(p: AgAiToolLabelParams): { title?: string; status?: string; requiredApprovals?: number } {
  if (!p.result?.success) return {};
  try {
    return JSON.parse(p.result.response) ?? {};
  } catch {
    return {};
  }
}

function proposal(kind: string, preparing: string): AgAiToolDisplay {
  return {
    label: (p) => {
      if (running(p)) return { text: preparing };
      if (!p.result?.success) return { text: `${kind} proposal not created` };
      const info = proposalInfo(p);
      const pill = info.status === 'executed' ? 'Done by your rules' : info.status === 'failed' ? 'Failed' : (info.requiredApprovals ?? 1) > 1 ? 'Needs 2 approvals' : 'Needs approval';
      return { text: `${PROPOSAL_LABEL_PREFIX} ${info.title ?? kind}`, pill };
    },
    detail: ProposalCard,
  };
}

const simple = (doing: string, done: string, pill?: (args: any) => string | undefined): AgAiToolDisplay => ({
  label: (p) => ({ text: running(p) ? doing : done, pill: pill?.(p.args) }),
});

const REPORT_NAMES: Record<string, string> = { pdf: 'PDF executive report', xlsx: 'Excel workbook', csv: 'CSV table', powerbi: 'Power BI / Excel live feed', quickbooks: 'QuickBooks import', xero: 'Xero import' };

export const TOOL_DISPLAY: Record<string, AgAiToolDisplay> = {
  create_report: {
    label: (p) =>
      running(p) ? { text: 'Preparing report…' } : { text: `${REPORT_LABEL_PREFIX} ${REPORT_NAMES[String((p.args as any)?.format ?? 'pdf')] ?? 'report'}`, pill: 'Download' },
    detail: ReportCard,
  },
  paypal_overview: simple('Reading PayPal KPIs…', 'Read PayPal KPIs', (a) => (a?.periodDays ? `${a.periodDays} days` : undefined)),
  paypal_detect_anomalies: simple('Scanning for anomalies…', 'Scanned for anomalies'),
  paypal_find_transactions: simple('Searching transactions…', 'Searched transactions', (a) => a?.item ?? a?.customerEmail),
  paypal_list_disputes: simple('Listing disputes…', 'Listed disputes', (a) => a?.status),
  paypal_get_dispute: simple('Reading dispute…', 'Read dispute', (a) => a?.disputeId),
  paypal_list_invoices: simple('Listing invoices…', 'Listed invoices', (a) => (a?.overdueOnly ? 'overdue' : undefined)),
  paypal_list_actions: simple('Checking the Action Center…', 'Checked the Action Center'),
  propose_refund: proposal('Refund', 'Preparing refund proposal…'),
  propose_dispute_evidence: proposal('Dispute evidence', 'Building the evidence pack…'),
  propose_payment_plan: proposal('Payment plan', 'Preparing payment plan…'),
  paypal_forecast: simple('Forecasting cash flow…', 'Forecasted cash flow', (a) => `${a?.days ?? 60} days`),
  propose_invoice_reminder: proposal('Reminder', 'Preparing invoice reminder…'),
  propose_accept_dispute: proposal('Accept dispute', 'Preparing dispute proposal…'),
  draft_dispute_response: proposal('Dispute response', 'Drafting dispute response…'),
};
