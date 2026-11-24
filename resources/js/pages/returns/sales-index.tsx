import { MasterFilterDate, MasterRegister, MasterStatus, RegisterMetric, useMasterFilters } from '@/components/master-register';
import { type PaginatedData } from '@/components/paginator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { usePermissions } from '@/hooks/use-permissions';
import AppLayout from '@/layouts/app-layout';
import { shortDate, totalMoney } from '@/lib/format';
import { type BreadcrumbItem } from '@/types';
import { useListKeyboardNav } from '@/hooks/use-list-keyboard-nav';
import { Head, Link, router } from '@inertiajs/react';
import { Plus, Undo2 } from 'lucide-react';

interface ReturnRow {
    id: number;
    return_number: string;
    return_date: string;
    status: string;
    total_amount: string;
    reason: string | null;
    customer?: { id: number; name: string; city: string | null };
    invoice?: { id: number; invoice_number: string };
}

interface Props {
    returns: PaginatedData<ReturnRow>;
    filters: { search?: string; from?: string; to?: string };
    summary: { total: number; count: number };
}

const breadcrumbs: BreadcrumbItem[] = [{ title: 'Sales Returns', href: '/returns/sales' }];

export default function SalesReturnsIndex({ returns, filters, summary }: Props) {
    const { can } = usePermissions();
    const state = useMasterFilters('/returns/sales', filters);
    const { searchRef, onSearchKeyDown, rowProps } = useListKeyboardNav({
        rowCount: returns.data.length,
        onActivate: (i) => router.visit(route('returns.sales.show', returns.data[i].id)),
    });

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Sales Returns" />
            <MasterRegister title="Sales Returns" description="Goods returned by pharmacies · customer credit notes"
                label="return" page={returns} state={state} searchRef={searchRef} onSearchKeyDown={onSearchKeyDown} placeholder="Return or invoice number…"
                actions={<div className="register-hero-actions">
                    <Link className="hbtn" href="/returns/purchases"><Undo2 className="i" aria-hidden="true" />Purchase Returns</Link>
                    {can('returns.manage') && <Link className="hbtn pri" href={route('returns.sales.create')}><Plus className="i" aria-hidden="true" />New Sales Return</Link>}
                </div>}
                summary={<section className="register-stats" aria-label="Return totals"><RegisterMetric label="Net Credit Notes"
                    value={totalMoney(summary.total)} color="var(--red)" detail={`${summary.count} posted`} /></section>}
                filters={<>
                    <MasterFilterDate label="From" value={filters.from} onChange={from => state.change({ from })} />
                    <MasterFilterDate label="To" value={filters.to} onChange={to => state.change({ to })} />
                </>}>
                {dense => <Table className={dense ? 'dense' : undefined}>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Return #</TableHead>
                                <TableHead>Against Invoice</TableHead>
                                <TableHead>Customer</TableHead>
                                <TableHead>Date</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Reason</TableHead>
                                <TableHead className="r">Credit Amount</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {returns.data.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={7} className="empty">
                                        {state.applied ? 'No returns match these filters.' : 'No sales returns yet.'}
                                    </TableCell>
                                </TableRow>
                            )}
                            {returns.data.map((row, index) => (
                                <TableRow key={row.id} {...rowProps(index)}>
                                    <TableCell className="font-medium">
                                        <Link href={route('returns.sales.show', row.id)} className="inv hover:underline">
                                            {row.return_number}
                                        </Link>
                                    </TableCell>
                                    <TableCell>
                                        {row.invoice ? (
                                            <Link href={route('sales.edit', row.invoice.id)} className="hover:underline">
                                                {row.invoice.invoice_number}
                                            </Link>
                                        ) : '—'}
                                    </TableCell>
                                    <TableCell>
                                        <div>{row.customer?.name}</div>
                                        <div className="row-secondary">{row.customer?.city}</div>
                                    </TableCell>
                                    <TableCell>{shortDate(row.return_date)}</TableCell>
                                    <TableCell>
                                        <MasterStatus status={row.status} tone={row.status === 'cancelled' ? 'negative' : row.status === 'posted' ? 'positive' : 'neutral'} />
                                    </TableCell>
                                    <TableCell className="wrap-cell muted">{row.reason || '—'}</TableCell>
                                    <TableCell className={`r num ${row.status === 'cancelled' ? 'text-muted-foreground line-through' : ''}`}>
                                        {totalMoney(row.total_amount)}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                </Table>}
            </MasterRegister>
        </AppLayout>
    );
}
