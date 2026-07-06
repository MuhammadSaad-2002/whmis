import { TrendChart, type TrendPoint } from '@/components/trend-chart';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import AppLayout from '@/layouts/app-layout';
import { money, qty, shortDate } from '@/lib/format';
import { type BreadcrumbItem } from '@/types';
import { Head, Link } from '@inertiajs/react';

interface Kpis {
    today_sales: number;
    today_sales_count: number;
    today_purchases: number;
    month_sales: number;
    month_profit: number;
    receivable: number;
    payable: number;
    inventory_value: number;
    draft_sales: number;
    draft_purchases: number;
    pending_bookings: number;
}

interface ExpiringBatch {
    id: number;
    product: string;
    batch_number: string;
    expiry_date: string;
    qty_available: number;
}

interface RecentSale {
    id: number;
    invoice_number: string;
    invoice_date: string;
    status: string;
    total_amount: string;
    customer?: { id: number; name: string };
}

interface TopCustomer {
    customer_id: number;
    total: string;
    profit: string;
    customer?: { id: number; name: string };
}

interface Props {
    kpis: Kpis;
    monthlyTrend: TrendPoint[];
    expiringSoon: ExpiringBatch[];
    recentSales: RecentSale[];
    topCustomers: TopCustomer[];
}

const breadcrumbs: BreadcrumbItem[] = [{ title: 'Dashboard', href: '/dashboard' }];

function Kpi({ label, value, hint, href }: { label: string; value: string; hint?: string; href?: string }) {
    const card = (
        <Card className={href ? 'transition-colors hover:bg-muted/40' : undefined}>
            <CardHeader className="pb-1">
                <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
            </CardHeader>
            <CardContent>
                <div className="text-2xl font-semibold tabular-nums">{value}</div>
                {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
            </CardContent>
        </Card>
    );

    return href ? <Link href={href}>{card}</Link> : card;
}

export default function Dashboard({ kpis, monthlyTrend, expiringSoon, recentSales, topCustomers }: Props) {
    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Dashboard" />
            <div className="flex h-full flex-col gap-4 p-4">
                <div className="grid gap-3 md:grid-cols-4">
                    <Kpi label="Today's Sales" value={money(kpis.today_sales)} hint={`${kpis.today_sales_count} invoices`} />
                    <Kpi label="Today's Purchases" value={money(kpis.today_purchases)} />
                    <Kpi label="This Month — Sales" value={money(kpis.month_sales)} />
                    <Kpi label="This Month — Profit" value={money(kpis.month_profit)} />
                    <Kpi label="Receivable from Customers" value={money(kpis.receivable)} />
                    <Kpi label="Payable to Suppliers" value={money(kpis.payable)} />
                    <Kpi label="Inventory Value (cost)" value={money(kpis.inventory_value)} />
                    <Kpi
                        label="Draft Invoices"
                        value={String(kpis.draft_sales + kpis.draft_purchases)}
                        hint={`${kpis.draft_sales} sales · ${kpis.draft_purchases} purchases`}
                    />
                    <Kpi
                        label="Pending Bookings"
                        value={String(kpis.pending_bookings)}
                        hint="awaiting approval"
                        href="/bookings?status=pending"
                    />
                </div>

                <Card>
                    <CardHeader className="pb-0">
                        <CardTitle className="text-base">Sales & Profit — last 12 months</CardTitle>
                    </CardHeader>
                    <CardContent className="pt-2">
                        <TrendChart data={monthlyTrend} />
                    </CardContent>
                </Card>

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
                                            <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                                                No sales yet — create your first invoice.
                                            </TableCell>
                                        </TableRow>
                                    )}
                                    {recentSales.map((sale) => (
                                        <TableRow key={sale.id}>
                                            <TableCell>
                                                <Link href={route('sales.edit', sale.id)} className="font-medium hover:underline">
                                                    {sale.invoice_number}
                                                </Link>
                                            </TableCell>
                                            <TableCell>{sale.customer?.name}</TableCell>
                                            <TableCell>{shortDate(sale.invoice_date)}</TableCell>
                                            <TableCell>
                                                <Badge variant={sale.status === 'posted' ? 'default' : sale.status === 'cancelled' ? 'destructive' : 'secondary'}>
                                                    {sale.status}
                                                </Badge>
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
                                                <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                                                    Nothing expiring soon.
                                                </TableCell>
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

                        <Card>
                            <CardHeader>
                                <CardTitle className="text-base">Top Customers (30 days)</CardTitle>
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
                                                <TableCell colSpan={3} className="py-8 text-center text-muted-foreground">
                                                    No posted sales in the last 30 days.
                                                </TableCell>
                                            </TableRow>
                                        )}
                                        {topCustomers.map((row) => (
                                            <TableRow key={row.customer_id}>
                                                <TableCell>
                                                    <Link href={route('ledger.customer', row.customer_id)} className="font-medium hover:underline">
                                                        {row.customer?.name}
                                                    </Link>
                                                </TableCell>
                                                <TableCell className="text-right tabular-nums">{money(row.total)}</TableCell>
                                                <TableCell className="text-right tabular-nums">{money(row.profit)}</TableCell>
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
