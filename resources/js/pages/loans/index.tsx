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
import { Plus, Search } from 'lucide-react';
import { useEffect, useState } from 'react';

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
    request_received_by?: UserRef | null;
    handed_over_by?: UserRef | null;
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

const statusVariant = (status: string) =>
    status === 'returned' || status === 'closed'
        ? 'default'
        : status === 'cancelled'
          ? 'destructive'
          : status === 'partially_returned'
            ? 'outline'
            : 'secondary';

export default function LoansIndex({ direction, loans, companies, users, summary, filters }: Props) {
    const { can } = usePermissions();
    const isOut = direction === 'out';
    const title = isOut ? 'Loan Stock Out' : 'Loan Stock In';
    const base = `/loans/${direction}`;

    const [search, setSearch] = useState(filters.search ?? '');
    const { searchRef, onSearchKeyDown, rowProps } = useListKeyboardNav({
        rowCount: loans.data.length,
        onActivate: (i) => router.visit(route('loans.edit', loans.data[i].id)),
    });

    useEffect(() => {
        const timeout = setTimeout(() => {
            if ((filters.search ?? '') !== search) {
                router.get(base, { ...filters, search: search || undefined }, { preserveState: true, replace: true });
            }
        }, 350);
        return () => clearTimeout(timeout);
    }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

    const setFilter = (key: string, value?: string) =>
        router.get(base, { ...filters, [key]: value }, { preserveState: true });

    const breadcrumbs: BreadcrumbItem[] = [{ title, href: base }];
    const colSpan = isOut ? 9 : 7;

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={title} />
            <div className="flex h-full flex-col gap-4 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-4">
                    <div>
                        <h1 className="text-4xl font-bold">{title}</h1>
                        <p className="text-sm text-muted-foreground">
                            {isOut
                                ? 'Products loaned out to suppliers/partners — tracked separately from sales'
                                : 'Products received on loan from suppliers/partners — tracked separately from purchases'}
                        </p>
                    </div>
                    {can('loans.create') && (
                        <Button asChild>
                            <Link href={route('loans.create', direction)}>
                                <Plus className="mr-1 size-4" /> New {title}
                            </Link>
                        </Button>
                    )}
                </div>

                <div className="grid grid-cols-3 gap-3">
                    <div className="rounded-xl border p-3">
                        <div className="text-xs text-muted-foreground uppercase">Total Loaned</div>
                        <div className="text-2xl font-bold tabular-nums">{qty(summary.loaned)}</div>
                    </div>
                    <div className="rounded-xl border p-3">
                        <div className="text-xs text-muted-foreground uppercase">Returned</div>
                        <div className="text-2xl font-bold tabular-nums">{qty(summary.returned)}</div>
                    </div>
                    <div className="rounded-xl border p-3">
                        <div className="text-xs text-muted-foreground uppercase">Outstanding {isOut ? 'Out' : 'In'}</div>
                        <div className="text-2xl font-bold tabular-nums text-primary">{qty(summary.outstanding)}</div>
                    </div>
                </div>

                <div className="flex flex-wrap gap-2">
                    <div className="relative w-full sm:w-56">
                        <Search className="absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
                        <Input ref={searchRef} onKeyDown={onSearchKeyDown} placeholder="Loan number…" className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} />
                    </div>
                    <Select value={filters.company_id ?? 'all'} onValueChange={(v) => setFilter('company_id', v === 'all' ? undefined : v)}>
                        <SelectTrigger className="w-44"><SelectValue placeholder="Supplier" /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All suppliers</SelectItem>
                            {companies.map((c) => (
                                <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <Select value={filters.status ?? 'all'} onValueChange={(v) => setFilter('status', v === 'all' ? undefined : v)}>
                        <SelectTrigger className="w-44"><SelectValue placeholder="Status" /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All statuses</SelectItem>
                            {Object.entries(STATUSES).map(([value, label]) => (
                                <SelectItem key={value} value={value}>{label}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <Select value={filters.user_id ?? 'all'} onValueChange={(v) => setFilter('user_id', v === 'all' ? undefined : v)}>
                        <SelectTrigger className="w-44"><SelectValue placeholder="Person" /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">Anyone</SelectItem>
                            {users.map((u) => (
                                <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <Input type="date" className="w-40" value={filters.from ?? ''} onChange={(e) => setFilter('from', e.target.value || undefined)} />
                    <Input type="date" className="w-40" value={filters.to ?? ''} onChange={(e) => setFilter('to', e.target.value || undefined)} />
                </div>

                <div className="rounded-xl border">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-12">S.No.</TableHead>
                                <TableHead>Loan #</TableHead>
                                <TableHead>Date</TableHead>
                                <TableHead className="text-right">Items</TableHead>
                                <TableHead className="text-right">Qty</TableHead>
                                <TableHead>Requested By</TableHead>
                                <TableHead>Received By</TableHead>
                                {isOut && <TableHead>Request Received By</TableHead>}
                                {isOut && <TableHead>Handed Over By</TableHead>}
                                <TableHead>Status</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loans.data.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={colSpan} className="py-10 text-center text-muted-foreground">
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
                                        <Link href={route('loans.edit', loan.id)} className="font-medium hover:underline">
                                            {loan.loan_number}
                                        </Link>
                                        <div className="text-xs text-muted-foreground">{loan.company?.name}</div>
                                    </TableCell>
                                    <TableCell>{shortDate(loan.loan_date)}</TableCell>
                                    <TableCell className="text-right tabular-nums">{loan.items_count}</TableCell>
                                    <TableCell className="text-right tabular-nums">{qty(loan.total_quantity)}</TableCell>
                                    <TableCell>{loan.requested_by?.name ?? '—'}</TableCell>
                                    <TableCell>{loan.received_by?.name ?? '—'}</TableCell>
                                    {isOut && <TableCell>{loan.request_received_by?.name ?? '—'}</TableCell>}
                                    {isOut && <TableCell>{loan.handed_over_by?.name ?? '—'}</TableCell>}
                                    <TableCell>
                                        <Badge variant={statusVariant(loan.status)}>{STATUSES[loan.status] ?? loan.status}</Badge>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                    <Paginator meta={loans} />
                </div>
            </div>
        </AppLayout>
    );
}
