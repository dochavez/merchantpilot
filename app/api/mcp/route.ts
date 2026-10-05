/**
 * MCP endpoint (Streamable HTTP transport, stateless, JSON responses).
 *   URL: https://<app>/api/mcp     Auth: Authorization: Bearer $MCP_API_KEY
 * Live mode requires MCP_API_KEY; demo mode is open so judges can try it.
 */
import { baseUrl } from '@/lib/base-url';
import { dataMode } from '@/lib/config';
import { handleRpc } from '@/lib/mcp';

export const dynamic = 'force-dynamic';

function unauthorized(msg: string) {
  return Response.json({ jsonrpc: '2.0', id: null, error: { code: -32001, message: msg } }, { status: 401, headers: { 'WWW-Authenticate': 'Bearer realm="merchantpilot-mcp"' } });
}

export async function POST(req: Request) {
  const key = process.env.MCP_API_KEY;
  if (key) {
    if (req.headers.get('authorization') !== `Bearer ${key}`) return unauthorized('Invalid or missing bearer token');
  } else if (dataMode() === 'live') {
    return unauthorized('Set MCP_API_KEY on the server to enable MCP access to live PayPal data');
  }
  let body: any;
  try {
    body = await req.json();
  } catch {
    return Response.json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }, { status: 400 });
  }
  const base = baseUrl(req);
  if (Array.isArray(body)) {
    const out = (await Promise.all(body.map((m) => handleRpc(m, base)))).filter(Boolean);
    return out.length ? Response.json(out) : new Response(null, { status: 202 });
  }
  const out = await handleRpc(body, base);
  return out ? Response.json(out, { headers: { 'Cache-Control': 'no-store' } }) : new Response(null, { status: 202 });
}

/** No server-initiated stream: GET returns 405 as allowed by the Streamable HTTP spec. */
export async function GET() {
  return new Response('MerchantPilot MCP endpoint: POST JSON-RPC here (Streamable HTTP, JSON responses).', { status: 405, headers: { Allow: 'POST' } });
}
