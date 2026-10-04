import type { AgLlmRequest } from 'ag-studio';
import { checkLlmLimit, clientIp } from '@/lib/ratelimit';
import { noModelTurn, resolveModel, runTurn, type WireLine } from '@/lib/llm/run';

export const maxDuration = 120;

/** Wraps a turn so every turn writes ONE summary line to the server log (no secrets, truncated). */
async function* logged(gen: AsyncGenerator<WireLine>, req: AgLlmRequest, bytes: number): AsyncGenerator<WireLine> {
  const t0 = Date.now();
  for await (const line of gen) {
    if (line.type === '__complete') {
      const r = line.response;
      const calls = (r.output ?? []).filter((o: any) => o.type === 'function_call').map((o: any) => `${o.name}(${String(o.arguments).slice(0, 160)})`);
      const text = (r.output ?? []).filter((o: any) => o.type === 'message').map((o: any) => o.content?.map((c: any) => c.text ?? '').join('')).join(' ');
      console.log(
        '[llm]',
        JSON.stringify({
          agent: (req.instructions ?? '').slice(0, 40).replace(/\s+/g, ' '),
          inItems: req.input?.length ?? 0,
          reqKB: Math.round(bytes / 1024),
          tools: req.tools?.length ?? 0,
          status: r.status,
          ms: Date.now() - t0,
          usage: r.usage,
          calls,
          textChars: text.length,
          textHead: text.slice(0, 200),
          error: r.error?.message,
        }),
      );
    }
    yield line;
  }
}

function ndjson(gen: AsyncGenerator<WireLine>): Response {
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async pull(controller) {
      try {
        const { value, done } = await gen.next();
        if (done) controller.close();
        else controller.enqueue(enc.encode(JSON.stringify(value) + '\n'));
      } catch (e) {
        controller.enqueue(enc.encode(JSON.stringify({ type: 'RUN_ERROR', message: (e as Error).message }) + '\n'));
        controller.close();
      }
    },
    cancel() {
      void gen.return(undefined);
    },
  });
  return new Response(stream, {
    headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' },
  });
}

export async function POST(req: Request) {
  const limit = checkLlmLimit(clientIp(req));
  if (!limit.ok) return Response.json({ error: limit.reason }, { status: 429 });

  let body: AgLlmRequest;
  let bytes = 0;
  try {
    const raw = await req.text();
    bytes = raw.length;
    body = JSON.parse(raw) as AgLlmRequest;
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!Array.isArray(body?.input)) return Response.json({ error: 'input[] is required' }, { status: 400 });

  const model = resolveModel();
  return ndjson(logged(model ? runTurn(body, model, req.signal) : noModelTurn(), body, bytes));
}
