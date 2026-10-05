/**
 * Morning brief: what happened yesterday, what needs the merchant today, and one-tap approvals.
 * Rendered as JSON (UI), HTML (email) and plain text (WhatsApp / SMS).
 */
import { detectAnomalies, overview } from './analytics';
import { forecastCashflow } from './forecast';
import { signApproval } from './signing';
import type { Dataset, ProposedAction } from './types';

const DAY = 86_400_000;
const r2 = (n: number) => Math.round(n * 100) / 100;

export interface Brief {
  merchantName: string;
  date: string;
  currency: string;
  yesterday: { sales: number; orders: number; refunds: number };
  week: { sales: number; salesPrev: number; changePct: number | null };
  attention: string[];
  pending: { id: string; title: string; impact?: number; approveUrl: string; rejectUrl: string; needsTwo: boolean }[];
  forecast: { days: number; doNothing: number; withActions: number; upside: number };
  dashboardUrl: string;
}

export function buildBrief(ds: Dataset, actions: ProposedAction[], baseUrl: string, now = Date.now()): Brief {
  const today = new Date(now).toISOString().slice(0, 10);
  const yday = new Date(now - DAY).toISOString().slice(0, 10);
  const y = ds.transactions.filter((t) => t.date === yday);
  const w = overview(ds, 7, now);
  const findings = detectAnomalies(ds, now);
  const attention: string[] = [];
  const urgent = ds.disputes.filter((d) => d.status !== 'RESOLVED' && !d.evidenceSubmittedAt && d.daysToRespond <= 3);
  if (urgent.length) attention.push(`${urgent.length} dispute(s) must be answered within 3 days (${urgent.map((d) => d.disputeId).join(', ')}).`);
  const newDisputes = ds.disputes.filter((d) => d.createdDate >= yday);
  if (newDisputes.length) attention.push(`${newDisputes.length} new dispute(s) opened since yesterday.`);
  for (const f of findings.slice(0, 3)) if (!attention.some((a) => a.includes(f.title))) attention.push(f.title + '.');
  const fc = forecastCashflow(ds, { days: 30, scenario: { fixRefundSpike: true, collectOverdue: true, fightDisputes: true }, now });
  const pending = actions
    .filter((a) => a.status === 'pending')
    .slice(0, 6)
    .map((a) => ({
      id: a.id,
      title: a.title,
      impact: a.impact?.amount,
      needsTwo: (a.requiredApprovals ?? 1) > 1,
      approveUrl: `${baseUrl}/approve?t=${signApproval({ a: a.id, d: 'approve', u: 'Owner (brief link)' })}`,
      rejectUrl: `${baseUrl}/approve?t=${signApproval({ a: a.id, d: 'reject', u: 'Owner (brief link)' })}`,
    }));
  return {
    merchantName: ds.merchantName,
    date: today,
    currency: ds.currency,
    yesterday: {
      sales: r2(y.filter((t) => t.type === 'Payment').reduce((s, t) => s + t.gross, 0)),
      orders: y.filter((t) => t.type === 'Payment').length,
      refunds: r2(-y.filter((t) => t.type === 'Refund').reduce((s, t) => s + t.gross, 0)),
    },
    week: { sales: w.grossSales, salesPrev: w.grossSalesPrevPeriod, changePct: w.salesChangePct },
    attention,
    pending,
    forecast: { days: 30, doNothing: fc.baseline.net, withActions: fc.withScenario.net, upside: fc.upside },
    dashboardUrl: `${baseUrl}/dashboard`,
  };
}

const money = (n: number, c: string) => new Intl.NumberFormat('en-US', { style: 'currency', currency: c, maximumFractionDigits: 0 }).format(n);
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function briefText(b: Brief): string {
  const c = b.currency;
  const lines = [
    `☀️ ${b.merchantName} – ${b.date}`,
    `Yesterday: ${money(b.yesterday.sales, c)} in ${b.yesterday.orders} orders, ${money(b.yesterday.refunds, c)} refunded.`,
    `Last 7 days: ${money(b.week.sales, c)}${b.week.changePct !== null ? ` (${b.week.changePct >= 0 ? '+' : ''}${b.week.changePct}% vs prior week)` : ''}.`,
    '',
    b.attention.length ? 'Needs you today:' : 'Nothing urgent today.',
    ...b.attention.map((a) => `• ${a}`),
    '',
    `30-day cash: ${money(b.forecast.doNothing, c)} if you do nothing, ${money(b.forecast.withActions, c)} if you act (+${money(b.forecast.upside, c)}).`,
  ];
  if (b.pending.length) {
    lines.push('', `Waiting for your approval (${b.pending.length}):`);
    for (const p of b.pending) lines.push(`• ${p.title}${p.needsTwo ? ' (needs 2 approvers)' : ''}\n  Approve: ${p.approveUrl}`);
  }
  lines.push('', `Dashboard: ${b.dashboardUrl}`);
  return lines.join('\n');
}

export function briefHtml(b: Brief): string {
  const c = b.currency;
  const btn = (href: string, label: string, bg: string) =>
    `<a href="${esc(href)}" style="display:inline-block;padding:6px 12px;border-radius:6px;background:${bg};color:#fff;text-decoration:none;font-size:13px;font-weight:600;margin-right:6px">${label}</a>`;
  return `<!doctype html><html><body style="margin:0;background:#F5F7FB;font-family:Inter,Arial,sans-serif;color:#0F172A">
<div style="max-width:560px;margin:0 auto;padding:20px">
  <div style="background:#003087;color:#fff;border-radius:12px 12px 0 0;padding:16px 20px">
    <div style="font-size:12px;color:#C7D7FE">Morning brief · ${esc(b.date)}</div>
    <div style="font-size:20px;font-weight:700">${esc(b.merchantName)}</div>
  </div>
  <div style="background:#fff;border-radius:0 0 12px 12px;padding:18px 20px;border:1px solid #E2E8F0;border-top:0">
    <table style="width:100%;border-collapse:collapse;font-size:13px"><tr>
      <td style="padding:6px 0"><div style="color:#64748B">Yesterday</div><div style="font-size:18px;font-weight:700">${money(b.yesterday.sales, c)}</div><div style="color:#64748B">${b.yesterday.orders} orders · ${money(b.yesterday.refunds, c)} refunded</div></td>
      <td style="padding:6px 0"><div style="color:#64748B">Last 7 days</div><div style="font-size:18px;font-weight:700">${money(b.week.sales, c)}</div><div style="color:${(b.week.changePct ?? 0) >= 0 ? '#047857' : '#B91C1C'}">${b.week.changePct !== null ? `${b.week.changePct >= 0 ? '+' : ''}${b.week.changePct}% vs prior week` : ''}</div></td>
    </tr></table>
    <h3 style="font-size:14px;margin:16px 0 6px">Needs you today</h3>
    ${b.attention.length ? `<ul style="margin:0;padding-left:18px;font-size:13px;line-height:1.6">${b.attention.map((a) => `<li>${esc(a)}</li>`).join('')}</ul>` : '<p style="font-size:13px;color:#64748B">Nothing urgent.</p>'}
    <div style="margin:16px 0;padding:12px;border-radius:8px;background:#ECFDF5;font-size:13px">30-day cash: <b>${money(b.forecast.doNothing, c)}</b> if you do nothing, <b style="color:#0070E0">${money(b.forecast.withActions, c)}</b> if you act <b style="color:#047857">(+${money(b.forecast.upside, c)})</b></div>
    ${
      b.pending.length
        ? `<h3 style="font-size:14px;margin:16px 0 6px">Waiting for your approval</h3>${b.pending
            .map(
              (p) =>
                `<div style="border:1px solid #E2E8F0;border-radius:8px;padding:10px 12px;margin-bottom:8px"><div style="font-size:13px;font-weight:600">${esc(p.title)}</div>${p.needsTwo ? '<div style="font-size:11px;color:#6D28D9">Needs 2 approvers</div>' : ''}<div style="margin-top:8px">${btn(p.approveUrl, 'Approve', '#0070E0')}${btn(p.rejectUrl, 'Reject', '#64748B')}</div></div>`,
            )
            .join('')}`
        : ''
    }
    <p style="margin-top:16px">${btn(b.dashboardUrl, 'Open MerchantPilot', '#003087')}</p>
    <p style="font-size:11px;color:#94A3B8">Approval links open a confirmation page and expire in 48 hours. Your approval rules and the audit trail apply.</p>
  </div>
</div></body></html>`;
}
