import { Paginator, type PaginatedData } from '@/components/paginator';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { usePermissions } from '@/hooks/use-permissions';
import AppLayout from '@/layouts/app-layout';
import { money, shortDate } from '@/lib/format';
import { type BreadcrumbItem } from '@/types';
import { useListKeyboardNav } from '@/hooks/use-list-keyboard-nav';
import { Head, Link, router } from '@inertiajs/react';
import { Plus, Search, Undo2 } from 'lucide-react';
import { useEffect, useState } from 'react';

interface ReturnRow {
    id: number;
    return_number: string;
    return_date: string;
    total_amount: string;
    reason: string | null;
    customer?: { id: number; name: string; city: string | null };
    invoice?: { id: number; invoice_number: string };
}

interface Props {
    returns: PaginatedData<ReturnRow>;
    filters: { search?: string; from?: string; to?: string };
}

const breadcrumbs: BreadcrumbItem[] = [{ title: 'Sales Returns', href: '/returns/sales' }];

export default function SalesReturnsIndex({ returns, filters }: Props) {
    const { can } = usePermissions();
    const [search, setSearch] = useState(filters.search ?? '');
    const { searchRef, onSearchKeyDown, rowProps } = useListKeyboardNav({
        rowCount: returns.data.length,
        onActivate: (i) => {
            const inv = returns.data[i].invoice;
            if (inv) router.visit(route('sales.edit', inv.id));
        },
    });

    useEffect(() => {
        const timeout = setTimeout(() => {
            if ((filters.search ?? '') !== search) {
                router.get('/returns/sales', { ...filters, search: search || undefined }, { preserveState: true, replace: true });
            }
        }, 350);
        return () => clearTimeout(timeout);
    }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Sales Returns" />
            <div className="flex h-full flex-col gap-4 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                        <h1 className="text-3xl font-bold">Sales Returns</h1>
                        <p className="text-sm text-muted-foreground">Goods returned by pharmacies — credit notes on the customer ledger</p>
                    </div>
                    <div className="flex gap-2">
                        <Button variant="outline" size="sm" asChild>
                            <Link href="/returns/purchases"><Undo2 className="mr-1 size-4" /> Purchase Returns</Link>
                        </Button>
                        {can('returns.manage') && (
                            <Button asChild>
                                <Link href={route('returns.sales.create')}>
                                    <Plus className="mr-1 size-4" /> New Sales Return
                                </Link>
                            </Button>
                        )}
                    </div>
                </div>

                <div className="flex flex-wrap gap-2">
                    <div className="relative w-full sm:w-64">
                        <Search className="absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
                        <Input ref={searchRef} onKeyDown={onSearchKeyDown} placeholder="Return or invoice number…" className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} />
                    </div>
                    <Input
                        type="date" className="w-40" value={filters.from ?? ''}
                        onChange={(e) => router.get('/returns/sales', { ...filters, from: e.target.value || undefined }, { preserveState: true })}
                    />
                    <Input
                        type="date" className="w-40" value={filters.to ?? ''}
                        onChange={(e) => router.get('/returns/sales', { ...filters, to: e.target.value || undefined }, { preserveState: true })}
                    />
                </div>

                <div className="rounded-xl border">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Return #</TableHead>
                                <TableHead>Against Invoice</TableHead>
                                <TableHead>Customer</TableHead>
                                <TableHead>Date</TableHead>
                                <TableHead>Reason</TableHead>
                                <TableHead className="text-right">Credit Amount</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {returns.data.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                                        No sales returns yet.
                                    </TableCell>
                                </TableRow>
                            )}
                            {returns.data.map((row, index) => (
                                <TableRow key={row.id} {...rowProps(index)}>
                                    <TableCell className="font-medium">{row.return_number}</TableCell>
                                    <TableCell>
                                        {row.invoice ? (
                                            <Link href={route('sales.edit', row.invoice.id)} className="hover:underline">
                                                {row.invoice.invoice_number}
                                            </Link>
                                        ) : '—'}
                                    </TableCell>
                                    <TableCell>
                                        <div>{row.customer?.name}</div>
                                        <div className="text-xs text-muted-foreground">{row.customer?.city}</div>
                                    </TableCell>
                                    <TableCell>{shortDate(row.return_date)}</TableCell>
                                    <TableCell className="text-sm text-muted-foreground">{row.reason || '—'}</TableCell>
                                    <TableCell className="text-right tabular-nums">{money(row.total_amount)}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                    <Paginator meta={returns} />
                </div>
            </div>
        </AppLayout>
    );
}
