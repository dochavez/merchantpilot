/**
 * How MerchantPilot's tool calls look in AG Studio's chat (`aiToolDisplay` property):
 * readable labels for every PayPal tool, and an Approve/Reject card under each proposal.
 */
import type { AgAiToolDisplay } from 'ag-studio-react';
import type { AgAiToolLabelParams } from 'ag-studio';
import ProposalCard from './ProposalCard';

/** Rows whose text starts with this are auto-expanded by StudioDashboard so the card is visible. */
export const PROPOSAL_LABEL_PREFIX = 'Proposal:';

const running = (p: AgAiToolLabelParams) => p.status !== 'done' && p.status !== 'cancelled';

function proposalTitle(p: AgAiToolLabelParams): string | undefined {
  if (!p.result?.success) return undefined;
  try {
    return JSON.parse(p.result.response)?.title;
  } catch {
    return undefined;
  }
}

function proposal(kind: string, preparing: string): AgAiToolDisplay {
  return {
    label: (p) => {
      if (running(p)) return { text: preparing };
      if (!p.result?.success) return { text: `${kind} proposal not created` };
      return { text: `${PROPOSAL_LABEL_PREFIX} ${proposalTitle(p) ?? kind}`, pill: 'Needs approval' };
    },
    detail: ProposalCard,
  };
}

const simple = (doing: string, done: string, pill?: (args: any) => string | undefined): AgAiToolDisplay => ({
  label: (p) => ({ text: running(p) ? doing : done, pill: pill?.(p.args) }),
});

export const TOOL_DISPLAY: Record<string, AgAiToolDisplay> = {
  paypal_overview: simple('Reading PayPal KPIs…', 'Read PayPal KPIs', (a) => (a?.periodDays ? `${a.periodDays} days` : undefined)),
  paypal_detect_anomalies: simple('Scanning for anomalies…', 'Scanned for anomalies'),
  paypal_find_transactions: simple('Searching transactions…', 'Searched transactions', (a) => a?.item ?? a?.customerEmail),
  paypal_list_disputes: simple('Listing disputes…', 'Listed disputes', (a) => a?.status),
  paypal_get_dispute: simple('Reading dispute…', 'Read dispute', (a) => a?.disputeId),
  paypal_list_invoices: simple('Listing invoices…', 'Listed invoices', (a) => (a?.overdueOnly ? 'overdue' : undefined)),
  paypal_list_actions: simple('Checking the Action Center…', 'Checked the Action Center'),
  propose_refund: proposal('Refund', 'Preparing refund proposal…'),
  propose_invoice_reminder: proposal('Reminder', 'Preparing invoice reminder…'),
  propose_accept_dispute: proposal('Accept dispute', 'Preparing dispute proposal…'),
  draft_dispute_response: proposal('Dispute response', 'Drafting dispute response…'),
};
