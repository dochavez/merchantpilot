import { beforeEach, describe, expect, it, vi } from 'vitest';

// Force demo mode regardless of the developer's env.
vi.stubEnv('PAYPAL_CLIENT_ID', '');
vi.stubEnv('PAYPAL_CLIENT_SECRET', '');
vi.stubEnv('PAYPAL_SECRET', '');

const { resetDemoStore, getDemoStore } = await import('@/lib/demo/store');
const { clearActions, decideAction, listActions, proposeAction, toolkitSafeNote } = await import('@/lib/actions');
const { runAgentTool } = await import('@/lib/agent-tools');

const { savePolicy, DEFAULT_POLICY } = await import('@/lib/policies');

beforeEach(async () => {
  resetDemoStore();
  await clearActions();
  await savePolicy(DEFAULT_POLICY, 'test');
});

describe('human-in-the-loop actions (demo mode)', () => {
  it('validates, queues and executes a refund only after approval', async () => {
    const pay = getDemoStore().transactions.find((t) => t.type === 'Payment' && t.status === 'Completed' && t.gross > 50)!;
    const before = getDemoStore().transactions.length;
    const a = await proposeAction({ kind: 'refund', data: { captureId: pay.transactionId }, rationale: 'damaged item' });
    expect(a.status).toBe('pending');
    expect(getDemoStore().transactions.length).toBe(before); // nothing executed yet
    const done = await decideAction(a.id, 'approve');
    expect(done.status).toBe('executed');
    expect(done.executedVia).toBe('demo-store');
    const refund = getDemoStore().transactions.at(-1)!;
    expect(refund.type).toBe('Refund');
    expect(refund.relatedTransactionId).toBe(pay.transactionId);
  });

  it('rejects impossible refunds', async () => {
    const pay = getDemoStore().transactions.find((t) => t.type === 'Payment')!;
    await expect(proposeAction({ kind: 'refund', data: { captureId: pay.transactionId, amount: pay.gross + 100 }, rationale: 'x' })).rejects.toThrow(/refundable/);
    await expect(proposeAction({ kind: 'refund', data: { captureId: 'NOPE' }, rationale: 'x' })).rejects.toThrow(/No payment/);
  });

  it('dedupes identical pending proposals and supports reject', async () => {
    const inv = getDemoStore().invoices.find((i) => i.daysOverdue > 0)!;
    const a = await proposeAction({ kind: 'invoice_reminder', data: { invoiceId: inv.invoiceNumber }, rationale: 'late' });
    const b = await proposeAction({ kind: 'invoice_reminder', data: { invoiceId: inv.invoiceNumber }, rationale: 'late again' });
    expect(b.id).toBe(a.id);
    const r = await decideAction(a.id, 'reject');
    expect(r.status).toBe('rejected');
    await expect(decideAction(a.id, 'approve')).rejects.toThrow(/already/);
  });

  it('agent tools return facts and proposals', async () => {
    const o: any = await runAgentTool('paypal_overview', {});
    expect(o.mode).toBe('demo');
    const f: any = await runAgentTool('paypal_detect_anomalies', {});
    expect(f.findings.length).toBeGreaterThan(0);
    const d = getDemoStore().disputes.find((x) => x.status !== 'RESOLVED')!;
    const p: any = await runAgentTool('propose_accept_dispute', { disputeId: d.disputeId, note: 'Package lost by carrier', rationale: 'Tracking shows lost' });
    expect(p.status).toBe('pending');
    expect(await listActions()).toHaveLength(1);
    await expect(runAgentTool('propose_refund', { captureId: 'X' })).rejects.toThrow(/Invalid arguments/);
  });

  it('auto-approves small refunds only when the merchant enabled it', async () => {
    const pay = getDemoStore().transactions.find((t) => t.type === 'Payment' && t.status === 'Completed' && t.gross < 40)!;
    const a = await proposeAction({ kind: 'refund', data: { captureId: pay.transactionId }, rationale: 'x' });
    expect(a.status).toBe('pending');
    await decideAction(a.id, 'reject');
    await savePolicy({ autoApproveRefundsUpTo: 50 }, 'owner');
    const pay2 = getDemoStore().transactions.find((t) => t.type === 'Payment' && t.status === 'Completed' && t.gross < 40 && t.transactionId !== pay.transactionId)!;
    const b = await proposeAction({ kind: 'refund', data: { captureId: pay2.transactionId }, rationale: 'x' });
    expect(b.status).toBe('executed');
    expect(b.autoApproved).toBe(true);
    expect(b.decidedBy).toMatch(/Policy/);
  });

  it('caps auto-approval at 100 even if asked for more', async () => {
    const p = await savePolicy({ autoApproveRefundsUpTo: 5000 }, 'owner');
    expect(p.autoApproveRefundsUpTo).toBe(100);
  });

  it('requires two different approvers above the threshold', async () => {
    await savePolicy({ dualApprovalAbove: 30 }, 'owner');
    const pay = getDemoStore().transactions.find((t) => t.type === 'Payment' && t.status === 'Completed' && t.gross > 60)!;
    const a = await proposeAction({ kind: 'refund', data: { captureId: pay.transactionId }, rationale: 'x' });
    expect(a.requiredApprovals).toBe(2);
    const first = await decideAction(a.id, 'approve', 'Danny');
    expect(first.status).toBe('pending');
    await expect(decideAction(a.id, 'approve', 'danny')).rejects.toThrow(/second, different approver/);
    const second = await decideAction(a.id, 'approve', 'Ana (CFO)');
    expect(second.status).toBe('executed');
    expect(second.decidedBy).toBe('Danny + Ana (CFO)');
  });

  it('blocks approvals over the daily money-out limit', async () => {
    await savePolicy({ dailyRefundLimit: 100, dualApprovalAbove: 0 }, 'owner');
    const pays = getDemoStore().transactions.filter((t) => t.type === 'Payment' && t.status === 'Completed' && t.gross >= 60 && t.gross <= 90);
    const a = await proposeAction({ kind: 'refund', data: { captureId: pays[0].transactionId }, rationale: 'x' });
    expect((await decideAction(a.id, 'approve')).status).toBe('executed');
    const b = await proposeAction({ kind: 'refund', data: { captureId: pays[1].transactionId }, rationale: 'x' });
    expect(b.policyNotes).toContain('Over the daily limit');
    await expect(decideAction(b.id, 'approve')).rejects.toThrow(/Daily money-out limit/);
  });

  it('makes accept-claim notes safe for the toolkit schema', () => {
    expect(toolkitSafeNote('Package lost by carrier, sorry!')).toBe('Package-lost-by-carrier-sorry');
    expect(toolkitSafeNote('ñandú envío')).toBe('nandu-envio');
  });
});
