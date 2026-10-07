/**
 * Server-side implementations of the PayPal agent's tools. The browser agent (running inside
 * AG Studio's harness) calls POST /api/agent/tools/:name; results are JSON the LLM reads.
 *
 * Read tools return computed facts. Write tools only create PROPOSALS (see lib/actions.ts).
 */
import { z } from 'zod';
import { dataMode } from './config';
import { getDataset } from './data';
import { detectAnomalies, disputeContext, findTransactions, overview, subscriptionMetrics } from './analytics';
import { forecastCashflow } from './forecast';
import { listActions, proposeAction } from './actions';
import type { ProposedAction } from './types';

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
  portfolio_overview: z.object({}).passthrough(),
  paypal_subscriptions: z.object({
    status: z.string().optional(),
    plan: z.string().optional(),
    subscriptionId: z.string().optional(),
    periodDays: z.number().int().min(7).max(90).optional(),
    limit: z.number().int().min(1).max(100).optional(),
  }),
  paypal_forecast: z.object({
    days: z.number().int().min(7).max(120).optional(),
    fixRefundSpike: z.boolean().optional(),
    collectOverdue: z.boolean().optional(),
    fightDisputes: z.boolean().optional(),
    salesChangePct: z.number().min(-90).max(200).optional(),
  }),
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
  propose_dispute_evidence: z.object({ disputeId: str, message: str, evidence: z.array(z.string()).default([]), rationale: str }),
  propose_payment_plan: z.object({ invoiceId: str, installments: z.number().int().min(2).max(6), note: z.string().max(1000).optional(), rationale: str }),
  draft_dispute_response: z.object({ disputeId: str, message: str, evidence: z.array(z.string()).default([]), rationale: str }),
} as const;

export type AgentToolName = keyof typeof schemas;
export const AGENT_TOOL_SCHEMAS = schemas;
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
    case 'propose_dispute_evidence': {
      const a = await proposeAction({ kind: 'submit_dispute_evidence', data: { disputeId: args.disputeId, message: args.message, evidence: args.evidence }, rationale: args.rationale });
      return { ...pending(a), evidencePack: `/api/disputes/${args.disputeId}/evidence-pack?action=${a.id}` };
    }
    case 'propose_payment_plan':
      return pending(await proposeAction({ kind: 'payment_plan', data: { invoiceId: args.invoiceId, installments: args.installments, note: args.note }, rationale: args.rationale }));
    case 'portfolio_overview': {
      const { buildPortfolio } = await import('./portfolio');
      const p = await buildPortfolio();
      return {
        totals: p.totals,
        businesses: p.businesses.map((b) => ({ id: b.id, name: b.name, mode: b.mode, error: b.error, health: b.health, sales30: b.kpis?.grossSales, salesChangePct: b.kpis?.salesChangePct, refundRatePct: b.kpis?.refundRatePct, netRevenue30: b.kpis?.netRevenue, moneyAtStake: b.moneyAtStake, forecastUpside30: b.forecast30?.upside, topFindings: b.topFindings, pendingApprovals: b.pendingApprovals })),
        insights: p.insights,
        note: 'Numbers per business, last 30 days. Quote them verbatim. Other tools work on the business currently selected in the dashboard; the owner switches business with the selector at the top or opens the Portfolio page.',
      };
    }
    case 'paypal_forecast': {
      const f = forecastCashflow(ds, { days: args.days ?? 60, scenario: args });
      // Weekly checkpoints only (keeps tokens low); the chart on the Forecast page shows every day.
      const weekly = f.points.filter((_, i) => (i + 1) % 7 === 0 || i === f.points.length - 1);
      return {
        currency: f.currency,
        days: f.days,
        baseline: f.baseline,
        withScenario: f.withScenario,
        upside: f.upside,
        levers: f.levers,
        scenario: f.scenario,
        weeklyCumulativeNet: weekly.map((p) => ({ date: p.date, baseline: p.baseline, scenario: p.scenario, low: p.low, high: p.high })),
        drivers: f.drivers,
        note: 'Quote these numbers verbatim. "upside" is how much more cash the scenario brings vs doing nothing. The merchant can toggle the same scenarios in the "Cash-flow forecast" widget on the dashboard.',
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
        invoices: rows.map(({ items, ...rest }) => ({ ...rest, products: rest.itemsSummary ?? (items ?? []).map((l) => `${l.name} x${l.quantity}`).join(', ') })),
      };
    }
    case 'paypal_subscriptions': {
      let subs = ds.subscriptions ?? [];
      if (args.subscriptionId && !subs.some((x) => x.subscriptionId === args.subscriptionId) && dataMode() === 'live') {
        // Not seen yet (no webhook / payment): read it from PayPal and remember it.
        const { fetchLiveSubscriptions, trackSubscriptionId } = await import('./paypal/live-data');
        await trackSubscriptionId(args.subscriptionId);
        const { invalidateDataset } = await import('./data');
        invalidateDataset();
        subs = (await getDataset()).subscriptions ?? (await fetchLiveSubscriptions([]));
      }
      const lc = (x?: string) => x?.toLowerCase() ?? '';
      const rows = subs.filter(
        (x) =>
          (!args.subscriptionId || x.subscriptionId === args.subscriptionId) &&
          (!args.status || lc(x.status) === lc(args.status)) &&
          (!args.plan || lc(x.planName).includes(lc(args.plan))),
      );
      const m = subscriptionMetrics({ ...ds, subscriptions: subs }, args.periodDays ?? 30);
      return {
        ...m,
        note: m.hasSubscriptions
          ? 'MRR = monthly recurring revenue from ACTIVE subscriptions; mrrAtRisk = SUSPENDED (failed payments). Quote these numbers verbatim.'
          : 'No PayPal subscriptions found for this business. In live mode they appear after the first recurring payment or a BILLING.SUBSCRIPTION webhook.',
        matching: rows.length,
        subscriptions: rows.slice(0, args.limit ?? 25),
      };
    }
    case 'paypal_list_actions':
      return { actions: (await listActions()).slice(0, 30) };
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

function pending(a: ProposedAction) {
  const base = { actionId: a.id, title: a.title, status: a.status, policy: a.policyNotes ?? [] };
  if (a.status === 'executed')
    return { ...base, note: `Executed automatically because the merchant's approval rules allow it (${a.decidedBy}). Tell the merchant it is done and that it is logged in the audit trail.` };
  if (a.status === 'failed') return { ...base, note: `Auto-approved by the merchant's rules but PayPal returned an error: ${a.error}` };
  return {
    ...base,
    requiredApprovals: a.requiredApprovals ?? 1,
    note:
      (a.requiredApprovals ?? 1) > 1
        ? 'Queued. Nothing has been executed yet. This one needs TWO different approvers under the merchant\'s rules.'
        : 'Queued in the Action Center. Nothing has been executed yet: the merchant must approve it.',
  };
}
