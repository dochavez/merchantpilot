/**
 * Browser e2e (no API keys): multi-business switcher, portfolio page (cards, grid, chart, PDF),
 * drill-down drawer (invoice → customer → back) and the portfolio Power BI feed.
 *   LLM_PROVIDER=mock npm run dev ; node tests/e2e/tanda4.mjs http://localhost:3000
 */
import { chromium } from 'playwright-core';

const base = process.argv[2] ?? 'http://localhost:3000';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, channel: process.env.CHROMIUM_PATH ? undefined : 'chromium', args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, acceptDownloads: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

try {
  await fetch(`${base}/api/demo/reset`, { method: 'POST' });
  await page.goto(`${base}/dashboard`, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });

  // 0. Recurring revenue widget on the default dashboard
  await page.getByTestId('recurring-revenue').waitFor({ timeout: 30000 });
  if (!/MRR/.test(await page.getByTestId('recurring-revenue').innerText())) throw new Error('recurring revenue widget has no MRR');

  // 1. Drill-down: click an invoice number in the grid → drawer → customer → back
  await page.getByTestId('drill-invoice').first().waitFor({ timeout: 30000 });
  await page.getByTestId('drill-invoice').first().click();
  const drawer = page.getByTestId('detail-drawer');
  await drawer.getByText('TIMELINE', { exact: false }).first().waitFor({ timeout: 15000 });
  await drawer.getByRole('button', { name: /Prepare a reminder/ }).waitFor();
  await drawer.getByTestId('invoice-items').waitFor({ timeout: 10000 }); // products on the invoice
  await drawer.getByTestId('link-customer').first().click();
  await drawer.getByText('Back').waitFor({ timeout: 15000 });
  await drawer.getByText('Back').click();
  await drawer.getByRole('button', { name: /Prepare a reminder/ }).waitFor({ timeout: 15000 });
  await page.keyboard.press('Escape');

  // 1b. Subscription drill-down (recurring revenue)
  const sub = await page.evaluate(async () => (await (await fetch('/api/data')).json()).subscriptions.find((x) => x.status === 'SUSPENDED')?.subscriptionId);
  if (!sub) throw new Error('demo has no suspended subscription');
  await page.evaluate((id) => window.dispatchEvent(new CustomEvent('merchantpilot:open-detail', { detail: { kind: 'subscription', id } })), sub);
  await drawer.getByRole('button', { name: /Recover this subscriber/ }).waitFor({ timeout: 15000 });
  await page.keyboard.press('Escape');

  // 2. Switch business → café dashboard
  await page.getByTestId('business-switcher').click();
  await page.getByRole('button', { name: /Altura Café Antigua/ }).click();
  await page.waitForLoadState('networkidle');
  await page.getByTestId('business-switcher').getByText('Altura Café Antigua').waitFor({ timeout: 20000 });

  // 3. Portfolio page
  await page.getByTestId('business-switcher').click();
  await page.getByTestId('open-portfolio').click();
  await page.getByTestId('business-cards').waitFor({ timeout: 30000 });
  const cards = await page.getByTestId('business-cards').getByRole('button', { name: 'Open dashboard' }).count();
  if (cards !== 3) throw new Error(`expected 3 business cards, got ${cards}`);
  await page.locator('[data-testid="portfolio-grid"] .ag-row').first().waitFor();
  await page.locator('canvas').first().waitFor({ timeout: 15000 });
  const summary = await page.getByTestId('portfolio-summary').innerText();
  if (summary.length < 40) throw new Error('portfolio briefing missing');
  const dl = await Promise.all([page.waitForEvent('download'), page.getByTestId('portfolio-pdf').click()]).then(([d]) => d);
  if (!dl.suggestedFilename().endsWith('.pdf')) throw new Error('portfolio PDF not downloaded');

  // 4. Portfolio Power BI feed
  const biz = await (await fetch(`${base}/api/odata/all/Businesses`)).json();
  if (biz.value?.length !== 3 || typeof biz.value[0].HealthScore !== 'number') throw new Error('Businesses table wrong');
  const tx = await (await fetch(`${base}/api/odata/all/Transactions?$top=1&$count=true`)).json();
  if (!tx.value?.[0]?.BusinessId) throw new Error('BusinessId column missing');

  // back to the primary business so other suites start clean
  await page.getByRole('button', { name: 'Open dashboard' }).first().click();
  await page.waitForLoadState('networkidle');

  if (errors.length) throw new Error('page errors: ' + errors.join(' | '));
  console.log(`✔ tanda4 passed: recurring revenue widget, drill-down drawer (invoice products, subscription), business switcher, portfolio (3 cards, grid, chart, PDF), OData /all (${tx['@odata.count']} rows)`);
} catch (e) {
  await page.screenshot({ path: 'e2e-failure.png' });
  console.error('✘ tanda4 failed:', e.message);
  process.exitCode = 1;
} finally {
  await browser.close();
}
