import { money } from '@/lib/format';
import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, FileCheck2, FileText, Landmark, SlidersHorizontal, type LucideIcon } from 'lucide-react';

export type ApprovalStatus = 'pending' | 'approved' | 'posted' | 'rejected' | 'cancelled';
export type ApprovalPayload = Record<string, string | number | null | undefined>;
export type ApprovalItem = {
    id: number; kind: string; status: ApprovalStatus; amount_paisa: number;
    created_by: number; approved_by: number | null; posted_by: number | null; beneficiary_id: number | null;
    created_at: string; approved_at: string | null; posted_at: string | null;
    requester_name: string | null; reviewer_name: string | null; poster_name: string | null;
    payload: ApprovalPayload; has_evidence: boolean; approval_note: string | null;
};
export const kinds: Record<string, string> = {
    opening: 'Opening balances', expense: 'Expense', statement: 'Bank statement or cash count',
    close_variance: 'Reconciliation variance', credit_apply: 'Apply customer credit', credit_release: 'Release customer credit',
    shortage: 'Cash shortage', shortage_receipt_reverse: 'Reverse shortage receipt', refund: 'Customer refund',
    commission_cap: 'Commission cap', commission_share: 'Commission share', delivery_correction: 'Delivery correction',
};
export const kindName = (kind: string) => kinds[kind] ?? kind.replaceAll('_', ' ').replace(/^./, char => char.toUpperCase());
export const amountText = (paisa: number) => money(Number(paisa) / 100);
export const person = (name: string | null | undefined, id: number | null | undefined) => name ?? (id ? 'User #' + id : '—');
export const statuses: Record<ApprovalStatus, string> = {
    pending: 'Awaiting review', approved: 'Approved, not posted', posted: 'Posted', rejected: 'Rejected', cancelled: 'Withdrawn',
};
const icons: Record<string, [LucideIcon, string]> = {
    opening: [Landmark, 'neutral'], transfer: [ArrowLeftRight, 'blue'], expense: [ArrowUpRight, 'red'], refund: [ArrowUpRight, 'red'],
    adjustment: [SlidersHorizontal, 'violet'], statement: [FileCheck2, 'violet'], shortage_repayment: [ArrowDownLeft, 'green'],
    refund_recovery: [ArrowDownLeft, 'green'], recovery_repayment: [ArrowDownLeft, 'green'], commission_payout: [ArrowUpRight, 'red'],
};
export const kindIcon = (kind: string): [LucideIcon, string] => icons[kind] ?? [FileText, 'blue'];
