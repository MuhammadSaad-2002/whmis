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
import {
    ArrowDownRight, ArrowUpRight, Banknote, Boxes, FileDown, Landmark,
    ReceiptText, ShoppingCart, TrendingUp,
    type LucideIcon,
} from 'lucide-react';

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
    stockOnLoan: { outstanding_out: number; outstanding_in: number; net_out: number; rows: LoanRow[] };
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

const KPI_TONES = {
    emerald: 'from-emerald-500/15 to-emerald-500/0 text-emerald-600 dark:text-emerald-400',
    blue: 'from-blue-500/15 to-blue-500/0 text-blue-600 dark:text-blue-400',
    violet: 'from-violet-500/15 to-violet-500/0 text-violet-600 dark:text-violet-400',
    amber: 'from-amber-500/15 to-amber-500/0 text-amber-600 dark:text-amber-400',
} as const;

function KpiCard({ label, value, delta, hint, icon: Icon, tone = 'blue' }: {
    label: string; value: string; delta?: React.ReactNode; hint?: string; icon: LucideIcon; tone?: keyof typeof KPI_TONES;
}) {
    return (
        <Card className="relative overflow-hidden border-border/60 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
            <div className={`absolute inset-0 bg-gradient-to-br ${KPI_TONES[tone]}`} />
            <CardContent className="relative p-5">
                <div className="mb-4 flex items-center justify-between gap-3">
                    <span className="text-sm font-medium text-muted-foreground">{label}</span>
                    <span className={`rounded-xl bg-background/80 p-2 shadow-sm ${KPI_TONES[tone].split(' ').slice(-2).join(' ')}`}><Icon className="size-4" /></span>
                </div>
                <div className="text-2xl font-bold tracking-tight tabular-nums">{value}</div>
                {delta && <div className="mt-1.5">{delta}</div>}
                {hint && <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p>}
            </CardContent>
        </Card>
    );
}

function MiniStat({ label, value, href }: { label: string; value: string; href?: string }) {
    const body = (
        <Card className={`border-border/60 shadow-sm ${href ? 'transition-all hover:-translate-y-0.5 hover:bg-muted/40 hover:shadow-md' : ''}`}>
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
            <div className="flex h-full flex-col gap-5 bg-gradient-to-b from-muted/35 via-background to-background p-4 md:p-6">
                {/* Period bar */}
                <div className="relative overflow-hidden rounded-2xl border border-primary/10 bg-gradient-to-br from-slate-950 via-slate-900 to-primary/80 p-5 text-white shadow-xl shadow-primary/10 md:p-7">
                    <div className="absolute -right-20 -top-24 size-72 rounded-full bg-white/10 blur-3xl" />
                    <div className="relative flex flex-wrap items-end justify-between gap-4">
                    <div>
                        <p className="mb-1 text-xs font-semibold uppercase tracking-[0.2em] text-white/60">WHMIS command centre</p>
                        <h1 className="text-3xl font-bold tracking-tight md:text-4xl">Executive Overview</h1>
                        <p className="mt-1 text-sm text-white/70">
                            {PERIOD_LABELS[filterValues.period] ?? 'This Month'} · {shortDate(filterValues.from)} — {shortDate(filterValues.to)}
                        </p>
                    </div>
                    <div className="flex flex-wrap items-end gap-2">
                        <Select value={filterValues.period} onValueChange={(v) => reload({ period: v })}>
                            <SelectTrigger className="w-44 border-white/20 bg-white/10 text-white"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                {Object.entries(PERIOD_LABELS).map(([value, label]) => (
                                    <SelectItem key={value} value={value}>{label}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        {filterValues.period === 'custom' && (
                            <>
                                <div>
                                    <Label className="text-xs text-white/70">From</Label>
                                    <Input type="date" className="w-40 border-white/20 bg-white/10 text-white" value={filterValues.from}
                                        onChange={(e) => reload({ from: e.target.value })} />
                                </div>
                                <div>
                                    <Label className="text-xs text-white/70">To</Label>
                                    <Input type="date" className="w-40 border-white/20 bg-white/10 text-white" value={filterValues.to}
                                        onChange={(e) => reload({ to: e.target.value })} />
                                </div>
                            </>
                        )}
                        <Button variant="outline" size="sm" className="border-white/20 bg-white/10 text-white hover:bg-white/20 hover:text-white" asChild>
                            <a href={pdfUrl()} target="_blank" rel="noreferrer">
                                <FileDown className="mr-1 size-4" /> PDF
                            </a>
                        </Button>
                    </div>
                    </div>
                </div>

                {/* KPI band A — period, with deltas */}
                <div className="grid gap-3 md:grid-cols-4">
                    <KpiCard label="Net Sales" value={money(kpis.sales)} delta={<Delta value={kpis.sales_delta} />} icon={TrendingUp} tone="emerald" />
                    <KpiCard label="Net Profit" value={money(kpis.profit)} delta={<Delta value={kpis.profit_delta} />} icon={Banknote} tone="blue" />
                    <KpiCard label="Net Margin" value={pct(kpis.margin_pct)} hint={`Previous period ${pct(kpis.prev_margin_pct)}`} icon={Landmark} tone="violet" />
                    <KpiCard label="Net Purchases" value={money(kpis.purchases)} delta={<Delta value={kpis.purchases_delta} invert />} icon={ShoppingCart} tone="amber" />
                </div>

                {/* KPI band B — snapshot position */}
                <div className="grid gap-3 md:grid-cols-4">
                    <KpiCard label="Customer Receivables" value={money(financials.receivable)} hint="Live ledger balance" icon={ReceiptText} tone="blue" />
                    <KpiCard label="Supplier Payables" value={money(financials.payable)} hint="Live ledger balance" icon={Landmark} tone="amber" />
                    <KpiCard label="Net Position" value={money(financials.net_position)} hint="Receivables minus payables" icon={Banknote} tone="violet" />
                    <KpiCard label="Inventory at Cost" value={money(financials.inventory_value)} hint="Current sellable stock" icon={Boxes} tone="emerald" />
                </div>

                {/* Attention tiles */}
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                    <MiniStat label="Draft invoices" value={String(attention.draft_sales + attention.draft_purchases)} />
                    <MiniStat label="Pending bookings" value={String(attention.pending_bookings)} href="/bookings?status=pending" />
                    <MiniStat label="Loan stock out" value={qty(stockOnLoan.outstanding_out)} href="/loans/out" />
                    <MiniStat label="Borrowed stock in" value={qty(stockOnLoan.outstanding_in)} href="/loans/in" />
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
