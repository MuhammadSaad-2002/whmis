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
import { money, qty, shortDate } from '@/lib/format';
import { type BreadcrumbItem } from '@/types';
import { Head, Link, router } from '@inertiajs/react';
import { Plus, Printer, Search } from 'lucide-react';
import { useEffect, useState } from 'react';

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

const statusVariant = (status: string) =>
    status === 'posted' ? 'default' : status === 'cancelled' ? 'destructive' : 'secondary';

export default function SampleIssuesIndex({ issues, customers, filters }: Props) {
    const { can } = usePermissions();
    const [search, setSearch] = useState(filters.search ?? '');
    const { searchRef, onSearchKeyDown, rowProps } = useListKeyboardNav({
        rowCount: issues.data.length,
        onActivate: (i) => router.visit(route('samples.issues.edit', issues.data[i].id)),
    });

    useEffect(() => {
        const timeout = setTimeout(() => {
            if ((filters.search ?? '') !== search) {
                router.get('/samples/issues', { ...filters, search: search || undefined }, { preserveState: true, replace: true });
            }
        }, 350);
        return () => clearTimeout(timeout);
    }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

    const setFilter = (key: string, value?: string) =>
        router.get('/samples/issues', { ...filters, [key]: value }, { preserveState: true });

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Sample Issues" />
            <div className="flex h-full flex-col gap-4 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-4">
                    <div>
                        <h1 className="text-4xl font-bold">Sample Issues</h1>
                        <p className="text-sm text-muted-foreground">Free samples given to customers / doctors — no charge, no receivable</p>
                    </div>
                    {can('samples.issue') && (
                        <Button asChild>
                            <Link href={route('samples.issues.create')}>
                                <Plus className="mr-1 size-4" /> New Sample Issue
                            </Link>
                        </Button>
                    )}
                </div>

                <div className="flex flex-wrap gap-2">
                    <div className="relative w-full sm:w-64">
                        <Search className="absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
                        <Input ref={searchRef} onKeyDown={onSearchKeyDown} placeholder="Issue number…" className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} />
                    </div>
                    <Select value={filters.customer_id ?? 'all'} onValueChange={(v) => setFilter('customer_id', v === 'all' ? undefined : v)}>
                        <SelectTrigger className="w-48"><SelectValue placeholder="Customer" /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All customers</SelectItem>
                            {customers.map((customer) => (
                                <SelectItem key={customer.id} value={String(customer.id)}>{customer.name}</SelectItem>
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
                                <TableHead>Issue #</TableHead>
                                <TableHead>Customer</TableHead>
                                <TableHead>Recipient</TableHead>
                                <TableHead>Date</TableHead>
                                <TableHead className="text-right">Qty</TableHead>
                                <TableHead className="text-right">Cost Value</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="w-16" />
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {issues.data.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                                        No sample issues found.
                                    </TableCell>
                                </TableRow>
                            )}
                            {issues.data.map((issue, index) => (
                                <TableRow key={issue.id} {...rowProps(index)}>
                                    <TableCell>
                                        <Link href={route('samples.issues.edit', issue.id)} className="font-medium hover:underline">
                                            {issue.issue_number}
                                        </Link>
                                    </TableCell>
                                    <TableCell>{issue.customer?.name}</TableCell>
                                    <TableCell>{issue.recipient_name || '—'}</TableCell>
                                    <TableCell>{shortDate(issue.issue_date)}</TableCell>
                                    <TableCell className="text-right tabular-nums">{qty(issue.total_quantity)}</TableCell>
                                    <TableCell className="text-right tabular-nums">{money(issue.total_cost)}</TableCell>
                                    <TableCell>
                                        <Badge variant={statusVariant(issue.status)}>{issue.status}</Badge>
                                    </TableCell>
                                    <TableCell>
                                        <Button variant="ghost" size="icon" asChild title="Print">
                                            <a href={route('samples.issues.print', issue.id)} target="_blank" rel="noreferrer">
                                                <Printer className="size-4" />
                                            </a>
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                    <Paginator meta={issues} />
                </div>
            </div>
        </AppLayout>
    );
}
