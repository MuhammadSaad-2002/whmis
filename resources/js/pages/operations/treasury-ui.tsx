import { money } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Banknote, Landmark, UserRound, Wallet } from 'lucide-react';
import type { ComponentPropsWithoutRef } from 'react';
import type { Staff } from './shared';

export type Account = {
    id: number; name: string; kind: string; opening_paisa: number; opening_reference: string | null;
    balance_paisa: number; custodian_id: number | null; operators: Staff[];
};

export const cash = (paisa: number) => money(Number(paisa) / 100);
export const kindText = (kind: string) => kind.replaceAll('_', ' ').replace(/^\w/, (first) => first.toUpperCase());

const accountStyles = {
    bank: { icon: Landmark, tone: 'bg-chart-1/12 text-chart-1' },
    cash: { icon: Banknote, tone: 'bg-accent text-accent-foreground' },
    custody: { icon: UserRound, tone: 'bg-chart-5/12 text-chart-5' },
    unknown: { icon: Wallet, tone: 'bg-muted text-muted-foreground' },
};

function accountStyle(kind: string) {
    if (kind === 'petty_cash') return accountStyles.cash;
    return accountStyles[kind as keyof typeof accountStyles] ?? accountStyles.unknown;
}

export function AccountGlyph({ kind, className }: { kind: string; className?: string }) {
    const { icon: Icon, tone } = accountStyle(kind);
    return <span aria-hidden="true" className={cn('grid size-8 shrink-0 place-items-center rounded-lg', tone, className)}><Icon className="size-4" /></span>;
}

export function KindBadge({ kind }: { kind: string }) {
    return <span className={cn('inline-flex shrink-0 rounded-md px-1.5 py-0.5 text-[0.6875rem] leading-tight font-bold tracking-wide uppercase', accountStyle(kind).tone)}>{kindText(kind)}</span>;
}

export function Avatar({ name, className }: { name: string; className?: string }) {
    const initials = name.trim().split(/\s+/).slice(0, 2).map((part) => part[0] ?? '').join('').toUpperCase();
    const tones = ['bg-primary text-primary-foreground', 'bg-accent text-accent-foreground', 'bg-secondary text-secondary-foreground'];
    const tone = tones[(name.codePointAt(0) ?? 0) % tones.length];
    return <span title={name} aria-hidden="true" className={cn('grid size-6 shrink-0 place-items-center rounded-full text-[0.625rem] font-bold', tone, className)}>{initials}</span>;
}

export function PaneCard({ className, ...props }: ComponentPropsWithoutRef<'section'>) {
    return <section className={cn('min-w-0 rounded-xl border bg-card text-card-foreground shadow-sm', className)} {...props} />;
}
