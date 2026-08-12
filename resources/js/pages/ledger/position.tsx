import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import AppLayout from '@/layouts/app-layout';
import { amount, money, shortDate } from '@/lib/format';
import { type BreadcrumbItem } from '@/types';
import { Head, Link, router } from '@inertiajs/react';
import { Printer } from 'lucide-react';

interface Aging {
    current: number;
    '31_60': number;
    '61_90': number;
    over_90: number;
    total: number;
}

interface Receivable {
    id: number;
    name: string;
    city: string | null;
    phone: string | null;
    credit_limit: number;
    balance: number;
    aging: Aging | null;
    paid: number;
}

interface Payable {
    id: number;
    name: string;
    city: string | null;
    balance: number;
    aging: Aging | null;
    paid: number;
}

interface PaymentLog {
    id: number;
    number: string;
    date: string;
    direction: 'in' | 'out';
    party_type: string;
    party_id: number;
    party_name: string | null;
    method: string;
    amount: number;
}

interface Totals {
    total_receivable: number;
    total_payable: number;
    net: number;
    customer_count: number;
    supplier_count: number;
    settled_customer_count: number;
    settled_supplier_count: number;
    received: number;
    paid: number;
}

interface Props {
    data: {
        receivables: Receivable[];
        payables: Payable[];
        payments: PaymentLog[];
        totals: Totals;
    };
    filters: { from?: string; to?: string };
}

const breadcrumbs: BreadcrumbItem[] = [{ title: 'Financial Position', href: '/ledger/position' }];

export default function FinancialPosition({ data, filters }: Props) {
    const { receivables, payables, payments, totals } = data;

    const setFilter = (key: 'from' | 'to', value: string | undefined) => {
        router.get('/ledger/position', { ...filters, [key]: value }, { preserveState: true, replace: true });
    };

    const pdfUrl = route('ledger.position.pdf', { from: filters.from, to: filters.to });

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Financial Position" />
            <div className="flex h-full w-full flex-col gap-4 p-4">
                <div className="flex flex-wrap items-end justify-between gap-3 border-b pb-4">
                    <div>
                        <h1 className="text-4xl font-bold">Financial Position</h1>
                        <p className="text-sm text-muted-foreground">
                            What customers owe us vs. what we owe suppliers. Balances are current; the payments log and
                            per-party paid amounts cover the selected period.
                        </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="flex flex-col">
                            <label className="text-xs text-muted-foreground">From</label>
                            <Input type="date" className="w-40" value={filters.from ?? ''} onChange={(e) => setFilter('from', e.target.value || undefined)} />
                        </div>
                        <div className="flex flex-col">
                            <label className="text-xs text-muted-foreground">To</label>
                            <Input type="date" className="w-40" value={filters.to ?? ''} onChange={(e) => setFilter('to', e.target.value || undefined)} />
                        </div>
                        <Button variant="outline" size="sm" asChild>
                            <a href={pdfUrl} target="_blank" rel="noreferrer">
                                <Printer className="mr-1 size-4" /> Print PDF
                            </a>
                        </Button>
                    </div>
                </div>

                {/* KPI tiles */}
                <div className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-xl border p-4">
                        <div className="text-xs text-muted-foreground">Due from Customers</div>
                        <div className="text-2xl font-bold tabular-nums text-emerald-600">{money(totals.total_receivable)}</div>
                        <div className="text-xs text-muted-foreground">
                            {totals.customer_count} customers
                            {totals.settled_customer_count > 0 && ` · +${totals.settled_customer_count} settled`}
                        </div>
                    </div>
                    <div className="rounded-xl border p-4">
                        <div className="text-xs text-muted-foreground">Owed to Suppliers</div>
                        <div className="text-2xl font-bold tabular-nums text-red-600">{money(totals.total_payable)}</div>
                        <div className="text-xs text-muted-foreground">
                            {totals.supplier_count} suppliers
                            {totals.settled_supplier_count > 0 && ` · +${totals.settled_supplier_count} settled`}
                        </div>
                    </div>
                    <div className="rounded-xl border p-4">
                        <div className="text-xs text-muted-foreground">Net Position</div>
                        <div className={`text-2xl font-bold tabular-nums ${totals.net >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                            {money(totals.net)}
                        </div>
                        <div className="text-xs text-muted-foreground">{totals.net >= 0 ? 'Net owed to us' : 'Net we owe'}</div>
                    </div>
                </div>

                {/* Receivables */}
                <Card>
                    <CardHeader>
                        <CardTitle>Receivables — Due from Customers</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="overflow-x-auto rounded-lg border">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Customer</TableHead>
                                        <TableHead>City</TableHead>
                                        <TableHead className="text-right">Balance</TableHead>
                                        <TableHead className="text-right">Current</TableHead>
                                        <TableHead className="text-right">31–60</TableHead>
                                        <TableHead className="text-right">61–90</TableHead>
                                        <TableHead className="text-right">90+</TableHead>
                                        <TableHead className="text-right">Received (period)</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {receivables.length === 0 && (
                                        <TableRow>
                                            <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                                                No outstanding receivables. 🎉
                                            </TableCell>
                                        </TableRow>
                                    )}
                                    {receivables.map((c) => {
                                        const overLimit = c.credit_limit > 0 && c.balance > c.credit_limit;
                                        return (
                                            <TableRow key={c.id}>
                                                <TableCell>
                                                    <div className="flex items-center gap-2">
                                                        <Link href={route('ledger.customer', c.id)} className="font-medium hover:underline">
                                                            {c.name}
                                                        </Link>
                                                        {c.balance === 0 && <Badge variant="secondary">Settled</Badge>}
                                                    </div>
                                                    <div className="text-xs text-muted-foreground">{c.phone}</div>
                                                </TableCell>
                                                <TableCell>{c.city ?? '—'}</TableCell>
                                                <TableCell className="text-right tabular-nums">
                                                    <span className={overLimit ? 'font-semibold text-destructive' : 'font-medium'}>{c.balance === 0 ? '—' : amount(c.balance)}</span>
                                                </TableCell>
                                                <TableCell className="text-right tabular-nums">{c.aging ? amount(c.aging.current) : '—'}</TableCell>
                                                <TableCell className="text-right tabular-nums">{c.aging ? amount(c.aging['31_60']) : '—'}</TableCell>
                                                <TableCell className="text-right tabular-nums">{c.aging ? amount(c.aging['61_90']) : '—'}</TableCell>
                                                <TableCell className="text-right tabular-nums">
                                                    <span className={c.aging && c.aging.over_90 > 0 ? 'font-semibold text-destructive' : ''}>
                                                        {c.aging ? amount(c.aging.over_90) : '—'}
                                                    </span>
                                                </TableCell>
                                                <TableCell className="text-right tabular-nums text-emerald-600">{c.paid ? amount(c.paid) : '—'}</TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                                {receivables.length > 0 && (
                                    <tfoot>
                                        <TableRow className="border-t font-semibold">
                                            <TableCell colSpan={2}>Total</TableCell>
                                            <TableCell className="text-right tabular-nums">{amount(totals.total_receivable)}</TableCell>
                                            <TableCell colSpan={4} />
                                            <TableCell className="text-right tabular-nums text-emerald-600">{amount(totals.received)}</TableCell>
                                        </TableRow>
                                    </tfoot>
                                )}
                            </Table>
                        </div>
                    </CardContent>
                </Card>

                {/* Payables */}
                <Card>
                    <CardHeader>
                        <CardTitle>Payables — Owed to Suppliers</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="overflow-x-auto rounded-lg border">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Supplier</TableHead>
                                        <TableHead>City</TableHead>
                                        <TableHead className="text-right">Balance</TableHead>
                                        <TableHead className="text-right">Current</TableHead>
                                        <TableHead className="text-right">31–60</TableHead>
                                        <TableHead className="text-right">61–90</TableHead>
                                        <TableHead className="text-right">90+</TableHead>
                                        <TableHead className="text-right">Paid (period)</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {payables.length === 0 && (
                                        <TableRow>
                                            <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                                                Nothing owed to suppliers. 🎉
                                            </TableCell>
                                        </TableRow>
                                    )}
                                    {payables.map((s) => (
                                        <TableRow key={s.id}>
                                            <TableCell>
                                                <div className="flex items-center gap-2">
                                                    <Link href={route('ledger.supplier', s.id)} className="font-medium hover:underline">
                                                        {s.name}
                                                    </Link>
                                                    {s.balance === 0 && <Badge variant="secondary">Settled</Badge>}
                                                </div>
                                            </TableCell>
                                            <TableCell>{s.city ?? '—'}</TableCell>
                                            <TableCell className="text-right font-medium tabular-nums">{s.balance === 0 ? '—' : amount(s.balance)}</TableCell>
                                            <TableCell className="text-right tabular-nums">{s.aging ? amount(s.aging.current) : '—'}</TableCell>
                                            <TableCell className="text-right tabular-nums">{s.aging ? amount(s.aging['31_60']) : '—'}</TableCell>
                                            <TableCell className="text-right tabular-nums">{s.aging ? amount(s.aging['61_90']) : '—'}</TableCell>
                                            <TableCell className="text-right tabular-nums">
                                                <span className={s.aging && s.aging.over_90 > 0 ? 'font-semibold text-destructive' : ''}>
                                                    {s.aging ? amount(s.aging.over_90) : '—'}
                                                </span>
                                            </TableCell>
                                            <TableCell className="text-right tabular-nums text-red-600">{s.paid ? amount(s.paid) : '—'}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                                {payables.length > 0 && (
                                    <tfoot>
                                        <TableRow className="border-t font-semibold">
                                            <TableCell colSpan={2}>Total</TableCell>
                                            <TableCell className="text-right tabular-nums">{amount(totals.total_payable)}</TableCell>
                                            <TableCell colSpan={4} />
                                            <TableCell className="text-right tabular-nums text-red-600">{amount(totals.paid)}</TableCell>
                                        </TableRow>
                                    </tfoot>
                                )}
                            </Table>
                        </div>
                    </CardContent>
                </Card>

                {/* Payments log */}
                <Card>
                    <CardHeader>
                        <CardTitle>Payments Log</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="overflow-x-auto rounded-lg border">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Date</TableHead>
                                        <TableHead>Ref #</TableHead>
                                        <TableHead>Type</TableHead>
                                        <TableHead>Party</TableHead>
                                        <TableHead>Method</TableHead>
                                        <TableHead className="text-right">Amount</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {payments.length === 0 && (
                                        <TableRow>
                                            <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                                                No payments recorded in this period.
                                            </TableCell>
                                        </TableRow>
                                    )}
                                    {payments.map((p) => {
                                        const isIn = p.direction === 'in';
                                        const partyRoute = p.party_type === 'customer' ? 'ledger.customer' : 'ledger.supplier';
                                        return (
                                            <TableRow key={p.id}>
                                                <TableCell>{shortDate(p.date)}</TableCell>
                                                <TableCell className="text-muted-foreground">{p.number}</TableCell>
                                                <TableCell>
                                                    <Badge variant={isIn ? 'default' : 'secondary'}>{isIn ? 'Receipt' : 'Payment'}</Badge>
                                                </TableCell>
                                                <TableCell>
                                                    <Link href={route(partyRoute, p.party_id)} className="hover:underline">
                                                        {p.party_name ?? '—'}
                                                    </Link>
                                                </TableCell>
                                                <TableCell className="capitalize">{p.method}</TableCell>
                                                <TableCell className={`text-right font-medium tabular-nums ${isIn ? 'text-emerald-600' : 'text-red-600'}`}>
                                                    {isIn ? '+' : '−'} {amount(p.amount)}
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </AppLayout>
    );
}
