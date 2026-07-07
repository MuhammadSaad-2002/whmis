import { Paginator, type PaginatedData } from '@/components/paginator';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { usePermissions } from '@/hooks/use-permissions';
import AppLayout from '@/layouts/app-layout';
import { money, shortDate } from '@/lib/format';
import { type BreadcrumbItem } from '@/types';
import { Head, Link, router } from '@inertiajs/react';
import { ArrowRight, Check, Plus, Search, X } from 'lucide-react';
import { useEffect, useState } from 'react';

interface BookingRow {
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

export default function BookingsIndex({ bookings, customers, filters }: Props) {
    const { can } = usePermissions();
    const [search, setSearch] = useState(filters.search ?? '');

    useEffect(() => {
        const timeout = setTimeout(() => {
            if ((filters.search ?? '') !== search) {
                router.get('/bookings', { ...filters, search: search || undefined }, { preserveState: true, replace: true });
            }
        }, 350);
        return () => clearTimeout(timeout);
    }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

    const setFilter = (key: string, value?: string) =>
        router.get('/bookings', { ...filters, [key]: value }, { preserveState: true });

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Bookings" />
            <div className="flex h-full flex-col gap-4 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                        <h1 className="text-xl font-semibold">Booking Orders</h1>
                        <p className="text-sm text-muted-foreground">Customer orders taken by bookers, converted to invoices after approval</p>
                    </div>
                    {can('bookings.create') && (
                        <Button asChild>
                            <Link href={route('bookings.create')}>
                                <Plus className="mr-1 size-4" /> New Booking
                            </Link>
                        </Button>
                    )}
                </div>

                <div className="flex flex-wrap gap-2">
                    <div className="relative w-64">
                        <Search className="absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
                        <Input placeholder="Booking number…" className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} />
                    </div>
                    <Select value={filters.status ?? 'all'} onValueChange={(v) => setFilter('status', v === 'all' ? undefined : v)}>
                        <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All statuses</SelectItem>
                            <SelectItem value="draft">Draft</SelectItem>
                            <SelectItem value="pending">Pending approval</SelectItem>
                            <SelectItem value="approved">Approved</SelectItem>
                            <SelectItem value="converted">Converted</SelectItem>
                            <SelectItem value="rejected">Rejected</SelectItem>
                            <SelectItem value="cancelled">Cancelled</SelectItem>
                        </SelectContent>
                    </Select>
                    <Select value={filters.customer_id ?? 'all'} onValueChange={(v) => setFilter('customer_id', v === 'all' ? undefined : v)}>
                        <SelectTrigger className="w-48"><SelectValue placeholder="Customer" /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All pharmacies</SelectItem>
                            {customers.map((customer) => (
                                <SelectItem key={customer.id} value={String(customer.id)}>{customer.name}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                <div className="rounded-xl border">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Booking #</TableHead>
                                <TableHead>Customer</TableHead>
                                <TableHead>Booker</TableHead>
                                <TableHead>Date</TableHead>
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
                            {bookings.data.map((booking) => (
                                <TableRow key={booking.id}>
                                    <TableCell>
                                        <Link href={route('bookings.edit', booking.id)} className="font-medium hover:underline">
                                            {booking.booking_number}
                                        </Link>
                                    </TableCell>
                                    <TableCell>
                                        <div>{booking.customer?.name}</div>
                                        <div className="text-xs text-muted-foreground">{booking.customer?.city}</div>
                                    </TableCell>
                                    <TableCell>{booking.booker?.name}</TableCell>
                                    <TableCell>{shortDate(booking.booking_date)}</TableCell>
                                    <TableCell className="text-right tabular-nums">{money(booking.total_amount)}</TableCell>
                                    <TableCell>
                                        <Badge variant={statusVariant(booking.status)}>{booking.status}</Badge>
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex justify-end gap-1">
                                            {booking.status === 'pending' && can('bookings.approve') && (
                                                <>
                                                    <Button
                                                        variant="ghost" size="icon" title="Approve"
                                                        onClick={() => router.post(route('bookings.approve', booking.id), {}, { preserveScroll: true })}
                                                    >
                                                        <Check className="size-4 text-green-600" />
                                                    </Button>
                                                    <Button
                                                        variant="ghost" size="icon" title="Reject"
                                                        onClick={() => {
                                                            if (confirm(`Reject ${booking.booking_number}?`)) {
                                                                router.post(route('bookings.reject', booking.id), {}, { preserveScroll: true });
                                                            }
                                                        }}
                                                    >
                                                        <X className="size-4 text-destructive" />
                                                    </Button>
                                                </>
                                            )}
                                            {booking.status === 'approved' && can('bookings.convert') && (
                                                <Button
                                                    variant="outline" size="sm"
                                                    onClick={() => router.post(route('bookings.convert', booking.id))}
                                                >
                                                    <ArrowRight className="mr-1 size-3.5" /> Convert
                                                </Button>
                                            )}
                                            {booking.status === 'converted' && booking.sales_invoice_id && (
                                                <Button variant="ghost" size="sm" asChild>
                                                    <Link href={route('sales.edit', booking.sales_invoice_id)}>Invoice →</Link>
                                                </Button>
                                            )}
                                        </div>
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
