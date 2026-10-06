import { clearActions } from '@/lib/actions';
import { dataMode } from '@/lib/config';
import { resetDemoStore } from '@/lib/demo/store';
import { getStore } from '@/lib/store';
import { withBusiness } from '@/lib/businesses';

/**
 * Judges can click "Reset demo" to restore the original story. Only affects demo mode: in live mode
 * the (persisted) audit trail of real sandbox actions is never wiped from the UI.
 */
async function POST_handler() {
  if (dataMode() === 'demo') {
    await clearActions();
    await getStore().setSetting('alerts', []);
    resetDemoStore();
  }
  return Response.json({ ok: true, dataMode: dataMode() });
}

export const POST = withBusiness(POST_handler);
