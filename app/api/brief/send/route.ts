import { listActions } from '@/lib/actions';
import { baseUrl } from '@/lib/base-url';
import { briefHtml, briefText, buildBrief } from '@/lib/brief';
import { getDataset } from '@/lib/data';
import { withBusiness } from '@/lib/businesses';

export const dynamic = 'force-dynamic';

/**
 * POST /api/brief/send – emails the brief via Resend.
 * Called by the Render cron job (Authorization: Bearer $CRON_SECRET) or from the app ("Send test").
 */
async function POST_handler(req: Request) {
  const fromCron = process.env.CRON_SECRET && req.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`;
  if (!fromCron && req.headers.get('sec-fetch-site') !== 'same-origin') return Response.json({ error: 'unauthorized' }, { status: 401 });
  const key = process.env.RESEND_API_KEY;
  const to = process.env.BRIEF_EMAIL_TO;
  if (!key || !to) return Response.json({ sent: false, reason: 'Set RESEND_API_KEY and BRIEF_EMAIL_TO to enable the daily email.' });
  const brief = buildBrief(await getDataset(), await listActions(), baseUrl(req));
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: process.env.BRIEF_EMAIL_FROM || 'MerchantPilot <onboarding@resend.dev>',
      to: to.split(',').map((s) => s.trim()),
      subject: `☀️ ${brief.merchantName}: ${brief.attention.length} thing(s) need you today`,
      html: briefHtml(brief),
      text: briefText(brief),
    }),
  });
  const body = await res.json().catch(() => ({}));
  return Response.json({ sent: res.ok, id: body?.id, error: res.ok ? undefined : body?.message ?? `HTTP ${res.status}` }, { status: res.ok ? 200 : 502 });
}

export const POST = withBusiness(POST_handler);
