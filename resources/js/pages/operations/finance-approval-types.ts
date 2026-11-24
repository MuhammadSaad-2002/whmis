import { money } from '@/lib/format';
import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, CircleAlert, FileCheck2, FileText, Gauge, Landmark, Pause, Play, Scale, SlidersHorizontal, Split, Undo2, type LucideIcon } from 'lucide-react';

export type ApprovalStatus = 'pending' | 'approved' | 'posted' | 'rejected' | 'cancelled' | 'reversed';
export type FinanceAccount = { id: number; name: string; kind: string; balance: number };
export type OpeningAccount = { id: number; name: string; opening_paisa: number; opening_reference?: string };
export type ShareFacts = { original: string; delivered: string; calculated: number; due: number; deliverers: { name: string; weight: number }[] };
export type AwardProjection = { name: string; calculated: number; earned: number };
export type PickOption = { id: number | string; label: string; max?: number; customer_id?: number; customer?: string; share?: ShareFacts; date?: string; source_payment_id?: number;
    correction_max?: number; account?: number; reported?: number; counted?: number; verified?: number; due?: number; recovery?: number; award_due?: number; held?: boolean };
export type ApprovalOptions = {
    opening?: OpeningAccount[]; locked?: boolean; statement?: Record<string, number>; customers?: PickOption[];
    invoices?: PickOption[]; targets?: PickOption[]; days?: PickOption[]; collections?: PickOption[]; references?: PickOption[]; employees?: PickOption[];
};
export type ApprovalPayload = Record<string, string | number | null | undefined>;
export type ApprovalItem = {
    id: number; kind: string; status: ApprovalStatus; amount_paisa: number;
    created_by: number; approved_by: number | null; posted_by: number | null; beneficiary_id: number | null;
    created_at: string; approved_at: string | null; posted_at: string | null;
    requester_name: string | null; reviewer_name: string | null; poster_name: string | null;
    payload: ApprovalPayload; has_evidence: boolean; approval_note: string | null;
    details: { invoice?: string; target_invoice?: string; customer?: string; employee?: string; share?: ShareFacts; opening?: OpeningAccount[];
        share_projection?: AwardProjection[]; opening_imports?: Record<string, number>;
        movements: { name: string; paisa: number; kind: string }[]; ledger: { description: string; paisa: number }[] };
    outcomes: { action: string; data: ApprovalPayload & { awards?: AwardProjection[] } }[];
};
export const kinds: Record<string, string> = {
    opening: 'Opening balances', expense: 'Expense', statement: 'Bank statement or cash count',
    close_variance: 'Reconciliation variance', credit_apply: 'Apply customer credit', credit_release: 'Undo applied customer credit',
    credit_writeoff: 'Release customer credit', shortage: 'Cash shortage', shortage_receipt_reverse: 'Correct shortage-backed invoice receipt',
    shortage_repayment_reverse: 'Reverse shortage receipt', shortage_commission_offset: 'Recover shortage from commission', refund: 'Customer refund',
    commission_cap: 'Commission cap', commission_share: 'Commission share', delivery_correction: 'Delivery correction',
};
export const kindName = (kind: string) => kinds[kind] ?? kind.replaceAll('_', ' ').replace(/^./, char => char.toUpperCase());
export const amountText = (paisa: number) => money(Number(paisa) / 100);
export const person = (name: string | null | undefined, id: number | null | undefined) => name ?? (id ? 'User #' + id : '—');
export const statuses: Record<ApprovalStatus, string> = {
    pending: 'Awaiting review', approved: 'Approved, not posted', posted: 'Posted', rejected: 'Rejected', cancelled: 'Withdrawn', reversed: 'Reversed',
};
const icons: Record<string, [LucideIcon, string]> = {
    opening: [Landmark, 'neutral'], transfer: [ArrowLeftRight, 'blue'], expense: [ArrowUpRight, 'red'], refund: [ArrowUpRight, 'red'],
    adjustment: [SlidersHorizontal, 'violet'], statement: [FileCheck2, 'violet'], shortage_repayment: [ArrowDownLeft, 'green'],
    refund_recovery: [ArrowDownLeft, 'green'], recovery_repayment: [ArrowDownLeft, 'green'], commission_payout: [ArrowUpRight, 'red'],
    close_variance: [Scale, 'amber'], shortage: [CircleAlert, 'amber'], shortage_repayment_reverse: [Undo2, 'amber'],
    commission_share: [Split, 'violet'], commission_cap: [Gauge, 'violet'], recovery_hold: [Pause, 'red'], recovery_resume: [Play, 'green'],
};
export const kindIcon = (kind: string): [LucideIcon, string] => icons[kind] ?? [FileText, 'blue'];

export const requestGroups = [
    ['Cash & bank', ['opening', 'transfer', 'expense', 'adjustment', 'statement', 'close_variance']],
    ['Customer credit & refunds', ['refund', 'credit_apply', 'credit_writeoff', 'refund_recovery', 'refund_correction', 'credit_release']],
    ['Cash shortages', ['shortage', 'shortage_repayment', 'shortage_commission_offset', 'shortage_repayment_reverse', 'shortage_receipt_reverse']],
    ['Commission', ['commission_cap', 'commission_share', 'commission_payout']],
    ['Employee recovery', ['recovery_repayment', 'recovery_waiver', 'recovery_hold', 'recovery_resume']],
] as const;

export const requiredEvidence = ['opening', 'transfer', 'expense', 'statement', 'refund_correction', 'recovery_waiver'];
export const expenseCategories = ['Fuel & transport', 'Rent', 'Utilities', 'Repairs & maintenance', 'Office & stationery', 'Staff welfare', 'Bank charges', 'Other'];
export const requestGuidance: Record<string, string> = {
    opening: 'Prepare each account’s opening amount and statement reference in Cash & Bank before go-live. Attach the cash count or bank statement and submit the snapshot. Posting creates the first ledger entries and locks the opening. The optional CSV reconciles existing obligations; it does not recreate sales or purchases. Correct locked balances with an Adjustment.',
    transfer: 'Record a move between your own accounts after it has happened and attach proof. Posting reduces the source account and increases the destination by the same amount. Total cash and profit do not change.',
    expense: 'Record a business cost already paid and attach its bill. Posting reduces the selected account and operating profit under the selected category. Stock you buy from suppliers still goes through Purchase Invoices.',
    adjustment: 'Explain the bank charge, rounding or recording error. Posting changes the selected cash or bank account only, without changing the customer, supplier or invoice ledger.',
    statement: 'Attach the bank statement or cash count for that date. Posting records the book balance, counted balance and variance as a checkpoint without moving money. Use an Adjustment for an unexplained account balance difference.',
    close_variance: 'Select a counted submission after every collection is verified. Apply the approval in Daily Reconciliation. Unallocated physical cash is recorded as other income. An accepted reporting shortfall closes the day without reducing the till again, charging the Salesman or paying unpaid invoices.',
    refund: 'Select receipt-backed credit from an eligible invoice or unapplied receipt. Confirm the actual payout when posting. Cash and available credit decrease; sales and stock do not change.',
    credit_apply: 'Use an eligible credit to settle another open invoice for the same customer. The amount cannot exceed either the available source credit or the target invoice balance. No cash moves.',
    credit_writeoff: 'Release receipt-backed credit that will not be refunded or used. Posting reduces the customer’s credit and recognizes other income. No cash moves.',
    credit_release: 'Undo an earlier credit application. Credit becomes available again and the invoice it settled may reopen. This is not income or a cash movement.',
    refund_recovery: 'Select the original refund and record actual money returned by the customer. Posting increases the selected account and reduces the unresolved payout and customer ledger debit.',
    refund_correction: 'Correct the recorded refund when the actual payment was right. Enter the correct net amount and attach proof. Posting adds a correcting entry to the original account and customer ledger; it does not record another transfer of money.',
    shortage: 'Select an unverified cash collection with a confirmed physical cash shortfall. Apply it in Daily Reconciliation. The invoice settles for the actual receipt plus the approved shortage; only the actual cash reaches the till. The salesman owes the shortage.',
    shortage_repayment: 'Select a posted shortage and record a repayment that has been received. Posting increases the selected account and reduces what the salesman owes, up to the remaining shortage.',
    shortage_commission_offset: 'Use commission already due to repay a posted shortage. The salesman owes less and their commission payable decreases by the same amount. No cash moves.',
    shortage_repayment_reverse: 'Reverse an employee’s posted shortage repayment recorded by mistake. Posting reverses that treasury entry and restores the amount owed. It does not cancel the customer’s receipt.',
    shortage_receipt_reverse: 'Correct a customer receipt that included an employee shortage before any repayment has been applied to it. Posting reverses that receipt and may reopen the invoice.',
    commission_cap: 'Set an employee’s maximum for one role per invoice or calendar month, from the effective invoice date. Posting reduces eligible unpaid commission without reclaiming paid commissions. It does not move cash.',
    commission_share: 'Split the salesman commission on an invoice between the original assignee and the people who actually delivered it. Booker commission is unchanged. Pending commission stays pending; an approved payout is still needed to pay anyone.',
    commission_payout: 'Select an employee with commission already due. Posting a confirmed payout reduces the selected account and that employee’s payable balance. If started from an invoice award, only that award is paid.',
    recovery_repayment: 'Record a confirmed repayment into an account or an approved deduction from commission due. Both reduce the amount the employee owes. Deduction reduces commission payable without moving cash.',
    recovery_waiver: 'Attach supporting approval to forgive an amount the employee owes. Posting reduces the recovery balance and recognizes a company loss. No cash moves.',
    recovery_hold: 'Pause automatic recovery deductions, optionally until a restart date. The employee still owes the same amount. The hold starts when posted.',
    recovery_resume: 'Resume automatic recovery deductions. The system offsets outstanding recovery against available commission due when this is posted. No cash moves.',
    delivery_correction: 'Correct retained delivery quantities from the Dispatch screen. Ledger and stock activity are not replayed.',
};
