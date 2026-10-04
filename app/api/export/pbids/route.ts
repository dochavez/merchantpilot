/**
 * GET /api/export/pbids → a Power BI data-source file. Double-clicking it opens Power BI Desktop
 * already connected to MerchantPilot's OData feed (Power BI then asks for credentials if needed).
 */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const proto = req.headers.get('x-forwarded-proto') ?? u.protocol.replace(':', '');
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? u.host;
  const body = {
    version: '0.1',
    connections: [{ details: { protocol: 'odata', address: { url: `${proto}://${host}/api/odata` } }, options: {}, mode: 'Import' }],
  };
  return new Response(JSON.stringify(body, null, 2), {
    headers: { 'Content-Type': 'application/json', 'Content-Disposition': 'attachment; filename="MerchantPilot.pbids"', 'Cache-Control': 'no-store' },
  });
}
