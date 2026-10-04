/**
 * Server-side implementations of the PayPal agent's tools. The browser agent (running inside
 * AG Studio's harness) calls POST /api/agent/tools/:name; results are JSON the LLM reads.
 *
 * Read tools return computed facts. Write tools only create PROPOSALS (see lib/actions.ts).
 */
import { z } from 'zod';
import { dataMode } from './config';
import { getDataset } from './data';
import { detectAnomalies, disputeContext, findTransactions, overview } from './analytics';
import { listActions, proposeAction } from './actions';

const str = z.string().trim().min(1);

const schemas = {
  paypal_overview: z.object({ periodDays: z.number().int().min(1).max(90).optional() }),
  paypal_detect_anomalies: z.object({}).passthrough(),
  paypal_find_transactions: z.object({
    customerEmail: z.string().optional(),
    item: z.string().optional(),
    type: z.string().optional(),
    status: z.string().optional(),
    country: z.string().optional(),
    fromDate: z.string().optional(),
    toDate: z.string().optional(),
    limit: z.number().int().min(1).max(100).optional(),
  }),
  paypal_list_disputes: z.object({ status: z.string().optional(), reason: z.string().optional() }),
  paypal_get_dispute: z.object({ disputeId: str }),
  paypal_list_invoices: z.object({ overdueOnly: z.boolean().optional(), status: z.string().optional() }),
  paypal_list_actions: z.object({}).passthrough(),
  propose_refund: z.object({
    captureId: str,
    amount: z.number().positive().optional(),
    noteToPayer: z.string().max(255).optional(),
    rationale: str,
  }),
  propose_invoice_reminder: z.object({
    invoiceId: str,
    subject: z.string().max(200).optional(),
    note: z.string().max(1000).optional(),
    rationale: str,
  }),
  propose_accept_dispute: z.object({ disputeId: str, note: str, rationale: str }),
  draft_dispute_response: z.object({ disputeId: str, message: str, evidence: z.array(z.string()).default([]), rationale: str }),
} as const;

export type AgentToolName = keyof typeof schemas;
export const AGENT_TOOL_NAMES = Object.keys(schemas) as AgentToolName[];

export async function runAgentTool(name: string, rawArgs: unknown): Promise<unknown> {
  if (!(name in schemas)) throw new Error(`Unknown tool ${name}`);
  const parsed = schemas[name as AgentToolName].safeParse(rawArgs ?? {});
  if (!parsed.success) throw new Error('Invalid arguments: ' + parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
  const args = parsed.data as any;
  const ds = await getDataset();

  switch (name as AgentToolName) {
    case 'paypal_overview':
      return { mode: dataMode(), merchant: ds.merchantName, warnings: ds.warnings, ...overview(ds, args.periodDays ?? 30) };
    case 'paypal_detect_anomalies':
      return { findings: detectAnomalies(ds) };
    case 'paypal_find_transactions':
      return findTransactions(ds, args);
    case 'paypal_list_disputes': {
      const rows = ds.disputes.filter(
        (d) =>
          (!args.status || (args.status === 'open' ? d.status !== 'RESOLVED' : d.status === args.status)) &&
          (!args.reason || d.reason === args.reason),
      );
      return {
        total: rows.length,
        amountAtRisk: Math.round(rows.filter((d) => d.status !== 'RESOLVED').reduce((s, d) => s + d.amount, 0) * 100) / 100,
        disputes: rows.slice(0, 50),
      };
    }
    case 'paypal_get_dispute': {
      const ctx = disputeContext(ds, args.disputeId);
      if (!ctx) throw new Error(`Dispute ${args.disputeId} not found`);
      return ctx;
    }
    case 'paypal_list_invoices': {
      const rows = ds.invoices.filter((i) => (!args.overdueOnly || i.daysOverdue > 0) && (!args.status || i.status === args.status));
      const sum = (xs: typeof rows) => Math.round(xs.reduce((s, i) => s + i.amount, 0) * 100) / 100;
      const byCustomer: Record<string, { invoices: number; amount: number }> = {};
      for (const i of rows) {
        const c = (byCustomer[i.recipientName || i.recipientEmail] ??= { invoices: 0, amount: 0 });
        c.invoices++;
        c.amount = Math.round((c.amount + i.amount) * 100) / 100;
      }
      return {
        total: rows.length,
        totalAmount: sum(rows),
        overdueCount: rows.filter((i) => i.daysOverdue > 0).length,
        overdueAmount: sum(rows.filter((i) => i.daysOverdue > 0)),
        byCustomer,
        note: 'Use these totals verbatim; do not add amounts yourself. Skip invoices with lastReminderAt in the last 3 days.',
        invoices: rows,
      };
    }
    case 'paypal_list_actions':
      return { actions: listActions().slice(0, 30) };
    case 'propose_refund':
      return pending(
        await proposeAction({
          kind: 'refund',
          data: { captureId: args.captureId, amount: args.amount, noteToPayer: args.noteToPayer },
          rationale: args.rationale,
        }),
      );
    case 'propose_invoice_reminder':
      return pending(
        await proposeAction({
          kind: 'invoice_reminder',
          data: { invoiceId: args.invoiceId, subject: args.subject, note: args.note },
          rationale: args.rationale,
        }),
      );
    case 'propose_accept_dispute':
      return pending(await proposeAction({ kind: 'accept_dispute', data: { disputeId: args.disputeId, note: args.note }, rationale: args.rationale }));
    case 'draft_dispute_response':
      return pending(
        await proposeAction({
          kind: 'dispute_response_draft',
          data: { disputeId: args.disputeId, message: args.message, evidence: args.evidence },
          rationale: args.rationale,
        }),
      );
  }
}

function pending(a: { id: string; title: string; status: string }) {
  return {
    actionId: a.id,
    title: a.title,
    status: a.status,
    note: 'Queued in the Action Center. Nothing has been executed yet: the merchant must approve it.',
  };
}
