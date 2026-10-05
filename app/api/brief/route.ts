import { listActions } from '@/lib/actions';
import { baseUrl } from '@/lib/base-url';
import { briefHtml, briefText, buildBrief } from '@/lib/brief';
import { getDataset } from '@/lib/data';

export const dynamic = 'force-dynamic';

/** GET /api/brief?format=json|html|text – the morning brief (also what the daily email sends). */
export async function GET(req: Request) {
  const format = new URL(req.url).searchParams.get('format') ?? 'json';
  const brief = buildBrief(await getDataset(), await listActions(), baseUrl(req));
  if (format === 'html') return new Response(briefHtml(brief), { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
  if (format === 'text') return new Response(briefText(brief), { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
  return Response.json({ brief, text: briefText(brief), html: briefHtml(brief), emailConfigured: Boolean(process.env.RESEND_API_KEY && process.env.BRIEF_EMAIL_TO) }, { headers: { 'Cache-Control': 'no-store' } });
}
