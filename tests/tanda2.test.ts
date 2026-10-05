import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.stubEnv('PAYPAL_CLIENT_ID', '');
vi.stubEnv('PAYPAL_CLIENT_SECRET', '');

const { resetDemoStore, getDemoStore } = await import('@/lib/demo/store');
const { clearActions, decideAction, proposeAction } = await import('@/lib/actions');
const { savePolicy, DEFAULT_POLICY } = await import('@/lib/policies');
const { forecastCashflow } = await import('@/lib/forecast');
const { signApproval, verifyApproval } = await import('@/lib/signing');
const { buildBrief, briefText, briefHtml } = await import('@/lib/brief');
const { buildEvidencePdf, evidenceNotes } = await import('@/lib/export/evidence-pdf');
const { runAgentTool } = await import('@/lib/agent-tools');

beforeEach(async () => {
  resetDemoStore();
  await clearActions();
  await savePolicy(DEFAULT_POLICY, 'test');
});

describe('cash-flow forecast', () => {
  it('produces a daily series with a band and a positive upside for good actions', () => {
    const f = forecastCashflow(getDemoStore(), { days: 60, scenario: { fixRefundSpike: true, collectOverdue: true, fightDisputes: true } });
    expect(f.points).toHaveLength(60);
    for (const p of f.points) expect(p.low).toBeLessThanOrEqual(p.baseline + 0.01);
    expect(f.upside).toBeGreaterThan(0);
    expect(f.withScenario.refunds).toBeLessThan(f.baseline.refunds);
    expect(f.withScenario.invoicesCollected).toBeGreaterThan(f.baseline.invoicesCollected);
    expect(f.withScenario.disputeLosses).toBeLessThan(f.baseline.disputeLosses);
    expect(f.drivers.length).toBeGreaterThan(3);
  });

  it('scales with a sales change and stays sane with no history', () => {
    const ds = getDemoStore();
    const up = forecastCashflow(ds, { days: 30, scenario: { salesChangePct: 20 } });
    expect(up.withScenario.sales).toBeCloseTo(up.baseline.sales * 1.2, 0);
    const empty = forecastCashflow({ ...ds, transactions: [], disputes: [], invoices: [] }, { days: 30 });
    expect(empty.baseline.net).toBe(0);
    expect(empty.drivers[0]).toMatch(/history/);
  });

  it('is exposed as an agent tool with weekly checkpoints', async () => {
    const r: any = await runAgentTool('paypal_forecast', { days: 28, collectOverdue: true });
    expect(r.weeklyCumulativeNet).toHaveLength(4);
    expect(typeof r.upside).toBe('number');
  });
});

describe('dispute evidence', () => {
  it('builds a PDF pack and submits it only after approval', async () => {
    const d = getDemoStore().disputes.find((x) => x.status !== 'RESOLVED' && x.status !== 'UNDER_REVIEW')!;
    const input = { disputeId: d.disputeId, message: 'Shipped on time 🚚 with tracking.', evidence: ['Tracking number'] };
    const pdf = await buildEvidencePdf(getDemoStore(), input, 'Altura');
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(evidenceNotes(getDemoStore(), input).length).toBeLessThanOrEqual(2000);

    const r: any = await runAgentTool('propose_dispute_evidence', { ...input, rationale: 'carrier delay' });
    expect(r.status).toBe('pending');
    expect(r.evidencePack).toContain(`/api/disputes/${d.disputeId}/evidence-pack`);
    expect(d.status).not.toBe('UNDER_REVIEW');
    const done = await decideAction(r.actionId, 'approve');
    expect(done.status).toBe('executed');
    expect(getDemoStore().disputes.find((x) => x.disputeId === d.disputeId)!.status).toBe('UNDER_REVIEW');
    await expect(proposeAction({ kind: 'submit_dispute_evidence', data: input, rationale: 'again' })).rejects.toThrow(/already submitted/);
  });
});

describe('payment plans', () => {
  it('validates installments and records the plan on approval', async () => {
    const inv = getDemoStore().invoices.find((i) => i.daysOverdue > 0)!;
    await expect(proposeAction({ kind: 'payment_plan', data: { invoiceId: inv.invoiceId, installments: 9 }, rationale: 'x' })).rejects.toThrow(/between 2 and 6/);
    const a = await proposeAction({ kind: 'payment_plan', data: { invoiceId: inv.invoiceNumber, installments: 3 }, rationale: 'late' });
    expect(a.kind === 'payment_plan' && a.data.minimumAmountDue).toBeCloseTo(Math.ceil((inv.amount / 3) * 100) / 100, 2);
    const done = await decideAction(a.id, 'approve');
    expect(done.status).toBe('executed');
    expect(getDemoStore().invoices.find((i) => i.invoiceId === inv.invoiceId)!.paymentPlan?.installments).toBe(3);
  });
});

describe('morning brief + signed links', () => {
  it('signs, verifies and rejects tampered links', () => {
    const t = signApproval({ a: 'act_1', d: 'approve', u: 'Owner' });
    expect(verifyApproval(t).a).toBe('act_1');
    const [body, sig] = t.split('.');
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(body, 'base64url').toString()), a: 'act_2' })).toString('base64url');
    expect(() => verifyApproval(`${forged}.${sig}`)).toThrow(/not valid/);
    expect(() => verifyApproval('junk')).toThrow();
  });

  it('builds a brief with pending approvals that can be approved via the link', async () => {
    const inv = getDemoStore().invoices.find((i) => i.daysOverdue > 0)!;
    const a = await proposeAction({ kind: 'invoice_reminder', data: { invoiceId: inv.invoiceId }, rationale: 'late' });
    const b = buildBrief(getDemoStore(), [a], 'https://x.test');
    expect(b.pending).toHaveLength(1);
    expect(briefText(b)).toContain('Approve: https://x.test/approve?t=');
    expect(briefHtml(b)).toContain('Waiting for your approval');
    const claim = verifyApproval(new URL(b.pending[0].approveUrl).searchParams.get('t')!);
    const done = await decideAction(claim.a, claim.d, claim.u);
    expect(done.status).toBe('executed');
    expect(done.decidedBy).toBe('Owner (brief link)');
  });
});
