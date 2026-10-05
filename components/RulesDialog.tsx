'use client';

/** "Approval rules" editor: the merchant decides what the AI may do and who must approve. */
import { useEffect, useState } from 'react';
import type { ApprovalPolicy } from '@/lib/types';
import { getApprover } from './studio/actions-client';

export default function RulesDialog({ onClose }: { onClose: () => void }) {
  const [policy, setPolicy] = useState<ApprovalPolicy | null>(null);
  const [max, setMax] = useState(100);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    void fetch('/api/policies', { cache: 'no-store' })
      .then((r) => r.json())
      .then((b) => {
        setPolicy(b.policy);
        setMax(b.limits?.maxAutoRefund ?? 100);
      });
  }, []);

  const save = async () => {
    if (!policy) return;
    setSaving(true);
    const r = await fetch('/api/policies', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ policy, approver: getApprover() }) });
    const b = await r.json();
    setPolicy(b.policy);
    setSaving(false);
    setSaved(true);
    setTimeout(onClose, 600);
  };

  const num = (k: keyof ApprovalPolicy, v: string) => setPolicy((p) => (p ? { ...p, [k]: Number(v) || 0 } : p));
  const row = 'flex items-start justify-between gap-4 border-b border-[var(--line)] py-3';
  const input = 'w-24 rounded-md border border-[var(--line)] bg-[var(--card)] px-2 py-1 text-right text-sm tabular-nums';

  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl bg-[var(--panel)] p-5 text-sm shadow-2xl" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Approval rules">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-base font-semibold">Approval rules</h2>
            <p className="mt-0.5 text-xs text-[var(--muted)]">You set the rules. The AI works inside them, and every decision is logged in the audit trail.</p>
          </div>
          <button className="text-[var(--muted)]" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        {!policy ? (
          <p className="py-6 text-xs text-[var(--muted)]">Loading…</p>
        ) : (
          <div className="mt-2">
            <label className={row}>
              <span>
                <b className="text-xs">Auto-approve small refunds</b>
                <br />
                <span className="text-[11px] text-[var(--muted)]">Refunds up to this amount execute without a click. 0 = off (max {max}).</span>
              </span>
              <input className={input} type="number" min={0} max={max} step={5} value={policy.autoApproveRefundsUpTo} onChange={(e) => num('autoApproveRefundsUpTo', e.target.value)} data-testid="rule-auto-refund" />
            </label>
            <label className={row}>
              <span>
                <b className="text-xs">Auto-send invoice reminders</b>
                <br />
                <span className="text-[11px] text-[var(--muted)]">Friendly reminders go out as soon as the AI proposes them (max one every 3 days per invoice).</span>
              </span>
              <input type="checkbox" className="mt-1 h-4 w-4" checked={policy.autoApproveInvoiceReminders} onChange={(e) => setPolicy({ ...policy, autoApproveInvoiceReminders: e.target.checked })} />
            </label>
            <label className={row}>
              <span>
                <b className="text-xs">Two-person approval above</b>
                <br />
                <span className="text-[11px] text-[var(--muted)]">Refunds and accepted disputes above this amount need two different people. 0 = off.</span>
              </span>
              <input className={input} type="number" min={0} step={50} value={policy.dualApprovalAbove} onChange={(e) => num('dualApprovalAbove', e.target.value)} data-testid="rule-dual" />
            </label>
            <label className={row + ' border-b-0'}>
              <span>
                <b className="text-xs">Daily money-out limit</b>
                <br />
                <span className="text-[11px] text-[var(--muted)]">Max refunds + accepted disputes per day. Approvals beyond it are blocked. 0 = off.</span>
              </span>
              <input className={input} type="number" min={0} step={100} value={policy.dailyRefundLimit} onChange={(e) => num('dailyRefundLimit', e.target.value)} data-testid="rule-daily" />
            </label>
            {policy.updatedAt && (
              <p className="text-[10px] text-[var(--muted)]">
                Last changed {policy.updatedAt.slice(0, 16).replace('T', ' ')} UTC by {policy.updatedBy}
              </p>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button className="rounded-md border border-[var(--line)] px-3 py-1.5 text-xs" onClick={onClose}>
                Cancel
              </button>
              <button className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50" disabled={saving} onClick={save} data-testid="rule-save">
                {saved ? 'Saved ✓' : saving ? 'Saving…' : 'Save rules'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
