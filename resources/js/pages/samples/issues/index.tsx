import { MasterFilterDate, MasterFilterSelect, MasterRegister, MasterStatus, useMasterFilters } from '@/components/master-register';
import { type PaginatedData } from '@/components/paginator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { usePermissions } from '@/hooks/use-permissions';
import { useListKeyboardNav } from '@/hooks/use-list-keyboard-nav';
import AppLayout from '@/layouts/app-layout';
import { money, qty, shortDate } from '@/lib/format';
import { type BreadcrumbItem } from '@/types';
import { Head, Link, router } from '@inertiajs/react';
import { Building2, ListFilter, Plus, Printer } from 'lucide-react';

interface IssueRow {
    id: number;
    issue_number: string;
    issue_date: string;
    status: string;
    recipient_name: string | null;
    total_quantity: string;
    total_cost: string;
    customer?: { id: number; name: string };
}

interface Props {
    issues: PaginatedData<IssueRow>;
    customers: { id: number; name: string }[];
    filters: { search?: string; customer_id?: string; status?: string; from?: string; to?: string };
}

const breadcrumbs: BreadcrumbItem[] = [{ title: 'Sample Issues', href: '/samples/issues' }];

const STATUSES = { draft: 'Draft', posted: 'Posted', cancelled: 'Cancelled' };

export default function SampleIssuesIndex({ issues, customers, filters }: Props) {
    const { can } = usePermissions();
    const state = useMasterFilters('/samples/issues', filters);
    const setFilter = (key: string, value?: string) => state.change({ [key]: value });
    const { searchRef, onSearchKeyDown, rowProps } = useListKeyboardNav({
        rowCount: issues.data.length,
        onActivate: (i) => router.visit(route('samples.issues.edit', issues.data[i].id)),
    });

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Sample Issues" />
            <MasterRegister title="Sample Issues" description="Free samples issued to customers or doctors, with no receivable"
                label="issue" page={issues} state={state} searchRef={searchRef} onSearchKeyDown={onSearchKeyDown} placeholder="Issue number…"
                actions={can('samples.issue') && <Link className="hbtn pri" href={route('samples.issues.create')}><Plus className="i" aria-hidden="true" />New Sample Issue</Link>}
                filters={<>
                    <MasterFilterSelect label="Customer" icon={Building2} value={filters.customer_id ?? ''} onChange={value => setFilter('customer_id', value || undefined)}>
                        <option value="">All customers</option>
                        {customers.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}
                    </MasterFilterSelect>
                    <MasterFilterSelect label="Status" icon={ListFilter} value={filters.status ?? ''} onChange={value => setFilter('status', value || undefined)}>
                        <option value="">All statuses</option>
                        {Object.entries(STATUSES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </MasterFilterSelect>
                    <MasterFilterDate label="From" value={filters.from} onChange={value => setFilter('from', value)} />
                    <MasterFilterDate label="To" value={filters.to} onChange={value => setFilter('to', value)} />
                </>}>
                {dense => <Table className={dense ? 'dense' : undefined}>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Issue #</TableHead>
                                <TableHead>Customer</TableHead>
                                <TableHead>Recipient</TableHead>
                                <TableHead>Date</TableHead>
                                <TableHead className="r">Qty</TableHead>
                                <TableHead className="r">Cost Value</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="w-16"><span className="sr-only">Actions</span></TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {issues.data.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={8} className="empty">
                                        No sample issues found.
                                    </TableCell>
                                </TableRow>
                            )}
                            {issues.data.map((issue, index) => (
                                <TableRow key={issue.id} {...rowProps(index)}>
                                    <TableCell>
                                        <Link href={route('samples.issues.edit', issue.id)} className="inv hover:underline">
                                            {issue.issue_number}
                                        </Link>
                                    </TableCell>
                                    <TableCell>{issue.customer?.name}</TableCell>
                                    <TableCell>{issue.recipient_name || '—'}</TableCell>
                                    <TableCell>{shortDate(issue.issue_date)}</TableCell>
                                    <TableCell className="r num">{qty(issue.total_quantity)}</TableCell>
                                    <TableCell className="r num">{money(issue.total_cost)}</TableCell>
                                    <TableCell>
                                        <MasterStatus status={issue.status.replaceAll('_', ' ')} tone={issue.status === 'cancelled' ? 'negative' : issue.status === 'posted' ? 'positive' : issue.status === 'draft' ? 'attention' : 'neutral'} />
                                    </TableCell>
                                    <TableCell>
                                        <div className="acts"><a className="ib" title="Print" aria-label="Print" href={route('samples.issues.print', issue.id)} target="_blank" rel="noreferrer">
                                            <Printer className="i" aria-hidden="true" />
                                        </a></div>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                </Table>}
            </MasterRegister>
        </AppLayout>
    );
}
