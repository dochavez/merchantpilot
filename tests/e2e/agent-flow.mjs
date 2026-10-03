/**
 * Browser end-to-end test of the full agent loop (no API keys needed).
 *
 *   LLM_PROVIDER=mock npm run dev        # terminal 1
 *   npm run e2e                          # terminal 2  (or: node tests/e2e/agent-flow.mjs http://localhost:3000)
 *
 * Flow: open dashboard → click "Chase overdue invoices" → MerchantPilot (mock model) calls
 * paypal_list_invoices → propose_invoice_reminder → card appears in Action Center → Approve →
 * action executed. Uses Playwright with any installed Chromium (set CHROMIUM_PATH if needed).
 */
import { chromium } from 'playwright-core';

const base = process.argv[2] ?? 'http://localhost:3000';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, channel: process.env.CHROMIUM_PATH ? undefined : 'chromium', args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

try {
  await fetch(`${base}/api/demo/reset`, { method: 'POST' });
  await page.goto(`${base}/dashboard`, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByText('Chase overdue invoices').click();
  await page.waitForSelector('[data-testid="pending-action"]', { timeout: 30000 });
  await page.locator('[data-testid="pending-action"] button', { hasText: 'Approve' }).first().click();
  await page.waitForSelector('text=executed', { timeout: 30000 });
  const { actions } = await (await fetch(`${base}/api/actions`)).json();
  if (!actions.some((a) => a.status === 'executed')) throw new Error('no executed action');
  if (errors.length) throw new Error('page errors: ' + errors.join(' | '));
  await page.screenshot({ path: 'e2e-result.png' });
  console.log('✔ agent flow passed:', actions.map((a) => `${a.kind}:${a.status}`).join(', '));
} catch (e) {
  await page.screenshot({ path: 'e2e-failure.png' });
  console.error('✘ agent flow failed:', e.message);
  process.exitCode = 1;
} finally {
  await browser.close();
}
