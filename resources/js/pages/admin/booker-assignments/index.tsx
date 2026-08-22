import { Paginator, type PaginatedData } from '@/components/paginator';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Head, router } from '@inertiajs/react';
import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';

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
            <div className="flex h-full flex-col gap-4 p-4">
                <div className="border-b pb-4">
                    <h1 className="text-4xl font-bold">Booker Assignments</h1>
                    <p className="text-sm text-muted-foreground">Every customer↔booker assignment change, oldest kept for audit</p>
                </div>

                <div className="flex flex-wrap gap-2">
                    <Select value={filters.customer_id ?? 'all'} onValueChange={(v) => apply({ customer_id: v === 'all' ? undefined : v })}>
                        <SelectTrigger className="w-56"><SelectValue placeholder="Customer" /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All customers</SelectItem>
                            {customers.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                        </SelectContent>
                    </Select>
                    <Select value={filters.booker_id ?? 'all'} onValueChange={(v) => apply({ booker_id: v === 'all' ? undefined : v })}>
                        <SelectTrigger className="w-48"><SelectValue placeholder="Booker" /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All bookers</SelectItem>
                            {bookers.map((b) => <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>)}
                        </SelectContent>
                    </Select>
                    <Select value={filters.action ?? 'all'} onValueChange={(v) => apply({ action: v === 'all' ? undefined : v })}>
                        <SelectTrigger className="w-40"><SelectValue placeholder="Action" /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All actions</SelectItem>
                            <SelectItem value="assigned">Assigned</SelectItem>
                            <SelectItem value="unassigned">Unassigned</SelectItem>
                        </SelectContent>
                    </Select>
                    <Input type="date" className="w-40" value={filters.from ?? ''} onChange={(e) => apply({ from: e.target.value || undefined })} />
                    <Input type="date" className="w-40" value={filters.to ?? ''} onChange={(e) => apply({ to: e.target.value || undefined })} />
                    {hasFilters && (
                        <Button variant="ghost" onClick={() => router.get('/booker-assignments')}>Clear</Button>
                    )}
                </div>

                <div className="rounded-xl border">
                    <Table>
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
                                    <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
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
                                        <Badge variant={row.action === 'assigned' ? 'default' : 'destructive'}>{row.action}</Badge>
                                    </TableCell>
                                    <TableCell className="text-sm text-muted-foreground">{row.changed_by ?? 'System'}</TableCell>
                                    <TableCell className="text-sm text-muted-foreground">{row.note ?? '—'}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                    <Paginator meta={logs} />
                </div>
            </div>
        </AppLayout>
    );
}
