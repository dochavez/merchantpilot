import { addBusiness, BUILT_IN_IDS, businessIdFrom, listBusinesses, removeBusiness, resolveBusiness } from '@/lib/businesses';
import { canEncrypt } from '@/lib/crypto';

export const dynamic = 'force-dynamic';

/** GET → businesses (never secrets) + the one selected by the mp_business cookie. */
export async function GET(req: Request) {
  const [all, current] = await Promise.all([listBusinesses(), resolveBusiness(businessIdFrom(req))]);
  return Response.json(
    { businesses: all.map(({ id, name, kind, description }) => ({ id, name, kind, description })), currentId: current.id, canAdd: canEncrypt() },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

/** POST { name, clientId, clientSecret } → adds a PayPal sandbox app as a new business (keys are verified, secret encrypted). */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  try {
    const b = await addBusiness(body);
    return Response.json({ business: b });
  } catch (e) {
    return Response.json({ error: (e as Error).message.replace(/client_secret|secret/gi, 'secret') }, { status: 400 });
  }
}

/** DELETE ?id= → removes an owner-added business (built-in ones can't be removed). */
export async function DELETE(req: Request) {
  const id = new URL(req.url).searchParams.get('id');
  if (!id || BUILT_IN_IDS.includes(id)) return Response.json({ error: 'This business cannot be removed' }, { status: 400 });
  await removeBusiness(id);
  return Response.json({ ok: true });
}
