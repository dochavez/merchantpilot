import type { AgLlmRequest } from 'ag-studio';
import { checkLlmLimit, clientIp } from '@/lib/ratelimit';
import { noModelTurn, resolveModel, runTurn, type WireLine } from '@/lib/llm/run';

export const maxDuration = 120;

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
  try {
    body = (await req.json()) as AgLlmRequest;
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!Array.isArray(body?.input)) return Response.json({ error: 'input[] is required' }, { status: 400 });

  const model = resolveModel();
  return ndjson(model ? runTurn(body, model, req.signal) : noModelTurn());
}
