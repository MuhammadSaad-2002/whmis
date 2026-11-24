import { MasterFilterDate, MasterRegister, RegisterMetric, useMasterFilters } from '@/components/master-register';
import { type PaginatedData } from '@/components/paginator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { usePermissions } from '@/hooks/use-permissions';
import AppLayout from '@/layouts/app-layout';
import { shortDate, totalMoney } from '@/lib/format';
import { type BreadcrumbItem } from '@/types';
import { useListKeyboardNav } from '@/hooks/use-list-keyboard-nav';
import { Head, Link } from '@inertiajs/react';
import { Plus, Undo2 } from 'lucide-react';

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
    summary: { total: number; count: number };
}

const breadcrumbs: BreadcrumbItem[] = [{ title: 'Purchase Returns', href: '/returns/purchases' }];

export default function PurchaseReturnsIndex({ returns, filters, summary }: Props) {
    const { can } = usePermissions();
    const state = useMasterFilters('/returns/purchases', filters);
    const { searchRef, onSearchKeyDown, rowProps } = useListKeyboardNav({
        rowCount: returns.data.length,
        onActivate: () => {}, // purchase returns have no detail page
    });

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Purchase Returns" />
            <MasterRegister title="Purchase Returns" description="Stock returned to suppliers · supplier debit notes"
                label="return" page={returns} state={state} searchRef={searchRef} onSearchKeyDown={onSearchKeyDown} placeholder="Return number…"
                actions={<div className="register-hero-actions">
                    <Link className="hbtn" href="/returns/sales"><Undo2 className="i" aria-hidden="true" />Sales Returns</Link>
                    {can('returns.manage') && <Link className="hbtn pri" href={route('returns.purchases.create')}><Plus className="i" aria-hidden="true" />New Purchase Return</Link>}
                </div>}
                summary={<section className="register-stats" aria-label="Return totals"><RegisterMetric label="Net Debit Notes"
                    value={totalMoney(summary.total)} color="var(--red)" detail={`${summary.count} returns`} /></section>}
                filters={<>
                    <MasterFilterDate label="From" value={filters.from} onChange={from => state.change({ from })} />
                    <MasterFilterDate label="To" value={filters.to} onChange={to => state.change({ to })} />
                </>}>
                {dense => <Table className={dense ? 'dense' : undefined}>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Return #</TableHead>
                                <TableHead>Supplier</TableHead>
                                <TableHead>Date</TableHead>
                                <TableHead>Reason</TableHead>
                                <TableHead className="r">Debit Amount</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {returns.data.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={5} className="empty">
                                        {state.applied ? 'No returns match these filters.' : 'No purchase returns yet.'}
                                    </TableCell>
                                </TableRow>
                            )}
                            {returns.data.map((row, index) => (
                                <TableRow key={row.id} {...rowProps(index)}>
                                    <TableCell className="font-medium">{row.return_number}</TableCell>
                                    <TableCell>{row.company?.name}</TableCell>
                                    <TableCell>{shortDate(row.return_date)}</TableCell>
                                    <TableCell className="wrap-cell muted">{row.reason || '—'}</TableCell>
                                    <TableCell className="r num">{totalMoney(row.total_amount)}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                </Table>}
            </MasterRegister>
        </AppLayout>
    );
}
