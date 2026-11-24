import { MasterFilterDate, MasterFilterSelect, MasterStatus, RegisterLayout, RegisterList } from '@/components/master-register';
import { type PaginatedData } from '@/components/paginator';
import { SearchField } from '@/components/ui/search-field';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Head, router } from '@inertiajs/react';
import AppLayout from '@/layouts/app-layout';
import { fieldLabel, formatValue, HIDDEN_FIELDS } from '@/lib/audit-format';
import { type BreadcrumbItem } from '@/types';
import { ChevronDown, ChevronRight, Files, ListFilter, UserRound } from 'lucide-react';
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

const eventTone = (event: string) => {
    if (['created', 'login', 'posted', 'approved', 'converted'].includes(event)) return 'positive';
    if (['deleted', 'cancelled', 'login_failed'].includes(event)) return 'negative';
    return 'neutral';
};

export default function AuditIndex({ audits, filters, users, events, models }: Props) {
    const [expanded, setExpanded] = useState<number | null>(null);
    const hasFilters = Object.values(filters).some(value => Boolean(value?.trim()));

    const apply = (patch: Record<string, string | undefined>) => {
        router.get('/audit-log', { ...filters, ...patch }, { preserveState: true, replace: true });
    };

    const keys = (row: AuditRow) => {
        const set = new Set([...Object.keys(row.old_values ?? {}), ...Object.keys(row.new_values ?? {})]);
        return [...set].filter((k) => !HIDDEN_FIELDS.has(k));
    };

    const changedSummary = (row: AuditRow) => {
        const k = keys(row);
        if (k.length === 0) return '—';
        const labels = k.map(fieldLabel);
        return labels.slice(0, 4).join(', ') + (labels.length > 4 ? `, +${labels.length - 4} more` : '');
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Audit Log" />
            <RegisterLayout title="Audit Log" description={<>Changes and actions recorded across the system · {audits.total.toLocaleString()} {audits.total === 1 ? 'entry' : 'entries'}</>}>
                <RegisterList title="Audit Log" page={audits}
                    controls={<>
                        <SearchField key={filters.search ?? ''} aria-label="Search audit log" placeholder="URL, tags, or values…" defaultValue={filters.search ?? ''}
                            onKeyDown={event => { if (event.key === 'Enter') apply({ search: event.currentTarget.value.trim() || undefined }); }} />
                        <MasterFilterSelect label="User" icon={UserRound} value={filters.user_id ?? ''} onChange={value => apply({ user_id: value || undefined })}>
                            <option value="">All users</option>
                            {users.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}
                        </MasterFilterSelect>
                        <MasterFilterSelect label="Event" icon={ListFilter} value={filters.event ?? ''} onChange={value => apply({ event: value || undefined })}>
                            <option value="">All events</option>
                            {events.map(option => <option key={option} value={option}>{option}</option>)}
                        </MasterFilterSelect>
                        <MasterFilterSelect label="Record type" icon={Files} value={filters.model ?? ''} onChange={value => apply({ model: value || undefined })}>
                            <option value="">All records</option>
                            {models.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                        </MasterFilterSelect>
                        <MasterFilterDate label="From" value={filters.from} onChange={value => apply({ from: value })} />
                        <MasterFilterDate label="To" value={filters.to} onChange={value => apply({ to: value })} />
                        {hasFilters && <button type="button" className="clear" onClick={() => router.get('/audit-log', {}, { preserveScroll: true, preserveState: true, replace: true })}>Clear filters</button>}
                    </>}>
                    {dense => <Table className={dense ? 'audit-table dense' : 'audit-table'}>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-8"><span className="sr-only">Details</span></TableHead>
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
                                    <TableCell colSpan={7} className="empty">
                                        No audit entries match these filters.
                                    </TableCell>
                                </TableRow>
                            )}
                            {audits.data.map((row) => (
                                <Fragment key={row.id}>
                                    <TableRow className="audit-toggle-row" onClick={() => setExpanded(expanded === row.id ? null : row.id)}>
                                        <TableCell>
                                            <button type="button" className="ib" aria-expanded={expanded === row.id} aria-label={expanded === row.id ? 'Hide change details' : 'Show change details'}
                                                onClick={event => { event.stopPropagation(); setExpanded(expanded === row.id ? null : row.id); }}>
                                                {expanded === row.id ? <ChevronDown className="i" aria-hidden="true" /> : <ChevronRight className="i" aria-hidden="true" />}
                                            </button>
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
                                        <TableCell><MasterStatus status={row.event.replaceAll('_', ' ')} tone={eventTone(row.event)} /></TableCell>
                                        <TableCell className="text-sm">
                                            {row.auditable_label ? `${row.auditable_label}${row.auditable_id ? ` #${row.auditable_id}` : ''}` : '—'}
                                        </TableCell>
                                        <TableCell className="text-sm text-muted-foreground">{changedSummary(row)}</TableCell>
                                        <TableCell className="text-xs tabular-nums text-muted-foreground">{row.ip_address ?? '—'}</TableCell>
                                    </TableRow>
                                    {expanded === row.id && (
                                        <TableRow>
                                            <TableCell colSpan={7} className="audit-detail wrap-cell">
                                                <div className="space-y-2 p-2">
                                                    {row.url && <div className="text-xs text-muted-foreground">URL: {row.url}</div>}
                                                    {keys(row).length === 0 ? (
                                                        <div className="text-sm text-muted-foreground">No field-level changes recorded.</div>
                                                    ) : (
                                                        <table className="register-short-table audit-detail-table">
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
                                                                        <td className="py-1 pr-4 font-medium">{fieldLabel(k)}</td>
                                                                        <td className="py-1 pr-4 text-destructive">{formatValue(row.old_values?.[k])}</td>
                                                                        <td className="py-1 text-green-700 dark:text-green-500">{formatValue(row.new_values?.[k])}</td>
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
                    </Table>}
                </RegisterList>
            </RegisterLayout>
        </AppLayout>
    );
}
