import type { PaginatedData } from '@/components/paginator';
import { Button } from '@/components/ui/button';
import { shiftDate, weekdayDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Link } from '@inertiajs/react';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';

export const fieldPage = 'mx-auto flex w-full min-w-0 flex-col gap-5 px-3 pt-3 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:px-5 sm:pt-4';
export const fieldHero = 'brand-panel rounded-2xl px-3.5 py-4 sm:px-5 sm:py-5';
export const fieldSurface = 'min-w-0 rounded-2xl border bg-card text-card-foreground shadow-sm';
export const fieldCard = fieldSurface + ' p-3.5 sm:p-4';
export const fieldAction = 'min-h-11 rounded-xl px-2.5 sm:px-3';
export const fieldHeroAction = 'min-h-11 rounded-xl border-brand-paper/25 bg-brand-paper/10 px-2.5 text-brand-paper hover:bg-brand-paper/20 hover:text-brand-paper sm:px-3';
export const fieldPrimary = 'bg-chart-2 text-brand-paper hover:bg-chart-2/90';
export const fieldGrid = 'grid grid-cols-[repeat(auto-fill,minmax(min(100%,340px),1fr))] gap-3';

export function FieldTile({ tone, children }: { tone: string; children: ReactNode }) {
    return <span aria-hidden="true" className={cn('grid size-10 shrink-0 place-items-center rounded-xl text-sm font-bold [&_svg]:size-5 sm:size-11', tone)}>{children}</span>;
}

export function FieldHeading({ id, title, count, note }: { id: string; title: string; count: number; note?: string }) {
    return <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-0.5">
        <h2 id={id} className="text-lg font-bold tracking-tight sm:text-xl">{title}</h2>
        <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-bold text-secondary-foreground">{count}</span>
        {note && <span className="text-sm text-muted-foreground sm:ml-auto">{note}</span>}
    </div>;
}

export function FieldDatePicker({ date, today, changeDate, dateLabel, groupLabel, emptyLabel = 'All dates' }: {
    date?: string; today: string; changeDate: (date: string) => void; dateLabel: string; groupLabel: string; emptyLabel?: string;
}) {
    const baseDate = date || today;
    const prefix = date === today ? 'Today · ' : date === shiftDate(today, 1) ? 'Tomorrow · ' : date === shiftDate(today, -1) ? 'Yesterday · ' : '';
    return <div className="mt-3.5 flex flex-wrap items-center gap-1.5" role="group" aria-label={groupLabel}>
        <Button type="button" variant="outline" size="icon" className={cn(fieldHeroAction, 'size-11 shrink-0 p-0')} aria-label="Previous day" onClick={() => changeDate(shiftDate(baseDate, -1))}><ChevronLeft /></Button>
        <label className={cn(fieldHeroAction, 'relative flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden border text-sm font-bold focus-within:ring-2 focus-within:ring-brand-mint sm:max-w-64')}>
            <CalendarDays className="size-4 shrink-0" /><span className="min-w-0 leading-tight">{date ? prefix + weekdayDate(date) : emptyLabel}</span>
            <input type="date" aria-label={dateLabel} className="absolute inset-0 h-full w-full cursor-pointer opacity-0 [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:h-auto [&::-webkit-calendar-picker-indicator]:w-auto"
                value={date ?? ''} onChange={event => changeDate(event.target.value)} />
        </label>
        <Button type="button" variant="outline" size="icon" className={cn(fieldHeroAction, 'size-11 shrink-0 p-0')} aria-label="Next day" onClick={() => changeDate(shiftDate(baseDate, 1))}><ChevronRight /></Button>
        <Button type="button" className="min-h-11 rounded-xl bg-brand-mint px-2.5 font-bold text-brand-navy hover:bg-brand-mint/90 disabled:bg-brand-paper/15 disabled:text-brand-paper/80 disabled:opacity-100" disabled={date === today} onClick={() => changeDate(today)}>Today</Button>
    </div>;
}

export type FieldPageLinks = { next_page_url: string | null; prev_page_url: string | null };

export function FieldPager({ page, label }: { page: Pick<PaginatedData<unknown>, 'last_page' | 'current_page'> & FieldPageLinks; label: string }) {
    if (page.last_page <= 1) return null;
    return <nav aria-label={label} className="flex items-center justify-between gap-2">
        {page.prev_page_url ? <Button variant="outline" asChild className={fieldAction}><Link href={page.prev_page_url} preserveScroll preserveState><ChevronLeft />Previous</Link></Button>
            : <Button variant="outline" className={fieldAction} disabled><ChevronLeft />Previous</Button>}
        <span className="text-center text-xs text-muted-foreground">Page {page.current_page} of {page.last_page}</span>
        {page.next_page_url ? <Button variant="outline" asChild className={fieldAction}><Link href={page.next_page_url} preserveScroll preserveState>Next<ChevronRight /></Link></Button>
            : <Button variant="outline" className={fieldAction} disabled>Next<ChevronRight /></Button>}
    </nav>;
}
