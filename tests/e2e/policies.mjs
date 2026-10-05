/**
 * Browser e2e for approval rules (no API keys):
 *  1. Two-person rule: a refund above the threshold needs two different approvers.
 *  2. Auto-approve: with "auto-send invoice reminders" on, the agent's reminder executes at once.
 *   LLM_PROVIDER=mock npm run dev ; node tests/e2e/policies.mjs http://localhost:3000
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

  // Set rules through the UI.
  await page.getByTestId('open-rules').click();
  await page.getByTestId('rule-dual').fill('50');
  await page.getByRole('dialog', { name: 'Approval rules' }).getByRole('checkbox').check();
  await page.getByTestId('rule-save').click();
  await page.getByRole('dialog', { name: 'Approval rules' }).waitFor({ state: 'detached' });
  const { policy } = await api('/api/policies');
  if (policy.dualApprovalAbove !== 50 || !policy.autoApproveInvoiceReminders) throw new Error('rules not saved: ' + JSON.stringify(policy));

  // 1. Two-person rule on a refund proposed by the agent tool endpoint.
  const data = await api('/api/data');
  const pay = data.transactions.find((t) => t.type === 'Payment' && t.status === 'Completed' && t.gross > 100);
  const res = await api('/api/agent/tools/propose_refund', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ captureId: pay.transactionId, rationale: 'Damaged on arrival' }) });
  if (res.result.requiredApprovals !== 2) throw new Error('expected 2 approvals: ' + JSON.stringify(res));
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('merchantpilot:actions-changed')));
  const card = page.getByTestId('pending-action').first();
  await card.getByText('0 of 2 approvals').waitFor();
  await card.getByRole('button', { name: /Approve as Owner/ }).click();
  await card.getByText('1 of 2 approvals').waitFor();
  await card.getByRole('button', { name: 'Waiting for 2nd approver' }).waitFor();
  await page.getByTestId('approver-name').fill('Ana (CFO)');
  await card.getByRole('button', { name: /Approve as Ana \(CFO\)/ }).click();
  await page.getByText('by Owner + Ana (CFO)').first().waitFor({ timeout: 15000 });
  await page.screenshot({ path: 'e2e-policies-dual.png' });

  // 2. Auto-approved invoice reminder from the chat.
  await page.getByText('Chase overdue invoices').click();
  await page.getByTestId('chat-proposal').getByText('auto-executed').waitFor({ timeout: 30000 });
  await page.screenshot({ path: 'e2e-policies-auto.png' });
  const { actions } = await api('/api/actions');
  const rem = actions.find((a) => a.kind === 'invoice_reminder');
  if (!rem?.autoApproved || rem.status !== 'executed') throw new Error('reminder not auto-executed: ' + JSON.stringify(rem));

  if (errors.length) throw new Error('page errors: ' + errors.join(' | '));
  console.log('✔ policies passed:', actions.map((a) => `${a.kind}:${a.status}:${a.decidedBy}`).join(', '));
} catch (e) {
  await page.screenshot({ path: 'e2e-failure.png' });
  console.error('✘ policies failed:', e.message);
  process.exitCode = 1;
} finally {
  await api('/api/policies', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ policy: { autoApproveRefundsUpTo: 0, autoApproveInvoiceReminders: false, dualApprovalAbove: 500, dailyRefundLimit: 2000 }, approver: 'e2e' }) }).catch(() => {});
  await browser.close();
}
