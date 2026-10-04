/**
 * Scripted model for end-to-end tests WITHOUT an API key (LLM_PROVIDER=mock).
 * It exercises the full loop: Studio harness -> /api/llm -> tool call -> browser executes the tool
 * -> /api/agent/tools -> result -> final answer. Never used when a real key is configured.
 */
import type { LanguageModel } from 'ai';

type Part = Record<string, any>;

function streamOf(parts: Part[]) {
  const delay = Number(process.env.MOCK_STREAM_MS || 0);
  if (!delay) {
    return new ReadableStream({
      start(c) {
        for (const p of parts) c.enqueue(p);
        c.close();
      },
    });
  }
  // Optional token-like streaming (MOCK_STREAM_MS) to reproduce how real models stream text.
  const expanded: Part[] = parts.flatMap((p) =>
    p.type === 'text-delta' ? (String(p.delta).match(/\S+\s*|\s+/g) ?? []).map((d) => ({ ...p, delta: d })) : [p],
  );
  let i = 0;
  return new ReadableStream({
    async pull(c) {
      if (i >= expanded.length) return c.close();
      await new Promise((r) => setTimeout(r, delay));
      c.enqueue(expanded[i++]);
    },
  });
}

const usage = {
  inputTokens: { total: 0, noCache: 0, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 0, text: 0, reasoning: 0 },
};

function text(t: string): Part[] {
  return [
    { type: 'text-start', id: 't' },
    { type: 'text-delta', id: 't', delta: t },
    { type: 'text-end', id: 't' },
    { type: 'finish', usage, finishReason: { unified: 'stop', raw: 'stop' } },
  ];
}

function call(toolName: string, input: unknown): Part[] {
  return [
    { type: 'tool-call', toolCallId: 'mock_' + Math.random().toString(36).slice(2, 8), toolName, input: JSON.stringify(input) },
    { type: 'finish', usage, finishReason: { unified: 'tool-calls', raw: 'tool_calls' } },
  ];
}

function resultValue(part: any): any {
  const o = part?.output;
  const raw = o?.type === 'json' ? o.value : o?.value;
  const parse = (v: any) => {
    try {
      return typeof v === 'string' ? JSON.parse(v) : v;
    } catch {
      return v;
    }
  };
  const v = parse(raw);
  // Studio wraps tool results as {success, response: "<json string>", data?}
  return v && typeof v === 'object' && 'response' in v ? parse(v.response) : v;
}

export function createMockModel(): LanguageModel {
  return {
    specificationVersion: 'v4',
    provider: 'mock',
    modelId: 'scripted-mock',
    supportedUrls: {},
    async doGenerate() {
      throw new Error('mock model supports streaming only');
    },
    async doStream(options: any) {
      const prompt: any[] = options.prompt ?? [];
      const toolNames = new Set((options.tools ?? []).map((t: any) => t.name));
      const lastUser = [...prompt].reverse().find((m) => m.role === 'user');
      const userText: string = (lastUser?.content ?? []).map((c: any) => c.text ?? '').join(' ').toLowerCase();
      const last = prompt[prompt.length - 1];

      let parts: Part[];
      if (last?.role === 'tool') {
        const r = last.content[0];
        const value = resultValue(r);
        if (process.env.MOCK_DEBUG) console.log('[mock] tool result', JSON.stringify(r).slice(0, 600));
        if (process.env.MOCK_FINAL_TEXT && userText.includes('health')) {
          // Lets tests replay a real model's final answer (e.g. rich markdown) through the UI.
          parts = text(process.env.MOCK_FINAL_TEXT);
        } else if (r.toolName === 'paypal_list_invoices' && toolNames.has('propose_invoice_reminder')) {
          const inv = value?.result?.invoices?.[0] ?? value?.invoices?.[0];
          parts = inv
            ? call('propose_invoice_reminder', { invoiceId: inv.invoiceId, note: 'Friendly reminder from Altura Coffee Supply.', rationale: `${inv.invoiceNumber} is ${inv.daysOverdue} days overdue.` })
            : text('No overdue invoices.');
        } else if (r.toolName === 'propose_invoice_reminder') {
          parts = text('I prepared the reminder. Nothing has been sent yet: approve or reject it on the card above (or in the Action Center).');
        } else if (last.content.length > 1) {
          parts = text('Health check: ' + last.content.map((c: any) => c.toolName).join(' + ') + ' done.');
        } else if (r.toolName === 'paypal_detect_anomalies') {
          const f = value?.findings ?? value?.result?.findings ?? [];
          parts = text('Top findings: ' + f.slice(0, 3).map((x: any) => x.title).join('; ') + '.');
        } else {
          parts = text('Done.');
        }
      } else if (!toolNames.has('paypal_detect_anomalies')) {
        parts = text('(mock) Studio agent reply.');
      } else if (userText.includes('health')) {
        // Two tool calls in ONE turn (parallel), like real models do for a health check.
        parts = [
          { type: 'tool-call', toolCallId: 'mock_a' + Date.now(), toolName: 'paypal_overview', input: JSON.stringify({ periodDays: 30 }) },
          { type: 'tool-call', toolCallId: 'mock_b' + Date.now(), toolName: 'paypal_detect_anomalies', input: '{}' },
          { type: 'finish', usage, finishReason: { unified: 'tool-calls', raw: 'tool_calls' } },
        ];
      } else if (userText.includes('invoice')) {
        parts = call('paypal_list_invoices', { overdueOnly: true });
      } else {
        parts = call('paypal_detect_anomalies', {});
      }
      return { stream: streamOf(parts) };
    },
  } as unknown as LanguageModel;
}
