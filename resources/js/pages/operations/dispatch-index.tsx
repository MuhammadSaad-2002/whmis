import { fieldAction, fieldCard, FieldDatePicker, fieldGrid, FieldHeading, fieldHero, fieldHeroAction, fieldPage, FieldPager, fieldPrimary, FieldTile, type FieldPageLinks } from '@/components/field-work-ui';
import type { PaginatedData } from '@/components/paginator';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import AppLayout from '@/layouts/app-layout';
import { shortDate, weekdayDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Head, Link, router } from '@inertiajs/react';
import { ArrowRight, CalendarDays, ClipboardList, MapPin, SlidersHorizontal, Truck } from 'lucide-react';
import { useState } from 'react';
import { AdminDispatchIndex, type AdminDispatchProps } from './dispatch-index-admin';
import { label, StatusPill } from './dispatch-detail';
import { Field, selectClass } from './shared';

export type DispatchRow = {
    id: number; invoice_number: string; invoice_date: string; dispatch_status: string;
    planned_date: string | null; assignee: string | null;
    customer: { name: string; city: string | null } | null;
};
export type DispatchFilters = { search?: string; status?: string; date?: string; assignee_id?: string };
type FieldProps = {
    invoices: PaginatedData<DispatchRow> & FieldPageLinks; filters: DispatchFilters; scoped: true; today: string;
};
const states = ['untracked', 'pending', 'picking', 'packed', 'dispatched', 'partial', 'delivered', 'failed', 'closed'];

function MyDeliveries({ invoices, filters, today }: FieldProps) {
    const [filterOpen, setFilterOpen] = useState(false);
    const hasFilters = Boolean(filters.search || filters.status);
    const changeDate = (date: string) => {
        if (date === (filters.date ?? '')) return;
        router.get('/dispatch', { search: filters.search, status: filters.status, date: date || undefined }, { preserveState: true });
    };
    const title = 'My Deliveries';
    const dateTitle = filters.date === today ? 'Today’s deliveries' : filters.date ? 'Deliveries for ' + weekdayDate(filters.date) : 'Assigned deliveries';

    return <AppLayout><Head title={title} />
        <main className={fieldPage}>
            <header className={fieldHero}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
                        <p className="mt-1 text-sm text-brand-paper/80">Pick up, dispatch, and record your assigned deliveries.</p>
                    </div>
                    <Button variant="outline" asChild className={fieldHeroAction}><Link href="/booker/workday"><ClipboardList />My Workday</Link></Button>
                </div>
                <FieldDatePicker date={filters.date} today={today} changeDate={changeDate} dateLabel="Planned delivery date" groupLabel="Choose delivery day" emptyLabel="All delivery dates" />
            </header>
            <section aria-labelledby="assigned-deliveries" className="min-w-0 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                    <FieldHeading id="assigned-deliveries" title={dateTitle} count={invoices.total} />
                    <div className="flex flex-wrap items-center gap-1.5">
                        {filters.date && <Button type="button" variant="ghost" className={fieldAction} onClick={() => changeDate('')}>All dates</Button>}
                        <Button type="button" variant={hasFilters ? 'secondary' : 'outline'} className={fieldAction}
                            aria-controls="field-delivery-filters" aria-expanded={filterOpen} onClick={() => setFilterOpen(open => !open)}>
                            <SlidersHorizontal />Filters{hasFilters && <span className="sr-only"> applied</span>}
                        </Button>
                    </div>
                </div>
                <div id="field-delivery-filters" hidden={!filterOpen}>
                    {filterOpen && <FieldDispatchFilters key={JSON.stringify(filters)} filters={filters} close={() => setFilterOpen(false)} />}
                </div>
                {invoices.data.length ? <div className={fieldGrid}>
                    {invoices.data.map(invoice => <FieldInvoiceCard key={invoice.id} invoice={invoice} today={today} />)}
                </div> : <div className="rounded-2xl border border-dashed bg-card p-5 text-center">
                    <Truck aria-hidden="true" className="mx-auto mb-2 size-5 text-muted-foreground" />
                    <p className="font-bold">{filters.date || hasFilters ? 'No deliveries match this view' : 'No assigned deliveries yet'}</p>
                    <p className="mt-0.5 text-sm text-muted-foreground">{filters.date || hasFilters ? 'Choose another day or clear your filters.' : 'Deliveries will appear here when assigned to you.'}</p>
                </div>}
                <FieldPager page={invoices} label="Delivery pages" />
            </section>
        </main>
    </AppLayout>;
}

function FieldDispatchFilters({ filters, close }: { filters: DispatchFilters; close: () => void }) {
    const [search, setSearch] = useState(filters.search ?? '');
    const [status, setStatus] = useState(filters.status ?? '');
    return <form className={cn(fieldCard, 'grid items-end gap-2.5 sm:grid-cols-[minmax(0,1fr)_minmax(0,12rem)_auto]')} onSubmit={event => {
        event.preventDefault();
        router.get('/dispatch', { date: filters.date, search: search.trim() || undefined, status: status || undefined }, { preserveState: true, onSuccess: close });
    }}>
        <Field label="Find invoice or customer"><Input className="min-h-11 rounded-xl text-base sm:text-sm" placeholder="Invoice or customer…" maxLength={100} value={search} onChange={event => setSearch(event.target.value)} /></Field>
        <Field label="Status"><select className={cn(selectClass, 'min-h-11 rounded-xl')} value={status} onChange={event => setStatus(event.target.value)}>
            <option value="">All statuses</option>{states.filter(state => state !== 'untracked').map(state => <option key={state} value={state}>{label(state)}</option>)}
        </select></Field>
        <div className="flex flex-wrap items-center gap-2">
            <Button className={cn(fieldAction, 'flex-1')} type="submit">Apply filters</Button>
            <Button className={fieldAction} type="button" variant="ghost" onClick={() => router.get('/dispatch', { date: filters.date }, { preserveState: true, onSuccess: close })}>Clear</Button>
        </div>
    </form>;
}

function FieldInvoiceCard({ invoice, today }: { invoice: DispatchRow; today: string }) {
    return <article className={cn(fieldCard, 'flex flex-col gap-3')}>
        <div className="flex items-start gap-2.5">
            <FieldTile tone="bg-chart-1/10 text-chart-1"><Truck /></FieldTile>
            <div className="min-w-0 space-y-0.5">
                <p className="break-words text-xs font-bold tracking-wide text-chart-1">{invoice.invoice_number}</p>
                <h3 className="break-words text-base leading-snug font-bold">{invoice.customer?.name ?? 'Customer'}</h3>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-muted-foreground">
                    {invoice.customer?.city && <span className="flex gap-1 break-words"><MapPin className="mt-0.5 size-3.5 shrink-0" />{invoice.customer.city}</span>}
                    <span>Invoice · {shortDate(invoice.invoice_date)}</span>
                </div>
            </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-muted/45 px-2.5 py-2">
            <div className="flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground">
                <CalendarDays className="size-4 shrink-0" />
                <span>{invoice.planned_date === today ? 'Planned for today' : invoice.planned_date ? 'Planned ' + shortDate(invoice.planned_date) : 'No planned date'}</span>
            </div>
            <StatusPill state={invoice.dispatch_status} />
        </div>
        <Button className={cn(fieldAction, fieldPrimary, 'mt-auto w-full')} asChild>
            <Link href={route('dispatch.show', invoice.id, false)} aria-label={'Open delivery ' + invoice.invoice_number}>Open delivery<ArrowRight /></Link>
        </Button>
    </article>;
}

export default function DispatchIndex(props: FieldProps | (AdminDispatchProps & { scoped: false })) {
    return props.scoped ? <MyDeliveries {...props} /> : <AdminDispatchIndex {...props} />;
}
