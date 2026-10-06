/**
 * Signed one-time-ish links for approving actions from the morning brief (email / WhatsApp).
 * HMAC-SHA256 over {action, decision, approver, expiry}. The link opens a confirmation page; the
 * decision only happens on an explicit POST, so link previews / scanners can't approve anything.
 */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { currentBusiness } from './business-context';

const KEY = Symbol.for('merchantpilot.signingSecret');
type G = typeof globalThis & { [KEY]?: string };

function secret(): string {
  const s = process.env.BRIEF_SIGNING_SECRET;
  if (s && s.length >= 16) return s;
  // Dev fallback: per-process secret (links stop working after a restart).
  const g = globalThis as G;
  return (g[KEY] ??= randomBytes(32).toString('hex'));
}

export interface ApprovalClaim {
  a: string; // action id
  d: 'approve' | 'reject';
  u: string; // approver label
  e: number; // expiry (ms)
  b?: string; // business id
}

const b64 = (b: Buffer | string) => Buffer.from(b).toString('base64url');

export function signApproval(claim: Omit<ApprovalClaim, 'e' | 'b'>, ttlHours = 48): string {
  const body = b64(JSON.stringify({ ...claim, b: currentBusiness().id, e: Date.now() + ttlHours * 3_600_000 }));
  const sig = b64(createHmac('sha256', secret()).update(body).digest());
  return `${body}.${sig}`;
}

export function verifyApproval(token: string): ApprovalClaim {
  const [body, sig] = String(token).split('.');
  if (!body || !sig) throw new Error('Malformed link');
  const expected = createHmac('sha256', secret()).update(body).digest();
  const given = Buffer.from(sig, 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) throw new Error('This link is not valid (signature mismatch)');
  const claim = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as ApprovalClaim;
  if (Date.now() > claim.e) throw new Error('This link has expired');
  if (claim.d !== 'approve' && claim.d !== 'reject') throw new Error('Invalid decision');
  return claim;
}
