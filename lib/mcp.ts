/**
 * MerchantPilot as an MCP server (Model Context Protocol, Streamable HTTP, stateless JSON responses).
 * Any MCP client – Claude Desktop, Claude Code, Cursor, the MCP Inspector – can ask about the PayPal
 * business and queue actions. Money-moving actions are still only PROPOSED: each result carries a
 * signed approval link and lands in the Action Center under the merchant's rules.
 */
import { zodToJsonSchema } from 'zod-to-json-schema';
import { listActions } from './actions';
import { AGENT_TOOL_NAMES, AGENT_TOOL_SCHEMAS, runAgentTool } from './agent-tools';
import { signApproval } from './signing';

const DESCRIPTIONS: Record<string, string> = {
  paypal_overview: 'KPIs for the merchant (sales, orders, refunds, refund rate vs previous period, fees, net revenue, open disputes, overdue invoices). Call first.',
  paypal_detect_anomalies: 'Deterministic anomaly detection: refund spikes by product, dispute clusters, urgent dispute deadlines, overdue invoices – with evidence and suggested actions.',
  paypal_find_transactions: 'Search PayPal transactions (payments, refunds, chargebacks) by customer, item, type, status, country or date.',
  paypal_list_disputes: 'List PayPal disputes; status="open" returns everything not resolved, with total amount at risk.',
  paypal_get_dispute: 'Full context for one dispute: transaction, customer history and recommended evidence.',
  paypal_list_invoices: 'List invoices; overdueOnly=true for unpaid invoices past due, with totals by customer.',
  paypal_list_actions: 'Actions already proposed / approved / executed (audit trail).',
  paypal_forecast: 'Cash-flow forecast for the next N days with an optional what-if scenario (fixRefundSpike, collectOverdue, fightDisputes, salesChangePct). Returns baseline vs scenario, upside per lever and drivers.',
  propose_refund: 'PROPOSE a refund (does not move money). Returns a signed approval link; executes only after the merchant approves.',
  propose_invoice_reminder: 'PROPOSE a payment reminder for an unpaid invoice. Needs merchant approval unless their rules auto-approve reminders.',
  propose_accept_dispute: 'PROPOSE accepting a dispute (buyer refunded, case closed). Needs approval.',
  propose_dispute_evidence: 'PROPOSE fighting a dispute with a PDF evidence pack submitted to PayPal after approval.',
  propose_payment_plan: 'PROPOSE offering an overdue invoice in 2-6 installments (PayPal partial payments + reminder with pay link).',
  draft_dispute_response: 'Save a drafted seller response for the merchant to review.',
};

interface Tool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

function schemaOf(name: string) {
  const s = zodToJsonSchema((AGENT_TOOL_SCHEMAS as any)[name], { target: 'jsonSchema7', $refStrategy: 'none' }) as Record<string, unknown>;
  delete s.$schema;
  if (s.type !== 'object') return { type: 'object', properties: {} };
  return s;
}

export function mcpTools(): Tool[] {
  return [
    ...AGENT_TOOL_NAMES.map((name) => ({ name, description: DESCRIPTIONS[name] ?? name, inputSchema: schemaOf(name) })),
    {
      name: 'get_report_links',
      description: 'Download links for the executive PDF, Excel workbook, QuickBooks/Xero CSVs and the Power BI / Excel OData feed.',
      inputSchema: { type: 'object', properties: { days: { type: 'number', description: '7-90, default 30' } } },
    },
    {
      name: 'list_pending_approvals',
      description: 'Actions waiting for the merchant, each with signed Approve / Reject links (valid 48 h).',
      inputSchema: { type: 'object', properties: {} },
    },
  ];
}

async function callTool(name: string, args: any, baseUrl: string): Promise<unknown> {
  const sign = (id: string, d: 'approve' | 'reject') => `${baseUrl}/approve?t=${signApproval({ a: id, d, u: 'Owner (MCP link)' })}`;
  if (name === 'get_report_links') {
    const days = Math.min(90, Math.max(7, Number(args?.days) || 30));
    return {
      pdf: `${baseUrl}/api/export/pdf?days=${days}`,
      excel: `${baseUrl}/api/export/xlsx?days=${days}`,
      quickbooks: `${baseUrl}/api/export/accounting?format=quickbooks&days=${Math.max(days, 30)}`,
      xero: `${baseUrl}/api/export/accounting?format=xero&days=${Math.max(days, 30)}`,
      powerBiFeed: `${baseUrl}/api/odata`,
      note: 'If EXPORT_API_KEY is set on the server, append ?key=… or use Basic auth.',
    };
  }
  if (name === 'list_pending_approvals') {
    const pending = (await listActions()).filter((a) => a.status === 'pending');
    return {
      pending: pending.map((a) => ({ id: a.id, title: a.title, rationale: a.rationale, requiredApprovals: a.requiredApprovals ?? 1, approveUrl: sign(a.id, 'approve'), rejectUrl: sign(a.id, 'reject') })),
      dashboard: `${baseUrl}/dashboard`,
    };
  }
  const result: any = await runAgentTool(name, args ?? {});
  if (result?.actionId && result.status === 'pending') {
    return { ...result, approveUrl: sign(result.actionId, 'approve'), rejectUrl: sign(result.actionId, 'reject'), howToApprove: 'Give the merchant the approveUrl (opens a confirmation page) or ask them to approve in the MerchantPilot Action Center.' };
  }
  if (result?.evidencePack) result.evidencePack = baseUrl + result.evidencePack;
  return result;
}

type Rpc = { jsonrpc: '2.0'; id?: string | number | null; method: string; params?: any };

export const MCP_PROTOCOL_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];

export async function handleRpc(msg: Rpc, baseUrl: string): Promise<object | null> {
  const isNotification = msg.id === undefined || msg.id === null;
  const ok = (result: unknown) => ({ jsonrpc: '2.0', id: msg.id, result });
  const err = (code: number, message: string) => ({ jsonrpc: '2.0', id: msg.id ?? null, error: { code, message } });
  if (!msg || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') return err(-32600, 'Invalid Request');
  if (msg.method.startsWith('notifications/')) return null;
  try {
    switch (msg.method) {
      case 'initialize': {
        const requested = msg.params?.protocolVersion;
        return ok({
          protocolVersion: MCP_PROTOCOL_VERSIONS.includes(requested) ? requested : MCP_PROTOCOL_VERSIONS[0],
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: 'merchantpilot', title: 'MerchantPilot – PayPal finance copilot', version: '1.0.0' },
          instructions:
            'Tools over the merchant\'s PayPal data. Start with paypal_overview / paypal_detect_anomalies. Never invent numbers: quote tool results. propose_* tools only queue actions; share the returned approveUrl with the merchant.',
        });
      }
      case 'ping':
        return ok({});
      case 'tools/list':
        return ok({ tools: mcpTools() });
      case 'tools/call': {
        const name = msg.params?.name;
        if (!mcpTools().some((t) => t.name === name)) return err(-32602, `Unknown tool: ${name}`);
        try {
          const result = await callTool(name, msg.params?.arguments ?? {}, baseUrl);
          return ok({ content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: result, isError: false });
        } catch (e) {
          return ok({ content: [{ type: 'text', text: (e as Error).message }], isError: true });
        }
      }
      default:
        return isNotification ? null : err(-32601, `Method not found: ${msg.method}`);
    }
  } catch (e) {
    return err(-32603, (e as Error).message);
  }
}
