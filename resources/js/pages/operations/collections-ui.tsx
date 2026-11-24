import { shortDate } from '@/lib/format';
import type { CSSProperties } from 'react';

export const aging = [
    ['not_due', 'Not due', '#14b8a6'],
    ['days_1_30', '1–30 days', '#f59e0b'],
    ['days_31_60', '31–60 days', '#ea580c'],
    ['days_61_90', '61–90 days', '#dc2626'],
    ['days_90_plus', '90+ days', '#991b1b'],
] as const;

export const flags = [
    ['promised', 'Promised'],
    ['broken', 'Broken promise'],
    ['no_follow_up', 'No follow-up yet'],
] as const;

export const outcomes = {
    unreachable: ['No answer', '#94a3b8'],
    promised: ['Promised to pay', '#1f4e79'],
    disputed: ['Disputed', '#dc2626'],
    statement_requested: ['Asked for statement', '#7c3aed'],
    reported_paid: ['Says already paid', '#059669'],
    visit_needed: ['Visit needed', '#d97706'],
    contacted: ['Contacted', '#0f8f80'],
} as const;

export type AgingKey = (typeof aging)[number][0];
export type Flag = (typeof flags)[number][0];
export type Outcome = keyof typeof outcomes;
export type Summary = {
    invoices: number; customers: number; outstanding: number; overdue: number;
    oldest_due: string | null; last_contact_at: string | null; promised_amount: number;
    aging: Record<AgingKey, { count: number; amount: number }>; flags: Record<Flag, number>;
};
export type CollectionRow = {
    id: number; invoice_number: string; due_on: string; total_amount: number; paid_amount: number;
    outstanding: number; return_credit: number; applied_credit: number; aging_bucket: AgingKey; flag: Flag | null;
    customer_id: number; customer: { name: string | null; city: string | null; phone: string | null; archived: boolean };
    follow_up: { outcome: string; next_follow_up: string; created_at: string } | null;
    promise: { amount: number; date: string } | null;
};

export function overdueDays(date: string, today: string) {
    return Math.round((Date.parse(today) - Date.parse(date)) / 86_400_000);
}

export function agingKey(days: number): AgingKey {
    return days <= 0 ? 'not_due' : days <= 30 ? 'days_1_30' : days <= 60 ? 'days_31_60' : days <= 90 ? 'days_61_90' : 'days_90_plus';
}

export function DueBadge({ date, today }: { date: string; today: string }) {
    const days = overdueDays(date, today);
    const band = agingKey(days);
    return <span className="od" data-quiet={days <= 0 || undefined} style={{ '--tone': aging.find(([key]) => key === band)?.[2] } as CSSProperties}>
        {days > 0 ? `${days} ${days === 1 ? 'day' : 'days'} overdue` : days === 0 ? 'Due today' : `Due in ${-days}d`}
    </span>;
}

export function contactNumber(raw: string | null) {
    for (const part of raw?.split(/[/;,]/) ?? []) {
        const input = part.replace(/[\s().-]/g, '');
        if (!/^\+?\d+$/.test(input)) continue;
        const digits = input.startsWith('+') ? input.slice(1) : input.startsWith('00') ? input.slice(2)
            : input.startsWith('0') ? '92' + input.slice(1) : input;
        if (/^[1-9]\d{8,14}$/.test(digits)) return '+' + digits;
    }
    return null;
}

export function shortDay(date: string) {
    return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(date.slice(0, 10)));
}

export function lastContact(date?: string | null) {
    return date ? `Last contact ${shortDay(date)}` : 'No follow-up yet';
}

export function followUpLabel(outcome: string) {
    return outcomes[outcome as Outcome]?.[0] ?? outcome.replaceAll('_', ' ');
}

export function dueDescription(date: string, today: string) {
    const days = overdueDays(date, today);
    return days > 0 ? `oldest ${days} ${days === 1 ? 'day' : 'days'} overdue` : days === 0 ? 'oldest due today' : `oldest due ${shortDate(date)}`;
}
