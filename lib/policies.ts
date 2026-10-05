/**
 * Approval policies: the merchant sets the rules, the AI works inside them.
 *  - auto-approve small refunds / invoice reminders (off by default)
 *  - two different approvers for money-out actions above a threshold
 *  - a daily cap on money out (refunds + accepted disputes)
 * Evaluated when an action is proposed AND again when it is approved.
 */
import { getStore } from './store';
import type { ApprovalPolicy, ProposedAction } from './types';

export const DEFAULT_POLICY: ApprovalPolicy = {
  autoApproveRefundsUpTo: 0,
  autoApproveInvoiceReminders: false,
  dualApprovalAbove: 500,
  dailyRefundLimit: 2000,
};
export const MAX_AUTO_REFUND = 100;

const clampNum = (v: unknown, min: number, max: number, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n * 100) / 100)) : fallback;
};

export function sanitizePolicy(input: Partial<ApprovalPolicy>, base: ApprovalPolicy = DEFAULT_POLICY): ApprovalPolicy {
  return {
    autoApproveRefundsUpTo: clampNum(input.autoApproveRefundsUpTo ?? base.autoApproveRefundsUpTo, 0, MAX_AUTO_REFUND, 0),
    autoApproveInvoiceReminders: Boolean(input.autoApproveInvoiceReminders ?? base.autoApproveInvoiceReminders),
    dualApprovalAbove: clampNum(input.dualApprovalAbove ?? base.dualApprovalAbove, 0, 1_000_000, base.dualApprovalAbove),
    dailyRefundLimit: clampNum(input.dailyRefundLimit ?? base.dailyRefundLimit, 0, 1_000_000, base.dailyRefundLimit),
  };
}

export async function getPolicy(): Promise<ApprovalPolicy> {
  const saved = await getStore().getSetting<ApprovalPolicy>('approvalPolicy');
  return saved ? { ...sanitizePolicy(saved), updatedAt: saved.updatedAt, updatedBy: saved.updatedBy } : { ...DEFAULT_POLICY };
}

export async function savePolicy(input: Partial<ApprovalPolicy>, by: string): Promise<ApprovalPolicy> {
  const p: ApprovalPolicy = { ...sanitizePolicy(input, await getPolicy()), updatedAt: new Date().toISOString(), updatedBy: by };
  await getStore().setSetting('approvalPolicy', p);
  return p;
}

export const isMoneyOut = (a: Pick<ProposedAction, 'kind'>) => a.kind === 'refund' || a.kind === 'accept_dispute';
export const moneyOutAmount = (a: ProposedAction) => (isMoneyOut(a) ? Math.abs(a.impact?.amount ?? 0) : 0);

/** Money out already executed today (UTC). */
export function moneyOutToday(actions: ProposedAction[], now = new Date()): number {
  const day = now.toISOString().slice(0, 10);
  const total = actions
    .filter((a) => a.status === 'executed' && isMoneyOut(a) && (a.decidedAt ?? '').slice(0, 10) === day)
    .reduce((s, a) => s + moneyOutAmount(a), 0);
  return Math.round(total * 100) / 100;
}

export interface PolicyDecision {
  requiredApprovals: number;
  autoApprove: boolean;
  blockedReason?: string;
  notes: string[];
}

export function evaluatePolicy(a: ProposedAction, p: ApprovalPolicy, actions: ProposedAction[], now = new Date()): PolicyDecision {
  const notes: string[] = [];
  const amount = moneyOutAmount(a);
  let requiredApprovals = 1;
  let blockedReason: string | undefined;

  if (isMoneyOut(a) && p.dualApprovalAbove > 0 && amount > p.dualApprovalAbove) {
    requiredApprovals = 2;
    notes.push(`Needs 2 different approvers (over ${p.dualApprovalAbove.toFixed(2)})`);
  }
  if (isMoneyOut(a) && p.dailyRefundLimit > 0) {
    const today = moneyOutToday(actions, now);
    if (today + amount > p.dailyRefundLimit + 0.001) {
      blockedReason = `Daily money-out limit of ${p.dailyRefundLimit.toFixed(2)} would be exceeded (${today.toFixed(2)} already today). Raise the limit in Rules or wait until tomorrow.`;
      notes.push('Over the daily limit');
    }
  }
  let autoApprove = false;
  if (!blockedReason && requiredApprovals === 1) {
    if (a.kind === 'refund' && p.autoApproveRefundsUpTo > 0 && amount <= p.autoApproveRefundsUpTo) {
      autoApprove = true;
      notes.push(`Auto-approved: refunds up to ${p.autoApproveRefundsUpTo.toFixed(2)}`);
    }
    if (a.kind === 'invoice_reminder' && p.autoApproveInvoiceReminders) {
      autoApprove = true;
      notes.push('Auto-approved: invoice reminders');
    }
  }
  return { requiredApprovals, autoApprove, blockedReason, notes };
}

export function cleanApprover(name: unknown): string {
  const s = String(name ?? '')
    .replace(/[^\p{L}\p{N} .'()_-]/gu, '')
    .trim()
    .slice(0, 40);
  return s || 'Merchant';
}
