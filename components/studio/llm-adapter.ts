/**
 * Browser-side AgLlmAdapter: AG Studio's agents run in the page and call this for every model turn.
 * It forwards the turn to our server (/api/llm), which holds the API key and streams back AG-UI
 * events as NDJSON. We replay those to Studio and resolve `complete` with the final response.
 */
import type { AgAiEvent, AgLlmAdapter, AgLlmExecuteTurnOptions, AgLlmRequest, AgLlmResponse, AgLlmResponseHandler } from 'ag-studio';

type Line = AgAiEvent | { type: '__complete'; response: AgLlmResponse };

/** Minimal async queue: producer pushes events, Studio iterates them. */
class Channel<T> {
  private buf: T[] = [];
  private waiters: ((r: IteratorResult<T>) => void)[] = [];
  private closed = false;
  push(v: T) {
    const w = this.waiters.shift();
    if (w) w({ value: v, done: false });
    else this.buf.push(v);
  }
  close() {
    this.closed = true;
    for (const w of this.waiters.splice(0)) w({ value: undefined as never, done: true });
  }
  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: () => {
        if (this.buf.length) return Promise.resolve({ value: this.buf.shift()!, done: false });
        if (this.closed) return Promise.resolve({ value: undefined as never, done: true });
        return new Promise((resolve) => this.waiters.push(resolve));
      },
    };
  }
}

function failed(message: string, code = 'adapter_error'): AgLlmResponse {
  return { id: `err_${Date.now()}`, createdAt: Date.now(), status: 'failed', error: { code, message }, output: [] };
}

export function createServerLlmAdapter(endpoint = '/api/llm'): AgLlmAdapter {
  return {
    executeTurn(request: AgLlmRequest, options?: AgLlmExecuteTurnOptions): AgLlmResponseHandler {
      const channel = new Channel<AgAiEvent>();
      const complete = (async (): Promise<AgLlmResponse> => {
        let final: AgLlmResponse | undefined;
        try {
          const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(request),
            signal: options?.signal,
          });
          if (!res.ok || !res.body) {
            const msg = (await res.json().catch(() => null))?.error ?? `AI request failed (${res.status})`;
            channel.push({ type: 'RUN_ERROR', message: msg, code: String(res.status) });
            return failed(msg, String(res.status));
          }
          const reader = res.body.getReader();
          const dec = new TextDecoder();
          let buffer = '';
          for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += dec.decode(value, { stream: true });
            let nl: number;
            while ((nl = buffer.indexOf('\n')) >= 0) {
              const raw = buffer.slice(0, nl).trim();
              buffer = buffer.slice(nl + 1);
              if (!raw) continue;
              const line = JSON.parse(raw) as Line;
              if (line.type === '__complete') final = line.response;
              else channel.push(line);
            }
          }
          return final ?? failed('AI stream ended without a response');
        } catch (e) {
          const aborted = options?.signal?.aborted;
          return { ...failed((e as Error).message, aborted ? 'cancelled' : 'network_error'), status: aborted ? 'cancelled' : 'failed' };
        } finally {
          channel.close();
        }
      })();
      return { stream: channel, complete };
    },
  };
}
