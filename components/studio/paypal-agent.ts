/**
 * MerchantPilot's custom agent, plugged into AG Studio's Agent Framework.
 *
 *  - "MerchantPilot" (primary) talks to the merchant, reads PayPal data through server tools and
 *    proposes actions (refund, reminder, accept dispute) that need human approval.
 *  - When the merchant wants to SEE something, it delegates to Studio's built-in "lead" agent,
 *    which builds/edits dashboard widgets with Studio's own tools.
 *
 * This is the "custom agent talking to Studio's built-in agents" pattern from the AG Studio docs.
 */
import { createAiHarness, directLlmRunner } from 'ag-studio';
import type { AgAiHarness, AgAiTool, AgLlmAdapter, AgStudioApi } from 'ag-studio';

export const ACTIONS_CHANGED_EVENT = 'merchantpilot:actions-changed';

async function callServerTool(name: string, args: unknown, signal?: AbortSignal) {
  const res = await fetch(`/api/agent/tools/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(args ?? {}),
    signal,
  });
  const body = await res.json().catch(() => ({ ok: false, error: `HTTP ${res.status}` }));
  if (!body.ok) throw new Error(body.error ?? `Tool ${name} failed`);
  return body.result;
}

const toolCache = new WeakMap<AgStudioApi, AgAiTool[]>();

/** Build PayPal tools with Studio's own tool factory so they show up in Studio's chat UI. */
export function createPayPalTools(api: AgStudioApi): AgAiTool[] {
  const cached = toolCache.get(api);
  if (cached) return cached;
  const tools = buildPayPalTools(api);
  toolCache.set(api, tools);
  return tools;
}

function buildPayPalTools(api: AgStudioApi): AgAiTool[] {
  const define = (
    name: string,
    description: string,
    params: (s: any) => any,
    opts: { proposes?: boolean } = {},
  ): AgAiTool =>
    api.defineAiTool({
      name,
      description,
      params,
      async execute(args: unknown, ctx: any) {
        try {
          const result = await callServerTool(name, args, ctx.signal);
          if (opts.proposes && typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(ACTIONS_CHANGED_EVENT));
          // Response only (no duplicate `data` payload) to keep LLM tokens low.
          return ctx.success(JSON.stringify(result));
        } catch (e) {
          return ctx.error((e as Error).message);
        }
      },
    } as any);

  const createReport: AgAiTool = api.defineAiTool({
    name: 'create_report',
    description:
      'Prepare a downloadable report for the merchant: "pdf" (executive report with charts and an AI summary), "xlsx" (Excel: summary, transactions, disputes, invoices), "csv" (one table), "powerbi" (live connection for Power BI / Excel), or "quickbooks" / "xero" (bank-statement CSV for the accountant, fees as separate lines). Returns a link; a download card appears in the chat.',
    params: (s: any) =>
      s.object({
        format: s.enum(['pdf', 'xlsx', 'csv', 'powerbi', 'quickbooks', 'xero']),
        periodDays: s.number({ description: 'Look-back window for KPIs (7-90). Default 30.' }).optional(),
        language: s.enum(['en', 'es']).optional(),
        table: s.enum(['Transactions', 'Disputes', 'Invoices', 'Products', 'Countries', 'WeeklyTrend', 'Findings', 'Actions']).optional(),
      }),
    async execute(args: any, ctx: any) {
      const days = Math.min(90, Math.max(7, Math.round(args?.periodDays ?? 30)));
      const lang = args?.language === 'es' ? 'es' : 'en';
      const format = args?.format ?? 'pdf';
      const url =
        format === 'pdf'
          ? `/api/export/pdf?days=${days}&lang=${lang}`
          : format === 'xlsx'
            ? `/api/export/xlsx?days=${days}`
            : format === 'csv'
              ? `/api/export/csv/${args?.table ?? 'Transactions'}?days=${days}`
              : format === 'quickbooks' || format === 'xero'
                ? `/api/export/accounting?format=${format}&days=${Math.max(days, 30)}`
                : '/api/odata';
      return ctx.success(JSON.stringify({ format, url, periodDays: days, note: 'A download card is shown to the merchant under your message. Do not paste the link.' }));
    },
  } as any);

  return [
    createReport,
    define('paypal_overview', 'KPIs for the merchant: sales, orders, refunds and refund rate (vs previous period), fees, net revenue, open disputes, overdue invoices. Call this first to ground any answer.', (s) =>
      s.object({ periodDays: s.number({ description: 'Look-back window in days (1-90). Default 30.' }).optional() }),
    ),
    define('paypal_detect_anomalies', 'Runs deterministic anomaly detection on the PayPal data: refund spikes by product, dispute clusters by reason/country, urgent dispute deadlines and overdue invoices. Returns findings with evidence and suggested actions.', (s) => s.object({})),
    define('paypal_find_transactions', 'Search PayPal transactions (payments, refunds, chargebacks, transfers). Use to get capture/transaction IDs before proposing refunds.', (s) =>
      s.object({
        customerEmail: s.string().optional(),
        item: s.string({ description: 'Product name, partial match' }).optional(),
        type: s.enum(['Payment', 'Refund', 'Chargeback', 'Transfer', 'Payout', 'Fee', 'Other']).optional(),
        status: s.enum(['Completed', 'Pending', 'Denied', 'Reversed', 'Partially refunded']).optional(),
        country: s.string({ description: 'ISO country code, e.g. MX' }).optional(),
        fromDate: s.string({ description: 'YYYY-MM-DD' }).optional(),
        toDate: s.string({ description: 'YYYY-MM-DD' }).optional(),
        limit: s.number().optional(),
      }),
    ),
    define('paypal_list_disputes', 'List PayPal disputes. status="open" returns everything not resolved.', (s) =>
      s.object({
        status: s.string({ description: 'open | WAITING_FOR_SELLER_RESPONSE | UNDER_REVIEW | RESOLVED' }).optional(),
        reason: s.string().optional(),
      }),
    ),
    define('paypal_get_dispute', 'Full context for one dispute: the disputed transaction, customer history and recommended evidence.', (s) => s.object({ disputeId: s.string() })),
    define('paypal_list_invoices', 'List PayPal invoices; overdueOnly=true returns unpaid invoices past their due date.', (s) =>
      s.object({ overdueOnly: s.boolean().optional(), status: s.string().optional() }),
    ),
    define(
      'paypal_forecast',
      'Cash-flow forecast for the next N days (default 60) with an optional what-if scenario: fixRefundSpike, collectOverdue (chase/payment plans), fightDisputes (respond with evidence), salesChangePct. Returns baseline vs scenario totals, the upside and the drivers behind it.',
      (s) =>
        s.object({
          days: s.number({ description: '7-120, default 60' }).optional(),
          fixRefundSpike: s.boolean().optional(),
          collectOverdue: s.boolean().optional(),
          fightDisputes: s.boolean().optional(),
          salesChangePct: s.number({ description: 'e.g. 10 for +10% sales, -20 for -20%' }).optional(),
        }),
    ),
    define(
      'portfolio_overview',
      'Compare ALL the owner\'s businesses: health score with reasons, sales, refund rate, money at stake, forecast upside, top issues, consolidated totals and insights. Use when the owner asks about "my businesses", which one needs attention, or totals across them.',
      (s) => s.object({}),
    ),
    define('paypal_list_actions', 'List actions already proposed/approved/executed in the Action Center, to avoid duplicates and report outcomes.', (s) => s.object({})),
    define(
      'propose_refund',
      'PROPOSE a refund for a captured payment. Does NOT move money: it queues the refund in the Action Center for the merchant to approve. Omit amount for a full refund.',
      (s) =>
        s.object({
          captureId: s.string({ description: 'transactionId of the Payment row' }),
          amount: s.number({ description: 'Partial refund amount; omit for full' }).optional(),
          noteToPayer: s.string({ description: 'Short, polite note the buyer sees' }).optional(),
          rationale: s.string({ description: 'Why you recommend this, citing data' }),
        }),
      { proposes: true },
    ),
    define(
      'propose_invoice_reminder',
      'PROPOSE sending a payment reminder for an unpaid invoice. Queued for merchant approval.',
      (s) =>
        s.object({
          invoiceId: s.string({ description: 'invoiceId or invoiceNumber' }),
          subject: s.string().optional(),
          note: s.string({ description: 'Friendly, specific reminder text' }).optional(),
          rationale: s.string(),
        }),
      { proposes: true },
    ),
    define(
      'propose_accept_dispute',
      'PROPOSE accepting liability for a dispute (buyer gets refunded, case closes). Use only when evidence shows the claim is valid. Queued for approval.',
      (s) => s.object({ disputeId: s.string(), note: s.string({ description: 'Short reason, letters/numbers only' }), rationale: s.string() }),
      { proposes: true },
    ),
    define(
      'propose_dispute_evidence',
      'PROPOSE fighting a dispute: MerchantPilot builds a PDF evidence pack (transaction, customer history, timeline, your statement, evidence checklist) and, once the merchant approves, submits it to PayPal. Use for disputes the merchant should contest.',
      (s) =>
        s.object({
          disputeId: s.string(),
          message: s.string({ description: 'Seller statement for PayPal/the buyer: factual, polite, specific (max ~1500 chars)' }),
          evidence: s.array(s.string(), { description: 'Evidence items to list, e.g. tracking number, delivery scan' }),
          rationale: s.string(),
        }),
      { proposes: true },
    ),
    define(
      'propose_payment_plan',
      'PROPOSE offering an overdue invoice in 2-6 installments: PayPal partial payments get enabled on the invoice and the customer gets a reminder with the pay link. Good for large or very late invoices.',
      (s) => s.object({ invoiceId: s.string(), installments: s.number({ description: '2-6' }), note: s.string({ description: 'Friendly note to the customer' }).optional(), rationale: s.string() }),
      { proposes: true },
    ),
    define(
      'draft_dispute_response',
      'Save a drafted seller response + evidence checklist for a dispute the merchant should FIGHT. The merchant reviews it in the Action Center.',
      (s) => s.object({ disputeId: s.string(), message: s.string(), evidence: s.array(s.string()), rationale: s.string() }),
      { proposes: true },
    ),
  ];
}

export const MERCHANTPILOT_INSTRUCTIONS = `You are MerchantPilot, an AI finance copilot for a small business that sells with PayPal.
You sit inside an AG Studio dashboard. You can read the merchant's PayPal data with tools and you can ask Studio's dashboard agent to build or change charts.

How you work:
1. Never do arithmetic yourself: totals, sums and counts must be copied from tool results (e.g. totalAmount, overdueAmount, byCustomer). Ground every answer in data. Call paypal_overview and/or paypal_detect_anomalies before giving conclusions. Never invent numbers; quote the numbers tools return.
2. Explain the "why" in plain language a busy shop owner understands, in 3-6 short sentences or bullets. Answer in the merchant's language (Spanish if they write in Spanish).
3. When the merchant asks to see, compare or visualise something, FIRST call view_report to see which widgets already exist. Never add a chart that duplicates an existing one (the dashboard already has: KPIs, weekly sales vs refunds, refunds by product, disputes table, invoices table). Instead add the chart that PROVES your finding, e.g. a line chart of daily refunds (transactions.refunds by transactions.date::day) for the last 30 days with transactions.item as legend, or open disputes by country. Prefer the pre-computed fields instead of filters: transactions.sales / refunds / orders / refundCount, disputes.openAmount / isOpen, invoices.overdueAmount / daysOverdue (they are already 0 when not applicable). Avoid filters on status text values. Then delegate to the dashboard agent ("lead") with a precise instruction: data source, exact field ids, chart type, legend, filters, time range and a short descriptive title. Then tell the merchant what was added and why it matters.
4. Money-moving actions are NEVER executed by you. Use propose_refund, propose_invoice_reminder, propose_accept_dispute or draft_dispute_response. They only queue a proposal. Each proposal appears as a card with Approve/Reject buttons right under your message (and in the Action Center). The merchant's approval rules (⚖ Rules in the Action Center) may auto-execute small actions or require two approvers: read the status and note in each tool result and report exactly that ("done automatically under your rules", "needs a second approver", or "approve or reject it on the card"). Never claim something executed unless the result says executed. Do not repeat the card's details at length.
5. Before proposing a refund, look up the payment with paypal_find_transactions to get the exact transactionId. Prefer few, high-value, well-justified proposals (max 5 at once) and give each a data-backed rationale.
6. For disputes: accept only when evidence favours the buyer (e.g. confirmed damaged batch); otherwise call paypal_get_dispute and then propose_dispute_evidence with a factual seller statement and the evidence list (this submits a PDF evidence pack after approval). Mention deadlines. For large or very late invoices, prefer propose_payment_plan (installments) over a plain reminder.
7a. Several businesses: the owner may run more than one business. For questions across businesses (which one is doing worst, totals, comparisons) call portfolio_overview and quote its numbers; mention the Portfolio page for the full comparison.
7. Forecasts / what-if: for questions about future cash, "what happens if…" or "how much is fixing X worth", call paypal_forecast (once without a scenario and once with the relevant scenario flags if useful), quote baseline, scenario and upside, and mention the "Cash-flow forecast" widget on the dashboard where they can toggle the same scenarios.
7b. Reports: when the merchant wants a report, a file, Excel, PDF, CSV or Power BI, call create_report (pdf by default; use language 'es' if they write in Spanish). A download card appears under your message.
8. Be concise. End with 1-3 suggested next steps.
9. Formatting: plain sentences, **bold** labels and simple bullet lists. Do not use markdown headings (lines starting with #) or tables.`;

export const PROMPT_STARTERS = [
  { label: 'What changed this month?', prompt: 'Give me a quick health check of my PayPal business for the last 30 days and tell me the 3 things I should worry about.' },
  { label: 'Why are refunds up?', prompt: 'Why are my refunds up? Find the cause and add a chart to the dashboard that shows it.' },
  { label: 'Chase overdue invoices', prompt: 'Which invoices are overdue? Prepare friendly reminders for them.' },
  { label: 'Disputes that need me', prompt: 'Which disputes need my attention this week, and what should I do with each one?' },
];

const agentToolCache = new WeakMap<AgStudioApi, AgAiTool[]>();

export function buildHarness(api: AgStudioApi, adapter: AgLlmAdapter): AgAiHarness {
  return createAiHarness(api, ({ tools, builtIn }) => {
    const studioAgents = (['lead', 'data', 'page', 'planning', 'widget'] as const).map((id) => directLlmRunner({ ...builtIn[id], adapter }));
    const merchantPilot = directLlmRunner({
      id: 'merchantpilot',
      name: 'MerchantPilot',
      description: 'PayPal finance copilot: explains your money and proposes refunds, reminders and dispute actions for your approval.',
      adapter,
      maxTurns: 30,
      instructions: () => MERCHANTPILOT_INSTRUCTIONS + `\n\nToday is ${new Date().toISOString().slice(0, 10)}.`,
      tools: (ctx) => {
        // Tools are re-resolved often during a run; build them once and reuse (schema() reads live state).
        let cached = agentToolCache.get(ctx.api);
        if (!cached) {
          cached = [
            ...createPayPalTools(ctx.api),
            ctx.studio.viewReport(),
            ctx.studio.viewSchema(),
            ctx.studio.executeQuery(),
            tools.delegateTo(['lead']),
          ];
          agentToolCache.set(ctx.api, cached);
        }
        return cached;
      },
    });
    return {
      agents: [merchantPilot, ...studioAgents],
      primary: 'merchantpilot',
      promptStarters: PROMPT_STARTERS,
    };
  });
}
