/**
 * Server-side bridge to the official PayPal Agent Toolkit (@paypal/agent-toolkit).
 *
 * The toolkit exposes PayPal operations as AI tools. We call their `execute` functions directly
 * after the merchant approves an action, so every money-moving step runs through PayPal's own
 * agent tooling, never through free-form LLM output.
 */
import { PayPalAgentToolkit } from '@paypal/agent-toolkit/ai-sdk';
import { config } from '../config';

const KEY = Symbol.for('merchantpilot.paypalToolkit');
type G = typeof globalThis & { [KEY]?: PayPalAgentToolkit };

/** Only the capabilities MerchantPilot needs (least privilege). */
const ACTIONS = {
  invoices: { list: true, get: true, sendReminder: true, send: true, create: true },
  orders: { get: true },
  disputes: { list: true, get: true, create: true }, // `create` enables accept_dispute_claim in the toolkit
  transactions: { list: true },
  payments: { createRefund: true, getRefunds: true },
  insights: { get: true },
};

export function getToolkit(): PayPalAgentToolkit {
  const g = globalThis as G;
  if (!g[KEY]) {
    const { clientId, clientSecret } = config.paypal;
    if (!clientId || !clientSecret) throw new Error('PayPal credentials are not configured');
    g[KEY] = new PayPalAgentToolkit({
      clientId,
      clientSecret,
      configuration: { actions: ACTIONS, context: { sandbox: true } },
    });
  }
  return g[KEY]!;
}

export async function runToolkitTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  const tools = getToolkit().getTools() as Record<string, { execute?: (a: any, o: any) => Promise<unknown> }>;
  const tool = tools[name];
  if (!tool?.execute) throw new Error(`PayPal Agent Toolkit tool "${name}" is not enabled`);
  const result = await tool.execute(args, { toolCallId: `mp-${Date.now()}`, messages: [] });
  // The toolkit returns error objects rather than throwing in some cases.
  if (result && typeof result === 'object' && 'error' in (result as any) && (result as any).error) {
    const err = (result as any).error;
    throw new Error(typeof err === 'string' ? err : JSON.stringify(err));
  }
  if (typeof result === 'string' && /^(error|failed)/i.test(result)) throw new Error(result);
  return result;
}
