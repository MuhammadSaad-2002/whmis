import { MasterFilterDate, MasterFilterSelect, MasterRegister, MasterStatus, useMasterFilters } from '@/components/master-register';
import { type PaginatedData } from '@/components/paginator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { usePermissions } from '@/hooks/use-permissions';
import { useListKeyboardNav } from '@/hooks/use-list-keyboard-nav';
import AppLayout from '@/layouts/app-layout';
import { qty, shortDate } from '@/lib/format';
import { type BreadcrumbItem } from '@/types';
import { Head, Link, router } from '@inertiajs/react';
import { Building2, ListFilter, Plus, UserRound } from 'lucide-react';

type Direction = 'in' | 'out';

interface UserRef { id: number; name: string }

interface LoanRow {
    id: number;
    loan_number: string;
    loan_date: string;
    status: string;
    total_quantity: string;
    returned_quantity: string;
    items_count: number;
    company?: { id: number; name: string };
    requested_by?: UserRef | null;
    received_by?: UserRef | null;
    external_requested_by?: string | null;
    external_received_by?: string | null;
    request_received_by?: UserRef | null;
    handed_over_by?: UserRef | null;
    last_return_date?: string | null;
    closed_at?: string | null;
}

interface Props {
    direction: Direction;
    loans: PaginatedData<LoanRow>;
    companies: { id: number; name: string }[];
    users: UserRef[];
    summary: { loaned: number; returned: number; outstanding: number };
    filters: {
        search?: string; company_id?: string; status?: string;
        user_id?: string; product_id?: string; from?: string; to?: string;
    };
}

const STATUSES: Record<string, string> = {
    pending: 'Pending',
    loaned: 'Loaned',
    partially_returned: 'Partially Returned',
    returned: 'Returned',
    closed: 'Closed',
    cancelled: 'Cancelled',
};

export default function LoansIndex({ direction, loans, companies, users, summary, filters }: Props) {
    const { can } = usePermissions();
    const isOut = direction === 'out';
    const title = isOut ? 'Loan Stock Out' : 'Loan Stock In';
    const base = `/loans/${direction}`;

    const state = useMasterFilters(base, filters);
    const setFilter = (key: string, value?: string) => state.change({ [key]: value });
    const { searchRef, onSearchKeyDown, rowProps } = useListKeyboardNav({
        rowCount: loans.data.length,
        onActivate: (i) => router.visit(route('loans.edit', loans.data[i].id)),
    });

    const breadcrumbs: BreadcrumbItem[] = [{ title, href: base }];
    const colSpan = isOut ? 12 : 10;

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={title} />
            <MasterRegister title={title} description={isOut ? 'Products loaned to suppliers and partners, tracked separately from sales' : 'Products borrowed from suppliers and partners, tracked separately from purchases'}
                label="loan" page={loans} state={state} searchRef={searchRef} onSearchKeyDown={onSearchKeyDown} placeholder="Loan number…"
                actions={can('loans.create') && <Link className="hbtn pri" href={route('loans.create', direction)}><Plus className="i" aria-hidden="true" />New {title}</Link>}
                summary={<section className="register-stats" aria-label="Loan stock totals">
                    {[
                        ['Total Loaned', summary.loaned],
                        ['Returned', summary.returned],
                        [isOut ? 'Outstanding Out' : 'Outstanding In', summary.outstanding],
                    ].map(([label, value]) => <div className="card kpi" key={label}><div className="lbl">{label}</div><div className="val num">{qty(Number(value))}</div></div>)}
                </section>}
                filters={<>
                    <MasterFilterSelect label="Supplier" icon={Building2} value={filters.company_id ?? ''} onChange={value => setFilter('company_id', value || undefined)}>
                        <option value="">All suppliers</option>
                        {companies.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}
                    </MasterFilterSelect>
                    <MasterFilterSelect label="Status" icon={ListFilter} value={filters.status ?? ''} onChange={value => setFilter('status', value || undefined)}>
                        <option value="">All statuses</option>
                        {Object.entries(STATUSES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </MasterFilterSelect>
                    <MasterFilterSelect label="Staff" icon={UserRound} value={filters.user_id ?? ''} onChange={value => setFilter('user_id', value || undefined)}>
                        <option value="">Anyone</option>
                        {users.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}
                    </MasterFilterSelect>
                    <MasterFilterDate label="From" value={filters.from} onChange={value => setFilter('from', value)} />
                    <MasterFilterDate label="To" value={filters.to} onChange={value => setFilter('to', value)} />
                </>}>
                {dense => <Table className={`loan-table${isOut ? ' loan-table-out' : ''}${dense ? ' dense' : ''}`}>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-12">S.No.</TableHead>
                                <TableHead>Loan #</TableHead>
                                <TableHead>Date</TableHead>
                                <TableHead>Last Return</TableHead>
                                <TableHead>Closed</TableHead>
                                <TableHead className="r">Items</TableHead>
                                <TableHead className="r">Qty</TableHead>
                                <TableHead>{isOut ? 'Requested By (Partner)' : 'Requested By (Our Staff)'}</TableHead>
                                <TableHead>{isOut ? 'Received By (Partner)' : 'Received By (Our Staff)'}</TableHead>
                                {isOut && <TableHead>Request Received By (Our Staff)</TableHead>}
                                {isOut && <TableHead>Handed Over By (Our Staff)</TableHead>}
                                <TableHead>Status</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loans.data.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={colSpan} className="empty">
                                        No stock loans found.
                                    </TableCell>
                                </TableRow>
                            )}
                            {loans.data.map((loan, index) => (
                                <TableRow key={loan.id} {...rowProps(index)}>
                                    <TableCell className="text-muted-foreground">
                                        {(loans.from ?? 0) + index}
                                    </TableCell>
                                    <TableCell>
                                        <Link href={route('loans.edit', loan.id)} className="inv hover:underline">
                                            {loan.loan_number}
                                        </Link>
                                        <div className="row-secondary">{loan.company?.name}</div>
                                    </TableCell>
                                    <TableCell>{shortDate(loan.loan_date)}</TableCell>
                                    <TableCell>{shortDate(loan.last_return_date)}</TableCell>
                                    <TableCell>{shortDate(loan.closed_at)}</TableCell>
                                    <TableCell className="r num">{loan.items_count}</TableCell>
                                    <TableCell className="r num">{qty(loan.total_quantity)}</TableCell>
                                    <TableCell>{isOut ? loan.external_requested_by || '—' : loan.requested_by?.name ?? '—'}</TableCell>
                                    <TableCell>{isOut ? loan.external_received_by || '—' : loan.received_by?.name ?? '—'}</TableCell>
                                    {isOut && <TableCell>{loan.request_received_by?.name ?? '—'}</TableCell>}
                                    {isOut && <TableCell>{loan.handed_over_by?.name ?? '—'}</TableCell>}
                                    <TableCell>
                                        <MasterStatus status={loan.status.replaceAll('_', ' ')} tone={loan.status === 'cancelled' ? 'negative' : ['returned', 'closed'].includes(loan.status) ? 'positive' : ['pending', 'partially_returned'].includes(loan.status) ? 'attention' : 'neutral'} />
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                </Table>}
            </MasterRegister>
        </AppLayout>
    );
}
