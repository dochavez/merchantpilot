/**
 * Converts AG Studio's provider-neutral LLM request (AgLlmRequest) into AI SDK messages + tools.
 * Kept free of network code so it can be unit-tested.
 */
import { jsonSchema, tool, type ModelMessage, type ToolSet } from 'ai';
import type { AgAiConversationItem, AgLlmRequest } from 'ag-studio';

type AssistantPart =
  | { type: 'text'; text: string }
  | { type: 'tool-call'; toolCallId: string; toolName: string; input: unknown };

function safeJson(s: string | undefined): unknown {
  if (!s) return {};
  try {
    return JSON.parse(s);
  } catch {
    return { _raw: s };
  }
}

export interface ConvertedRequest {
  system: string | undefined;
  messages: ModelMessage[];
  tools: ToolSet | undefined;
  toolChoice: 'auto' | 'none' | 'required' | { type: 'tool'; toolName: string } | undefined;
}

export function convertInput(items: AgAiConversationItem[]): { system: string[]; messages: ModelMessage[] } {
  const system: string[] = [];
  const messages: ModelMessage[] = [];
  const toolNames = new Map<string, string>();
  const answered = new Set(items.filter((i) => i.type === 'function_call_output').map((i) => (i as any).callId as string));
  let assistant: AssistantPart[] | null = null;
  let pendingInlineResults: { callId: string; output: string }[] = [];

  const flushAssistant = () => {
    if (assistant && assistant.length) messages.push({ role: 'assistant', content: assistant as any });
    assistant = null;
    if (pendingInlineResults.length) {
      messages.push({
        role: 'tool',
        content: pendingInlineResults.map((r) => ({
          type: 'tool-result' as const,
          toolCallId: r.callId,
          toolName: toolNames.get(r.callId) ?? 'unknown',
          output: { type: 'text' as const, value: r.output },
        })),
      });
      pendingInlineResults = [];
    }
  };

  for (const item of items) {
    switch (item.type) {
      case 'message': {
        if (item.kind === 'input') {
          const text = item.content
            .map((c) => (c.type === 'text' ? c.text : c.type === 'file' ? `[file ${c.filename ?? ''}]` : '[image]'))
            .join('\n');
          if (item.role === 'system') {
            system.push(text);
          } else {
            flushAssistant();
            messages.push({ role: 'user', content: text });
          }
        } else {
          const text = item.content.map((c) => (c.type === 'text' ? c.text : c.refusal)).join('');
          if (text) (assistant ??= []).push({ type: 'text', text });
        }
        break;
      }
      case 'function_call': {
        toolNames.set(item.callId, item.name);
        (assistant ??= []).push({ type: 'tool-call', toolCallId: item.callId, toolName: item.name, input: safeJson(item.arguments) });
        if (item.result !== undefined && !answered.has(item.callId)) {
          pendingInlineResults.push({ callId: item.callId, output: item.result });
        }
        break;
      }
      case 'function_call_output': {
        const a = assistant as AssistantPart[] | null;
        if (a && a.length) {
          messages.push({ role: 'assistant', content: a as any });
          assistant = null;
        }
        const last = messages[messages.length - 1];
        const part = {
          type: 'tool-result' as const,
          toolCallId: item.callId,
          toolName: toolNames.get(item.callId) ?? 'unknown',
          output: { type: 'text' as const, value: item.output },
        };
        if (last && last.role === 'tool') (last.content as any[]).push(part);
        else messages.push({ role: 'tool', content: [part] });
        break;
      }
      case 'reasoning':
        // Provider-specific reasoning is not replayed.
        break;
    }
  }
  flushAssistant();
  return { system, messages };
}

export function convertRequest(req: AgLlmRequest): ConvertedRequest {
  const { system, messages } = convertInput(req.input ?? []);
  const instructions = [req.instructions, ...system].filter(Boolean).join('\n\n') || undefined;

  let tools: ToolSet | undefined;
  for (const t of req.tools ?? []) {
    if (t.kind === 'provided') continue; // provider-hosted tools are not supported through this proxy
    tools ??= {};
    tools[t.name] = tool({
      description: t.description,
      inputSchema: jsonSchema((t.parameters as any) ?? { type: 'object', properties: {} }),
    });
  }

  let toolChoice: ConvertedRequest['toolChoice'];
  if (tools) {
    const tc = req.toolChoice;
    if (tc === 'auto' || tc === 'none' || tc === 'required') toolChoice = tc;
    else if (tc && typeof tc === 'object') toolChoice = { type: 'tool', toolName: tc.name };
  }
  return { system: instructions, messages, tools, toolChoice };
}
