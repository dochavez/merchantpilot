'use client';

/** Browser helpers for the selected business (cookie read by every API route). */
export interface BusinessInfo {
  id: string;
  name: string;
  kind: 'primary' | 'demo' | 'paypal';
  description?: string;
}

export function currentBusinessId(): string {
  if (typeof document === 'undefined') return 'primary';
  const m = /(?:^|;\s*)mp_business=([^;]+)/.exec(document.cookie);
  return m ? decodeURIComponent(m[1]) : 'primary';
}

export function selectBusiness(id: string, goTo = '/dashboard') {
  document.cookie = `mp_business=${encodeURIComponent(id)}; path=/; max-age=31536000; samesite=lax`;
  window.location.href = goTo;
}
