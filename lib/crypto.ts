/** AES-256-GCM encryption for secrets stored in the database (owner-added PayPal app secrets). */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

function key(): Buffer {
  const material = process.env.CREDENTIALS_KEY || process.env.BRIEF_SIGNING_SECRET;
  if (!material || material.length < 16) throw new Error('Set BRIEF_SIGNING_SECRET (or CREDENTIALS_KEY) on the server to store PayPal credentials securely.');
  return createHash('sha256').update('merchantpilot:credentials:' + material).digest();
}

export function canEncrypt(): boolean {
  try {
    key();
    return true;
  } catch {
    return false;
  }
}

export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return ['v1', iv.toString('base64url'), c.getAuthTag().toString('base64url'), enc.toString('base64url')].join('.');
}

export function decrypt(box: string): string {
  const [v, iv, tag, enc] = box.split('.');
  if (v !== 'v1') throw new Error('Unknown secret format');
  const d = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64url'));
  d.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([d.update(Buffer.from(enc, 'base64url')), d.final()]).toString('utf8');
}
