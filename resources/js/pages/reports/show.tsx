import { RegisterLayout, RegisterList, RegisterMetric } from '@/components/master-register';
import { SearchableSelect } from '@/components/searchable-select';
import { TrendChart, type TrendPoint } from '@/components/trend-chart';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import AppLayout from '@/layouts/app-layout';
import { amount, qty, shiftDate, shortDate, totalAmount } from '@/lib/format';
import { cn } from '@/lib/utils';
import { type BreadcrumbItem } from '@/types';
import { Head, router } from '@inertiajs/react';
import {
    ArrowDownToLine,
    ArrowUpFromLine,
    BarChart3,
    CalendarRange,
    ChartBar,
    ChartLine,
    ChartPie,
    ChevronDown,
    FileDown,
    FileSpreadsheet,
    Info,
    RotateCcw,
    SlidersHorizontal,
} from 'lucide-react';
import { Fragment, useEffect, useMemo, useState } from 'react';
import ChartView, { type ReportChartView } from './chart-view';
import './reports.css';

interface Column {
    key: string;
    label: string;
    align?: 'right';
    format?: 'money' | 'qty' | 'date' | 'pct';
    final?: boolean;
    wrap?: boolean;
}

interface Option {
    id: number;
    name: string;
}

interface ReportTableData {
    columns: Column[];
    rows: Record<string, string | number | null>[];
    totals: Record<string, number>;
    groupBy?: string | null;
}

interface Props extends ReportTableData {
    report: { key: string; title: string; description: string; filters: string[] };
    chart: TrendPoint[] | null;
    chartViews: ReportChartView[];
    chartColors: string[];
    visualization: RankedChartConfig | null;
    sections?: (ReportTableData & { title: string })[];
    sectionTitle?: string | null;
    context?: string | null;
    notes?: string[];
    filterValues: Record<string, string | undefined>;
    defaultDates: { from: string; to: string };
    options: { customers: Option[]; suppliers: Option[]; products: Option[] };
}

interface MetricConfig {
    key: string;
    label: string;
    format: 'money' | 'qty' | 'pct';
    labelKey?: string;
    valueKey?: string;
}

interface RankedChartConfig {
    labelKey: string;
    metrics: MetricConfig[];
}

const SUMMARY_KEYS: Record<string, string[]> = {
    'sales-register': ['net_amount', 'received', 'outstanding', 'net_profit'],
    'product-sales': ['net_revenue', 'net_cost', 'net_profit', 'net_qty'],
    'all-time-product-cogs': ['net_qty_sold', 'net_cogs', 'qty_returned', 'return_cogs'],
    'customer-sales': ['net_revenue', 'received', 'net_profit', 'outstanding'],
    'booker-sales': ['net_revenue', 'received', 'net_profit', 'invoices'],
    'product-sales-daily': ['revenue', 'cost', 'profit', 'qty'],
    'purchase-register': ['total_amount', 'total_margin'],
    'supplier-purchases': ['total', 'margin', 'invoices'],
    'stock-position': ['value', 'stock'],
    'stock-movement': ['closing', 'value', 'purchased', 'billed'],
    expiry: ['value', 'qty'],
    outstanding: ['balance', 'over_90', 'current', 'd31_60'],
    'supplier-payables': ['balance'],
    'profit-by-month': ['net_sales', 'received', 'profit', 'cost'],
    'all-time-purchases-stock': ['purchased', 'sold', 'on_hold', 'available'],
};

function formatCell(value: string | number | null, format?: Column['format'], final = false): string {
    if (value === null || value === undefined || value === '') return '—';
    switch (format) {
        case 'money':
            return final ? totalAmount(value) : amount(value);
        case 'qty':
            return qty(value);
        case 'date':
            return shortDate(String(value));
        case 'pct':
            return `${value}%`;
        default:
            return String(value);
    }
}

function firstNumber(data: Record<string, string | number | null>, keys: string[]): number | null {
    for (const key of keys) {
        const value = data[key];
        if (value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value))) return Number(value);
    }

    return null;
}

function negativeExplanation(columnKey: string, label: string, data: Record<string, string | number | null>): string {
    if (columnKey === 'purchase_value') return 'Posted return cost exceeds the posted cost of the sold and bonus units in this row.';
    if (columnKey === 'net_sale_value') return 'Posted return credits exceed this supplier’s share of the invoice sale value.';
    const grossRevenue = firstNumber(data, ['revenue', 'gross_revenue', 'sales', 'total_amount']);
    const returns = firstNumber(data, ['returns', 'credit_notes']);
    const netRevenue = firstNumber(data, ['net_revenue', 'net_sales', 'net_amount']);
    const grossCost = firstNumber(data, ['gross_cost', 'gross_cogs']);
    const returnCost = firstNumber(data, ['return_cost', 'return_cogs']);
    const netCost = firstNumber(data, ['net_cost', 'net_cogs', 'cost']);
    const soldQuantity = firstNumber(data, ['qty', 'qty_sold', 'sold', 'loaned']);
    const returnedQuantity = firstNumber(data, ['returned_qty', 'qty_returned', 'returned']);

    if ((columnKey.includes('qty') || columnKey === 'net') && soldQuantity !== null && returnedQuantity !== null && returnedQuantity > soldQuantity) {
        return `Negative ${label}: returned quantity (${qty(returnedQuantity)}) exceeds the quantity recorded in the selected report data (${qty(soldQuantity)}).`;
    }

    if (
        (columnKey.includes('revenue') || columnKey.includes('sales') || columnKey === 'net_amount') &&
        grossRevenue !== null &&
        returns !== null &&
        returns > grossRevenue
    ) {
        return `Negative ${label}: returns of Rs ${amount(returns)} exceed gross revenue of Rs ${amount(grossRevenue)} in the selected report data.`;
    }

    if ((columnKey.includes('cost') || columnKey.includes('cogs')) && grossCost !== null && returnCost !== null && returnCost > grossCost) {
        return `Negative ${label}: returned COGS of Rs ${amount(returnCost)} exceeds gross COGS of Rs ${amount(grossCost)} in the selected report data.`;
    }

    if (columnKey.includes('profit')) {
        if (grossRevenue !== null && returns !== null && returns > grossRevenue) {
            return `Negative ${label}: a return of Rs ${amount(returns)} is present against only Rs ${amount(grossRevenue)} of gross revenue in the selected report data. Profit also includes the related COGS reversal.`;
        }
        if (netRevenue !== null && netCost !== null && netCost > netRevenue) {
            return `Negative ${label}: net cost of Rs ${amount(netCost)} exceeds net revenue of Rs ${amount(netRevenue)} by Rs ${amount(netCost - netRevenue)}.`;
        }
        return `Negative ${label}: after discounts, returns, bonus-unit cost, and COGS, the recorded costs exceed the revenue in this row.`;
    }

    if (columnKey.includes('margin')) {
        return `Negative ${label}: the underlying net profit is below zero for this row.`;
    }

    if (columnKey === 'balance' || columnKey === 'outstanding') {
        return `Negative ${label}: credits or payments exceed debits, which generally represents an advance or credit balance rather than an amount receivable.`;
    }

    return `Negative ${label}: deductions, returns, credits, or outbound quantities exceed the corresponding positive amount in the selected report data.`;
}

function NegativeValueInfo({ explanation }: { explanation: string }) {
    return (
        <TooltipProvider delayDuration={100}>
            <Tooltip>
                <TooltipTrigger asChild>
                    <button
                        type="button"
                        aria-label="Why is this value negative?"
                        className="inline-flex size-4 shrink-0 items-center justify-center rounded-full text-red-600 hover:bg-red-50 focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:outline-none dark:text-red-400 dark:hover:bg-red-950/40"
                    >
                        <Info className="size-3.5" />
                    </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-80 text-left text-xs leading-relaxed">
                    {explanation}
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    );
}

function RankedBars({ data, metric }: { data: { label: string; value: number }[]; metric: MetricConfig }) {
    const min = Math.min(0, ...data.map(({ value }) => value));
    const max = Math.max(0, ...data.map(({ value }) => value));
    const span = max - min || 1;
    const zero = (-min / span) * 100;
    return (
        <figure aria-label={metric.label}>
            <figcaption className="report-chart-caption">
                {metric.label} · {data.length} {data.length === 1 ? 'result' : 'results'} from the current report
                {min < 0 && ' · Red bars show negative values'}
            </figcaption>
            <ol className="report-ranked">
                {data.map(({ label, value }) => (
                    <li key={label}>
                        <span className="report-bar-label">{label}</span>
                        <div className="report-bar-track" aria-hidden="true">
                            {min < 0 && max > 0 && <span className="report-bar-zero" style={{ left: `${zero}%` }} />}
                            <span
                                className={cn('report-bar-fill', value < 0 && 'negative')}
                                style={{
                                    left: `${((Math.min(0, value) - min) / span) * 100}%`,
                                    width: `${(Math.abs(value) / span) * 100}%`,
                                }}
                            />
                        </div>
                        <strong className={cn('report-bar-value num', value < 0 && 'neg')}>
                            {metric.format === 'money' && 'Rs '}
                            {formatCell(value, metric.format)}
                        </strong>
                    </li>
                ))}
            </ol>
        </figure>
    );
}

function ReportTable({ columns, rows, totals, groupBy, title }: ReportTableData & { title: string }) {
    return (
        <RegisterList
            title={title}
            controls={
                <div className="report-list-heading">
                    <h2>{title}</h2>
                    <span>
                        {rows.length.toLocaleString()} {rows.length === 1 ? 'row' : 'rows'}
                    </span>
                </div>
            }
        >
            {(dense) => (
                <Table className={cn('report-table', dense && 'dense', columns.length < 4 && 'register-short-table')}>
                    <TableHeader>
                        <TableRow>
                            {columns.map((column, index) => (
                                <TableHead key={column.key} className={cn(column.align === 'right' && 'r', index === 0 && 'report-frozen')}>
                                    {column.label}
                                </TableHead>
                            ))}
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {rows.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={columns.length} className="text-muted-foreground py-10 text-center">
                                    No data for the selected filters.
                                </TableCell>
                            </TableRow>
                        )}
                        {rows.map((row, index) => {
                            const group = groupBy ? row[groupBy] : null;
                            const previousGroup = groupBy && index > 0 ? rows[index - 1][groupBy] : null;

                            return (
                                <Fragment key={index}>
                                    {groupBy && (index === 0 || group !== previousGroup) && (
                                        <TableRow className="report-group">
                                            <TableCell colSpan={columns.length} className="font-semibold">
                                                {String(group ?? 'Other')}
                                            </TableCell>
                                        </TableRow>
                                    )}
                                    <TableRow className="group">
                                        {columns.map((column, columnIndex) => {
                                            const value = row[column.key] ?? null;
                                            const profit = column.key.includes('profit') && Number(value) !== 0;
                                            const negative = !column.wrap && value !== null && value !== '' && Number(value) < 0;
                                            const explanation = negative ? negativeExplanation(column.key, column.label, row) : null;
                                            return (
                                                <TableCell
                                                    key={column.key}
                                                    className={cn(
                                                        column.align === 'right' && 'r num',
                                                        columnIndex === 0 && 'report-frozen font-semibold',
                                                        profit && Number(value) < 0 && 'text-red-600 dark:text-red-500',
                                                        profit && Number(value) > 0 && 'text-emerald-600 dark:text-emerald-500',
                                                        negative && 'text-red-600 dark:text-red-500',
                                                    )}
                                                >
                                                    {explanation ? (
                                                        <span className="inline-flex items-center justify-end gap-1.5">
                                                            <span>{formatCell(value, column.format, column.final)}</span>
                                                            <NegativeValueInfo explanation={explanation} />
                                                        </span>
                                                    ) : column.wrap ? (
                                                        <div className="max-w-72 [overflow-wrap:anywhere] whitespace-pre-wrap">{value}</div>
                                                    ) : (
                                                        formatCell(value, column.format, column.final)
                                                    )}
                                                </TableCell>
                                            );
                                        })}
                                    </TableRow>
                                </Fragment>
                            );
                        })}
                    </TableBody>
                    {rows.length > 0 && Object.keys(totals).length > 0 && (
                        <tfoot>
                            <TableRow>
                                {columns.map((column, index) => {
                                    const value = totals[column.key];
                                    const negative = column.key in totals && Number(value) < 0;
                                    const explanation = negative ? negativeExplanation(column.key, column.label, totals) : null;

                                    return (
                                        <TableCell
                                            key={column.key}
                                            className={cn(
                                                column.align === 'right' && 'r num',
                                                index === 0 && 'report-frozen',
                                                negative && 'text-red-600 dark:text-red-500',
                                            )}
                                        >
                                            {column.key in totals ? (
                                                explanation ? (
                                                    <span className="inline-flex items-center justify-end gap-1.5">
                                                        <span>{formatCell(value, column.format, true)}</span>
                                                        <NegativeValueInfo explanation={explanation} />
                                                    </span>
                                                ) : (
                                                    formatCell(value, column.format, true)
                                                )
                                            ) : index === 0 ? (
                                                'TOTAL'
                                            ) : (
                                                ''
                                            )}
                                        </TableCell>
                                    );
                                })}
                            </TableRow>
                        </tfoot>
                    )}
                </Table>
            )}
        </RegisterList>
    );
}

export default function ReportShow({
    report,
    columns,
    rows,
    totals,
    chart,
    chartViews,
    chartColors,
    visualization,
    groupBy,
    sections = [],
    sectionTitle,
    context,
    notes = [],
    filterValues,
    defaultDates,
    options,
}: Props) {
    const breadcrumbs: BreadcrumbItem[] = [
        { title: 'Reports', href: '/reports' },
        { title: report.title, href: '#' },
    ];

    const rankedConfig = visualization;
    const [metricKey, setMetricKey] = useState(rankedConfig?.metrics[0]?.key ?? '');
    const [chartLimit, setChartLimit] = useState('10');
    const [chartOrder, setChartOrder] = useState<'desc' | 'asc'>('desc');
    const [isLoading, setIsLoading] = useState(false);
    const [filterOpen, setFilterOpen] = useState(false);
    const [showVisuals, setShowVisuals] = useState(true);
    const [viewId, setViewId] = useState('');
    const [draftFilters, setDraftFilters] = useState<Record<string, string | undefined>>({ ...filterValues });

    useEffect(() => {
        setDraftFilters({ ...filterValues });
    }, [filterValues]);

    useEffect(() => {
        setFilterOpen(false);
        setMetricKey('');
        setChartLimit('10');
        setChartOrder('desc');
        setShowVisuals(true);
        setViewId('');
    }, [report.key]);

    const navigate = (values: Record<string, string | undefined>, closeFilters = false) => {
        router.get(route('reports.show', report.key), values, {
            preserveState: true,
            preserveScroll: true,
            replace: true,
            only: ['columns', 'rows', 'totals', 'chart', 'chartViews', 'groupBy', 'sections', 'sectionTitle', 'context', 'notes', 'filterValues'],
            onStart: () => setIsLoading(true),
            onSuccess: () => {
                if (closeFilters) setFilterOpen(false);
            },
            onFinish: () => setIsLoading(false),
        });
    };

    const has = (filter: string) => report.filters.includes(filter);

    const setDraftFilter = (key: string, value: string | undefined) => {
        setDraftFilters((current) => ({ ...current, [key]: value }));
    };

    const clearDraftFilters = () => setDraftFilters(has('date_range') ? { ...defaultDates } : {});

    const closeFilterPanel = () => {
        setDraftFilters({ ...filterValues });
        setFilterOpen(false);
    };

    const applyDraftFilters = () => {
        const values: Record<string, string | undefined> = {};
        if (has('date_range')) {
            values.from = draftFilters.from || undefined;
            values.to = draftFilters.to || undefined;
        }
        if (has('customer')) values.customer_id = draftFilters.customer_id || undefined;
        if (has('supplier')) values.company_id = draftFilters.company_id || undefined;
        if (has('product')) values.product_id = draftFilters.product_id || undefined;
        if (has('direction')) values.direction = draftFilters.direction || undefined;
        if (has('expiry_window')) values.expiry_window = draftFilters.expiry_window || '90';
        if (has('order')) values.order = draftFilters.order || 'slow';
        navigate(values, true);
    };

    const applyDatePreset = (preset: 'today' | 'month' | '90') => {
        const to = defaultDates.to;
        const range = { from: preset === 'month' ? defaultDates.from : preset === '90' ? shiftDate(to, -89) : to, to };
        setDraftFilters((current) => ({ ...current, ...range }));
    };

    const exportUrl = (format: string) => {
        const params = new URLSearchParams();
        Object.entries(filterValues).forEach(([key, value]) => value && params.set(key, value));
        params.set('format', format);
        if (format === 'pdf') {
            if (activeChart) params.set('chart_view', activeChart.id);
            if (activeView === 'ranking' && metric) {
                params.set('chart_metric', metric.key);
                params.set('chart_order', chartOrder);
                params.set('chart_limit', chartLimit === '5' ? '5' : '10');
            }
        }
        return `${route('reports.show', report.key)}?${params}`;
    };

    const invalidDates = has('date_range') && !!draftFilters.from && !!draftFilters.to && draftFilters.from > draftFilters.to;
    const activeFilterCount = [
        has('date_range') &&
            ((filterValues.from || defaultDates.from) !== defaultDates.from || (filterValues.to || defaultDates.to) !== defaultDates.to),
        has('customer') && filterValues.customer_id,
        has('supplier') && filterValues.company_id,
        has('product') && filterValues.product_id,
        has('direction') && filterValues.direction,
        has('expiry_window') && (filterValues.expiry_window || '90') !== '90',
        has('order') && (filterValues.order || 'slow') !== 'slow',
    ].filter(Boolean).length;

    const metric = rankedConfig?.metrics.find((item) => item.key === metricKey) ?? rankedConfig?.metrics[0];
    const rankedData = useMemo(() => {
        if (!rankedConfig || !metric) return [];

        const grouped = new Map<string, number>();
        rows.forEach((row) => {
            const raw = row[metric.valueKey ?? metric.key];
            if (raw === null || raw === undefined || raw === '') return;
            const label = String(row[metric.labelKey ?? rankedConfig.labelKey] ?? 'Other').trim() || 'Other';
            const value = Number(raw);
            if (Number.isFinite(value)) grouped.set(label, (grouped.get(label) ?? 0) + value);
        });

        const direction = chartOrder === 'desc' ? -1 : 1;
        return [...grouped.entries()]
            .map(([label, value]) => ({ label, value: (Math.sign(value) * Math.round((Math.abs(value) + Number.EPSILON) * 100)) / 100 }))
            .sort((a, b) => direction * (a.value - b.value))
            .slice(0, Number(chartLimit));
    }, [chartLimit, chartOrder, metric, rankedConfig, rows]);

    const totalColumns = useMemo(() => {
        if (report.key === 'stock-on-loan') return [];
        const preferred = SUMMARY_KEYS[report.key] ?? [];
        const orderedKeys = [...preferred, ...columns.filter((column) => column.key in totals).map((column) => column.key)];

        return [...new Set(orderedKeys)]
            .map((key) => columns.find((column) => column.key === key))
            .filter((column): column is Column => !!column && column.key in totals)
            .slice(0, 4);
    }, [columns, report.key, totals]);
    const viewChoices = [
        ...(chart?.length ? [{ id: 'trend', title: 'Sales & profit trend', icon: ChartLine }] : []),
        ...chartViews.map((view) => ({
            id: view.id,
            title: view.title,
            icon: view.kind === 'donut' ? ChartPie : view.kind === 'line' ? ChartLine : BarChart3,
        })),
        ...(rankedData.length ? [{ id: 'ranking', title: 'Ranked bars', icon: ChartBar }] : []),
    ];
    const activeView = viewChoices.some(({ id }) => id === viewId) ? viewId : viewChoices[0]?.id;
    const activeChart = chartViews.find(({ id }) => id === activeView);
    const hasVisuals = viewChoices.length > 0;
    const filterLabel = (list: Option[], id?: string) => list.find((option) => String(option.id) === String(id))?.name;
    const scope = [
        context,
        has('date_range') && `${shortDate(filterValues.from ?? defaultDates.from)} – ${shortDate(filterValues.to ?? defaultDates.to)}`,
        !context && filterLabel(options.suppliers, filterValues.company_id),
        filterLabel(options.customers, filterValues.customer_id),
        filterLabel(options.products, filterValues.product_id),
        has('expiry_window') && (filterValues.expiry_window === 'expired' ? 'Expired batches' : `Within ${filterValues.expiry_window || '90'} days`),
        has('direction') && filterValues.direction && (filterValues.direction === 'in' ? 'Loan stock in' : 'Loan stock out'),
        has('order') && (filterValues.order === 'fast' ? 'Fastest moving first' : 'Slowest moving first'),
    ].filter(Boolean);

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={report.title} />
            <div className="reports-page" aria-busy={isLoading}>
                <RegisterLayout
                    title={report.title}
                    description={report.description}
                    actions={
                        <div className="register-hero-actions">
                            {report.filters.length > 0 && (
                                <button
                                    type="button"
                                    className="hbtn"
                                    aria-expanded={filterOpen}
                                    aria-controls="report-filter-panel"
                                    onClick={() => setFilterOpen((open) => !open)}
                                >
                                    <SlidersHorizontal className="i" /> Filters
                                    {activeFilterCount > 0 && <span className="report-filter-count">{activeFilterCount}</span>}
                                    <ChevronDown className={cn('ml-1 size-3.5 transition-transform', filterOpen && 'rotate-180')} />
                                </button>
                            )}
                            <a className="hbtn" href={exportUrl('xlsx')}>
                                <FileSpreadsheet className="i" /> Excel
                            </a>
                            <a
                                className="hbtn pri"
                                href={exportUrl('pdf')}
                                target="_blank"
                                rel="noreferrer"
                                title={
                                    activeView === 'ranking' && chartLimit === '20'
                                        ? 'PDF includes up to 10 chart results and all data rows'
                                        : 'Export current chart view and report tables'
                                }
                            >
                                <FileDown className="i" /> PDF
                            </a>
                        </div>
                    }
                >
                    <div className="report-scope-bar">
                        <div className="report-scope-labels">
                            {scope.map((label, index) => (
                                <span key={index} className={index === 0 && context ? 'report-scope-context' : undefined}>
                                    {label}
                                </span>
                            ))}
                        </div>
                        <div className="report-view-actions">
                            {hasVisuals && (
                                <button
                                    className="register-filter-action"
                                    type="button"
                                    aria-expanded={showVisuals}
                                    aria-controls="report-visuals"
                                    onClick={() => setShowVisuals((open) => !open)}
                                >
                                    <BarChart3 className="i" /> {showVisuals ? 'Hide charts' : 'Show charts'}
                                </button>
                            )}
                            <a className="register-filter-action" href="#report-data">
                                <ArrowDownToLine className="i" /> View data
                            </a>
                        </div>
                    </div>

                    {filterOpen && (
                        <div id="report-filter-panel" className="card report-filter-panel">
                            <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
                                <CalendarRange className="text-muted-foreground size-4" /> Report Filters
                            </div>
                            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                                {has('date_range') && (
                                    <>
                                        <div>
                                            <Label htmlFor="report-from">From</Label>
                                            <Input
                                                id="report-from"
                                                type="date"
                                                value={draftFilters.from ?? ''}
                                                onChange={(e) => setDraftFilter('from', e.target.value)}
                                            />
                                        </div>
                                        <div>
                                            <Label htmlFor="report-to">To</Label>
                                            <Input
                                                id="report-to"
                                                type="date"
                                                value={draftFilters.to ?? ''}
                                                onChange={(e) => setDraftFilter('to', e.target.value)}
                                            />
                                        </div>
                                    </>
                                )}
                                {has('customer') && (
                                    <div>
                                        <Label className="text-xs">Customer</Label>
                                        <Select
                                            value={draftFilters.customer_id ?? 'all'}
                                            onValueChange={(v) => setDraftFilter('customer_id', v === 'all' ? undefined : v)}
                                        >
                                            <SelectTrigger className="w-full" aria-label="Customer">
                                                <SelectValue placeholder="Customer" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="all">All customers</SelectItem>
                                                {options.customers.map((option) => (
                                                    <SelectItem key={option.id} value={String(option.id)}>
                                                        {option.name}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                )}
                                {has('supplier') && (
                                    <div>
                                        <Label className="text-xs">Supplier</Label>
                                        <Select
                                            value={draftFilters.company_id ?? 'all'}
                                            onValueChange={(v) => setDraftFilter('company_id', v === 'all' ? undefined : v)}
                                        >
                                            <SelectTrigger className="w-full" aria-label="Supplier">
                                                <SelectValue placeholder="Supplier" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="all">All suppliers</SelectItem>
                                                {options.suppliers.map((option) => (
                                                    <SelectItem key={option.id} value={String(option.id)}>
                                                        {option.name}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                )}
                                {has('product') && (
                                    <div>
                                        <Label htmlFor="report-product-filter" className="text-xs">
                                            Product
                                        </Label>
                                        <SearchableSelect
                                            id="report-product-filter"
                                            value={draftFilters.product_id ?? 'all'}
                                            onValueChange={(v) => setDraftFilter('product_id', v === 'all' ? undefined : v)}
                                            options={[
                                                { value: 'all', label: 'All products' },
                                                ...options.products.map((option) => ({
                                                    value: String(option.id),
                                                    label: option.name,
                                                })),
                                            ]}
                                            placeholder="Product"
                                            searchPlaceholder="Search products…"
                                            className="min-h-11 text-base"
                                            touch
                                        />
                                    </div>
                                )}
                                {has('direction') && (
                                    <div>
                                        <Label className="text-xs">Loan Direction</Label>
                                        <Select
                                            value={draftFilters.direction ?? 'all'}
                                            onValueChange={(v) => setDraftFilter('direction', v === 'all' ? undefined : v)}
                                        >
                                            <SelectTrigger className="w-full" aria-label="Loan Direction">
                                                <SelectValue placeholder="Loan direction" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="all">Both directions</SelectItem>
                                                <SelectItem value="out">Loan stock out</SelectItem>
                                                <SelectItem value="in">Loan stock in</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                )}
                                {has('expiry_window') && (
                                    <div>
                                        <Label className="text-xs">Expiry Window</Label>
                                        <Select value={draftFilters.expiry_window ?? '90'} onValueChange={(v) => setDraftFilter('expiry_window', v)}>
                                            <SelectTrigger className="w-full" aria-label="Expiry Window">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="expired">Already expired</SelectItem>
                                                <SelectItem value="30">Within 30 days</SelectItem>
                                                <SelectItem value="90">Within 90 days</SelectItem>
                                                <SelectItem value="180">Within 180 days</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                )}
                                {has('order') && (
                                    <div>
                                        <Label className="text-xs">Sort Order</Label>
                                        <Select value={draftFilters.order ?? 'slow'} onValueChange={(v) => setDraftFilter('order', v)}>
                                            <SelectTrigger className="w-full" aria-label="Sort Order">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="slow">Slowest moving first</SelectItem>
                                                <SelectItem value="fast">Fastest moving first</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                )}
                            </div>
                            {has('date_range') && (
                                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                                    <span className="text-muted-foreground mr-1 text-xs">Quick range:</span>
                                    <Button variant="outline" size="sm" disabled={isLoading} onClick={() => applyDatePreset('today')}>
                                        Today
                                    </Button>
                                    <Button variant="outline" size="sm" disabled={isLoading} onClick={() => applyDatePreset('month')}>
                                        This month
                                    </Button>
                                    <Button variant="outline" size="sm" disabled={isLoading} onClick={() => applyDatePreset('90')}>
                                        Last 90 days
                                    </Button>
                                </div>
                            )}
                            {invalidDates && <p className="text-destructive mt-2 text-xs">The From date must be on or before the To date.</p>}
                            <div className="mt-3 flex flex-wrap justify-end gap-2 border-t pt-3">
                                {activeFilterCount > 0 && (
                                    <Button variant="ghost" size="sm" disabled={isLoading} onClick={clearDraftFilters}>
                                        <RotateCcw className="mr-1 size-3.5" /> Clear filters
                                    </Button>
                                )}
                                <Button variant="outline" size="sm" disabled={isLoading} onClick={closeFilterPanel}>
                                    Cancel
                                </Button>
                                <Button size="sm" disabled={invalidDates || isLoading} onClick={applyDraftFilters}>
                                    {isLoading ? 'Applying…' : 'Apply Filters'}
                                </Button>
                            </div>
                        </div>
                    )}

                    {totalColumns.length > 0 && (
                        <section className="kpis report-kpis" aria-label="Report totals">
                            {totalColumns.map((column) => {
                                const value = Number(totals[column.key] ?? 0);
                                const isProfit = column.key.includes('profit');
                                const explanation = value < 0 ? negativeExplanation(column.key, column.label, totals) : null;
                                return (
                                    <RegisterMetric
                                        key={column.key}
                                        label={column.label}
                                        color={value < 0 ? 'var(--red)' : column.key === 'received' ? 'var(--teal)' : 'var(--sales)'}
                                        value={
                                            <span
                                                className={cn(
                                                    'inline-flex items-center gap-1.5',
                                                    value < 0 && 'neg',
                                                    isProfit && value > 0 && 'text-emerald-700',
                                                )}
                                            >
                                                {formatCell(value, column.format, true)}
                                                {explanation && <NegativeValueInfo explanation={explanation} />}
                                            </span>
                                        }
                                    />
                                );
                            })}
                        </section>
                    )}

                    <div id="report-visuals" className="report-visuals" hidden={!showVisuals || !hasVisuals}>
                        {showVisuals && hasVisuals && (
                            <>
                                {viewChoices.length > 1 && (
                                    <div className="card insight-switcher" role="group" aria-label="Report chart view">
                                        <strong id="report-chart-view-label">Chart views</strong>
                                        <select
                                            className="insight-mobile-select"
                                            aria-labelledby="report-chart-view-label"
                                            value={activeView}
                                            onChange={(event) => setViewId(event.target.value)}
                                        >
                                            {viewChoices.map(({ id, title }) => (
                                                <option key={id} value={id}>
                                                    {title}
                                                </option>
                                            ))}
                                        </select>
                                        <div className="insight-switcher-options">
                                            {viewChoices.map(({ id, title, icon: ViewIcon }) => (
                                                <button key={id} type="button" aria-pressed={id === activeView} onClick={() => setViewId(id)}>
                                                    <ViewIcon className="i" aria-hidden="true" />
                                                    {title}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}
                                {activeChart && (
                                    <Card className="report-chart-card">
                                        <CardHeader className="pb-0">
                                            <CardTitle className="text-xl">{activeChart.title}</CardTitle>
                                        </CardHeader>
                                        <CardContent>
                                            <ChartView key={activeChart.id} view={activeChart} colors={chartColors} />
                                        </CardContent>
                                    </Card>
                                )}
                                {activeView === 'trend' && chart && chart.length > 0 && (
                                    <Card className="report-chart-card">
                                        <CardHeader className="pb-0">
                                            <CardTitle className="flex items-center gap-2 text-xl">
                                                <BarChart3 className="size-4" /> Sales and Profit Trend
                                            </CardTitle>
                                            <p className="report-chart-caption">
                                                {chart.some((point) => point.received !== undefined)
                                                    ? 'Actual receipts are shown by payment date, separately from posted sales.'
                                                    : 'Compare net sales and net profit over time.'}
                                            </p>
                                        </CardHeader>
                                        <CardContent className="pt-2">
                                            <TrendChart data={chart} />
                                        </CardContent>
                                    </Card>
                                )}

                                {activeView === 'ranking' && rankedConfig && metric && rankedData.length > 0 && (
                                    <Card className="report-chart-card">
                                        <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 pb-2">
                                            <CardTitle className="flex items-center gap-2 text-xl">
                                                <BarChart3 className="size-4" /> Visual Analysis
                                            </CardTitle>
                                            <div className="flex flex-wrap gap-2">
                                                <Select value={metric.key} onValueChange={setMetricKey}>
                                                    <SelectTrigger className="min-h-10 w-auto" aria-label="Chart metric">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {rankedConfig.metrics.map((item) => (
                                                            <SelectItem key={item.key} value={item.key}>
                                                                {item.label}
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                                <Select value={chartLimit} onValueChange={setChartLimit}>
                                                    <SelectTrigger className="min-h-10 w-auto" aria-label="Chart result limit">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="5">Show 5</SelectItem>
                                                        <SelectItem value="10">Show 10</SelectItem>
                                                        <SelectItem value="20">Show 20</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                                <Select value={chartOrder} onValueChange={(value) => setChartOrder(value as 'desc' | 'asc')}>
                                                    <SelectTrigger className="min-h-10 w-auto" aria-label="Chart sort direction">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="desc">Highest first</SelectItem>
                                                        <SelectItem value="asc">Lowest first</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                        </CardHeader>
                                        <CardContent>
                                            <RankedBars data={rankedData} metric={metric} />
                                        </CardContent>
                                    </Card>
                                )}
                            </>
                        )}
                    </div>

                    {report.key === 'stock-on-loan' && (
                        <div className="space-y-3">
                            <p className="text-muted-foreground text-sm">
                                In = received from a partner; its returns are sent back. Out = sent to a partner; its returns are received back. The
                                period filters loan dates; return dates and balances show the complete current history of those loans.
                            </p>
                            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                                {(
                                    [
                                        ['Received on loan', 'received_on_loan'],
                                        ['Sent on loan', 'sent_on_loan'],
                                        ['Received back', 'received_back'],
                                        ['Returned to partner', 'returned_to_partner'],
                                    ] as const
                                ).map(([label, key]) => (
                                    <Card key={key}>
                                        <CardContent className="py-3">
                                            <p className="text-muted-foreground text-xs">{label}</p>
                                            <p className="text-lg font-semibold tabular-nums">{qty(totals[key] ?? 0)}</p>
                                        </CardContent>
                                    </Card>
                                ))}
                            </div>
                            <div className="grid gap-3 sm:grid-cols-3">
                                <Card className="border-orange-200 bg-orange-50/60 dark:border-orange-950 dark:bg-orange-950/20">
                                    <CardContent className="flex items-center gap-3 py-4">
                                        <span className="rounded-xl bg-orange-500/10 p-2 text-orange-600">
                                            <ArrowUpFromLine className="size-5" />
                                        </span>
                                        <div>
                                            <p className="text-muted-foreground text-xs">Outstanding loaned out</p>
                                            <p className="text-xl font-semibold tabular-nums">{qty(totals.outstanding_out ?? 0)}</p>
                                        </div>
                                    </CardContent>
                                </Card>
                                <Card className="border-sky-200 bg-sky-50/60 dark:border-sky-950 dark:bg-sky-950/20">
                                    <CardContent className="flex items-center gap-3 py-4">
                                        <span className="rounded-xl bg-sky-500/10 p-2 text-sky-600">
                                            <ArrowDownToLine className="size-5" />
                                        </span>
                                        <div>
                                            <p className="text-muted-foreground text-xs">Outstanding borrowed in</p>
                                            <p className="text-xl font-semibold tabular-nums">{qty(totals.outstanding_in ?? 0)}</p>
                                        </div>
                                    </CardContent>
                                </Card>
                                <Card>
                                    <CardContent className="py-4">
                                        <p className="text-muted-foreground text-xs">Net units out</p>
                                        <p className="text-xl font-semibold tabular-nums">{qty(totals.net_out ?? 0)}</p>
                                    </CardContent>
                                </Card>
                            </div>
                        </div>
                    )}

                    {notes.length > 0 && (
                        <aside className="report-notes" aria-label="How to read this report">
                            <Info className="i" aria-hidden="true" />
                            <div>
                                {notes.map((note) => (
                                    <p key={note}>{note}</p>
                                ))}
                            </div>
                        </aside>
                    )}
                    <div id="report-data" tabIndex={-1}>
                        <ReportTable columns={columns} rows={rows} totals={totals} groupBy={groupBy} title={sectionTitle ?? 'Report data'} />
                        {sections.map((section) => (
                            <ReportTable key={section.title} {...section} />
                        ))}
                    </div>
                </RegisterLayout>
            </div>
        </AppLayout>
    );
}
