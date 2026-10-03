import { clearActions } from '@/lib/actions';
import { dataMode } from '@/lib/config';
import { resetDemoStore } from '@/lib/demo/store';

/** Judges can click "Reset demo" to restore the original story. Only affects demo mode data. */
export async function POST() {
  clearActions();
  if (dataMode() === 'demo') resetDemoStore();
  return Response.json({ ok: true, dataMode: dataMode() });
}
