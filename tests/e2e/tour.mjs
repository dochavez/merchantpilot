/**
 * Browser test of the guided tour: welcome screen, every step's button, auto-ticked steps
 * (approval executed, detail drawer opened) and page switching. No API keys needed (mock LLM).
 */
import { chromium } from 'playwright-core';

const base = process.env.BASE_URL ?? 'http://localhost:3000';
const shots = process.env.SHOTS_DIR;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, channel: process.env.CHROMIUM_PATH ? undefined : 'chromium', args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
// Behave like a normal visitor (the tour skips its welcome screen for automated browsers).
await page.addInitScript(() => Object.defineProperty(navigator, 'webdriver', { get: () => false }));
const fail = (m) => {
  throw new Error(m);
};
const title = () => page.locator('[data-testid="tour-title"]').innerText();
const next = () => page.click('[data-testid="tour-next"]');
const selectedTab = () => page.locator('[data-testid="report-pages"] [aria-selected="true"]').getAttribute('data-testid');

try {
  await fetch(`${base}/api/demo/reset`, { method: 'POST' });
  await page.goto(`${base}/dashboard`, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });

  // 1. First visit → welcome screen.
  await page.waitForSelector('[data-testid="tour-welcome"]', { timeout: 30000 });
  await page.waitForSelector('[data-testid="report-pages"]', { timeout: 30000 });
  if (shots) await page.screenshot({ path: `${shots}/tour-welcome.png` });
  await page.click('[data-testid="tour-start"]');
  if ((await title()) !== 'Your money at a glance') fail('step 1 title');
  await page.click('[data-testid="tour-cta"]');
  await page.waitForSelector('[data-testid="tour-done"]');
  if (shots) await page.screenshot({ path: `${shots}/tour-step1.png` });
  await next();

  // 2. Ask the AI.
  if ((await title()) !== 'Ask the AI why') fail('step 2 title');
  await page.click('[data-testid="tour-cta"]');
  await page.waitForSelector('text=Ceramic Pour-Over Kit', { timeout: 40000 });
  if (shots) await page.screenshot({ path: `${shots}/tour-step2.png` });
  await next();

  // 3. Approve: ticked only after the action really executes.
  if ((await title()) !== 'Approve an action') fail('step 3 title');
  await page.click('[data-testid="tour-cta"]');
  const card = page.locator('[data-testid="chat-proposal"]').last();
  await card.waitFor({ timeout: 40000 });
  if (await page.locator('[data-testid="tour-done"]').count()) fail('step 3 ticked before approval');
  await card.locator('button', { hasText: 'Approve' }).click();
  await page.waitForSelector('[data-testid="tour-done"]', { timeout: 30000 });
  if (shots) await page.screenshot({ path: `${shots}/tour-step3.png` });
  await next();

  // 4. Drill-down: switches to Collections and opens the most overdue invoice.
  if ((await title()) !== 'Click anything for the story') fail('step 4 title');
  await page.waitForFunction(() => document.querySelector('[data-testid="report-pages"] [aria-selected="true"]')?.getAttribute('data-testid') === 'page-tab-collections', null, { timeout: 10000 });
  await page.click('[data-testid="tour-cta"]');
  await page.waitForSelector('[data-testid="tour-done"]', { timeout: 15000 });
  await page.waitForSelector('text=Northside Roasters', { timeout: 15000 });
  if (shots) await page.screenshot({ path: `${shots}/tour-step4.png` });
  await page.keyboard.press('Escape');
  await next();

  // 5. Disputes page.
  if ((await title()) !== 'Disputes before the deadline') fail('step 5 title');
  await page.waitForFunction(() => document.querySelector('[data-testid="report-pages"] [aria-selected="true"]')?.getAttribute('data-testid') === 'page-tab-risk', null, { timeout: 10000 });
  await next();

  // 6. Recurring revenue.
  if ((await title()) !== 'Recurring revenue') fail('step 6 title');
  await page.click('[data-testid="tour-cta"]');
  if ((await selectedTab()) !== 'page-tab-recurring') fail('step 6 page');
  await next();

  // 7. Rules dialog opens.
  if ((await title()) !== 'You set the rules') fail('step 7 title');
  await page.click('[data-testid="tour-cta"]');
  await page.waitForSelector('text=Two-person approval', { timeout: 10000 }).catch(() => page.waitForSelector('[role="dialog"] >> text=/rule/i', { timeout: 5000 }));
  if (shots) await page.screenshot({ path: `${shots}/tour-step7.png` });
  await page.keyboard.press('Escape');
  await next();

  // 8-9. Portfolio and exports open new tabs.
  if ((await title()) !== 'More than one business') fail('step 8 title');
  const [portfolio] = await Promise.all([page.context().waitForEvent('page'), page.click('[data-testid="tour-cta"]')]);
  await portfolio.close();
  await next();
  if ((await title()) !== 'Take it with you') fail('step 9 title');
  await next(); // Finish
  if (await page.locator('[data-testid="tour-card"]').count()) fail('tour did not close');

  // Reopen from the header; the welcome does not come back.
  await page.reload({ waitUntil: 'networkidle' });
  if (await page.locator('[data-testid="tour-welcome"]').count()) fail('welcome shown twice');
  await page.click('[data-testid="start-tour"]');
  if ((await title()) !== 'Your money at a glance') fail('restart');

  console.log('✔ tour passed: welcome, 9 steps, auto-tick on approval and drill-down, page switching, rules, restart');
} finally {
  await browser.close();
}
