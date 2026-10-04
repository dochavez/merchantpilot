/**
 * Browser e2e for exports (no API keys): Export menu → PDF + Excel downloads, Power BI dialog,
 * and the chat flow "make me a PDF report" → download card → file downloads.
 *   LLM_PROVIDER=mock npm run dev ; node tests/e2e/exports.mjs http://localhost:3000
 */
import { chromium } from 'playwright-core';

const base = process.argv[2] ?? 'http://localhost:3000';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, channel: process.env.CHROMIUM_PATH ? undefined : 'chromium', args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, acceptDownloads: true });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const expectDownload = async (trigger, ext) => {
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), trigger()]);
  const name = dl.suggestedFilename();
  if (!name.endsWith(ext)) throw new Error(`expected ${ext}, got ${name}`);
  const path = await dl.path();
  return { name, path };
};

try {
  await page.goto(`${base}/dashboard`, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });

  await page.getByTestId('export-menu').click();
  const pdf = await expectDownload(() => page.getByText('Executive report').click(), '.pdf');
  await page.getByTestId('export-menu').click();
  const xlsx = await expectDownload(() => page.getByText('Excel workbook').click(), '.xlsx');
  await page.getByTestId('export-menu').click();
  await page.getByText('Connect Power BI / Excel (live)').click();
  await page.getByRole('dialog', { name: 'Connect Power BI or Excel' }).waitFor();
  await page.screenshot({ path: 'e2e-bi-dialog.png' });
  const pbids = await expectDownload(() => page.getByText('Download .pbids (1-click)').click(), '.pbids');
  await page.getByLabel('Close').click();

  await page.getByPlaceholder('Ask the AI Assistant...').fill('Make me a PDF report of this month');
  await page.keyboard.press('Enter');
  const card = page.getByTestId('chat-report').first();
  await card.waitFor({ timeout: 30000 });
  await page.screenshot({ path: 'e2e-chat-report.png' });
  const chatPdf = await expectDownload(() => card.getByTestId('chat-report-download').click(), '.pdf');

  if (errors.length) throw new Error('page errors: ' + errors.join(' | '));
  console.log('✔ exports passed:', [pdf, xlsx, pbids, chatPdf].map((d) => d.name).join(', '));
} catch (e) {
  await page.screenshot({ path: 'e2e-failure.png' });
  console.error('✘ exports failed:', e.message);
  process.exitCode = 1;
} finally {
  await browser.close();
}
