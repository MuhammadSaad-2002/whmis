import { Paginator, type PaginatedData } from '@/components/paginator';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { usePermissions } from '@/hooks/use-permissions';
import { useListKeyboardNav } from '@/hooks/use-list-keyboard-nav';
import AppLayout from '@/layouts/app-layout';
import { qty, shortDate } from '@/lib/format';
import { type BreadcrumbItem } from '@/types';
import { Head, Link, router } from '@inertiajs/react';
import { Plus, Printer, Search } from 'lucide-react';
import { useEffect, useState } from 'react';

interface ReceiptRow {
    id: number;
    receipt_number: string;
    receipt_date: string;
    status: string;
    total_quantity: string;
    company?: { id: number; name: string };
}

interface Props {
    receipts: PaginatedData<ReceiptRow>;
    companies: { id: number; name: string }[];
    filters: { search?: string; company_id?: string; status?: string; from?: string; to?: string };
}

const breadcrumbs: BreadcrumbItem[] = [{ title: 'Sample Receipts', href: '/samples/receipts' }];

const statusVariant = (status: string) =>
    status === 'posted' ? 'default' : status === 'cancelled' ? 'destructive' : 'secondary';

export default function SampleReceiptsIndex({ receipts, companies, filters }: Props) {
    const { can } = usePermissions();
    const [search, setSearch] = useState(filters.search ?? '');
    const { searchRef, onSearchKeyDown, rowProps } = useListKeyboardNav({
        rowCount: receipts.data.length,
        onActivate: (i) => router.visit(route('samples.receipts.edit', receipts.data[i].id)),
    });

    useEffect(() => {
        const timeout = setTimeout(() => {
            if ((filters.search ?? '') !== search) {
                router.get('/samples/receipts', { ...filters, search: search || undefined }, { preserveState: true, replace: true });
            }
        }, 350);
        return () => clearTimeout(timeout);
    }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

    const setFilter = (key: string, value?: string) =>
        router.get('/samples/receipts', { ...filters, [key]: value }, { preserveState: true });

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Sample Receipts" />
            <div className="flex h-full flex-col gap-4 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-4">
                    <div>
                        <h1 className="text-4xl font-bold">Sample Receipts</h1>
                        <p className="text-sm text-muted-foreground">Free samples received (FOC) from suppliers — zero cost, segregated stock</p>
                    </div>
                    {can('samples.receive') && (
                        <Button asChild>
                            <Link href={route('samples.receipts.create')}>
                                <Plus className="mr-1 size-4" /> New Sample Receipt
                            </Link>
                        </Button>
                    )}
                </div>

                <div className="flex flex-wrap gap-2">
                    <div className="relative w-full sm:w-64">
                        <Search className="absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
                        <Input ref={searchRef} onKeyDown={onSearchKeyDown} placeholder="Receipt number…" className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} />
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
                                <TableHead>Receipt #</TableHead>
                                <TableHead>Supplier</TableHead>
                                <TableHead>Date</TableHead>
                                <TableHead className="text-right">Sample Qty</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="w-16" />
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {receipts.data.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                                        No sample receipts found.
                                    </TableCell>
                                </TableRow>
                            )}
                            {receipts.data.map((receipt, index) => (
                                <TableRow key={receipt.id} {...rowProps(index)}>
                                    <TableCell>
                                        <Link href={route('samples.receipts.edit', receipt.id)} className="font-medium hover:underline">
                                            {receipt.receipt_number}
                                        </Link>
                                    </TableCell>
                                    <TableCell>{receipt.company?.name}</TableCell>
                                    <TableCell>{shortDate(receipt.receipt_date)}</TableCell>
                                    <TableCell className="text-right tabular-nums">{qty(receipt.total_quantity)}</TableCell>
                                    <TableCell>
                                        <Badge variant={statusVariant(receipt.status)}>{receipt.status}</Badge>
                                    </TableCell>
                                    <TableCell>
                                        <Button variant="ghost" size="icon" asChild title="Print">
                                            <a href={route('samples.receipts.print', receipt.id)} target="_blank" rel="noreferrer">
                                                <Printer className="size-4" />
                                            </a>
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                    <Paginator meta={receipts} />
                </div>
            </div>
        </AppLayout>
    );
}
