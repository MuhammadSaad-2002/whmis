import { Paginator, type PaginatedData } from '@/components/paginator';
import { bookingDateTime, type BookingTimestamps } from '@/components/booking-timestamps';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { usePermissions } from '@/hooks/use-permissions';
import { useListKeyboardNav } from '@/hooks/use-list-keyboard-nav';
import { WorkspaceRecordLink } from '@/components/workspace/record-link';
import AppLayout from '@/layouts/app-layout';
import { money, shortDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import { type BreadcrumbItem } from '@/types';
import { Head, Link, router } from '@inertiajs/react';
import { ArrowRight, Check, ChevronDown, ChevronLeft, ChevronRight, ClipboardList, Plus, Search, SlidersHorizontal, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

interface BookingRow extends BookingTimestamps {
    id: number;
    booking_number: string;
    booking_date: string;
    status: string;
    total_amount: string;
    sales_invoice_id: number | null;
    customer?: { id: number; name: string; city: string | null };
    booker?: { id: number; name: string };
}

interface Props {
    bookings: PaginatedData<BookingRow>;
    customers: { id: number; name: string }[];
    filters: { search?: string; status?: string; customer_id?: string };
}

const breadcrumbs: BreadcrumbItem[] = [{ title: 'Bookings', href: '/bookings' }];

const statusVariant = (status: string) =>
    status === 'approved' || status === 'converted' ? 'default'
        : status === 'rejected' || status === 'cancelled' ? 'destructive' : 'secondary';

const statusLabels: Record<string, string> = {
    draft: 'Draft', pending: 'Pending approval', approved: 'Approved',
    converted: 'Converted', partially_invoiced: 'Partially invoiced', rejected: 'Rejected', cancelled: 'Cancelled',
};

const statusTimestamp = (booking: BookingRow) =>
    booking.status === 'pending' ? booking.submitted_at
        : booking.status === 'approved' ? booking.approved_at
        : booking.status === 'rejected' ? booking.rejected_at
        : booking.status === 'converted' ? booking.converted_at
        : booking.status === 'cancelled' ? booking.cancelled_at : null;

const desktopTableVisible = () => typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches;

export default function BookingsIndex({ bookings, customers, filters }: Props) {
    const { can } = usePermissions();
    const [search, setSearch] = useState(filters.search ?? '');
    const searchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const [filtersOpen, setFiltersOpen] = useState(false);
    const appliedFilters = Number(Boolean(filters.status)) + Number(Boolean(filters.customer_id));
    const canApprove = can('bookings.approve');
    const canConvert = can('bookings.convert');
    const canViewSale = can('sales.view');
    const { searchRef, onSearchKeyDown, rowProps } = useListKeyboardNav({
        rowCount: bookings.data.length,
        autoFocus: desktopTableVisible(),
        onActivate: (i) => router.visit(route('bookings.edit', bookings.data[i].id)),
    });

    useEffect(() => () => clearTimeout(searchTimer.current), []);

    const updateSearch = (value: string) => {
        setSearch(value);
        clearTimeout(searchTimer.current);
        searchTimer.current = setTimeout(() => {
            const query = value.trim();
            if ((filters.search ?? '') !== query) {
                router.get('/bookings', { ...filters, search: query || undefined }, { preserveState: true, replace: true });
            }
        }, 350);
    };

    const setFilter = (key: 'status' | 'customer_id', value?: string) => {
        clearTimeout(searchTimer.current);
        router.get('/bookings', { ...filters, search: search.trim() || undefined, [key]: value }, { preserveState: true });
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Bookings" />
            <div className="flex min-w-0 flex-col gap-3 p-3 sm:gap-4 sm:p-4">
                <header className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5 border-b pb-3 sm:pb-4">
                    <div>
                        <h1 className="text-xl font-bold tracking-tight min-[360px]:text-2xl lg:text-4xl">Booking Orders</h1>
                        <p className="hidden text-sm text-muted-foreground lg:block">Customer orders taken by bookers, converted to invoices after approval</p>
                    </div>
                    {can('bookings.create') && (
                        <Button className="h-11 gap-1.5 px-2.5 sm:px-4 lg:h-10" asChild>
                            <Link href={route('bookings.create')}>
                                <Plus aria-hidden="true" /> New booking
                            </Link>
                        </Button>
                    )}
                </header>

                <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 lg:flex lg:flex-wrap">
                    <div className="relative min-w-0 lg:w-64">
                        <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                        <Input ref={searchRef} onKeyDown={(event) => { if (desktopTableVisible()) onSearchKeyDown(event); }}
                            aria-label="Search by booking number" placeholder="Booking number…" className="h-11 pl-8 pr-10 lg:h-10" value={search} onChange={(e) => updateSearch(e.target.value)} />
                        {search && <Button type="button" variant="ghost" size="icon" className="absolute top-0 right-0 size-11 lg:size-10" aria-label="Clear search" onClick={() => updateSearch('')}><X aria-hidden="true" /></Button>}
                    </div>
                    <Button type="button" variant={appliedFilters ? 'secondary' : 'outline'} className="h-11 gap-1.5 px-2.5 lg:hidden" aria-expanded={filtersOpen} aria-controls="booking-filters" onClick={() => setFiltersOpen((open) => !open)}>
                        <SlidersHorizontal aria-hidden="true" /> Filters{appliedFilters > 0 && <span className="rounded-full bg-primary px-1.5 text-xs text-primary-foreground">{appliedFilters}</span>}
                    </Button>
                    <div id="booking-filters" className={cn('col-span-2 grid-cols-2 gap-2 lg:flex', filtersOpen ? 'grid' : 'hidden')}>
                        <Select value={filters.status ?? 'all'} onValueChange={(v) => setFilter('status', v === 'all' ? undefined : v)}>
                            <SelectTrigger className="h-11 w-full min-w-0 lg:h-10 lg:w-40" aria-label="Booking status"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All statuses</SelectItem>
                                {Object.entries(statusLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
                            </SelectContent>
                        </Select>
                        <Select value={filters.customer_id ?? 'all'} onValueChange={(v) => setFilter('customer_id', v === 'all' ? undefined : v)}>
                            <SelectTrigger className="h-11 w-full min-w-0 lg:h-10 lg:w-48" aria-label="Pharmacy"><SelectValue placeholder="Customer" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All pharmacies</SelectItem>
                                {customers.map((customer) => (
                                    <SelectItem key={customer.id} value={String(customer.id)}>{customer.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                <section className="min-w-0 space-y-2 lg:hidden" aria-label="Bookings">
                    <p role="status" className="px-0.5 text-xs text-muted-foreground">{bookings.total} {bookings.total === 1 ? 'booking' : 'bookings'}</p>
                    {!bookings.data.length && (
                        <div className="rounded-xl border border-dashed bg-card px-4 py-7 text-center">
                            <ClipboardList aria-hidden="true" className="mx-auto mb-2 size-6 text-muted-foreground" />
                            <p className="text-sm font-medium">No bookings found</p>
                            {(filters.search || appliedFilters > 0) && (
                                <Button variant="outline" className="mt-3 h-11" onClick={() => {
                                    clearTimeout(searchTimer.current);
                                    setSearch('');
                                    router.get('/bookings', {}, { preserveState: true });
                                }}>Clear search and filters</Button>
                            )}
                        </div>
                    )}
                    <div className="grid gap-2.5 sm:grid-cols-2">
                        {bookings.data.map((booking) => <BookingCard key={booking.id} booking={booking} canApprove={canApprove} canConvert={canConvert} canViewSale={canViewSale} />)}
                    </div>
                    <MobilePagination bookings={bookings} />
                </section>

                <div className="hidden rounded-xl border lg:block">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Booking #</TableHead>
                                <TableHead>Customer</TableHead>
                                <TableHead>Booker</TableHead>
                                <TableHead>Created / Updated (PKT)</TableHead>
                                <TableHead className="text-right">Total</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="w-48" />
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {bookings.data.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                                        No bookings found.
                                    </TableCell>
                                </TableRow>
                            )}
                            {bookings.data.map((booking, index) => (
                                <TableRow key={booking.id} {...rowProps(index)}>
                                    <TableCell>
                                        <WorkspaceRecordLink href={route('bookings.edit', booking.id)} number={booking.booking_number} />
                                    </TableCell>
                                    <TableCell>
                                        <div>{booking.customer?.name}</div>
                                        <div className="text-xs text-muted-foreground">{booking.customer?.city}</div>
                                    </TableCell>
                                    <TableCell>{booking.booker?.name}</TableCell>
                                    <TableCell>
                                        <div>{bookingDateTime(booking.created_at)}</div>
                                        <div className="text-xs text-muted-foreground">Updated: {bookingDateTime(booking.updated_at)}</div>
                                        <div className="text-xs text-muted-foreground">Booking date: {shortDate(booking.booking_date)}</div>
                                    </TableCell>
                                    <TableCell className="text-right tabular-nums">{money(booking.total_amount)}</TableCell>
                                    <TableCell>
                                        <Badge variant={statusVariant(booking.status)}>{booking.status}</Badge>
                                        {booking.status !== 'draft' && <div className="mt-1 text-xs text-muted-foreground">{bookingDateTime(statusTimestamp(booking))}</div>}
                                    </TableCell>
                                    <TableCell>
                                        <BookingActions booking={booking} canApprove={canApprove} canConvert={canConvert} canViewSale={canViewSale} />
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                    <Paginator meta={bookings} />
                </div>
            </div>
        </AppLayout>
    );
}

interface BookingActionsProps {
    booking: BookingRow;
    canApprove: boolean;
    canConvert: boolean;
    canViewSale: boolean;
    mobile?: boolean;
}

function BookingCard(props: BookingActionsProps) {
    const { booking } = props;
    const latestStatus = statusTimestamp(booking);

    return (
        <article className="min-w-0 overflow-hidden rounded-xl border bg-card shadow-xs">
            <Link href={route('bookings.edit', booking.id)} className="group block px-3 py-2.5 hover:bg-accent/45 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring">
                <div className="flex flex-wrap items-center justify-between gap-1.5">
                    <span className="break-all text-xs font-semibold text-muted-foreground">{booking.booking_number}</span>
                    <Badge variant={statusVariant(booking.status)} className="max-w-full text-xs">
                        {statusLabels[booking.status] ?? booking.status}
                    </Badge>
                </div>
                <div className="mt-1.5 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                        <h2 className="break-words text-sm leading-snug font-semibold">{booking.customer?.name ?? 'Customer not recorded'}</h2>
                        {booking.customer?.city && <p className="break-words text-xs text-muted-foreground">{booking.customer.city}</p>}
                    </div>
                    <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground group-hover:text-accent-foreground" />
                </div>
                <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5 text-xs">
                    <time dateTime={booking.booking_date} className="text-muted-foreground">{shortDate(booking.booking_date)}</time>
                    <span className="font-semibold tabular-nums">{money(booking.total_amount)}</span>
                </div>
            </Link>

            <details className="group border-t">
                <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-3 text-xs font-medium text-muted-foreground hover:bg-muted/50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
                    Details & timestamps <ChevronDown aria-hidden="true" className="size-4 shrink-0 group-open:rotate-180" />
                </summary>
                <dl className="grid grid-cols-2 gap-2.5 px-3 pb-3 text-xs">
                    <div><dt className="text-muted-foreground">Created (PKT)</dt><dd>{bookingDateTime(booking.created_at)}</dd></div>
                    <div><dt className="text-muted-foreground">Updated (PKT)</dt><dd>{bookingDateTime(booking.updated_at)}</dd></div>
                    {latestStatus && (
                        <div><dt className="text-muted-foreground">{booking.status === 'pending' ? 'Submitted' : statusLabels[booking.status]} (PKT)</dt><dd>{bookingDateTime(latestStatus)}</dd></div>
                    )}
                    {booking.booker && <div><dt className="text-muted-foreground">Booker</dt><dd className="break-words">{booking.booker.name}</dd></div>}
                </dl>
            </details>

            <BookingActions {...props} mobile />
        </article>
    );
}

function BookingActions({ booking, canApprove, canConvert, canViewSale, mobile = false }: BookingActionsProps) {
    const [processing, setProcessing] = useState(false);
    const approve = booking.status === 'pending' && canApprove;
    const convert = ['approved', 'partially_invoiced'].includes(booking.status) && canConvert;
    const invoice = booking.status === 'converted' && canViewSale ? booking.sales_invoice_id : null;
    if (!approve && !convert && !invoice) return null;

    const post = (action: 'approve' | 'reject' | 'convert') => {
        setProcessing(true);
        router.post(route(`bookings.${action}`, booking.id), {}, {
            preserveScroll: action !== 'convert',
            onFinish: () => setProcessing(false),
        });
    };
    const mobileButton = mobile ? 'h-11 flex-1' : undefined;

    return (
        <div className={cn('flex flex-wrap gap-1.5', mobile ? 'border-t p-2' : 'justify-end')}>
            {approve && (
                <>
                    <Button type="button" variant={mobile ? 'outline' : 'ghost'} size={mobile ? 'sm' : 'icon'} className={mobileButton} aria-label="Approve" title="Approve"
                        disabled={processing} onClick={() => post('approve')}>
                        <Check aria-hidden="true" className="text-green-700 dark:text-green-400" /> {mobile && 'Approve'}
                    </Button>
                    <Button type="button" variant={mobile ? 'outline' : 'ghost'} size={mobile ? 'sm' : 'icon'} className={mobileButton} aria-label="Reject" title="Reject"
                        disabled={processing} onClick={() => { if (confirm(`Reject ${booking.booking_number}?`)) post('reject'); }}>
                        <X aria-hidden="true" className="text-destructive" /> {mobile && 'Reject'}
                    </Button>
                </>
            )}
            {convert && <Button variant="outline" size="sm" className={mobileButton} asChild><Link href={route('bookings.edit', booking.id)}><ArrowRight aria-hidden="true" /> Invoice quantities</Link></Button>}
            {invoice && <Button variant={mobile ? 'outline' : 'ghost'} size="sm" className={mobileButton} asChild><Link href={route('sales.edit', invoice)}>Invoice <ArrowRight aria-hidden="true" /></Link></Button>}
        </div>
    );
}

function MobilePagination({ bookings }: { bookings: PaginatedData<BookingRow> }) {
    if (bookings.last_page <= 1) return null;

    const previous = bookings.links[0]?.url;
    const next = bookings.links.at(-1)?.url;
    return (
        <nav className="flex items-center justify-between gap-2" aria-label="Booking pages">
            <MobilePageButton url={previous} direction="Previous" />
            <span className="text-center text-xs text-muted-foreground">Page {bookings.current_page} of {bookings.last_page}</span>
            <MobilePageButton url={next} direction="Next" />
        </nav>
    );
}

function MobilePageButton({ url, direction }: { url?: string | null; direction: 'Previous' | 'Next' }) {
    const Icon = direction === 'Next' ? ChevronRight : ChevronLeft;
    const content = <><Icon aria-hidden="true" className={direction === 'Next' ? 'order-last' : ''} /> {direction}</>;
    return url
        ? <Button variant="outline" className="h-11 gap-1 px-2.5" asChild><Link href={url} preserveState>{content}</Link></Button>
        : <Button variant="outline" className="h-11 gap-1 px-2.5" disabled>{content}</Button>;
}
