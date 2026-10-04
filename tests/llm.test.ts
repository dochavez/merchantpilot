import { describe, expect, it } from 'vitest';
import { MockLanguageModelV4, convertArrayToReadableStream } from 'ai/test';
import type { AgLlmRequest } from 'ag-studio';
import { convertInput, convertRequest } from '@/lib/llm/convert';
import { runTurn, type WireLine } from '@/lib/llm/run';

const usage = {
  inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 5, text: 5, reasoning: 0 },
};

function req(partial: Partial<AgLlmRequest> = {}): AgLlmRequest {
  return {
    input: [{ id: 'u1', kind: 'input', type: 'message', role: 'user', status: 'completed', content: [{ type: 'text', text: 'Why are refunds up?' }] }],
    instructions: 'You are a test agent',
    responseFormat: { type: 'text' },
    tools: [{ name: 'paypal_overview', description: 'overview', parameters: { type: 'object', properties: { periodDays: { type: 'number' } } } }],
    toolChoice: 'auto',
    ...partial,
  };
}

async function collect(gen: AsyncGenerator<WireLine>) {
  const out: WireLine[] = [];
  for await (const x of gen) out.push(x);
  return out;
}

describe('convert', () => {
  it('maps Studio conversation items to AI SDK messages', () => {
    const { messages, system } = convertInput([
      { id: 's', kind: 'input', type: 'message', role: 'system', status: 'completed', content: [{ type: 'text', text: 'sys' }] },
      { id: 'u', kind: 'input', type: 'message', role: 'user', status: 'completed', content: [{ type: 'text', text: 'hi' }] },
      { id: 'a', kind: 'output', type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'text', text: 'checking', annotations: [] }] },
      { id: 'f', kind: 'output', type: 'function_call', callId: 'c1', name: 'paypal_overview', arguments: '{"periodDays":7}' },
      { type: 'function_call_output', callId: 'c1', output: '{"grossSales":1}', status: 'completed' },
    ]);
    expect(system).toEqual(['sys']);
    expect(messages.map((m) => m.role)).toEqual(['user', 'assistant', 'tool']);
    const asst = messages[1].content as any[];
    expect(asst[1]).toMatchObject({ type: 'tool-call', toolCallId: 'c1', toolName: 'paypal_overview', input: { periodDays: 7 } });
    expect((messages[2].content as any[])[0]).toMatchObject({ toolCallId: 'c1', toolName: 'paypal_overview' });
  });

  it('builds tools and tool choice', () => {
    const c = convertRequest(req({ toolChoice: { name: 'paypal_overview' } }));
    expect(Object.keys(c.tools!)).toEqual(['paypal_overview']);
    expect(c.toolChoice).toEqual({ type: 'tool', toolName: 'paypal_overview' });
    expect(c.system).toContain('test agent');
  });
});

describe('runTurn', () => {
  it('streams text as AG-UI events and completes', async () => {
    const model = new MockLanguageModelV4({
      doStream: {
        stream: convertArrayToReadableStream([
          { type: 'text-start', id: 't1' },
          { type: 'text-delta', id: 't1', delta: 'Refunds ' },
          { type: 'text-delta', id: 't1', delta: 'spiked.' },
          { type: 'text-end', id: 't1' },
          { type: 'finish', usage, finishReason: { unified: 'stop', raw: 'stop' } },
        ]),
      },
    });
    const lines = await collect(runTurn(req(), model as any));
    // Small deltas are coalesced into one UI update.
    expect(lines.map((l) => l.type)).toEqual(['TEXT_MESSAGE_START', 'TEXT_MESSAGE_CONTENT', 'TEXT_MESSAGE_END', '__complete']);
    expect((lines[1] as any).delta).toBe('Refunds spiked.');
    const done = lines.at(-1) as any;
    expect(done.response.status).toBe('completed');
    expect(done.response.output[0].content[0].text).toBe('Refunds spiked.');
    expect(done.response.usage).toMatchObject({ inputTokens: 10, outputTokens: 5 });
  });

  it('chunks long streams instead of one event per token', async () => {
    const words = Array.from({ length: 60 }, (_, i) => `word${i} `);
    const model = new MockLanguageModelV4({
      doStream: {
        stream: convertArrayToReadableStream([
          { type: 'text-start', id: 't1' },
          ...words.map((w) => ({ type: 'text-delta' as const, id: 't1', delta: w })),
          { type: 'text-end', id: 't1' },
          { type: 'finish', usage, finishReason: { unified: 'stop', raw: 'stop' } },
        ]),
      },
    });
    const lines = await collect(runTurn(req(), model as any));
    const contents = lines.filter((l) => l.type === 'TEXT_MESSAGE_CONTENT') as any[];
    expect(contents.length).toBeGreaterThan(1);
    expect(contents.length).toBeLessThan(words.length / 3);
    expect(contents.map((c) => c.delta).join('')).toBe(words.join(''));
  });

  it('streams tool calls without executing them', async () => {
    const model = new MockLanguageModelV4({
      doStream: {
        stream: convertArrayToReadableStream([
          { type: 'tool-call', toolCallId: 'call_1', toolName: 'paypal_overview', input: '{"periodDays":30}' },
          { type: 'finish', usage, finishReason: { unified: 'tool-calls', raw: 'tool_calls' } },
        ]),
      },
    });
    const lines = await collect(runTurn(req(), model as any));
    expect(lines.map((l) => l.type)).toEqual(['TOOL_CALL_START', 'TOOL_CALL_ARGS', 'TOOL_CALL_END', '__complete']);
    const fc = (lines.at(-1) as any).response.output[0];
    expect(fc).toMatchObject({ type: 'function_call', callId: 'call_1', name: 'paypal_overview' });
    expect(JSON.parse(fc.arguments)).toEqual({ periodDays: 30 });
  });

  it('reports provider errors as a failed response', async () => {
    const model = new MockLanguageModelV4({
      doStream: async () => {
        throw new Error('boom');
      },
    });
    const lines = await collect(runTurn(req(), model as any));
    const done = lines.at(-1) as any;
    expect(done.response.status).toBe('failed');
    expect(done.response.error.message).toMatch(/boom/);
  });
});
