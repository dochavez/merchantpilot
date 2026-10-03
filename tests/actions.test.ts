import { beforeEach, describe, expect, it, vi } from 'vitest';

// Force demo mode regardless of the developer's env.
vi.stubEnv('PAYPAL_CLIENT_ID', '');
vi.stubEnv('PAYPAL_CLIENT_SECRET', '');
vi.stubEnv('PAYPAL_SECRET', '');

const { resetDemoStore, getDemoStore } = await import('@/lib/demo/store');
const { clearActions, decideAction, listActions, proposeAction, toolkitSafeNote } = await import('@/lib/actions');
const { runAgentTool } = await import('@/lib/agent-tools');

beforeEach(() => {
  resetDemoStore();
  clearActions();
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
    expect(listActions()).toHaveLength(1);
    await expect(runAgentTool('propose_refund', { captureId: 'X' })).rejects.toThrow(/Invalid arguments/);
  });

  it('makes accept-claim notes safe for the toolkit schema', () => {
    expect(toolkitSafeNote('Package lost by carrier, sorry!')).toBe('Package-lost-by-carrier-sorry');
    expect(toolkitSafeNote('ñandú envío')).toBe('nandu-envio');
  });
});
