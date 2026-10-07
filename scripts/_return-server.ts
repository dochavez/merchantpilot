/**
 * Tiny local page PayPal redirects the buyer to after approving or cancelling
 * (return_url / cancel_url = http://localhost:4599/...). Lets scripts know immediately
 * whether the buyer paid / subscribed or walked away.
 */
import { createServer } from 'node:http';

export const RETURN_PORT = 4599;
export const RETURN_URL = `http://localhost:${RETURN_PORT}/return`;
export const CANCEL_URL = `http://localhost:${RETURN_PORT}/cancel`;
export type Outcome = 'returned' | 'cancelled';

export function listenForReturn(okText = 'MerchantPilot is finishing the operation now…'): Promise<{ wait: Promise<Outcome>; close: () => void }> {
  return new Promise((resolve) => {
    let done: (o: Outcome) => void = () => {};
    const wait = new Promise<Outcome>((r) => (done = r));
    const page = (title: string, body: string, color: string) =>
      `<!doctype html><meta charset="utf-8"><title>${title}</title><body style="font-family:system-ui;display:grid;place-items:center;height:90vh;background:#f8fafc"><div style="text-align:center"><h1 style="color:${color}">${title}</h1><p>${body}</p><p style="color:#64748b">You can close this tab and go back to VS Code.</p></div>`;
    const server = createServer((req, res) => {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      if (req.url?.startsWith('/cancel')) {
        res.end(page('Cancelled', 'The buyer walked away – nothing was charged.', '#b45309'));
        done('cancelled');
      } else if (req.url?.startsWith('/return')) {
        res.end(page('Approved', okText, '#047857'));
        done('returned');
      } else res.end('');
    });
    server.on('error', () => resolve({ wait: new Promise(() => {}), close: () => {} })); // port busy → polling only
    server.listen(RETURN_PORT, '127.0.0.1', () => resolve({ wait, close: () => server.close() }));
  });
}
