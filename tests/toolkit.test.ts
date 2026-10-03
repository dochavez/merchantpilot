import { describe, expect, it, vi } from 'vitest';

describe('PayPal Agent Toolkit wiring', () => {
  it('enables exactly the tools MerchantPilot executes after approval', async () => {
    vi.stubEnv('PAYPAL_CLIENT_ID', 'test-id');
    vi.stubEnv('PAYPAL_CLIENT_SECRET', 'test-secret');
    const { getToolkit } = await import('@/lib/paypal/toolkit');
    const names = Object.keys(getToolkit().getTools());
    for (const n of ['create_refund', 'send_invoice_reminder', 'accept_dispute_claim', 'list_disputes', 'get_dispute', 'list_transactions']) {
      expect(names).toContain(n);
    }
    expect(names).not.toContain('cancel_subscription');
  });
});
