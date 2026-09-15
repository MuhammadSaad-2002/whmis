import { HBarChart, type BarDatum } from '@/components/bar-chart';
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
import { amount, qty, shortDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import { type BreadcrumbItem } from '@/types';
import { Head, router } from '@inertiajs/react';
import {
    ArrowDownToLine,
    ArrowUpFromLine,
    BarChart3,
    CalendarRange,
    ChevronDown,
    FileDown,
    FileSpreadsheet,
    Info,
    RotateCcw,
    SlidersHorizontal,
} from 'lucide-react';
import { Fragment, useEffect, useMemo, useState } from 'react';

interface Column {
    key: string;
    label: string;
    align?: 'right';
    format?: 'money' | 'qty' | 'date' | 'pct';
}

interface Option {
    id: number;
    name: string;
}

interface Props {
    report: { key: string; title: string; description: string; filters: string[] };
    columns: Column[];
    rows: Record<string, string | number | null>[];
    totals: Record<string, number>;
    chart: TrendPoint[] | null;
    visualization: RankedChartConfig | null;
    groupBy: string | null;
    filterValues: Record<string, string | undefined>;
    options: { customers: Option[]; suppliers: Option[]; products: Option[] };
}

interface MetricConfig {
    key: string;
    label: string;
    format: 'money' | 'qty' | 'pct';
}

interface RankedChartConfig {
    labelKey: string;
    metrics: MetricConfig[];
}

const RANKED_CHARTS: Record<string, RankedChartConfig> = {
    'sales-register': {
        labelKey: 'customer',
        metrics: [
            { key: 'net_amount', label: 'Net Sales', format: 'money' },
            { key: 'net_profit', label: 'Net Profit', format: 'money' },
            { key: 'returns', label: 'Returns', format: 'money' },
        ],
    },
    'product-sales': {
        labelKey: 'product',
        metrics: [
            { key: 'net_revenue', label: 'Net Revenue', format: 'money' },
            { key: 'net_profit', label: 'Net Profit', format: 'money' },
            { key: 'net_cost', label: 'Net COGS', format: 'money' },
            { key: 'net_qty', label: 'Net Quantity', format: 'qty' },
        ],
    },
    'all-time-product-cogs': {
        labelKey: 'product',
        metrics: [
            { key: 'net_qty_sold', label: 'Net Quantity Sold', format: 'qty' },
            { key: 'net_cogs', label: 'Net COGS', format: 'money' },
            { key: 'gross_cogs', label: 'Gross COGS', format: 'money' },
        ],
    },
    'product-sales-daily': {
        labelKey: 'product',
        metrics: [
            { key: 'revenue', label: 'Net Revenue', format: 'money' },
            { key: 'profit', label: 'Net Profit', format: 'money' },
            { key: 'cost', label: 'Net COGS', format: 'money' },
            { key: 'qty', label: 'Net Quantity', format: 'qty' },
        ],
    },
    'customer-sales': {
        labelKey: 'customer',
        metrics: [
            { key: 'net_revenue', label: 'Net Revenue', format: 'money' },
            { key: 'net_profit', label: 'Net Profit', format: 'money' },
            { key: 'outstanding', label: 'Outstanding', format: 'money' },
        ],
    },
    'booker-sales': {
        labelKey: 'booker',
        metrics: [
            { key: 'net_revenue', label: 'Net Revenue', format: 'money' },
            { key: 'net_profit', label: 'Net Profit', format: 'money' },
            { key: 'invoices', label: 'Invoices', format: 'qty' },
        ],
    },
    'incentives-given': {
        labelKey: 'customer',
        metrics: [
            { key: 'value_given', label: 'Incentive Value', format: 'money' },
            { key: 'bonus_qty', label: 'Bonus Units', format: 'qty' },
            { key: 'discount', label: 'Discount', format: 'money' },
        ],
    },
    'purchase-register': {
        labelKey: 'company',
        metrics: [
            { key: 'total_amount', label: 'Purchases', format: 'money' },
            { key: 'total_margin', label: 'Expected Margin', format: 'money' },
        ],
    },
    'supplier-purchases': {
        labelKey: 'supplier',
        metrics: [
            { key: 'total', label: 'Purchases', format: 'money' },
            { key: 'margin', label: 'Expected Margin', format: 'money' },
            { key: 'invoices', label: 'Invoices', format: 'qty' },
        ],
    },
    'bonus-analysis': {
        labelKey: 'product',
        metrics: [
            { key: 'received', label: 'Bonus Received', format: 'qty' },
            { key: 'given', label: 'Bonus Given', format: 'qty' },
            { key: 'net', label: 'Net Kept', format: 'qty' },
        ],
    },
    'stock-position': {
        labelKey: 'product',
        metrics: [
            { key: 'value', label: 'Value at Cost', format: 'money' },
            { key: 'stock', label: 'Available Quantity', format: 'qty' },
        ],
    },
    expiry: {
        labelKey: 'product',
        metrics: [
            { key: 'value', label: 'Value at Cost', format: 'money' },
            { key: 'qty', label: 'Expiring Quantity', format: 'qty' },
        ],
    },
    'sample-stock': {
        labelKey: 'product',
        metrics: [{ key: 'qty', label: 'Sample Quantity', format: 'qty' }],
    },
    'sample-movement': {
        labelKey: 'product',
        metrics: [
            { key: 'closing', label: 'Closing Quantity', format: 'qty' },
            { key: 'received', label: 'Received', format: 'qty' },
            { key: 'issued', label: 'Issued', format: 'qty' },
        ],
    },
    'stock-movement': {
        labelKey: 'product',
        metrics: [
            { key: 'closing', label: 'Closing Quantity', format: 'qty' },
            { key: 'purchased', label: 'Purchased', format: 'qty' },
            { key: 'billed', label: 'Billed', format: 'qty' },
            { key: 'value', label: 'Value at Cost', format: 'money' },
        ],
    },
    'slow-fast-moving': {
        labelKey: 'product',
        metrics: [
            { key: 'sold', label: 'Quantity Sold', format: 'qty' },
            { key: 'stock', label: 'Current Stock', format: 'qty' },
        ],
    },
    outstanding: {
        labelKey: 'customer',
        metrics: [
            { key: 'balance', label: 'Outstanding Balance', format: 'money' },
            { key: 'over_90', label: 'Over 90 Days', format: 'money' },
            { key: 'current', label: '0–30 Days', format: 'money' },
        ],
    },
    'supplier-payables': {
        labelKey: 'supplier',
        metrics: [{ key: 'balance', label: 'Supplier Payable', format: 'money' }],
    },
    'sample-issue-product': {
        labelKey: 'product',
        metrics: [
            { key: 'qty', label: 'Quantity Issued', format: 'qty' },
            { key: 'cost', label: 'Cost Value', format: 'money' },
        ],
    },
    'sample-issue-recipient': {
        labelKey: 'customer',
        metrics: [
            { key: 'qty', label: 'Quantity Issued', format: 'qty' },
            { key: 'cost', label: 'Cost Value', format: 'money' },
            { key: 'issues', label: 'Issues', format: 'qty' },
        ],
    },
    'stock-on-loan': {
        labelKey: 'product',
        metrics: [
            { key: 'outstanding', label: 'Outstanding Units', format: 'qty' },
            { key: 'loaned', label: 'Loaned Units', format: 'qty' },
            { key: 'returned', label: 'Returned Units', format: 'qty' },
        ],
    },
};

const SUMMARY_KEYS: Record<string, string[]> = {
    'sales-register': ['net_amount', 'net_profit', 'returns', 'total_amount'],
    'product-sales': ['net_revenue', 'net_cost', 'net_profit', 'net_qty'],
    'all-time-product-cogs': ['net_qty_sold', 'net_cogs', 'qty_returned', 'return_cogs'],
    'customer-sales': ['net_revenue', 'net_profit', 'outstanding', 'invoices'],
    'booker-sales': ['net_revenue', 'net_profit', 'invoices', 'returns'],
    'product-sales-daily': ['revenue', 'cost', 'profit', 'qty'],
    'purchase-register': ['total_amount', 'total_margin'],
    'supplier-purchases': ['total', 'margin', 'invoices'],
    'stock-position': ['value', 'stock'],
    'stock-movement': ['closing', 'value', 'purchased', 'billed'],
    expiry: ['value', 'qty'],
    outstanding: ['balance', 'over_90', 'current', 'd31_60'],
    'supplier-payables': ['balance'],
    'profit-by-month': ['net_sales', 'profit', 'cost', 'returns'],
};

function formatCell(value: string | number | null, format?: Column['format']): string {
    if (value === null || value === undefined || value === '') return '—';
    switch (format) {
        case 'money':
            return amount(value);
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

export default function ReportShow({ report, columns, rows, totals, chart, visualization, groupBy, filterValues, options }: Props) {
    const breadcrumbs: BreadcrumbItem[] = [
        { title: 'Reports', href: '/reports' },
        { title: report.title, href: '#' },
    ];

    const rankedConfig = visualization ?? RANKED_CHARTS[report.key];
    const [metricKey, setMetricKey] = useState(rankedConfig?.metrics[0]?.key ?? '');
    const [chartLimit, setChartLimit] = useState('10');
    const [chartOrder, setChartOrder] = useState<'desc' | 'asc'>('desc');
    const [isLoading, setIsLoading] = useState(false);
    const [filterOpen, setFilterOpen] = useState(false);
    const [draftFilters, setDraftFilters] = useState<Record<string, string | undefined>>({ ...filterValues });

    useEffect(() => {
        setMetricKey((visualization ?? RANKED_CHARTS[report.key])?.metrics[0]?.key ?? '');
        setDraftFilters({ ...filterValues });
    }, [
        report.key,
        visualization,
        filterValues.from,
        filterValues.to,
        filterValues.customer_id,
        filterValues.company_id,
        filterValues.product_id,
        filterValues.direction,
        filterValues.expiry_window,
        filterValues.order,
    ]);

    const navigate = (values: Record<string, string | undefined>, closeFilters = false) => {
        router.get(route('reports.show', report.key), values, {
            preserveState: true,
            preserveScroll: true,
            replace: true,
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

    const clearDraftFilters = () => {
        setDraftFilters({
            from: has('date_range') ? '' : undefined,
            to: has('date_range') ? '' : undefined,
            expiry_window: has('expiry_window') ? '90' : undefined,
            order: has('order') ? 'slow' : undefined,
        });
    };

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

    const inputDate = (date: Date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    const applyDatePreset = (preset: 'today' | 'month' | '90') => {
        const to = new Date();
        const from = new Date(to);
        if (preset === 'month') from.setDate(1);
        if (preset === '90') from.setDate(from.getDate() - 89);
        const range = { from: inputDate(from), to: inputDate(to) };
        setDraftFilters((current) => ({ ...current, ...range }));
    };

    const exportUrl = (format: string) => {
        const params = new URLSearchParams();
        Object.entries(filterValues).forEach(([key, value]) => value && params.set(key, value));
        params.set('format', format);
        return `${route('reports.show', report.key)}?${params}`;
    };

    const invalidDates = has('date_range') && !!draftFilters.from && !!draftFilters.to && draftFilters.from > draftFilters.to;
    const activeFilterCount = [
        has('date_range') && filterValues.from && filterValues.to,
        has('customer') && filterValues.customer_id,
        has('supplier') && filterValues.company_id,
        has('product') && filterValues.product_id,
        has('direction') && filterValues.direction,
        has('expiry_window') && filterValues.expiry_window,
        has('order') && filterValues.order,
    ].filter(Boolean).length;

    const metric = rankedConfig?.metrics.find((item) => item.key === metricKey) ?? rankedConfig?.metrics[0];
    const rankedData = useMemo<BarDatum[]>(() => {
        if (!rankedConfig || !metric) return [];

        const grouped = new Map<string, number>();
        rows.forEach((row) => {
            const label = String(row[rankedConfig.labelKey] ?? 'Other');
            const value = Number(row[metric.key] ?? 0);
            if (Number.isFinite(value)) grouped.set(label, (grouped.get(label) ?? 0) + value);
        });

        const direction = chartOrder === 'desc' ? -1 : 1;
        return [...grouped.entries()]
            .map(([label, value]) => ({ label, value }))
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

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={report.title} />
            <div className="flex h-full flex-col gap-4 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-4">
                    <div>
                        <h1 className="text-4xl font-bold">{report.title}</h1>
                        <p className="text-muted-foreground text-sm">{report.description}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {report.filters.length > 0 && (
                            <Button
                                variant={filterOpen ? 'secondary' : 'outline'}
                                size="sm"
                                aria-expanded={filterOpen}
                                onClick={() => setFilterOpen((open) => !open)}
                            >
                                <SlidersHorizontal className="mr-1 size-4" /> Filters
                                {activeFilterCount > 0 && (
                                    <span className="bg-primary text-primary-foreground ml-1 rounded-full px-1.5 py-0.5 text-[10px] leading-none">
                                        {activeFilterCount}
                                    </span>
                                )}
                                <ChevronDown className={cn('ml-1 size-3.5 transition-transform', filterOpen && 'rotate-180')} />
                            </Button>
                        )}
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

                {filterOpen && (
                    <div className="animate-in slide-in-from-top-2 bg-muted/20 rounded-xl border p-3 duration-200">
                        <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
                            <CalendarRange className="text-muted-foreground size-4" /> Report Filters
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                            {has('date_range') && (
                                <>
                                    <div>
                                        <Label className="text-xs">From</Label>
                                        <Input type="date" value={draftFilters.from ?? ''} onChange={(e) => setDraftFilter('from', e.target.value)} />
                                    </div>
                                    <div>
                                        <Label className="text-xs">To</Label>
                                        <Input type="date" value={draftFilters.to ?? ''} onChange={(e) => setDraftFilter('to', e.target.value)} />
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
                                        <SelectTrigger className="w-full">
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
                                        <SelectTrigger className="w-full">
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
                                    <Label className="text-xs">Product</Label>
                                    <SearchableSelect
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
                                        <SelectTrigger className="w-full">
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
                                        <SelectTrigger className="w-full">
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
                                        <SelectTrigger className="w-full">
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
                            <Button variant="ghost" size="sm" disabled={isLoading} onClick={clearDraftFilters}>
                                <RotateCcw className="mr-1 size-3.5" /> Clear
                            </Button>
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
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        {totalColumns.map((column) => {
                            const value = Number(totals[column.key] ?? 0);
                            const isProfit = column.key.includes('profit');
                            const explanation = value < 0 ? negativeExplanation(column.key, column.label, totals) : null;
                            return (
                                <Card key={column.key} className="border-border/60 overflow-hidden shadow-sm">
                                    <CardContent className="relative py-4">
                                        <div className="bg-primary/60 absolute inset-x-0 top-0 h-0.5" />
                                        <p className="text-muted-foreground text-xs font-medium">{column.label}</p>
                                        <div
                                            className={cn(
                                                'mt-1 flex items-center gap-1.5 text-xl font-semibold tabular-nums',
                                                isProfit && value < 0 && 'text-red-600 dark:text-red-500',
                                                isProfit && value > 0 && 'text-emerald-600 dark:text-emerald-500',
                                                value < 0 && 'text-red-600 dark:text-red-500',
                                            )}
                                        >
                                            <span>{formatCell(value, column.format)}</span>
                                            {explanation && <NegativeValueInfo explanation={explanation} />}
                                        </div>
                                    </CardContent>
                                </Card>
                            );
                        })}
                    </div>
                )}

                {chart && chart.length > 0 && (
                    <Card>
                        <CardHeader className="pb-0">
                            <CardTitle className="flex items-center gap-2 text-base">
                                <BarChart3 className="text-muted-foreground size-4" /> Trend
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="pt-2">
                            <TrendChart data={chart} />
                        </CardContent>
                    </Card>
                )}

                {rankedConfig && metric && (
                    <Card>
                        <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 pb-2">
                            <CardTitle className="flex items-center gap-2 text-base">
                                <BarChart3 className="text-muted-foreground size-4" /> Visual Analysis
                            </CardTitle>
                            <div className="flex flex-wrap gap-2">
                                <Select value={metric.key} onValueChange={setMetricKey}>
                                    <SelectTrigger className="h-9 w-44">
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
                                    <SelectTrigger className="h-9 w-24">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="5">Show 5</SelectItem>
                                        <SelectItem value="10">Show 10</SelectItem>
                                        <SelectItem value="20">Show 20</SelectItem>
                                    </SelectContent>
                                </Select>
                                <Select value={chartOrder} onValueChange={(value) => setChartOrder(value as 'desc' | 'asc')}>
                                    <SelectTrigger className="h-9 w-32">
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
                            <HBarChart data={rankedData} valueLabel={metric.label} valueFormat={metric.format} />
                        </CardContent>
                    </Card>
                )}

                {report.key === 'stock-on-loan' && (
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
                )}

                <div className="max-h-[70vh] overflow-hidden rounded-xl border shadow-sm [&>div]:max-h-[70vh]">
                    <Table className="min-w-max">
                        <TableHeader className="bg-background sticky top-0 z-20 shadow-sm">
                            <TableRow>
                                {columns.map((column, index) => (
                                    <TableHead
                                        key={column.key}
                                        className={cn(
                                            'h-10 px-3 whitespace-nowrap',
                                            column.align === 'right' && 'text-right',
                                            index === 0 && 'bg-background sticky left-0 z-30',
                                        )}
                                    >
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
                                            <TableRow className="bg-muted/60">
                                                <TableCell
                                                    colSpan={columns.length}
                                                    className="text-muted-foreground py-2 text-xs font-semibold tracking-wider uppercase"
                                                >
                                                    {String(group ?? 'Other')}
                                                </TableCell>
                                            </TableRow>
                                        )}
                                        <TableRow className="group">
                                            {columns.map((column, columnIndex) => {
                                                const value = row[column.key] ?? null;
                                                const profit = column.key.includes('profit') && Number(value) !== 0;
                                                const negative = value !== null && value !== '' && Number(value) < 0;
                                                const explanation = negative ? negativeExplanation(column.key, column.label, row) : null;
                                                return (
                                                    <TableCell
                                                        key={column.key}
                                                        className={cn(
                                                            'px-3 py-2.5 whitespace-nowrap',
                                                            column.align === 'right' && 'text-right tabular-nums',
                                                            columnIndex === 0 && 'bg-background group-hover:bg-muted/50 sticky left-0',
                                                            profit && Number(value) < 0 && 'text-red-600 dark:text-red-500',
                                                            profit && Number(value) > 0 && 'text-emerald-600 dark:text-emerald-500',
                                                            negative && 'text-red-600 dark:text-red-500',
                                                        )}
                                                    >
                                                        {explanation ? (
                                                            <span className="inline-flex items-center justify-end gap-1.5">
                                                                <span>{formatCell(value, column.format)}</span>
                                                                <NegativeValueInfo explanation={explanation} />
                                                            </span>
                                                        ) : (
                                                            formatCell(value, column.format)
                                                        )}
                                                    </TableCell>
                                                );
                                            })}
                                        </TableRow>
                                    </Fragment>
                                );
                            })}
                            {rows.length > 0 && Object.keys(totals).length > 0 && (
                                <TableRow className="bg-muted hover:bg-muted sticky bottom-0 z-20 font-semibold shadow-[0_-1px_0_hsl(var(--border))]">
                                    {columns.map((column, index) => {
                                        const value = totals[column.key];
                                        const negative = column.key in totals && Number(value) < 0;
                                        const explanation = negative ? negativeExplanation(column.key, column.label, totals) : null;

                                        return (
                                            <TableCell
                                                key={column.key}
                                                className={cn(
                                                    'px-3 py-2.5 whitespace-nowrap',
                                                    column.align === 'right' && 'text-right tabular-nums',
                                                    index === 0 && 'bg-muted sticky left-0 z-30',
                                                    negative && 'text-red-600 dark:text-red-500',
                                                )}
                                            >
                                                {column.key in totals ? (
                                                    explanation ? (
                                                        <span className="inline-flex items-center justify-end gap-1.5">
                                                            <span>{formatCell(value, column.format)}</span>
                                                            <NegativeValueInfo explanation={explanation} />
                                                        </span>
                                                    ) : (
                                                        formatCell(value, column.format)
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
                            )}
                        </TableBody>
                    </Table>
                </div>
                <p className="text-muted-foreground text-xs">{rows.length} rows</p>
            </div>
        </AppLayout>
    );
}
