/**
 * Runs ONE LLM turn for AG Studio and streams it back as AG-UI style events (NDJSON).
 * The browser-side AgLlmAdapter (components/studio/llm-adapter.ts) replays these events to Studio.
 *
 * The API key never reaches the browser: Studio's agents run in the page, but every model call is
 * proxied through here.
 */
import { Output, jsonSchema, streamText, type LanguageModel } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import type { AgAiEvent, AgAiOutputItem, AgLlmRequest, AgLlmResponse } from 'ag-studio';
import { config, llmModelId, llmProvider } from '../config';
import { convertRequest } from './convert';
import { createMockModel } from './mock';

export type WireLine = AgAiEvent | { type: '__complete'; response: AgLlmResponse };

export function resolveModel(): LanguageModel | null {
  const provider = llmProvider();
  const modelId = llmModelId();
  if (provider === 'mock') return createMockModel();
  if (provider === 'openai' && modelId) return createOpenAI({ apiKey: config.llm.openaiKey })(modelId);
  if (provider === 'anthropic' && modelId) return createAnthropic({ apiKey: config.llm.anthropicKey })(modelId);
  return null;
}

const uid = () => Math.random().toString(36).slice(2, 10);

/** Streams one turn. `model` is injectable for tests (MockLanguageModel). */
export async function* runTurn(req: AgLlmRequest, model: LanguageModel, signal?: AbortSignal): AsyncGenerator<WireLine> {
  const turn = uid();
  const conv = convertRequest(req);
  const output: AgAiOutputItem[] = [];
  // Text deltas are coalesced (~80 chars / 120 ms) so the browser re-renders the chat far less often.
  const texts = new Map<string, { id: string; text: string; pending: string; last: number }>();
  const FLUSH_CHARS = 80;
  const FLUSH_MS = 120;
  const reasoning = new Map<string, { id: string; text: string }>();
  const toolStarted = new Set<string>();
  let usage: AgLlmResponse['usage'];
  let error: AgLlmResponse['error'];

  const result = streamText({
    model,
    system: conv.system,
    messages: conv.messages,
    tools: conv.tools,
    toolChoice: conv.toolChoice as any,
    abortSignal: signal,
    maxRetries: 2,
    maxOutputTokens: 2000,
    ...(req.responseFormat?.type === 'json'
      ? { output: Output.object({ schema: jsonSchema(req.responseFormat.schema as any), name: req.responseFormat.name, description: req.responseFormat.description }) }
      : {}),
  });

  try {
    for await (const part of result.fullStream) {
      switch (part.type) {
        case 'text-start': {
          const id = `${turn}-msg-${part.id}`;
          texts.set(part.id, { id, text: '', pending: '', last: Date.now() });
          yield { type: 'TEXT_MESSAGE_START', messageId: id, role: 'assistant' };
          break;
        }
        case 'text-delta': {
          let t = texts.get(part.id);
          if (!t) {
            t = { id: `${turn}-msg-${part.id}`, text: '', pending: '', last: Date.now() };
            texts.set(part.id, t);
            yield { type: 'TEXT_MESSAGE_START', messageId: t.id, role: 'assistant' };
          }
          t.text += part.text;
          t.pending += part.text;
          if (t.pending.length >= FLUSH_CHARS || Date.now() - t.last >= FLUSH_MS) {
            yield { type: 'TEXT_MESSAGE_CONTENT', messageId: t.id, delta: t.pending };
            t.pending = '';
            t.last = Date.now();
          }
          break;
        }
        case 'text-end': {
          const t = texts.get(part.id);
          if (t) {
            if (t.pending) yield { type: 'TEXT_MESSAGE_CONTENT', messageId: t.id, delta: t.pending };
            yield { type: 'TEXT_MESSAGE_END', messageId: t.id };
            output.push({ id: t.id, kind: 'output', type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'text', text: t.text, annotations: [] }] });
            texts.delete(part.id);
          }
          break;
        }
        case 'reasoning-start': {
          const id = `${turn}-rsn-${part.id}`;
          reasoning.set(part.id, { id, text: '' });
          yield { type: 'REASONING_MESSAGE_START', messageId: id, role: 'reasoning' };
          break;
        }
        case 'reasoning-delta': {
          const r = reasoning.get(part.id);
          if (r && part.text) {
            r.text += part.text;
            yield { type: 'REASONING_MESSAGE_CONTENT', messageId: r.id, delta: part.text };
          }
          break;
        }
        case 'reasoning-end': {
          const r = reasoning.get(part.id);
          if (r) {
            yield { type: 'REASONING_MESSAGE_END', messageId: r.id };
            if (r.text) output.push({ id: r.id, kind: 'output', type: 'reasoning', summary: [{ type: 'summary', text: r.text }] });
            reasoning.delete(part.id);
          }
          break;
        }
        case 'tool-input-start': {
          toolStarted.add(part.id);
          yield { type: 'TOOL_CALL_START', toolCallId: part.id, toolCallName: part.toolName };
          break;
        }
        case 'tool-input-delta': {
          yield { type: 'TOOL_CALL_ARGS', toolCallId: part.id, delta: part.delta };
          break;
        }
        case 'tool-input-end':
          break;
        case 'tool-call': {
          const args = JSON.stringify((part as any).input ?? {});
          if (!toolStarted.has(part.toolCallId)) {
            yield { type: 'TOOL_CALL_START', toolCallId: part.toolCallId, toolCallName: part.toolName };
            yield { type: 'TOOL_CALL_ARGS', toolCallId: part.toolCallId, delta: args };
          }
          yield { type: 'TOOL_CALL_END', toolCallId: part.toolCallId };
          output.push({ id: `${turn}-fc-${part.toolCallId}`, kind: 'output', type: 'function_call', callId: part.toolCallId, name: part.toolName, arguments: args, status: 'completed' });
          break;
        }
        case 'finish': {
          const u = part.totalUsage;
          usage = { inputTokens: u?.inputTokens ?? 0, outputTokens: u?.outputTokens ?? 0, totalTokens: u?.totalTokens };
          break;
        }
        case 'error': {
          const e = part.error as any;
          error = { code: 'provider_error', message: e?.message ?? String(e) };
          break;
        }
        default:
          break;
      }
    }
  } catch (e) {
    error = { code: signal?.aborted ? 'cancelled' : 'provider_error', message: (e as Error).message };
  }

  // Close any text that never received text-end.
  for (const t of texts.values()) {
    if (t.pending) yield { type: 'TEXT_MESSAGE_CONTENT', messageId: t.id, delta: t.pending };
    yield { type: 'TEXT_MESSAGE_END', messageId: t.id };
    output.push({ id: t.id, kind: 'output', type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'text', text: t.text, annotations: [] }] });
  }

  if (error) yield { type: 'RUN_ERROR', message: error.message, code: error.code };

  yield {
    type: '__complete',
    response: {
      id: `resp_${turn}`,
      createdAt: Date.now(),
      status: error ? (signal?.aborted ? 'cancelled' : 'failed') : 'completed',
      error,
      output,
      usage,
      model: llmModelId(),
    },
  };
}

/** A friendly single-message turn used when no LLM key is configured. */
export async function* noModelTurn(): AsyncGenerator<WireLine> {
  const id = `nokey-${uid()}`;
  const text =
    'MerchantPilot has no AI model configured yet. Add `OPENAI_API_KEY` (or `ANTHROPIC_API_KEY`) to `.env.local` and restart `npm run dev`. To try the agent without a key, set `LLM_PROVIDER=mock`. The dashboard, data and Action Center keep working without it.';
  yield { type: 'TEXT_MESSAGE_START', messageId: id, role: 'assistant' };
  yield { type: 'TEXT_MESSAGE_CONTENT', messageId: id, delta: text };
  yield { type: 'TEXT_MESSAGE_END', messageId: id };
  yield {
    type: '__complete',
    response: {
      id: `resp_${id}`,
      createdAt: Date.now(),
      status: 'completed',
      output: [{ id, kind: 'output', type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'text', text, annotations: [] }] }],
    },
  };
}
