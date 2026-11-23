import { type PaginatedData } from '@/components/paginator';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import AppLayout from '@/layouts/app-layout';
import { money, shortDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Head, Link, router, useForm } from '@inertiajs/react';
import { CalendarDays, ChevronLeft, ChevronRight, ClipboardList, MapPin, Plus, RotateCcw, Search, Store } from 'lucide-react';
import { useState } from 'react';
import { Errors, todayPK } from '../operations/shared';

const PATH = '/booker/workday';
const VISIT_OUTCOMES = [
    { value: 'planned', label: 'Planned', tone: 'bg-secondary text-secondary-foreground' },
    { value: 'visited', label: 'Visited', tone: 'bg-accent text-accent-foreground' },
    { value: 'no_order', label: 'No order', tone: 'bg-amber-50 text-amber-900 dark:bg-amber-950/70 dark:text-amber-200' },
    { value: 'closed', label: 'Outlet closed', tone: 'bg-muted text-muted-foreground' },
] as const;

interface Customer {
    id: number;
    name: string;
    city: string | null;
    account_balance: string | number | null;
    visit: { outcome: (typeof VISIT_OUTCOMES)[number]['value']; notes: string | null } | null;
    last_booking: { id: number; booking_number: string; booking_date: string; status: string } | null;
}

type Filters = { date: string; search: string };
type Customers = PaginatedData<Customer> & { prev_page_url: string | null; next_page_url: string | null };

function shiftDate(date: string, days: number) {
    const day = new Date(`${date}T00:00:00Z`);
    day.setUTCDate(day.getUTCDate() + days);
    return day.toISOString().slice(0, 10);
}

function WorkdayFilters({ filters, today }: { filters: Filters; today: string }) {
    const [search, setSearch] = useState(filters.search);
    const visit = (patch: Partial<Filters>) => router.get(PATH, { ...filters, ...patch }, { preserveState: true, preserveScroll: true });

    return (
        <div className="grid gap-2.5 rounded-2xl border bg-card p-2.5 shadow-sm sm:flex sm:flex-wrap sm:items-center sm:justify-between sm:p-3">
            <div className="flex min-w-0 items-center gap-1.5" role="group" aria-label="Choose workday">
                <Button type="button" variant="outline" size="icon" className="size-11 shrink-0" aria-label="Previous day" onClick={() => visit({ date: shiftDate(filters.date, -1) })}>
                    <ChevronLeft aria-hidden="true" />
                </Button>
                <Input aria-label="Visit date" type="date" className="h-11 min-w-0 flex-1 px-1.5 sm:w-40 sm:px-3" value={filters.date}
                    onChange={(event) => { if (event.target.value) visit({ date: event.target.value }); }} />
                <Button type="button" variant="outline" size="icon" className="size-11 shrink-0" aria-label="Next day" onClick={() => visit({ date: shiftDate(filters.date, 1) })}>
                    <ChevronRight aria-hidden="true" />
                </Button>
                <Button type="button" variant="ghost" className="h-11 shrink-0 px-2.5" disabled={filters.date === today} onClick={() => visit({ date: today })}>Today</Button>
            </div>

            <form role="search" className="flex min-w-0 gap-1.5 sm:w-80" onSubmit={(event) => { event.preventDefault(); visit({ search: search.trim() }); }}>
                <div className="relative min-w-0 flex-1">
                    <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input aria-label="Search assigned customers" placeholder="Customer or city" className="h-11 pl-9" value={search} maxLength={100} onChange={(event) => setSearch(event.target.value)} />
                </div>
                <Button type="submit" variant="secondary" className="h-11 shrink-0 px-3.5">Search</Button>
            </form>
        </div>
    );
}

export default function Workday({ customers, filters }: { customers: Customers; filters: Filters }) {
    const today = todayPK();
    const count = customers.total;

    return (
        <AppLayout>
            <Head title="My Workday" />
            <main className="flex w-full min-w-0 flex-col gap-3 p-3 sm:gap-4 sm:p-5 lg:p-6">
                <header className="brand-panel flex flex-wrap items-center justify-between gap-2 rounded-2xl px-3.5 py-3 sm:px-5 sm:py-4">
                    <div className="min-w-0">
                        <h1 className="text-xl font-bold tracking-tight sm:text-3xl">My Workday</h1>
                        <p className="mt-0.5 flex items-center gap-1.5 text-xs text-brand-paper/80 sm:text-sm">
                            <CalendarDays aria-hidden="true" className="size-3.5 shrink-0" />
                            <time dateTime={filters.date}>{shortDate(filters.date)}</time>
                        </p>
                    </div>
                    <Button variant="outline" size="sm" className="h-11 border-white/30 bg-white/10 px-2.5 text-brand-paper hover:bg-white/20 hover:text-white sm:px-3" asChild>
                        <Link href="/bookings"><ClipboardList aria-hidden="true" /> My bookings</Link>
                    </Button>
                </header>

                <WorkdayFilters key={filters.search} filters={filters} today={today} />

                <section aria-labelledby="customers-title" className="min-w-0 space-y-2.5">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-2 px-0.5">
                        <h2 id="customers-title" className="text-base font-semibold sm:text-lg">Assigned customers</h2>
                        <p className="text-xs text-muted-foreground" role="status">
                            {count} {filters.search ? (count === 1 ? 'match' : 'matches') : (count === 1 ? 'customer' : 'customers')}
                        </p>
                    </div>

                    {filters.search && (
                        <div className="flex items-center justify-between gap-2 rounded-lg bg-secondary/55 px-2.5 text-sm">
                            <p className="min-w-0 break-words">Results for <span className="font-medium">“{filters.search}”</span></p>
                            <Button variant="ghost" className="h-11 shrink-0" onClick={() => router.get(PATH, { date: filters.date }, { preserveState: true, preserveScroll: true })}>Clear search</Button>
                        </div>
                    )}

                    {!customers.data.length ? (
                        <div className="rounded-xl border border-dashed bg-card p-6 text-center">
                            <Store aria-hidden="true" className="mx-auto mb-2 size-6 text-muted-foreground" />
                            <p className="font-semibold">{filters.search ? 'No customers match this search' : 'No assigned customers yet'}</p>
                            <p className="mt-1 text-sm text-muted-foreground">
                                {filters.search ? 'Try a different customer name or city.' : 'Ask your administrator to assign customers to your Booker profile.'}
                            </p>
                        </div>
                    ) : (
                        <div className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-3">
                            {customers.data.map((customer) => (
                                <CustomerCard key={`${filters.date}:${customer.id}`} customer={customer} date={filters.date} future={filters.date > today} />
                            ))}
                        </div>
                    )}
                </section>

                {customers.last_page > 1 && (
                    <nav className="flex items-center justify-between gap-2" aria-label="Customer pages">
                        <PageButton url={customers.prev_page_url} direction="Previous" />
                        <span className="text-center text-xs text-muted-foreground sm:text-sm">Page {customers.current_page} of {customers.last_page}</span>
                        <PageButton url={customers.next_page_url} direction="Next" />
                    </nav>
                )}
            </main>
        </AppLayout>
    );
}

function PageButton({ url, direction }: { url: string | null; direction: 'Previous' | 'Next' }) {
    const Icon = direction === 'Next' ? ChevronRight : ChevronLeft;
    const contents = <><Icon aria-hidden="true" className={direction === 'Next' ? 'order-last' : ''} /> {direction}</>;
    const className = 'h-11 gap-1 px-2.5 sm:px-3';
    return url
        ? <Button variant="outline" className={className} asChild><Link href={url} preserveState>{contents}</Link></Button>
        : <Button variant="outline" className={className} disabled>{contents}</Button>;
}

function CustomerCard({ customer, date, future }: { customer: Customer; date: string; future: boolean }) {
    const visit = VISIT_OUTCOMES.find(({ value }) => value === customer.visit?.outcome);
    const balance = Number(customer.account_balance ?? 0);
    const lastBooking = customer.last_booking;

    return (
        <article aria-labelledby={`customer-${customer.id}`} className="flex min-w-0 flex-col gap-2.5 rounded-xl border bg-card p-3 shadow-xs sm:p-3.5">
            <div className="flex flex-wrap items-start gap-x-2 gap-y-1.5">
                <div className="min-w-0 flex-[1_1_9rem]">
                    <h3 id={`customer-${customer.id}`} className="break-words text-sm leading-snug font-semibold sm:text-base">{customer.name}</h3>
                    {customer.city && <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground"><MapPin aria-hidden="true" className="size-3 shrink-0" /><span className="min-w-0 break-words">{customer.city}</span></p>}
                </div>
                <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', visit?.tone ?? 'bg-muted text-muted-foreground')}>
                    {visit?.label ?? 'Not planned'}
                </span>
            </div>

            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 rounded-lg bg-muted/65 px-2.5 py-1.5 text-xs">
                <span className="text-muted-foreground">{balance < 0 ? 'Customer credit' : 'Account balance'}</span>
                <span className="font-semibold tabular-nums">{money(balance)}</span>
            </div>
            {lastBooking && (
                <p className="break-words text-xs text-muted-foreground">
                    Last order: <span className="font-medium text-foreground">{lastBooking.booking_number}</span>
                    {' · '}{shortDate(lastBooking.booking_date)}{' · '}{lastBooking.status}
                </p>
            )}

            <div className="mt-auto flex flex-wrap gap-1.5">
                <Button asChild size="sm" className="h-11 min-w-0 flex-1 gap-1 px-2">
                    <Link href={`/bookings/create?customer_id=${customer.id}`}><Plus aria-hidden="true" /> New order</Link>
                </Button>
                <VisitEditor customer={customer} date={date} future={future} />
                {lastBooking && (
                    <Button asChild size="sm" variant="ghost" className="h-11 gap-1 px-2 text-accent-foreground">
                        <Link href={`/bookings/create?repeat_booking_id=${lastBooking.id}`} aria-label="Repeat last order" title="Repeat last order">
                            <RotateCcw aria-hidden="true" /> Repeat
                        </Link>
                    </Button>
                )}
            </div>
        </article>
    );
}

function VisitEditor({ customer, date, future }: { customer: Customer; date: string; future: boolean }) {
    const [open, setOpen] = useState(false);

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button size="sm" variant="outline" className="h-11 min-w-0 flex-1 gap-1 px-2">
                    <CalendarDays aria-hidden="true" /> {customer.visit ? 'Edit visit' : 'Plan visit'}
                </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[92dvh] min-w-0 overflow-y-auto overscroll-contain rounded-xl p-4 max-sm:top-auto max-sm:right-0 max-sm:bottom-0 max-sm:left-0 max-sm:max-w-none max-sm:translate-none max-sm:rounded-b-none max-sm:pb-[max(1rem,env(safe-area-inset-bottom))] max-sm:data-[state=closed]:animate-none max-sm:data-[state=open]:animate-none sm:w-[calc(100%-2rem)] sm:p-6">
                <DialogHeader className="pr-8 text-left">
                    <DialogTitle>{customer.visit ? 'Edit visit' : 'Plan visit'}</DialogTitle>
                    <DialogDescription className="break-words">{customer.name} · {shortDate(date)}</DialogDescription>
                </DialogHeader>
                <VisitForm customer={customer} date={date} future={future} onClose={() => setOpen(false)} />
            </DialogContent>
        </Dialog>
    );
}

function VisitForm({ customer, date, future, onClose }: { customer: Customer; date: string; future: boolean; onClose: () => void }) {
    const form = useForm({ visit_date: date, outcome: customer.visit?.outcome ?? 'planned', notes: customer.visit?.notes ?? '' });

    return (
        <form className="min-w-0 space-y-3.5" onSubmit={(event) => {
            event.preventDefault();
            form.put(`/booker/customers/${customer.id}/visit`, { preserveScroll: true, onSuccess: onClose });
        }}>
            <fieldset className="min-w-0">
                <legend className="mb-2 text-sm font-medium">Visit outcome</legend>
                <div className="grid grid-cols-2 gap-2">
                    {VISIT_OUTCOMES.map(({ value, label }) => (
                        <label key={value} className="min-w-0">
                            <input className="peer sr-only" type="radio" name="outcome" value={value}
                                checked={form.data.outcome === value} disabled={future && value !== 'planned'} onChange={() => form.setData('outcome', value)} />
                            <span className="flex min-h-11 cursor-pointer items-center justify-center rounded-lg border px-2 py-1 text-center text-sm peer-checked:border-ring peer-checked:bg-accent peer-checked:font-semibold peer-checked:text-accent-foreground peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring peer-disabled:cursor-not-allowed peer-disabled:opacity-50">
                                {label}
                            </span>
                        </label>
                    ))}
                </div>
                {future && <p className="mt-2 text-xs text-muted-foreground">Future visits can only be planned.</p>}
            </fieldset>
            <div className="grid gap-1.5">
                <Label htmlFor={`visit-notes-${customer.id}`}>Notes <span className="font-normal text-muted-foreground">(optional)</span></Label>
                <textarea id={`visit-notes-${customer.id}`} maxLength={1000} rows={3} placeholder="Add a note about this visit" className="w-full resize-y rounded-lg border border-input bg-background p-2.5 text-base focus-visible:outline-2 focus-visible:outline-ring sm:text-sm"
                    value={form.data.notes} onChange={(event) => form.setData('notes', event.target.value)} />
            </div>
            <Errors errors={form.errors} />
            <div className="flex gap-2">
                <Button type="button" variant="outline" className="h-11 flex-1" disabled={form.processing} onClick={onClose}>Cancel</Button>
                <Button type="submit" className="h-11 flex-1" disabled={form.processing}>{form.processing ? 'Saving…' : 'Save visit'}</Button>
            </div>
        </form>
    );
}
