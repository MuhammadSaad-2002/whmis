import { fieldAction as action, fieldCard as card, FieldDatePicker, fieldGrid as routeGrid, FieldHeading as SectionHeading, fieldHero, fieldHeroAction as heroButton, fieldPage, FieldPager as PageControls, fieldPrimary, FieldTile as Tile } from '@/components/field-work-ui';
import { Button } from '@/components/ui/button';
import AppLayout from '@/layouts/app-layout';
import { amount, money, shortDate, weekdayDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Head, Link, router, useForm, usePage } from '@inertiajs/react';
import { Banknote, Check, ClipboardList, MapPin, Navigation, Phone, Plus, RotateCcw, Store, Truck } from 'lucide-react';
import { useEffect } from 'react';
import { label as deliveryLabel } from '../operations/dispatch-detail';
import { Errors } from '../operations/shared';
import { CollectionEditor, CollectionSummary, VisitEditor } from './workday-sheets';
import { OUTCOMES, WORKDAY, type BookStats, type Collections, type Delivery, type DirectoryCustomer, type Filters, type Page, type RouteVisit } from './workday-types';

type Props = {
    today: string; filters: Filters; deliveries: Page<Delivery> | null; visits: Page<RouteVisit> | null;
    customers: Page<DirectoryCustomer> | null; bookerStats: BookStats | null; pendingDeliveries: number; collections: Collections | null;
};
const customerGrid = 'grid grid-cols-[repeat(auto-fill,minmax(min(100%,320px),1fr))] gap-3';
const tones = ['bg-chart-1 text-brand-paper', 'bg-chart-2 text-brand-paper', 'bg-chart-5 text-brand-paper', 'bg-primary text-primary-foreground', 'bg-chart-4 text-brand-paper'];
const initials = (name: string) => name.replace(/phaa?rmacy|chemist/ig, '').trim().split(/\s+/).slice(0, 2).map(word => word[0] ?? '').join('').toUpperCase() || name.slice(0, 2).toUpperCase();
const collectionsMoney = (paisa: number) => money(Number(paisa) / 100);

export default function Workday(p: Props) {
    const { auth } = usePage<{ auth: { user: { name: string } | null } }>().props;
    const { date, filter, search, sort, size } = p.filters;
    // Old bookmarked links may still include now-hidden directory filters.
    useEffect(() => {
        if (filter === 'all' && !search && sort === 'name') return;
        // Wait for the parent Inertia app to initialize its router on a direct load.
        const cleanup = window.setTimeout(() => {
            router.get(WORKDAY, { date, size }, { preserveScroll: true, preserveState: true, replace: true });
        }, 0);
        return () => window.clearTimeout(cleanup);
    }, [date, filter, search, sort, size]);

    const changeDate = (value: string) => {
        if (!value || value === date) return;
        router.get(WORKDAY, { date: value, size: 12 }, { preserveScroll: true, preserveState: true, replace: true });
    };

    return <AppLayout><Head title="My Workday" />
        <main className={fieldPage}>
            <Hero {...p} name={auth.user?.name} changeDate={changeDate} />
            <section aria-labelledby="workday-route" className="min-w-0 space-y-2.5">
                <SectionHeading id="workday-route" title={date === p.today ? 'Today’s route' : 'Route for ' + weekdayDate(date)}
                    count={Number(p.deliveries?.total ?? 0) + Number(p.visits?.total ?? 0)} note="Deliveries and planned visits" />
                {!(p.deliveries?.data.length || p.visits?.data.length) && <p className="rounded-2xl border border-dashed bg-card p-5 text-center text-sm text-muted-foreground">Nothing planned for {date === p.today ? 'today' : shortDate(date)}.{p.customers ? ' Use Plan visit below to build your route.' : ''}</p>}
                <div className={routeGrid}>
                    {p.deliveries?.data.map(task => <DeliveryCard key={task.id} task={task} date={date} today={p.today} />)}
                    {p.visits?.data.map(visit => <VisitCard key={visit.id} visit={visit} date={date} today={p.today} />)}
                </div>
                {p.deliveries && <PageControls page={p.deliveries} label="Delivery pages" />}
                {p.visits && <PageControls page={p.visits} label="Visit pages" />}
            </section>
            {p.customers && p.bookerStats && <Directory page={p.customers} date={date} size={size} today={p.today} total={p.bookerStats.all} />}
        </main>
    </AppLayout>;
}

function Hero(p: Props & { name?: string; changeDate: (date: string) => void }) {
    const { date } = p.filters;
    const hour = Number(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hourCycle: 'h23', timeZone: 'Asia/Karachi' }).format(new Date()));
    const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
    const stats = [
        ...(p.deliveries ? [{ label: 'Deliveries', value: p.deliveries.total, description: p.pendingDeliveries + ' pending' }] : []),
        ...(p.visits ? [{ label: 'Visits planned', value: p.visits.total, description: (p.bookerStats?.completedVisits ?? 0) + ' done' }] : []),
        ...(p.collections ? [{ label: 'Collected', value: collectionsMoney(p.collections.cash + p.collections.online), description: p.collections.pending ? p.collections.pending + ' awaiting Finance' : p.collections.entryCount ? 'Reported collections' : 'Nothing reported' }] : []),
        ...(p.bookerStats ? [
            { label: 'Due from customers', value: money(p.bookerStats.dueAmount), description: p.bookerStats.due + (p.bookerStats.due === 1 ? ' customer' : ' customers') },
            { label: date === p.today ? 'Orders today' : 'Orders', value: p.bookerStats.orders, description: 'Bookings created' },
        ] : []),
    ];
    return <header className={fieldHero}>
        <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0"><p className="break-words text-sm text-brand-paper/80">{greeting}{p.name ? ', ' + p.name : ''}</p><h1 className="text-2xl font-bold tracking-tight sm:text-3xl">My Workday</h1></div>
            <div className="flex w-full flex-wrap gap-2 sm:w-auto max-sm:[&>*]:min-w-0 max-sm:[&>*]:flex-1">
                {p.collections && <CollectionSummary data={p.collections} date={date} className={heroButton} />}
                {p.customers && <Button variant="outline" className={heroButton} asChild><Link href="/bookings"><ClipboardList />My bookings</Link></Button>}
            </div>
        </div>
        <FieldDatePicker date={date} today={p.today} changeDate={p.changeDate} dateLabel="Workday date" groupLabel="Choose workday" />
        {stats.length > 0 && <dl className={cn('mt-3.5 grid grid-cols-2 gap-2 sm:gap-2.5',
            stats.length > 2 && 'grid-cols-3', stats.length > 3 && 'min-[901px]:grid-cols-5')}>
            {stats.map((stat, index) => <div key={stat.label} className={cn('min-w-0 rounded-xl border border-brand-paper/15 bg-brand-paper/10 px-2 py-2.5 sm:px-3',
                stats.length > 3 && index >= 3 && 'max-[901px]:hidden')}>
                <dt className="text-xs leading-tight font-medium text-brand-paper/80 sm:text-sm">{stat.label}</dt>
                <dd className="mt-1 break-words text-base leading-tight font-bold tabular-nums sm:text-xl">{stat.value}</dd>
                <dd className="mt-0.5 text-xs leading-snug text-brand-paper/80">{stat.description}</dd>
            </div>)}
        </dl>}
    </header>;
}

function navigate(address: string) {
    return 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(address);
}

function DeliveryCard({ task, date, today }: { task: Delivery; date: string; today: string }) {
    const customer = task.customer;
    const address = [customer?.address, customer?.city].filter(Boolean).join(', ');
    const destination = customer?.address ? address : customer?.city ? [customer.name, customer.city].join(', ') : '';
    const dial = customer?.phone?.split(/[/,;|]/)[0].replace(/[^\d+]/g, '') ?? '';
    const canCall = /^\+?\d{7,15}$/.test(dial);
    const outstanding = Math.max(0, Number(task.outstanding));
    const openCollections = task.can_collect && date === today;
    return <article className={cn(card, 'flex flex-col gap-3')}>
        <div className="flex items-start gap-2.5">
            <Tile tone="bg-chart-1/10 text-chart-1"><Truck /></Tile>
            <div className="min-w-0">
                <p className="text-xs font-bold tracking-wide text-chart-1 uppercase">Delivery · {deliveryLabel(task.delivery_status)}</p>
                <h3 className="break-words text-base font-bold">{customer?.name ?? 'Customer'}</h3>
                <p className="break-words text-sm text-muted-foreground">{task.invoice_number}{address ? ' · ' + address : ''}</p>
                {task.planned_date < date && <p className="text-xs font-semibold text-chart-4">Carried over · {shortDate(task.planned_date)}</p>}
            </div>
        </div>
        <dl className="grid grid-cols-3 divide-x rounded-xl border bg-muted/45">
            {[
                ['Invoice', task.total_amount], ['Paid', task.paid_amount], ['Outstanding', outstanding],
            ].map(([label, value]) => <div key={label} className="min-w-0 px-2 py-2 sm:px-3"><dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className={cn('break-words text-sm font-bold tabular-nums', label === 'Outstanding' && (outstanding > 0 ? 'text-destructive' : 'text-chart-2'))}>{amount(value)}</dd></div>)}
        </dl>
        {task.pending_paisa > 0 && <p className="flex items-start gap-1.5 rounded-lg bg-accent/60 px-2.5 py-2 text-xs font-semibold text-accent-foreground"><Banknote className="size-4 shrink-0" />{collectionsMoney(task.pending_paisa)} reported · awaiting Finance</p>}
        <div className="mt-auto flex min-w-0 flex-wrap gap-1.5">
            <Button asChild className={cn(action, fieldPrimary, 'min-w-[8rem] flex-1')}><Link href={'/dispatch/' + task.id}><Truck />Open delivery</Link></Button>
            {openCollections && <CollectionEditor task={task} />}
            {(canCall || destination) && <div className="ml-auto flex shrink-0 gap-1.5">
                {canCall && <Button size="icon" variant="outline" className="size-11 shrink-0 rounded-xl" asChild><a aria-label={'Call ' + (customer?.name ?? 'customer')} href={'tel:' + dial}><Phone /></a></Button>}
                {destination && <MapButton address={destination} name={customer?.name ?? 'customer'} />}
            </div>}
        </div>
    </article>;
}

function VisitCard({ visit, date, today }: { visit: RouteVisit; date: string; today: string }) {
    const { customer } = visit;
    const pending = visit.outcome === 'planned';
    const undo = visit.outcome === 'visited';
    const form = useForm({ visit_date: date, outcome: pending ? 'visited' : 'planned', notes: visit.notes ?? '' });
    const targetOutcome = pending ? 'visited' : 'planned';
    const balance = Number(customer.account_balance ?? 0);
    const location = customer.address ? [customer.address, customer.city].filter(Boolean).join(', ') : [customer.name, customer.city].filter(Boolean).join(', ');
    return <article className={cn(card, 'flex flex-col gap-3')}>
        <div className="flex items-start gap-2.5">
            <Tile tone="bg-accent text-accent-foreground">{pending ? <MapPin /> : <Check />}</Tile>
            <div className="min-w-0">
                <p className="text-xs font-bold tracking-wide text-chart-2 uppercase">Visit · {OUTCOMES[visit.outcome].label}</p>
                <h3 className="break-words text-base font-bold">{customer.name}</h3>
                {customer.city && <p className="text-sm text-muted-foreground">{customer.city}</p>}
                {visit.notes && <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-muted-foreground">{visit.notes}</p>}
            </div>
        </div>
        {balance > 0 && <Balance balance={balance} />}
        <Errors errors={form.errors} />
        <div className="mt-auto flex flex-wrap gap-1.5">
            {date <= today && (pending || undo) ? <Button type="button" className={cn(action, 'flex-1', pending && fieldPrimary)} variant={pending ? 'default' : 'outline'}
                disabled={form.processing} onClick={() => {
                    form.transform(data => ({ ...data, outcome: targetOutcome, notes: visit.notes ?? '' }));
                    form.put('/booker/customers/' + customer.id + '/visit', { preserveScroll: true });
                }}>
                {pending ? <><Check />Check in</> : <><RotateCcw />Undo check-in</>}
            </Button> : <VisitEditor customer={customer} date={date} today={today} visit={visit} />}
            <Button asChild className={action}><Link href={'/bookings/create?customer_id=' + customer.id}><Plus />Order</Link></Button>
            {(customer.city || customer.address) && <MapButton address={location} name={customer.name} />}
        </div>
    </article>;
}

function Directory({ page, date, size, today, total }: { page: Page<DirectoryCustomer>; date: string; size: number; today: string; total: number }) {
    const showMore = () => router.get(WORKDAY, { date, size: size + 12 }, {
        preserveScroll: true, preserveState: true, replace: true, only: ['customers', 'filters'],
    });
    const left = Math.max(0, page.total - (page.to ?? 0));

    return <section aria-labelledby="workday-customers" className="min-w-0 space-y-2.5">
        <SectionHeading id="workday-customers" title="My customers" count={total} />
        <p className="sr-only" role="status">{page.data.length} customers shown</p>
        {page.data.length ? <div className={customerGrid}>{page.data.map(customer => <CustomerCard key={customer.id} customer={customer} date={date} today={today} />)}</div>
            : <div className="rounded-2xl border bg-card p-6 text-center"><Store className="mx-auto mb-2 size-5 text-muted-foreground" />
                <p className="font-bold">{total ? 'No customers on this page' : 'No assigned customers yet'}</p>
                {!total && <p className="text-sm text-muted-foreground">Ask your administrator to assign customers to you.</p>}
            </div>}
        {left > 0 && size < 60 && page.current_page === 1 ? <div className="flex justify-center pt-1">
            <Button type="button" variant="outline" className="min-h-11 min-w-44 rounded-xl" onClick={showMore}>Show {Math.min(12, left)} more</Button>
        </div> : <PageControls page={page} label="Customer pages" />}
    </section>;
}

function CustomerCard({ customer, date, today }: { customer: DirectoryCustomer; date: string; today: string }) {
    const visit = customer.visit ? OUTCOMES[customer.visit.outcome] : null;
    const activeRoute = !!visit || customer.has_delivery;
    const booking = customer.last_booking;
    return <article className={cn(card, 'flex flex-col gap-3', activeRoute && 'border-ring/50 ring-1 ring-ring/15')}>
        <div className="flex items-start gap-2.5">
            <Tile tone={tones[customer.id % tones.length]}>{initials(customer.name)}</Tile>
            <div className="min-w-0 flex-1">
                <h3 className="break-words text-base leading-snug font-bold">{customer.name}</h3>
                <p className="mt-0.5 flex gap-1 text-sm text-muted-foreground"><MapPin className="mt-0.5 size-3.5 shrink-0" />{customer.city || 'City not set'}</p>
            </div>
            <span className={cn('max-w-[40%] shrink-0 rounded-full px-2 py-1 text-center text-xs leading-tight font-semibold', customer.has_delivery ? 'bg-chart-1/10 text-chart-1' : visit?.tone ?? 'bg-muted text-muted-foreground')}>
                {customer.has_delivery ? 'On delivery route' : visit?.label ?? 'Not planned'}
            </span>
        </div>
        <Balance balance={Number(customer.account_balance ?? 0)} />
        {booking && <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 break-words text-xs text-muted-foreground"><RotateCcw className="size-3.5 shrink-0" />Last order <strong className="text-foreground">{booking.booking_number}</strong> · {shortDate(booking.booking_date)}
            <span className="rounded-full bg-secondary px-1.5 py-0.5 font-semibold text-secondary-foreground">{booking.status.replaceAll('_', ' ')}</span></p>}
        <div className="mt-auto flex flex-wrap gap-1.5">
            <Button asChild className={cn(action, 'min-w-0 flex-1')}><Link href={'/bookings/create?customer_id=' + customer.id}><Plus />New order</Link></Button>
            {booking && <Button asChild variant="outline" className={action}><Link aria-label={'Repeat last order for ' + customer.name} href={'/bookings/create?repeat_booking_id=' + booking.id}><RotateCcw />Repeat</Link></Button>}
            <VisitEditor customer={customer} visit={customer.visit} date={date} today={today} compact={!!booking} />
        </div>
    </article>;
}

function Balance({ balance }: { balance: number }) {
    return <div className={cn('flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5 rounded-xl bg-muted/65 px-3 py-2 text-sm text-muted-foreground',
        balance > 0 ? 'bg-destructive/8 text-destructive' : balance < 0 && 'bg-accent text-accent-foreground')}>
        <span>{balance > 0 ? 'Balance due' : balance < 0 ? 'Customer credit' : 'Account balance'}</span><strong className="text-base tabular-nums">{money(balance)}</strong>
    </div>;
}

function MapButton({ address, name }: { address: string; name: string }) {
    return <Button size="icon" variant="outline" className="size-11 shrink-0 rounded-xl text-chart-1" asChild>
        <a href={navigate(address)} target="_blank" rel="noreferrer" aria-label={'Navigate to ' + name}><Navigation /></a>
    </Button>;
}
