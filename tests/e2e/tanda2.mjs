/**
 * Browser e2e (no API keys): forecast widget what-if, dispute evidence pack → approve,
 * morning brief dialog, and approving from a signed brief link.
 *   LLM_PROVIDER=mock npm run dev ; node tests/e2e/tanda2.mjs http://localhost:3000
 */
import { chromium } from 'playwright-core';

const base = process.argv[2] ?? 'http://localhost:3000';
const api = (p, init) => fetch(base + p, init).then((r) => r.json());
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, channel: process.env.CHROMIUM_PATH ? undefined : 'chromium', args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

try {
  await api('/api/demo/reset', { method: 'POST' });
  await page.goto(`${base}/dashboard`, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });

  // 1. Forecast what-if: toggling "fight disputes" changes the upside.
  const upside = page.getByTestId('forecast-upside');
  await upside.waitFor({ timeout: 30000 });
  const before = await upside.textContent();
  await page.getByTestId('sc-fight').check();
  await page.waitForFunction((b) => document.querySelector('[data-testid="forecast-upside"]')?.textContent !== b, before, { timeout: 15000 });
  await page.getByTestId('cashflow-forecast').screenshot({ path: 'e2e-forecast.png' });

  // 2. Dispute evidence from the chat.
  await page.getByText('Disputes that need me').click();
  const card = page.getByTestId('chat-proposal').first();
  await card.waitFor({ timeout: 30000 });
  const href = await card.getByTestId('evidence-pack-link').getAttribute('href');
  const pdf = await fetch(base + href);
  if (pdf.headers.get('content-type') !== 'application/pdf') throw new Error('evidence pack is not a PDF');
  await card.getByRole('button', { name: 'Approve' }).click();
  await card.getByText('executed').waitFor({ timeout: 15000 });
  await page.screenshot({ path: 'e2e-evidence.png' });

  // 3. Morning brief dialog + signed link approval.
  const inv = (await api('/api/data')).invoices.find((i) => i.daysOverdue > 0);
  await api('/api/agent/tools/propose_payment_plan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ invoiceId: inv.invoiceId, installments: 3, rationale: 'late' }) });
  await page.getByTestId('open-brief').click();
  await page.getByRole('dialog', { name: 'Morning brief' }).waitFor();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'e2e-brief.png' });
  const { brief } = await api('/api/brief');
  const link = brief.pending.find((p) => p.title.includes('payments of'))?.approveUrl;
  if (!link) throw new Error('payment plan not in brief');
  const p2 = await browser.newPage();
  await p2.goto(link.replace(/^https?:\/\/[^/]+/, base));
  await p2.getByTestId('approve-confirm').click();
  await p2.getByTestId('approve-done').waitFor({ timeout: 15000 });
  await p2.screenshot({ path: 'e2e-approve-link.png' });

  const { actions } = await api('/api/actions');
  const plan = actions.find((a) => a.kind === 'payment_plan');
  const ev = actions.find((a) => a.kind === 'submit_dispute_evidence');
  if (plan?.status !== 'executed' || ev?.status !== 'executed') throw new Error('actions not executed: ' + JSON.stringify(actions.map((a) => [a.kind, a.status])));
  if (errors.length) throw new Error('page errors: ' + errors.join(' | '));
  console.log('✔ tanda2 passed:', actions.map((a) => `${a.kind}:${a.status}:${a.decidedBy}`).join(', '));
} catch (e) {
  await page.screenshot({ path: 'e2e-failure.png' });
  console.error('✘ tanda2 failed:', e.message);
  process.exitCode = 1;
} finally {
  await browser.close();
}
