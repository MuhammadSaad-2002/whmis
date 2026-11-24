import { MasterFilterDate, MasterFilterSelect, MasterStatus, RegisterLayout, RegisterList } from '@/components/master-register';
import { type PaginatedData } from '@/components/paginator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Head, router } from '@inertiajs/react';
import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Building2, ListFilter, UserRound } from 'lucide-react';

interface LogRow {
    id: number;
    customer: string | null;
    booker: string | null;
    action: string;
    changed_by: string | null;
    note: string | null;
    created_at: string | null;
}

interface Props {
    logs: PaginatedData<LogRow>;
    filters: { customer_id?: string; booker_id?: string; action?: string; from?: string; to?: string };
    customers: { id: number; name: string }[];
    bookers: { id: number; name: string }[];
}

const breadcrumbs: BreadcrumbItem[] = [{ title: 'Booker Assignments', href: '/booker-assignments' }];

export default function BookerAssignmentsIndex({ logs, filters, customers, bookers }: Props) {
    const apply = (patch: Record<string, string | undefined>) => {
        router.get('/booker-assignments', { ...filters, ...patch }, { preserveState: true, replace: true });
    };

    const hasFilters = filters.customer_id || filters.booker_id || filters.action || filters.from || filters.to;

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Booker Assignments" />
            <RegisterLayout title="Booker Assignments" description={<>History of customer assignments to bookers · {logs.total.toLocaleString()} {logs.total === 1 ? 'entry' : 'entries'}</>}>
                <RegisterList title="Booker Assignments" page={logs}
                    controls={<>
                        <MasterFilterSelect label="Customer" icon={Building2} value={filters.customer_id ?? ''} onChange={value => apply({ customer_id: value || undefined })}>
                            <option value="">All customers</option>
                            {customers.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}
                        </MasterFilterSelect>
                        <MasterFilterSelect label="Booker" icon={UserRound} value={filters.booker_id ?? ''} onChange={value => apply({ booker_id: value || undefined })}>
                            <option value="">All bookers</option>
                            {bookers.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}
                        </MasterFilterSelect>
                        <MasterFilterSelect label="Action" icon={ListFilter} value={filters.action ?? ''} onChange={value => apply({ action: value || undefined })}>
                            <option value="">All actions</option>
                            <option value="assigned">Assigned</option><option value="unassigned">Unassigned</option>
                        </MasterFilterSelect>
                        <MasterFilterDate label="From" value={filters.from} onChange={value => apply({ from: value })} />
                        <MasterFilterDate label="To" value={filters.to} onChange={value => apply({ to: value })} />
                        {hasFilters && <button type="button" className="clear" onClick={() => router.get('/booker-assignments', {}, { preserveScroll: true, preserveState: true, replace: true })}>Clear filters</button>}
                    </>}>
                    {dense => <Table className={dense ? 'dense' : undefined}>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-44">When</TableHead>
                                <TableHead>Customer</TableHead>
                                <TableHead>Booker</TableHead>
                                <TableHead>Action</TableHead>
                                <TableHead>Changed By</TableHead>
                                <TableHead>Note</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {logs.data.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={6} className="empty">
                                        No assignment changes match these filters.
                                    </TableCell>
                                </TableRow>
                            )}
                            {logs.data.map((row) => (
                                <TableRow key={row.id}>
                                    <TableCell className="whitespace-nowrap text-sm tabular-nums">{row.created_at}</TableCell>
                                    <TableCell className="font-medium">{row.customer ?? '—'}</TableCell>
                                    <TableCell>{row.booker ?? '—'}</TableCell>
                                    <TableCell>
                                        <MasterStatus status={row.action} tone={row.action === 'assigned' ? 'positive' : 'neutral'} />
                                    </TableCell>
                                    <TableCell className="text-sm text-muted-foreground">{row.changed_by ?? 'System'}</TableCell>
                                    <TableCell className="wrap-cell muted">{row.note ?? '—'}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>}
                </RegisterList>
            </RegisterLayout>
        </AppLayout>
    );
}
