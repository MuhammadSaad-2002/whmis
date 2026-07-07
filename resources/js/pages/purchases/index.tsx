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
    supplier_invoice_number: string | null;
    invoice_date: string;
    purchase_type: string;
    status: string;
    total_amount: string;
    total_margin: string;
    company?: { id: number; name: string };
}

interface Props {
    invoices: PaginatedData<InvoiceRow>;
    companies: { id: number; name: string }[];
    filters: { search?: string; company_id?: string; status?: string; from?: string; to?: string };
}

const breadcrumbs: BreadcrumbItem[] = [{ title: 'Purchases', href: '/purchases' }];

const statusVariant = (status: string) =>
    status === 'posted' ? 'default' : status === 'cancelled' ? 'destructive' : 'secondary';

export default function PurchasesIndex({ invoices, companies, filters }: Props) {
    const { can } = usePermissions();
    const [search, setSearch] = useState(filters.search ?? '');
    const { searchRef, onSearchKeyDown, rowProps } = useListKeyboardNav({
        rowCount: invoices.data.length,
        onActivate: (i) => router.visit(route('purchases.edit', invoices.data[i].id)),
    });

    useEffect(() => {
        const timeout = setTimeout(() => {
            if ((filters.search ?? '') !== search) {
                router.get('/purchases', { ...filters, search: search || undefined }, { preserveState: true, replace: true });
            }
        }, 350);
        return () => clearTimeout(timeout);
    }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

    const setFilter = (key: string, value?: string) =>
        router.get('/purchases', { ...filters, [key]: value }, { preserveState: true });

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Purchase Invoices" />
            <div className="flex h-full flex-col gap-4 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                        <h1 className="text-xl font-semibold">Purchase Invoices</h1>
                        <p className="text-sm text-muted-foreground">Master invoices from pharmaceutical companies</p>
                    </div>
                    {can('purchases.create') && (
                        <Button asChild>
                            <Link href={route('purchases.create')}>
                                <Plus className="mr-1 size-4" /> New Purchase
                            </Link>
                        </Button>
                    )}
                </div>

                <div className="flex flex-wrap gap-2">
                    <div className="relative w-full sm:w-64">
                        <Search className="absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
                        <Input ref={searchRef} onKeyDown={onSearchKeyDown} placeholder="Invoice number…" className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} />
                    </div>
                    <Select value={filters.company_id ?? 'all'} onValueChange={(v) => setFilter('company_id', v === 'all' ? undefined : v)}>
                        <SelectTrigger className="w-48"><SelectValue placeholder="Supplier" /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All suppliers</SelectItem>
                            {companies.map((company) => (
                                <SelectItem key={company.id} value={String(company.id)}>{company.name}</SelectItem>
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
                    <Input type="date" className="w-40" value={filters.from ?? ''} onChange={(e) => setFilter('from', e.target.value || undefined)} />
                    <Input type="date" className="w-40" value={filters.to ?? ''} onChange={(e) => setFilter('to', e.target.value || undefined)} />
                </div>

                <div className="rounded-xl border">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Invoice #</TableHead>
                                <TableHead>Supplier Inv #</TableHead>
                                <TableHead>Supplier</TableHead>
                                <TableHead>Date</TableHead>
                                <TableHead>Type</TableHead>
                                <TableHead className="text-right">Total</TableHead>
                                <TableHead className="text-right">Margin</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="w-16" />
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {invoices.data.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={9} className="py-10 text-center text-muted-foreground">
                                        No purchase invoices found.
                                    </TableCell>
                                </TableRow>
                            )}
                            {invoices.data.map((invoice, index) => (
                                <TableRow key={invoice.id} {...rowProps(index)}>
                                    <TableCell>
                                        <Link href={route('purchases.edit', invoice.id)} className="font-medium hover:underline">
                                            {invoice.invoice_number}
                                        </Link>
                                    </TableCell>
                                    <TableCell>{invoice.supplier_invoice_number || '—'}</TableCell>
                                    <TableCell>{invoice.company?.name}</TableCell>
                                    <TableCell>{shortDate(invoice.invoice_date)}</TableCell>
                                    <TableCell className="capitalize">{invoice.purchase_type}</TableCell>
                                    <TableCell className="text-right tabular-nums">{money(invoice.total_amount)}</TableCell>
                                    <TableCell className="text-right tabular-nums">{money(invoice.total_margin)}</TableCell>
                                    <TableCell>
                                        <Badge variant={statusVariant(invoice.status)}>{invoice.status}</Badge>
                                    </TableCell>
                                    <TableCell>
                                        <Button variant="ghost" size="icon" asChild title="Print">
                                            <a href={route('purchases.print', invoice.id)} target="_blank" rel="noreferrer">
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
