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
import { useListKeyboardNav } from '@/hooks/use-list-keyboard-nav';
import { Head, Link, router } from '@inertiajs/react';
import { Plus, Printer, Search } from 'lucide-react';
import { useEffect, useState } from 'react';

interface InvoiceRow {
    id: number;
    invoice_number: string;
    invoice_date: string;
    sale_type: string;
    status: string;
    total_amount: string;
    total_profit: string;
    customer?: { id: number; name: string; city: string | null };
}

interface Props {
    invoices: PaginatedData<InvoiceRow>;
    customers: { id: number; name: string }[];
    filters: { search?: string; customer_id?: string; status?: string; sale_type?: string; from?: string; to?: string };
}

const breadcrumbs: BreadcrumbItem[] = [{ title: 'Sales', href: '/sales' }];

const statusVariant = (status: string) =>
    status === 'posted' ? 'default' : status === 'cancelled' ? 'destructive' : 'secondary';

export default function SalesIndex({ invoices, customers, filters }: Props) {
    const { can } = usePermissions();
    const [search, setSearch] = useState(filters.search ?? '');
    const { searchRef, onSearchKeyDown, rowProps } = useListKeyboardNav({
        rowCount: invoices.data.length,
        onActivate: (i) => router.visit(route('sales.edit', invoices.data[i].id)),
    });

    useEffect(() => {
        const timeout = setTimeout(() => {
            if ((filters.search ?? '') !== search) {
                router.get('/sales', { ...filters, search: search || undefined }, { preserveState: true, replace: true });
            }
        }, 350);
        return () => clearTimeout(timeout);
    }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

    const setFilter = (key: string, value?: string) =>
        router.get('/sales', { ...filters, [key]: value }, { preserveState: true });

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Sales Invoices" />
            <div className="flex h-full flex-col gap-4 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                        <h1 className="text-xl font-semibold">Sales Invoices</h1>
                        <p className="text-sm text-muted-foreground">Invoices issued to pharmacies</p>
                    </div>
                    {can('sales.create') && (
                        <Button asChild>
                            <Link href={route('sales.create')}>
                                <Plus className="mr-1 size-4" /> New Sale
                            </Link>
                        </Button>
                    )}
                </div>

                <div className="flex flex-wrap gap-2">
                    <div className="relative w-64">
                        <Search className="absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
                        <Input ref={searchRef} onKeyDown={onSearchKeyDown} placeholder="Invoice number…" className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} />
                    </div>
                    <Select value={filters.customer_id ?? 'all'} onValueChange={(v) => setFilter('customer_id', v === 'all' ? undefined : v)}>
                        <SelectTrigger className="w-48"><SelectValue placeholder="Customer" /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All customers</SelectItem>
                            {customers.map((customer) => (
                                <SelectItem key={customer.id} value={String(customer.id)}>{customer.name}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <Select value={filters.status ?? 'all'} onValueChange={(v) => setFilter('status', v === 'all' ? undefined : v)}>
                        <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All statuses</SelectItem>
                            <SelectItem value="draft">Draft</SelectItem>
                            <SelectItem value="posted">Posted</SelectItem>
                            <SelectItem value="cancelled">Cancelled</SelectItem>
                        </SelectContent>
                    </Select>
                    <Select value={filters.sale_type ?? 'all'} onValueChange={(v) => setFilter('sale_type', v === 'all' ? undefined : v)}>
                        <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All types</SelectItem>
                            <SelectItem value="cash">Cash</SelectItem>
                            <SelectItem value="credit">Credit</SelectItem>
                            <SelectItem value="sale_base">Sale Base</SelectItem>
                        </SelectContent>
                    </Select>
                    <Input type="date" className="w-40" value={filters.from ?? ''} onChange={(e) => setFilter('from', e.target.value || undefined)} />
                    <Input type="date" className="w-40" value={filters.to ?? ''} onChange={(e) => setFilter('to', e.target.value || undefined)} />
                </div>

                <div className="rounded-xl border">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Invoice #</TableHead>
                                <TableHead>Customer</TableHead>
                                <TableHead>Date</TableHead>
                                <TableHead>Type</TableHead>
                                <TableHead className="text-right">Total</TableHead>
                                <TableHead className="text-right">Profit</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="w-16" />
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {invoices.data.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                                        No sales invoices found.
                                    </TableCell>
                                </TableRow>
                            )}
                            {invoices.data.map((invoice, index) => (
                                <TableRow key={invoice.id} {...rowProps(index)}>
                                    <TableCell>
                                        <Link href={route('sales.edit', invoice.id)} className="font-medium hover:underline">
                                            {invoice.invoice_number}
                                        </Link>
                                    </TableCell>
                                    <TableCell>
                                        <div>{invoice.customer?.name}</div>
                                        <div className="text-xs text-muted-foreground">{invoice.customer?.city}</div>
                                    </TableCell>
                                    <TableCell>{shortDate(invoice.invoice_date)}</TableCell>
                                    <TableCell className="capitalize">{invoice.sale_type.replace('_', ' ')}</TableCell>
                                    <TableCell className="text-right tabular-nums">{money(invoice.total_amount)}</TableCell>
                                    <TableCell className="text-right tabular-nums">
                                        {invoice.status === 'posted' ? money(invoice.total_profit) : '—'}
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant={statusVariant(invoice.status)}>{invoice.status}</Badge>
                                    </TableCell>
                                    <TableCell>
                                        <Button variant="ghost" size="icon" asChild title="Print">
                                            <a href={route('sales.print', invoice.id)} target="_blank" rel="noreferrer">
                                                <Printer className="size-4" />
                                            </a>
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                    <Paginator meta={invoices} />
                </div>
            </div>
        </AppLayout>
    );
}
