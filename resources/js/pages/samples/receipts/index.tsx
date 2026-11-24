import { MasterFilterDate, MasterFilterSelect, MasterRegister, MasterStatus, useMasterFilters } from '@/components/master-register';
import { type PaginatedData } from '@/components/paginator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { usePermissions } from '@/hooks/use-permissions';
import { useListKeyboardNav } from '@/hooks/use-list-keyboard-nav';
import AppLayout from '@/layouts/app-layout';
import { qty, shortDate } from '@/lib/format';
import { type BreadcrumbItem } from '@/types';
import { Head, Link, router } from '@inertiajs/react';
import { Building2, ListFilter, Plus, Printer } from 'lucide-react';

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

const STATUSES = { draft: 'Draft', posted: 'Posted', cancelled: 'Cancelled' };

export default function SampleReceiptsIndex({ receipts, companies, filters }: Props) {
    const { can } = usePermissions();
    const state = useMasterFilters('/samples/receipts', filters);
    const setFilter = (key: string, value?: string) => state.change({ [key]: value });
    const { searchRef, onSearchKeyDown, rowProps } = useListKeyboardNav({
        rowCount: receipts.data.length,
        onActivate: (i) => router.visit(route('samples.receipts.edit', receipts.data[i].id)),
    });

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Sample Receipts" />
            <MasterRegister title="Sample Receipts" description="Zero-cost samples received from suppliers, tracked separately from purchased stock"
                label="receipt" page={receipts} state={state} searchRef={searchRef} onSearchKeyDown={onSearchKeyDown} placeholder="Receipt number…"
                actions={can('samples.receive') && <Link className="hbtn pri" href={route('samples.receipts.create')}><Plus className="i" aria-hidden="true" />New Sample Receipt</Link>}
                filters={<>
                    <MasterFilterSelect label="Supplier" icon={Building2} value={filters.company_id ?? ''} onChange={value => setFilter('company_id', value || undefined)}>
                        <option value="">All suppliers</option>
                        {companies.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}
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
                                <TableHead>Receipt #</TableHead>
                                <TableHead>Supplier</TableHead>
                                <TableHead>Date</TableHead>
                                <TableHead className="r">Sample Qty</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="w-16"><span className="sr-only">Actions</span></TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {receipts.data.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={6} className="empty">
                                        No sample receipts found.
                                    </TableCell>
                                </TableRow>
                            )}
                            {receipts.data.map((receipt, index) => (
                                <TableRow key={receipt.id} {...rowProps(index)}>
                                    <TableCell>
                                        <Link href={route('samples.receipts.edit', receipt.id)} className="inv hover:underline">
                                            {receipt.receipt_number}
                                        </Link>
                                    </TableCell>
                                    <TableCell>{receipt.company?.name}</TableCell>
                                    <TableCell>{shortDate(receipt.receipt_date)}</TableCell>
                                    <TableCell className="r num">{qty(receipt.total_quantity)}</TableCell>
                                    <TableCell>
                                        <MasterStatus status={receipt.status.replaceAll('_', ' ')} tone={receipt.status === 'cancelled' ? 'negative' : receipt.status === 'posted' ? 'positive' : receipt.status === 'draft' ? 'attention' : 'neutral'} />
                                    </TableCell>
                                    <TableCell>
                                        <div className="acts"><a className="ib" title="Print" aria-label="Print" href={route('samples.receipts.print', receipt.id)} target="_blank" rel="noreferrer">
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
