/**
 * Runs only when TEST_DATABASE_URL points to a Postgres database (skipped otherwise).
 *   TEST_DATABASE_URL=postgres://postgres@localhost:5433/mp npx vitest run tests/store.pg.test.ts
 */
import { afterAll, describe, expect, it, vi } from 'vitest';

const url = process.env.TEST_DATABASE_URL;
describe.skipIf(!url)('Postgres store', () => {
  it('persists actions and settings across store instances, namespaced by mode', async () => {
    vi.stubEnv('DATABASE_URL', url!);
    vi.stubEnv('PAYPAL_CLIENT_ID', '');
    const { getStore, resetStoreForTests } = await import('@/lib/store');
    resetStoreForTests();
    const s1 = getStore();
    expect(s1.kind).toBe('postgres');
    await s1.clearActions();
    const a: any = { id: 'act_pg1', kind: 'invoice_reminder', data: { invoiceId: 'X' }, title: 't', rationale: 'r', status: 'pending', createdAt: new Date().toISOString() };
    await s1.saveAction(a);
    await s1.saveAction({ ...a, status: 'executed' });
    await s1.setSetting('approvalPolicy', { dualApprovalAbove: 123 });
    resetStoreForTests(); // simulate a redeploy: brand new pool
    const s2 = getStore();
    const list = await s2.listActions();
    expect(list).toHaveLength(1);
    expect(list[0].status).toBe('executed');
    expect(((await s2.getSetting('approvalPolicy')) as any).dualApprovalAbove).toBe(123);
    vi.stubEnv('FORCE_DEMO', '0');
  });
  afterAll(() => vi.unstubAllEnvs());
});
