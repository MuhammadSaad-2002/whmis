import { bookingDateTime, type BookingTimestamps } from '@/components/booking-timestamps';
import { type PaginatedData } from '@/components/paginator';
import { Button } from '@/components/ui/button';
import { SearchField } from '@/components/ui/search-field';
import { WorkspaceRecordLink } from '@/components/workspace/record-link';
import { useListKeyboardNav } from '@/hooks/use-list-keyboard-nav';
import { usePermissions } from '@/hooks/use-permissions';
import AppLayout from '@/layouts/app-layout';
import { shiftDate, shortDate, totalMoney } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Head, Link, router } from '@inertiajs/react';
import { ArrowRight, Check, ChevronDown, ChevronRight, Eye, List, Plus, SlidersHorizontal, UserRound, X } from 'lucide-react';
import { type ChangeEvent, useEffect, useRef, useState } from 'react';
import '../sales/invoice-list.css';

const statusLabels = {
    draft: 'Draft', pending: 'Pending approval', approved: 'Approved', partially_invoiced: 'Partially invoiced',
    converted: 'Converted', rejected: 'Rejected', cancelled: 'Cancelled',
} as const;
const columns = [['booking', 'Booking #'], [null, 'Customer'], [null, 'Booker'], ['date', 'Booking date'], ['created', 'Created / Updated (PKT)'], ['total', 'Total']] as const;
const presets = ['7', '30', '90', 'all'] as const;
const pageSizes = [10, 15, 25, 50];

type Status = keyof typeof statusLabels;
type Sort = Exclude<(typeof columns)[number][0], null>;
type Preset = (typeof presets)[number];
type Filters = { search?: string; status?: Status; customer_id?: string | number; from?: string; to?: string; sort?: Sort; direction?: 'asc' | 'desc'; per_page?: string };
type BookingRow = BookingTimestamps & {
    id: number; booking_number: string; booking_date: string; status: Status; total_amount: string; sales_invoice_id: number | null;
    customer?: { id: number; name: string; city: string | null }; booker?: { id: number; name: string };
};
type Props = {
    bookings: PaginatedData<BookingRow> & { per_page: number };
    customers: { id: number; name: string }[]; filters: Filters; today: string;
    statusSummary: { counts: Record<Status | 'all', number>; totals: Record<Status, number>; shown_value: number };
};

function range(preset: Preset, today: string) {
    return preset === 'all' ? { from: undefined, to: undefined } : { from: shiftDate(today, 1 - Number(preset)), to: today };
}

function countLabel(count: number) {
    return `${count.toLocaleString('en-PK')} booking${count === 1 ? '' : 's'}`;
}

function StatusPill({ status }: { status: Status }) {
    return <span className={`st ${status}`}>{statusLabels[status] ?? status}</span>;
}

const statusTimestamp = (booking: BookingRow) => ({
    pending: booking.submitted_at,
    approved: booking.approved_at,
    rejected: booking.rejected_at,
    converted: booking.converted_at,
    cancelled: booking.cancelled_at,
} as Partial<Record<Status, string | null>>)[booking.status] ?? null;

export default function BookingsIndex({ bookings, customers, filters, statusSummary, today }: Props) {
    const { can } = usePermissions();
    const [search, setSearch] = useState(filters.search ?? '');
    const [dates, setDates] = useState({ from: filters.from ?? '', to: filters.to ?? '' });
    const [filtersOpen, setFiltersOpen] = useState(false);
    const [dense, setDense] = useState(false);
    const [loading, setLoading] = useState(false);
    const searchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const { counts, totals, shown_value: shownValue } = statusSummary;
    const access = { canApprove: can('bookings.approve'), canConvert: can('bookings.convert') && can('view-supplier-details'), canViewSale: can('sales.view') && can('view-supplier-details') };
    const activeStatus = filters.status ?? 'all';
    const sort = filters.sort ?? 'date';
    const direction = filters.direction ?? 'desc';
    const inverted = Boolean(dates.from && dates.to && dates.from > dates.to);
    const activeFilters = Number(Boolean(filters.customer_id)) + Number(Boolean(filters.from || filters.to));
    const hasFilters = Boolean(activeFilters || filters.search?.trim() || filters.status);
    const activePreset = presets.find((preset) => {
        const applied = range(preset, today);
        return (applied.from ?? '') === dates.from && (applied.to ?? '') === dates.to;
    });
    const visiblePages = [...new Set([1, bookings.current_page - 1, bookings.current_page, bookings.current_page + 1, bookings.last_page])]
        .filter((page) => page >= 1 && page <= bookings.last_page).sort((a, b) => a - b);
    const { searchRef, onSearchKeyDown, rowProps } = useListKeyboardNav({
        rowCount: bookings.data.length, autoFocus: false,
        onActivate: (index) => router.visit(route('bookings.edit', bookings.data[index].id, false)),
    });

    useEffect(() => { setSearch(filters.search ?? ''); }, [filters.search]);
    useEffect(() => { setDates({ from: filters.from ?? '', to: filters.to ?? '' }); }, [filters.from, filters.to]);
    useEffect(() => () => clearTimeout(searchTimer.current), []);

    function visit(next: Filters, page = 1, replace = false) {
        clearTimeout(searchTimer.current);
        router.get(route('bookings.index', {}, false), { ...next, page: page === 1 ? undefined : page }, {
            only: ['bookings', 'filters', 'statusSummary', 'today'], preserveState: true, preserveScroll: true, replace,
            onStart: () => setLoading(true), onFinish: () => setLoading(false),
        });
    }

    const change = (next: Partial<Filters>) => visit({ ...filters, search: search.trim() || undefined, ...next });

    function updateSearch(event: ChangeEvent<HTMLInputElement>) {
        const value = event.target.value;
        setSearch(value);
        clearTimeout(searchTimer.current);
        searchTimer.current = setTimeout(() => {
            if ((filters.search ?? '') !== value.trim()) visit({ ...filters, search: value.trim() || undefined }, 1, true);
        }, 300);
    }

    function updateDates(next: typeof dates) {
        setDates(next);
        if (!next.from || !next.to || next.from <= next.to) change({ from: next.from || undefined, to: next.to || undefined });
    }

    function clearFilters() {
        setSearch('');
        setDates({ from: '', to: '' });
        visit({ sort: filters.sort, direction: filters.direction, per_page: filters.per_page });
    }

    function sortBy(key: Sort) {
        change({ sort: key, direction: key === sort ? (direction === 'asc' ? 'desc' : 'asc') : (key === 'booking' ? 'asc' : 'desc') });
    }

    return <AppLayout>
        <Head title="Bookings" />
        <main className="booking-register" aria-busy={loading}>
            <header className="hero">
                <div className="intro"><h1>Booking Orders</h1><p className="sub">{countLabel(counts.all)} · {counts.pending} awaiting approval</p></div>
                <div className="sp" />
                {can('bookings.create') && <Link className="hbtn pri" href={route('bookings.create', {}, false)}><Plus className="i" />New Booking</Link>}
            </header>
            <section className="kpis" aria-label="Booking summary">
                <BookingKpi title="Booking Value" color="#1f4e79" value={shownValue} note={countLabel(bookings.total)} />
                <BookingKpi title="Drafts" color="#64748b" value={totals.draft} note={countLabel(counts.draft)} />
                <BookingKpi title="Awaiting Approval" color="#e3a008" value={totals.pending} note={countLabel(counts.pending)} />
                <BookingKpi title="Approved / Invoicing" color="#087568" value={totals.approved + totals.partially_invoiced} note={countLabel(counts.approved + counts.partially_invoiced)} />
            </section>

            <section className="card list" aria-label="Booking list">
                <div className="tabs" role="group" aria-label="Filter by booking status">
                    {(['all', ...Object.keys(statusLabels)] as (Status | 'all')[]).filter((key) => !['rejected', 'cancelled'].includes(key) || counts[key] > 0 || activeStatus === key).map((key) =>
                        <button key={key} className={`tab ${activeStatus === key ? 'on' : ''}`} type="button" aria-pressed={activeStatus === key}
                            onClick={() => change({ status: key === 'all' ? undefined : key })}>{key === 'all' ? 'All' : statusLabels[key]}<span className="ct">{counts[key]}</span></button>)}
                </div>
                <div className="filters">
                    <SearchField ref={searchRef} onKeyDown={onSearchKeyDown} maxLength={120} aria-label="Search by booking number or customer" placeholder="Booking # or name" value={search} onChange={updateSearch} />
                    <button type="button" className="booking-filter-toggle" aria-expanded={filtersOpen} aria-controls="booking-filters" onClick={() => setFiltersOpen((open) => !open)}>
                        <SlidersHorizontal className="i" />Filters{activeFilters > 0 && <span className="chip g">{activeFilters}</span>}
                    </button>
                    <div id="booking-filters" className="booking-filter-controls" data-open={filtersOpen}>
                        <label className="fld choice"><UserRound className="i" /><select aria-label="Pharmacy" value={filters.customer_id ?? ''} onChange={(event) => change({ customer_id: event.target.value || undefined })}>
                            <option value="">All pharmacies</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
                        </select></label>
                        <label className="fld date-field"><small>From</small><input type="date" value={dates.from} onChange={(event) => updateDates({ ...dates, from: event.target.value })} /></label>
                        <label className="fld date-field"><small>To</small><input aria-invalid={inverted} type="date" value={dates.to} onChange={(event) => updateDates({ ...dates, to: event.target.value })} /></label>
                        <div className="presets" role="group" aria-label="Booking date presets">
                            {presets.map((preset) => <button key={preset} type="button" className={activePreset === preset ? 'on' : ''} aria-pressed={activePreset === preset} onClick={() => {
                                const next = range(preset, today);
                                setDates({ from: next.from ?? '', to: next.to ?? '' });
                                change(next);
                            }}>{preset === 'all' ? 'All' : `${preset}D`}</button>)}
                        </div>
                    </div>
                    {hasFilters && <button type="button" className="clear" onClick={clearFilters}>Clear filters</button>}<div className="fsp" />
                    <button type="button" className="dens" title="Toggle row density" aria-label="Compact rows" aria-pressed={dense} onClick={() => setDense((value) => !value)}><List className="i" /></button>
                    {inverted && <p className="filter-error" role="alert">To date must be on or after From date.</p>}
                </div>

                {!bookings.data.length ? <div className="empty">{hasFilters ? 'No bookings match these filters.' : 'No bookings found.'}</div> : <>
                    <div className="grid gap-2.5 p-2.5 sm:grid-cols-2 lg:hidden" aria-label="Booking cards">
                        {bookings.data.map((booking) => <BookingCard key={booking.id} booking={booking} {...access} />)}
                    </div>
                    <div className="tblwrap hidden lg:block" tabIndex={0} role="region" aria-label="Bookings table">
                        <table className={dense ? 'dense' : undefined}>
                            <thead><tr>
                                {columns.map(([key, label]) => <th key={label} scope="col" className={cn(key && 's', key === sort && 'act', key === 'total' && 'r')}
                                    aria-sort={key === sort ? (direction === 'asc' ? 'ascending' : 'descending') : undefined}>
                                    {key ? <button className="sort" type="button" onClick={() => sortBy(key)}>{label}<span className="ar" aria-hidden="true">{sort === key ? (direction === 'asc' ? '↑' : '↓') : '↕'}</span></button> : label}
                                </th>)}
                                <th scope="col">Status</th><th scope="col" className="r acts-head">Actions</th>
                            </tr></thead>
                            <tbody>
                                {bookings.data.map((booking, index) => {
                                    const href = route('bookings.edit', booking.id, false);
                                    return <tr key={booking.id} {...rowProps(index)} onClick={(event) => {
                                        if (event.target instanceof Element && !event.target.closest('a,button')) router.visit(href);
                                    }}>
                                        <td className="inv"><WorkspaceRecordLink href={href} number={booking.booking_number} /></td>
                                        <td className="cust"><b>{booking.customer?.name ?? '—'}</b>{booking.customer?.city && <small>{booking.customer.city}</small>}</td>
                                        <td>{booking.booker?.name ?? '—'}</td>
                                        <td>{shortDate(booking.booking_date)}</td>
                                        <td className="date">{bookingDateTime(booking.created_at)}<small className="muted">Updated: {bookingDateTime(booking.updated_at)}</small></td>
                                        <td className="r num number-cell">{totalMoney(booking.total_amount)}</td>
                                        <td className="date"><StatusPill status={booking.status} />{statusTimestamp(booking) && <small className="muted">{bookingDateTime(statusTimestamp(booking))}</small>}</td>
                                        <td className="acts-cell"><div className="acts"><BookingActions booking={booking} {...access} /><Link className="ib" title="Open booking" aria-label={`Open ${booking.booking_number}`} href={href}><Eye className="i" /></Link></div></td>
                                    </tr>;
                                })}
                            </tbody>
                            <tfoot><tr><td colSpan={5}>Total · {countLabel(bookings.total)}</td><td className="r num">{totalMoney(shownValue)}</td><td colSpan={2} /></tr></tfoot>
                        </table>
                    </div>
                </>}
                <div className="pager">
                    <span>{bookings.total ? `${bookings.from}–${bookings.to} of ${bookings.total}` : '0 results'}</span>
                    <label>· Rows <select aria-label="Rows per page" value={bookings.per_page} onChange={(event) => change({ per_page: event.target.value })}>
                        {pageSizes.map((size) => <option key={size} value={size}>{size}</option>)}
                    </select></label><div className="sp" />
                    <nav className="pg" aria-label="Booking pages">
                        <button type="button" disabled={bookings.current_page <= 1} onClick={() => visit(filters, bookings.current_page - 1)}>‹ Prev</button>
                        {visiblePages.map((page, index) => <span className="pg-entry" key={page}>
                            {index > 0 && page - visiblePages[index - 1] > 1 && <span className="muted hidden lg:inline">…</span>}
                            <button type="button" aria-current={bookings.current_page === page ? 'page' : undefined} className={bookings.current_page === page ? 'on' : ''} onClick={() => visit(filters, page)}>{page}</button>
                        </span>)}
                        <button type="button" disabled={bookings.current_page >= bookings.last_page} onClick={() => visit(filters, bookings.current_page + 1)}>Next ›</button>
                    </nav>
                </div>
            </section>
        </main>
    </AppLayout>;
}

function BookingKpi({ title, value, color, note }: { title: string; value: number; color: string; note: string }) {
    return <div className="card kpi"><div className="lbl"><i style={{ background: color }} />{title}</div><div className="val num">{totalMoney(value)}</div><div className="foot">{note}</div></div>;
}

type BookingActionsProps = { booking: BookingRow; canApprove: boolean; canConvert: boolean; canViewSale: boolean; mobile?: boolean };

function BookingCard(props: BookingActionsProps) {
    const { booking } = props;
    const latestStatus = statusTimestamp(booking);

    return <article className="booking-card overflow-hidden">
        <Link href={route('bookings.edit', booking.id, false)} className="group block px-3 py-2.5 hover:bg-accent/45 focus-visible:-outline-offset-2">
            <div className="flex flex-wrap items-center justify-between gap-1.5"><span className="inv text-xs">{booking.booking_number}</span><StatusPill status={booking.status} /></div>
            <div className="mt-1.5 flex items-center justify-between gap-2">
                <div className="min-w-0"><h2 className="break-words text-sm leading-snug font-semibold">{booking.customer?.name ?? 'Customer not recorded'}</h2>
                    {booking.customer?.city && <p className="muted break-words text-xs">{booking.customer.city}</p>}</div>
                <ChevronRight aria-hidden="true" className="muted size-4 shrink-0" />
            </div>
            <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5 text-xs">
                <time dateTime={booking.booking_date} className="muted">{shortDate(booking.booking_date)}</time>
                <span className="num text-sm font-bold">{totalMoney(booking.total_amount)}</span>
            </div>
        </Link>
        <details className="booking-card-details group">
            <summary className="muted flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-3 text-xs font-medium hover:bg-muted/50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
                Details &amp; timestamps <ChevronDown aria-hidden="true" className="size-4 shrink-0 group-open:rotate-180" />
            </summary>
            <dl className="grid grid-cols-2 gap-2.5 px-3 pb-3 text-xs">
                <div><dt className="muted">Created (PKT)</dt><dd>{bookingDateTime(booking.created_at)}</dd></div>
                <div><dt className="muted">Updated (PKT)</dt><dd>{bookingDateTime(booking.updated_at)}</dd></div>
                {latestStatus && <div><dt className="muted">{booking.status === 'pending' ? 'Submitted' : statusLabels[booking.status]} (PKT)</dt><dd>{bookingDateTime(latestStatus)}</dd></div>}
                {booking.booker && <div><dt className="muted">Booker</dt><dd className="break-words">{booking.booker.name}</dd></div>}
            </dl>
        </details>
        <BookingActions {...props} mobile />
    </article>;
}

function BookingActions({ booking, canApprove, canConvert, canViewSale, mobile = false }: BookingActionsProps) {
    const [processing, setProcessing] = useState(false);
    const approve = booking.status === 'pending' && canApprove;
    const convert = ['approved', 'partially_invoiced'].includes(booking.status) && canConvert;
    const invoice = booking.status === 'converted' && canViewSale ? booking.sales_invoice_id : null;
    if (!approve && !convert && !invoice) return null;

    function post(action: 'approve' | 'reject') {
        setProcessing(true);
        router.post(route(`bookings.${action}`, booking.id, false), {}, { preserveScroll: true, onFinish: () => setProcessing(false) });
    }

    const button = mobile ? 'h-11 flex-1' : undefined;
    return <div className={cn('flex flex-wrap items-center gap-1.5', mobile ? 'booking-card-details p-2' : 'justify-end')}>
        {approve && <>
            <Button type="button" variant={mobile ? 'outline' : 'ghost'} size={mobile ? 'sm' : 'icon'} className={cn(button, !mobile && 'ib')} aria-label="Approve" title="Approve"
                disabled={processing} onClick={() => post('approve')}><Check aria-hidden="true" className="text-green-700" />{mobile && 'Approve'}</Button>
            <Button type="button" variant={mobile ? 'outline' : 'ghost'} size={mobile ? 'sm' : 'icon'} className={cn(button, !mobile && 'ib')} aria-label="Reject" title="Reject"
                disabled={processing} onClick={() => { if (confirm(`Reject ${booking.booking_number}?`)) post('reject'); }}><X aria-hidden="true" className="text-destructive" />{mobile && 'Reject'}</Button>
        </>}
        {convert && <Button variant="outline" size="sm" className={button} asChild><Link href={route('bookings.edit', booking.id, false)}><ArrowRight aria-hidden="true" />Invoice quantities</Link></Button>}
        {invoice && <Button variant={mobile ? 'outline' : 'ghost'} size="sm" className={button} asChild><Link href={route('sales.edit', invoice, false)}>Invoice <ArrowRight aria-hidden="true" /></Link></Button>}
    </div>;
}
