/**
 * Browser e2e (no API keys): voice (speech recognition stubbed), real-time alert → Ask AI,
 * accounting CSVs and the MCP endpoint.
 *   LLM_PROVIDER=mock npm run dev ; node tests/e2e/tanda3.mjs http://localhost:3000
 */
import { chromium } from 'playwright-core';

const base = process.argv[2] ?? 'http://localhost:3000';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, channel: process.env.CHROMIUM_PATH ? undefined : 'chromium', args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
// Fake speech recognition: "hears" a Spanish question.
await ctx.addInitScript(() => {
  class FakeSR {
    start() {
      setTimeout(() => {
        this.onresult?.({ results: [Object.assign([{ transcript: '¿Qué disputas necesitan mi atención?' }], { isFinal: true })] });
        this.onend?.();
      }, 300);
    }
    stop() {}
  }
  Object.defineProperty(window, 'webkitSpeechRecognition', { value: FakeSR, configurable: true, writable: true });
  Object.defineProperty(window, 'SpeechRecognition', { value: FakeSR, configurable: true, writable: true });
  window.speechSynthesis.speak = () => {};
});
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

try {
  await fetch(`${base}/api/demo/reset`, { method: 'POST' });
  await page.goto(`${base}/dashboard`, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });

  // 1. Voice → chat
  await page.getByTestId('voice-button').click();
  await page.getByText('¿Qué disputas necesitan mi atención?').first().waitFor({ timeout: 20000 });

  // 2. Real-time alert → toast → Ask AI
  await page.getByTestId('alerts-bell').click();
  await page.getByTestId('simulate-alert').click();
  const toast = page.getByTestId('alert-toast').first();
  await toast.waitFor({ timeout: 20000 });
  await page.screenshot({ path: 'e2e-alert.png' });
  await toast.getByTestId('alert-ask-ai').click();
  await page.getByText('A new PayPal dispute').first().waitFor({ timeout: 20000 });

  // 3. Accounting exports
  for (const [fmt, header] of [['quickbooks', 'Date,Description,Amount'], ['xero', 'Date,Amount,Payee,Description,Reference'], ['summary', 'Month,Gross sales']]) {
    const t = await (await fetch(`${base}/api/export/accounting?format=${fmt}`)).text();
    if (!t.replace('﻿', '').startsWith(header)) throw new Error(`${fmt} csv header: ${t.slice(0, 60)}`);
  }

  // 4. MCP
  const rpc = (method, params, id = 1) => fetch(`${base}/api/mcp`, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' }, body: JSON.stringify({ jsonrpc: '2.0', id, method, params }) }).then((r) => r.json());
  const init = await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'e2e', version: '1' } });
  if (init.result?.serverInfo?.name !== 'merchantpilot') throw new Error('MCP initialize failed');
  const list = await rpc('tools/list', {}, 2);
  if ((list.result?.tools?.length ?? 0) < 10) throw new Error('MCP tools missing');

  if (errors.length) throw new Error('page errors: ' + errors.join(' | '));
  console.log(`✔ tanda3 passed: voice, alert, accounting CSVs, MCP (${list.result.tools.length} tools)`);
} catch (e) {
  await page.screenshot({ path: 'e2e-failure.png' });
  console.error('✘ tanda3 failed:', e.message);
  process.exitCode = 1;
} finally {
  await browser.close();
}
