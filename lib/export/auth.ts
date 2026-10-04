/**
 * Optional protection for data exports and the Power BI / Excel OData feed.
 * If EXPORT_API_KEY is set, requests must send it as `?key=...`, a Bearer token, or the password of
 * HTTP Basic auth (what Power BI / Excel ask for: any user name + the key as password).
 * Downloads started from the MerchantPilot page itself (same-origin browser requests) don't need it:
 * the key protects the external feed, the dashboard page is the app's own UI.
 * Without EXPORT_API_KEY the exports are open (fine for demo/sandbox data only).
 */
export function exportKeyRequired(): boolean {
  return !!process.env.EXPORT_API_KEY;
}

export function checkExportAuth(req: Request): Response | null {
  const key = process.env.EXPORT_API_KEY;
  if (!key) return null;
  if (req.headers.get('sec-fetch-site') === 'same-origin') return null;
  const url = new URL(req.url);
  if (url.searchParams.get('key') === key) return null;
  const auth = req.headers.get('authorization') ?? '';
  if (auth === `Bearer ${key}`) return null;
  if (auth.startsWith('Basic ')) {
    try {
      const decoded = Buffer.from(auth.slice(6), 'base64').toString('utf8');
      if (decoded.slice(decoded.indexOf(':') + 1) === key) return null;
    } catch {
      /* fall through */
    }
  }
  return new Response('Export key required', { status: 401, headers: { 'WWW-Authenticate': 'Basic realm="MerchantPilot exports"' } });
}

/** Period from `?days=` (1-90, default 30). */
export function periodFrom(req: Request): number {
  const d = Number(new URL(req.url).searchParams.get('days'));
  return Number.isFinite(d) && d >= 1 && d <= 90 ? Math.round(d) : 30;
}
