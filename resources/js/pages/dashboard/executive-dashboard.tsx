import { HBarChart, type BarDatum } from '@/components/bar-chart';
import { DonutChart, type DonutSlice } from '@/components/donut-chart';
import { TrendChart, type TrendPoint } from '@/components/trend-chart';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import AppLayout from '@/layouts/app-layout';
import { money, pct, qty, shortDate } from '@/lib/format';
import { type BreadcrumbItem } from '@/types';
import { Head, Link, router } from '@inertiajs/react';
import { ArrowDownRight, ArrowUpRight, FileDown } from 'lucide-react';

interface Kpis {
    sales: number;
    sales_delta: number | null;
    profit: number;
    profit_delta: number | null;
    margin_pct: number;
    prev_margin_pct: number;
    purchases: number;
    purchases_delta: number | null;
}

interface Financials {
    receivable: number;
    payable: number;
    net_position: number;
    inventory_value: number;
}

interface Attention {
    draft_sales: number;
    draft_purchases: number;
    pending_bookings: number;
    expiring_90: number;
}

interface Debtor {
    customer: string;
    city: string | null;
    balance: number;
    over_90: number;
}

interface TopCustomer {
    customer_id: number;
    customer: string | null;
    total: number;
    profit: number;
}

interface LoanRow {
    direction: string;
    product: string | null;
    supplier: string | null;
    outstanding: number;
}

interface RecentSale {
    id: number;
    invoice_number: string;
    invoice_date: string;
    status: string;
    total_amount: string;
    customer?: { id: number; name: string };
}

interface ExpiringBatch {
    id: number;
    product: string;
    batch_number: string;
    expiry_date: string;
    qty_available: number;
}

export interface ExecutiveProps {
    filterValues: { period: string; from: string; to: string };
    kpis: Kpis;
    financials: Financials;
    monthlyTrend: TrendPoint[];
    aging: DonutSlice[];
    topProducts: BarDatum[];
    salesBySupplier: BarDatum[];
    topDebtors: Debtor[];
    topCustomers: TopCustomer[];
    stockOnLoan: { outstanding: number; rows: LoanRow[] };
    attention: Attention;
    recentSales: RecentSale[];
    expiringSoon: ExpiringBatch[];
}

const breadcrumbs: BreadcrumbItem[] = [{ title: 'Dashboard', href: '/dashboard' }];

const PERIOD_LABELS: Record<string, string> = {
    this_month: 'This Month',
    last_3: 'Last 3 Months',
    last_6: 'Last 6 Months',
    last_12: 'Last 12 Months',
    custom: 'Custom Range',
};

/** Signed % change badge vs the prior equal-length period. */
function Delta({ value, invert }: { value: number | null; invert?: boolean }) {
    if (value === null) {
        return <span className="text-xs text-muted-foreground">no prior period</span>;
    }
    const up = value >= 0;
    // For most metrics up = good; `invert` flips that (e.g. purchases rising).
    const good = invert ? !up : up;
    const Icon = up ? ArrowUpRight : ArrowDownRight;
    return (
        <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${good ? 'text-emerald-600 dark:text-emerald-500' : 'text-red-600 dark:text-red-500'}`}>
            <Icon className="size-3" />
            {Math.abs(value)}% <span className="font-normal text-muted-foreground">vs prev</span>
        </span>
    );
}

function KpiCard({ label, value, delta, hint }: { label: string; value: string; delta?: React.ReactNode; hint?: string }) {
    return (
        <Card>
            <CardHeader className="pb-1">
                <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
            </CardHeader>
            <CardContent>
                <div className="text-2xl font-semibold tabular-nums">{value}</div>
                {delta && <div className="mt-1">{delta}</div>}
                {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
            </CardContent>
        </Card>
    );
}

function MiniStat({ label, value, href }: { label: string; value: string; href?: string }) {
    const body = (
        <Card className={href ? 'transition-colors hover:bg-muted/40' : undefined}>
            <CardContent className="flex flex-col gap-0.5 py-4">
                <span className="text-2xl font-semibold tabular-nums">{value}</span>
                <span className="text-xs text-muted-foreground">{label}</span>
            </CardContent>
        </Card>
    );
    return href ? <Link href={href}>{body}</Link> : body;
}

export default function ExecutiveDashboard(props: ExecutiveProps) {
    const { filterValues, kpis, financials, monthlyTrend, aging, topProducts, salesBySupplier, topDebtors, topCustomers, stockOnLoan, attention, recentSales, expiringSoon } = props;

    const reload = (patch: Partial<ExecutiveProps['filterValues']>) => {
        router.get(route('dashboard'), { ...filterValues, ...patch }, { preserveState: true, preserveScroll: true, replace: true });
    };

    const pdfUrl = () => {
        const params = new URLSearchParams(filterValues as Record<string, string>);
        return `${route('dashboard.executive.pdf')}?${params}`;
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Executive Dashboard" />
            <div className="flex h-full flex-col gap-4 p-4">
                {/* Period bar */}
                <div className="flex flex-wrap items-end justify-between gap-3 border-b pb-4">
                    <div>
                        <h1 className="text-3xl font-bold">Executive Overview</h1>
                        <p className="text-sm text-muted-foreground">
                            {PERIOD_LABELS[filterValues.period] ?? 'This Month'} · {shortDate(filterValues.from)} — {shortDate(filterValues.to)}
                        </p>
                    </div>
                    <div className="flex flex-wrap items-end gap-2">
                        <Select value={filterValues.period} onValueChange={(v) => reload({ period: v })}>
                            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                {Object.entries(PERIOD_LABELS).map(([value, label]) => (
                                    <SelectItem key={value} value={value}>{label}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        {filterValues.period === 'custom' && (
                            <>
                                <div>
                                    <Label className="text-xs">From</Label>
                                    <Input type="date" className="w-40" value={filterValues.from}
                                        onChange={(e) => reload({ from: e.target.value })} />
                                </div>
                                <div>
                                    <Label className="text-xs">To</Label>
                                    <Input type="date" className="w-40" value={filterValues.to}
                                        onChange={(e) => reload({ to: e.target.value })} />
                                </div>
                            </>
                        )}
                        <Button variant="outline" size="sm" asChild>
                            <a href={pdfUrl()} target="_blank" rel="noreferrer">
                                <FileDown className="mr-1 size-4" /> PDF
                            </a>
                        </Button>
                    </div>
                </div>

                {/* KPI band A — period, with deltas */}
                <div className="grid gap-3 md:grid-cols-4">
                    <KpiCard label="Sales" value={money(kpis.sales)} delta={<Delta value={kpis.sales_delta} />} />
                    <KpiCard label="Gross Profit" value={money(kpis.profit)} delta={<Delta value={kpis.profit_delta} />} />
                    <KpiCard label="Margin" value={pct(kpis.margin_pct)} hint={`prev ${pct(kpis.prev_margin_pct)}`} />
                    <KpiCard label="Purchases" value={money(kpis.purchases)} delta={<Delta value={kpis.purchases_delta} invert />} />
                </div>

                {/* KPI band B — snapshot position */}
                <div className="grid gap-3 md:grid-cols-4">
                    <KpiCard label="Receivable from Customers" value={money(financials.receivable)} hint="as of now" />
                    <KpiCard label="Payable to Suppliers" value={money(financials.payable)} hint="as of now" />
                    <KpiCard label="Net Position" value={money(financials.net_position)} hint="receivable − payable" />
                    <KpiCard label="Inventory Value (cost)" value={money(financials.inventory_value)} hint="as of now" />
                </div>

                {/* Attention tiles */}
                <div className="grid gap-3 md:grid-cols-4">
                    <MiniStat label="Draft invoices" value={String(attention.draft_sales + attention.draft_purchases)} />
                    <MiniStat label="Pending bookings" value={String(attention.pending_bookings)} href="/bookings?status=pending" />
                    <MiniStat label="Stock on loan (units out)" value={qty(stockOnLoan.outstanding)} href="/loans/out" />
                    <MiniStat label="Batches expiring ≤90d" value={String(attention.expiring_90)} />
                </div>

                {/* Trend — rolling 12 months */}
                <Card>
                    <CardHeader className="pb-0">
                        <CardTitle className="text-base">Sales & Profit — last 12 months</CardTitle>
                    </CardHeader>
                    <CardContent className="pt-2">
                        <TrendChart data={monthlyTrend} />
                    </CardContent>
                </Card>

                {/* Aging donut + Top products */}
                <div className="grid gap-4 lg:grid-cols-2">
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">Receivables Aging <span className="text-xs font-normal text-muted-foreground">· as of now</span></CardTitle>
                        </CardHeader>
                        <CardContent>
                            <DonutChart data={aging} />
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">Top Products by Net Revenue <span className="text-xs font-normal text-muted-foreground">· period</span></CardTitle>
                        </CardHeader>
                        <CardContent>
                            <HBarChart data={topProducts} />
                        </CardContent>
                    </Card>
                </div>

                {/* Sales by supplier + Top debtors */}
                <div className="grid gap-4 lg:grid-cols-2">
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">Sales by Supplier <span className="text-xs font-normal text-muted-foreground">· period</span></CardTitle>
                        </CardHeader>
                        <CardContent>
                            <HBarChart data={salesBySupplier} />
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">Top Debtors <span className="text-xs font-normal text-muted-foreground">· as of now</span></CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Customer</TableHead>
                                        <TableHead className="text-right">Balance</TableHead>
                                        <TableHead className="text-right">90+ Days</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {topDebtors.length === 0 && (
                                        <TableRow>
                                            <TableCell colSpan={3} className="py-8 text-center text-muted-foreground">Nothing outstanding.</TableCell>
                                        </TableRow>
                                    )}
                                    {topDebtors.map((row, i) => (
                                        <TableRow key={i}>
                                            <TableCell className="font-medium">{row.customer}{row.city ? <span className="text-muted-foreground"> · {row.city}</span> : null}</TableCell>
                                            <TableCell className="text-right tabular-nums">{money(row.balance)}</TableCell>
                                            <TableCell className="text-right tabular-nums">{row.over_90 > 0 ? <span className="text-red-600 dark:text-red-500">{money(row.over_90)}</span> : '—'}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </div>

                {/* Recent sales + right column (expiring / top customers / loans) */}
                <div className="grid gap-4 lg:grid-cols-2">
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">Recent Sales</CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Invoice</TableHead>
                                        <TableHead>Customer</TableHead>
                                        <TableHead>Date</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead className="text-right">Total</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {recentSales.length === 0 && (
                                        <TableRow>
                                            <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">No sales yet.</TableCell>
                                        </TableRow>
                                    )}
                                    {recentSales.map((sale) => (
                                        <TableRow key={sale.id}>
                                            <TableCell>
                                                <Link href={route('sales.edit', sale.id)} className="font-medium hover:underline">{sale.invoice_number}</Link>
                                            </TableCell>
                                            <TableCell>{sale.customer?.name}</TableCell>
                                            <TableCell>{shortDate(sale.invoice_date)}</TableCell>
                                            <TableCell>
                                                <Badge variant={sale.status === 'posted' ? 'default' : sale.status === 'cancelled' ? 'destructive' : 'secondary'}>{sale.status}</Badge>
                                            </TableCell>
                                            <TableCell className="text-right tabular-nums">{money(sale.total_amount)}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>

                    <div className="flex flex-col gap-4">
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-base">Top Customers <span className="text-xs font-normal text-muted-foreground">· period</span></CardTitle>
                            </CardHeader>
                            <CardContent className="p-0">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Customer</TableHead>
                                            <TableHead className="text-right">Sales</TableHead>
                                            <TableHead className="text-right">Profit</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {topCustomers.length === 0 && (
                                            <TableRow>
                                                <TableCell colSpan={3} className="py-8 text-center text-muted-foreground">No posted sales in this period.</TableCell>
                                            </TableRow>
                                        )}
                                        {topCustomers.map((row) => (
                                            <TableRow key={row.customer_id}>
                                                <TableCell>
                                                    <Link href={route('ledger.customer', row.customer_id)} className="font-medium hover:underline">{row.customer}</Link>
                                                </TableCell>
                                                <TableCell className="text-right tabular-nums">{money(row.total)}</TableCell>
                                                <TableCell className="text-right tabular-nums">{money(row.profit)}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle className="text-base">Expiring Within 90 Days</CardTitle>
                            </CardHeader>
                            <CardContent className="p-0">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Product</TableHead>
                                            <TableHead>Batch</TableHead>
                                            <TableHead>Expiry</TableHead>
                                            <TableHead className="text-right">Qty</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {expiringSoon.length === 0 && (
                                            <TableRow>
                                                <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">Nothing expiring soon.</TableCell>
                                            </TableRow>
                                        )}
                                        {expiringSoon.map((batch) => (
                                            <TableRow key={batch.id}>
                                                <TableCell className="font-medium">{batch.product}</TableCell>
                                                <TableCell className="font-mono text-sm">{batch.batch_number}</TableCell>
                                                <TableCell>{shortDate(batch.expiry_date)}</TableCell>
                                                <TableCell className="text-right tabular-nums">{qty(batch.qty_available)}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </CardContent>
                        </Card>
                    </div>
                </div>
            </div>
        </AppLayout>
    );
}
