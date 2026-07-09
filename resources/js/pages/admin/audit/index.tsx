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
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Fragment, useState } from 'react';

interface AuditRow {
    id: number;
    event: string;
    user: { name: string; email: string } | null;
    auditable_label: string | null;
    auditable_id: number | null;
    old_values: Record<string, unknown> | null;
    new_values: Record<string, unknown> | null;
    ip_address: string | null;
    url: string | null;
    tags: string | null;
    created_at: string | null;
}

interface Props {
    audits: PaginatedData<AuditRow>;
    filters: { user_id?: string; event?: string; model?: string; from?: string; to?: string; search?: string };
    users: { id: number; name: string }[];
    events: string[];
    models: { value: string; label: string }[];
}

const breadcrumbs: BreadcrumbItem[] = [{ title: 'Audit Log', href: '/audit-log' }];

const eventColor = (event: string): 'default' | 'secondary' | 'destructive' | 'outline' => {
    if (['created', 'login', 'posted', 'approved', 'converted'].includes(event)) return 'default';
    if (['deleted', 'cancelled', 'login_failed'].includes(event)) return 'destructive';
    if (event === 'updated' || event === 'permissions_synced') return 'secondary';
    return 'outline';
};

export default function AuditIndex({ audits, filters, users, events, models }: Props) {
    const [expanded, setExpanded] = useState<number | null>(null);

    const apply = (patch: Record<string, string | undefined>) => {
        router.get('/audit-log', { ...filters, ...patch }, { preserveState: true, replace: true });
    };

    const keys = (row: AuditRow) => {
        const set = new Set([...Object.keys(row.old_values ?? {}), ...Object.keys(row.new_values ?? {})]);
        return [...set];
    };

    const changedSummary = (row: AuditRow) => {
        const k = keys(row);
        if (k.length === 0) return '—';
        return k.slice(0, 4).join(', ') + (k.length > 4 ? `, +${k.length - 4} more` : '');
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Audit Log" />
            <div className="flex h-full flex-col gap-4 p-4">
                <div className="border-b pb-4">
                    <h1 className="text-4xl font-bold">Audit Log</h1>
                    <p className="text-sm text-muted-foreground">Every change and action recorded across the system</p>
                </div>

                <div className="flex flex-wrap gap-2">
                    <Input
                        placeholder="Search url, tags, values…"
                        className="w-full sm:w-64"
                        defaultValue={filters.search ?? ''}
                        onKeyDown={(e) => { if (e.key === 'Enter') apply({ search: (e.target as HTMLInputElement).value || undefined }); }}
                    />
                    <Select value={filters.user_id ?? 'all'} onValueChange={(v) => apply({ user_id: v === 'all' ? undefined : v })}>
                        <SelectTrigger className="w-44"><SelectValue placeholder="User" /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All users</SelectItem>
                            {users.map((u) => <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>)}
                        </SelectContent>
                    </Select>
                    <Select value={filters.event ?? 'all'} onValueChange={(v) => apply({ event: v === 'all' ? undefined : v })}>
                        <SelectTrigger className="w-40"><SelectValue placeholder="Event" /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All events</SelectItem>
                            {events.map((ev) => <SelectItem key={ev} value={ev}>{ev}</SelectItem>)}
                        </SelectContent>
                    </Select>
                    <Select value={filters.model ?? 'all'} onValueChange={(v) => apply({ model: v === 'all' ? undefined : v })}>
                        <SelectTrigger className="w-44"><SelectValue placeholder="Record type" /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All records</SelectItem>
                            {models.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                        </SelectContent>
                    </Select>
                    <Input type="date" className="w-40" value={filters.from ?? ''} onChange={(e) => apply({ from: e.target.value || undefined })} />
                    <Input type="date" className="w-40" value={filters.to ?? ''} onChange={(e) => apply({ to: e.target.value || undefined })} />
                    {(filters.user_id || filters.event || filters.model || filters.from || filters.to || filters.search) && (
                        <Button variant="ghost" onClick={() => router.get('/audit-log')}>Clear</Button>
                    )}
                </div>

                <div className="rounded-xl border">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-8" />
                                <TableHead className="w-44">When</TableHead>
                                <TableHead>User</TableHead>
                                <TableHead>Event</TableHead>
                                <TableHead>Record</TableHead>
                                <TableHead>Changed</TableHead>
                                <TableHead className="w-32">IP</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {audits.data.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                                        No audit entries match these filters.
                                    </TableCell>
                                </TableRow>
                            )}
                            {audits.data.map((row) => (
                                <Fragment key={row.id}>
                                    <TableRow className="cursor-pointer" onClick={() => setExpanded(expanded === row.id ? null : row.id)}>
                                        <TableCell>
                                            {expanded === row.id ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                                        </TableCell>
                                        <TableCell className="whitespace-nowrap text-sm tabular-nums">{row.created_at}</TableCell>
                                        <TableCell>
                                            {row.user ? (
                                                <div>
                                                    <div className="text-sm font-medium">{row.user.name}</div>
                                                    <div className="text-xs lowercase text-muted-foreground">{row.user.email}</div>
                                                </div>
                                            ) : <span className="text-muted-foreground">System</span>}
                                        </TableCell>
                                        <TableCell><Badge variant={eventColor(row.event)}>{row.event}</Badge></TableCell>
                                        <TableCell className="text-sm">
                                            {row.auditable_label ? `${row.auditable_label}${row.auditable_id ? ` #${row.auditable_id}` : ''}` : '—'}
                                        </TableCell>
                                        <TableCell className="text-sm text-muted-foreground">{changedSummary(row)}</TableCell>
                                        <TableCell className="text-xs tabular-nums text-muted-foreground">{row.ip_address ?? '—'}</TableCell>
                                    </TableRow>
                                    {expanded === row.id && (
                                        <TableRow>
                                            <TableCell colSpan={7} className="bg-muted/40">
                                                <div className="space-y-2 p-2">
                                                    {row.url && <div className="text-xs text-muted-foreground">URL: {row.url}</div>}
                                                    {keys(row).length === 0 ? (
                                                        <div className="text-sm text-muted-foreground">No field-level changes recorded.</div>
                                                    ) : (
                                                        <table className="w-full text-sm">
                                                            <thead>
                                                                <tr className="text-left text-xs uppercase text-muted-foreground">
                                                                    <th className="py-1 pr-4">Field</th>
                                                                    <th className="py-1 pr-4">Old</th>
                                                                    <th className="py-1">New</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody>
                                                                {keys(row).map((k) => (
                                                                    <tr key={k} className="border-t">
                                                                        <td className="py-1 pr-4 font-medium">{k}</td>
                                                                        <td className="py-1 pr-4 text-destructive">{formatVal(row.old_values?.[k])}</td>
                                                                        <td className="py-1 text-green-700 dark:text-green-500">{formatVal(row.new_values?.[k])}</td>
                                                                    </tr>
                                                                ))}
                                                            </tbody>
                                                        </table>
                                                    )}
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </Fragment>
                            ))}
                        </TableBody>
                    </Table>
                    <Paginator meta={audits} />
                </div>
            </div>
        </AppLayout>
    );
}

function formatVal(value: unknown): string {
    if (value === null || value === undefined || value === '') return '—';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
}
