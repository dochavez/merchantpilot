import { clearActions } from '@/lib/actions';
import { dataMode } from '@/lib/config';
import { resetDemoStore } from '@/lib/demo/store';

/**
 * Judges can click "Reset demo" to restore the original story. Only affects demo mode: in live mode
 * the (persisted) audit trail of real sandbox actions is never wiped from the UI.
 */
export async function POST() {
  if (dataMode() === 'demo') {
    await clearActions();
    resetDemoStore();
  }
  return Response.json({ ok: true, dataMode: dataMode() });
}
