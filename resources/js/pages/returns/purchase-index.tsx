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
    company?: { id: number; name: string };
}

interface Props {
    returns: PaginatedData<ReturnRow>;
    filters: { search?: string; from?: string; to?: string };
}

const breadcrumbs: BreadcrumbItem[] = [{ title: 'Purchase Returns', href: '/returns/purchases' }];

export default function PurchaseReturnsIndex({ returns, filters }: Props) {
    const { can } = usePermissions();
    const [search, setSearch] = useState(filters.search ?? '');
    const { searchRef, onSearchKeyDown, rowProps } = useListKeyboardNav({
        rowCount: returns.data.length,
        onActivate: () => {}, // purchase returns have no detail page
    });

    useEffect(() => {
        const timeout = setTimeout(() => {
            if ((filters.search ?? '') !== search) {
                router.get('/returns/purchases', { ...filters, search: search || undefined }, { preserveState: true, replace: true });
            }
        }, 350);
        return () => clearTimeout(timeout);
    }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Purchase Returns" />
            <div className="flex h-full flex-col gap-4 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                        <h1 className="text-3xl font-bold">Purchase Returns</h1>
                        <p className="text-sm text-muted-foreground">Stock returned to suppliers — debit notes on the supplier ledger</p>
                    </div>
                    <div className="flex gap-2">
                        <Button variant="outline" size="sm" asChild>
                            <Link href="/returns/sales"><Undo2 className="mr-1 size-4" /> Sales Returns</Link>
                        </Button>
                        {can('returns.manage') && (
                            <Button asChild>
                                <Link href={route('returns.purchases.create')}>
                                    <Plus className="mr-1 size-4" /> New Purchase Return
                                </Link>
                            </Button>
                        )}
                    </div>
                </div>

                <div className="flex flex-wrap gap-2">
                    <div className="relative w-full sm:w-64">
                        <Search className="absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
                        <Input ref={searchRef} onKeyDown={onSearchKeyDown} placeholder="Return number…" className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} />
                    </div>
                    <Input
                        type="date" className="w-40" value={filters.from ?? ''}
                        onChange={(e) => router.get('/returns/purchases', { ...filters, from: e.target.value || undefined }, { preserveState: true })}
                    />
                    <Input
                        type="date" className="w-40" value={filters.to ?? ''}
                        onChange={(e) => router.get('/returns/purchases', { ...filters, to: e.target.value || undefined }, { preserveState: true })}
                    />
                </div>

                <div className="rounded-xl border">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Return #</TableHead>
                                <TableHead>Supplier</TableHead>
                                <TableHead>Date</TableHead>
                                <TableHead>Reason</TableHead>
                                <TableHead className="text-right">Debit Amount</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {returns.data.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                                        No purchase returns yet.
                                    </TableCell>
                                </TableRow>
                            )}
                            {returns.data.map((row, index) => (
                                <TableRow key={row.id} {...rowProps(index)}>
                                    <TableCell className="font-medium">{row.return_number}</TableCell>
                                    <TableCell>{row.company?.name}</TableCell>
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
