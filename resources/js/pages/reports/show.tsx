import { TrendChart, type TrendPoint } from '@/components/trend-chart';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import AppLayout from '@/layouts/app-layout';
import { amount, qty, shortDate } from '@/lib/format';
import { type BreadcrumbItem } from '@/types';
import { Head, router } from '@inertiajs/react';
import { FileDown, FileSpreadsheet } from 'lucide-react';

interface Column {
    key: string;
    label: string;
    align?: 'right';
    format?: 'money' | 'qty' | 'date' | 'pct';
}

interface Option { id: number; name: string }

interface Props {
    report: { key: string; title: string; description: string; filters: string[] };
    columns: Column[];
    rows: Record<string, string | number | null>[];
    totals: Record<string, number>;
    chart: TrendPoint[] | null;
    filterValues: Record<string, string | undefined>;
    options: { customers: Option[]; suppliers: Option[] };
}

function formatCell(value: string | number | null, format?: Column['format']): string {
    if (value === null || value === undefined || value === '') return '—';
    switch (format) {
        case 'money': return amount(value);
        case 'qty': return qty(value);
        case 'date': return shortDate(String(value));
        case 'pct': return `${value}%`;
        default: return String(value);
    }
}

export default function ReportShow({ report, columns, rows, totals, chart, filterValues, options }: Props) {
    const breadcrumbs: BreadcrumbItem[] = [
        { title: 'Reports', href: '/reports' },
        { title: report.title, href: '#' },
    ];

    const applyFilter = (patch: Record<string, string | undefined>) => {
        router.get(route('reports.show', report.key), { ...filterValues, ...patch }, { preserveState: true });
    };

    const exportUrl = (format: string) => {
        const params = new URLSearchParams();
        Object.entries(filterValues).forEach(([key, value]) => value && params.set(key, value));
        params.set('format', format);
        return `${route('reports.show', report.key)}?${params}`;
    };

    const has = (filter: string) => report.filters.includes(filter);

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={report.title} />
            <div className="flex h-full flex-col gap-4 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                        <h1 className="text-2xl font-bold">{report.title}</h1>
                        <p className="text-sm text-muted-foreground">{report.description}</p>
                    </div>
                    <div className="flex gap-2">
                        <Button variant="outline" size="sm" asChild>
                            <a href={exportUrl('xlsx')}>
                                <FileSpreadsheet className="mr-1 size-4" /> Excel
                            </a>
                        </Button>
                        <Button variant="outline" size="sm" asChild>
                            <a href={exportUrl('pdf')} target="_blank" rel="noreferrer">
                                <FileDown className="mr-1 size-4" /> PDF
                            </a>
                        </Button>
                    </div>
                </div>

                <div className="flex flex-wrap items-end gap-2">
                    {has('date_range') && (
                        <>
                            <div>
                                <Label className="text-xs">From</Label>
                                <Input
                                    type="date" className="w-40"
                                    value={filterValues.from ?? ''}
                                    onChange={(e) => applyFilter({ from: e.target.value || undefined })}
                                />
                            </div>
                            <div>
                                <Label className="text-xs">To</Label>
                                <Input
                                    type="date" className="w-40"
                                    value={filterValues.to ?? ''}
                                    onChange={(e) => applyFilter({ to: e.target.value || undefined })}
                                />
                            </div>
                        </>
                    )}
                    {has('customer') && (
                        <Select
                            value={filterValues.customer_id ?? 'all'}
                            onValueChange={(v) => applyFilter({ customer_id: v === 'all' ? undefined : v })}
                        >
                            <SelectTrigger className="w-48"><SelectValue placeholder="Customer" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All customers</SelectItem>
                                {options.customers.map((option) => (
                                    <SelectItem key={option.id} value={String(option.id)}>{option.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    )}
                    {has('supplier') && (
                        <Select
                            value={filterValues.company_id ?? 'all'}
                            onValueChange={(v) => applyFilter({ company_id: v === 'all' ? undefined : v })}
                        >
                            <SelectTrigger className="w-48"><SelectValue placeholder="Supplier" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All suppliers</SelectItem>
                                {options.suppliers.map((option) => (
                                    <SelectItem key={option.id} value={String(option.id)}>{option.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    )}
                    {has('expiry_window') && (
                        <Select
                            value={filterValues.expiry_window ?? '90'}
                            onValueChange={(v) => applyFilter({ expiry_window: v })}
                        >
                            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="expired">Already expired</SelectItem>
                                <SelectItem value="30">Within 30 days</SelectItem>
                                <SelectItem value="90">Within 90 days</SelectItem>
                                <SelectItem value="180">Within 180 days</SelectItem>
                            </SelectContent>
                        </Select>
                    )}
                    {has('order') && (
                        <Select
                            value={filterValues.order ?? 'slow'}
                            onValueChange={(v) => applyFilter({ order: v })}
                        >
                            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="slow">Slowest moving first</SelectItem>
                                <SelectItem value="fast">Fastest moving first</SelectItem>
                            </SelectContent>
                        </Select>
                    )}
                </div>

                {chart && chart.length > 0 && (
                    <Card>
                        <CardContent className="pt-4">
                            <TrendChart data={chart} />
                        </CardContent>
                    </Card>
                )}

                <div className="rounded-xl border">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                {columns.map((column) => (
                                    <TableHead key={column.key} className={column.align === 'right' ? 'text-right' : ''}>
                                        {column.label}
                                    </TableHead>
                                ))}
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {rows.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={columns.length} className="py-10 text-center text-muted-foreground">
                                        No data for the selected filters.
                                    </TableCell>
                                </TableRow>
                            )}
                            {rows.map((row, index) => (
                                <TableRow key={index}>
                                    {columns.map((column) => (
                                        <TableCell
                                            key={column.key}
                                            className={column.align === 'right' ? 'text-right tabular-nums' : ''}
                                        >
                                            {formatCell(row[column.key] ?? null, column.format)}
                                        </TableCell>
                                    ))}
                                </TableRow>
                            ))}
                            {rows.length > 0 && Object.keys(totals).length > 0 && (
                                <TableRow className="bg-muted/30 font-semibold">
                                    {columns.map((column, index) => (
                                        <TableCell
                                            key={column.key}
                                            className={column.align === 'right' ? 'text-right tabular-nums' : ''}
                                        >
                                            {column.key in totals
                                                ? formatCell(totals[column.key], column.format)
                                                : index === 0 ? 'TOTAL' : ''}
                                        </TableCell>
                                    ))}
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </div>
                <p className="text-xs text-muted-foreground">{rows.length} rows</p>
            </div>
        </AppLayout>
    );
}
