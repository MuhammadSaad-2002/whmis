import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { usePermissions } from '@/hooks/use-permissions';
import AppLayout from '@/layouts/app-layout';
import { dec2, money, qty, shortDate } from '@/lib/format';
import { type BreadcrumbItem } from '@/types';
import { Head, Link } from '@inertiajs/react';
import { FileDown, Plus, Printer } from 'lucide-react';

interface Figures {
    amount: number;
    qty: number;
    discount: number;
    tax: number;
    receivable: number;
    cost: number;
}

interface ReturnLine {
    id: number;
    return_number: string;
    date: string;
    status: string;
    amount: number;
    receivable: number;
    qty: number;
    discount: number;
    tax: number;
    cost: number;
}

interface Position {
    original: Figures;
    returns: ReturnLine[];
    returned: Figures;
    net: Figures;
    payments: number;
    final_outstanding: number;
    refund_due: number;
    status: string;
}

interface ItemIncentive {
    id: number;
    rule_name: string;
    rule_type: string;
    value_given: string;
}

interface InvoiceItem {
    id: number;
    quantity: string;
    bonus_quantity: string;
    trade_price: string;
    discount_amount: string;
    gst_amount: string;
    net_amount: string;
    product?: { name: string };
    batch?: { batch_number: string };
    incentives?: ItemIncentive[];
}

interface Invoice {
    id: number;
    invoice_number: string;
    invoice_date: string;
    status: string;
    sale_type: string;
    customer?: { name: string; city: string | null };
    warehouse?: { name: string };
    items: InvoiceItem[];
}

interface Props {
    invoice: Invoice;
    position: Position;
}

const statusMeta: Record<string, { label: string; className: string }> = {
    posted_no_returns: { label: 'Posted — No Returns', className: 'text-emerald-600' },
    partially_returned: { label: 'Partially Returned', className: 'text-amber-600' },
    fully_returned: { label: 'Fully Returned', className: 'text-red-600' },
};

export default function SalesSummary({ invoice, position }: Props) {
    const { can } = usePermissions();
    const breadcrumbs: BreadcrumbItem[] = [
        { title: 'Sales', href: '/sales' },
        { title: invoice.invoice_number, href: route('sales.summary', invoice.id) },
    ];
    const status = statusMeta[position.status] ?? statusMeta.posted_no_returns;

    const netRow = (label: string, key: keyof Figures, fmt: (v: number) => string) => (
        <TableRow>
            <TableCell className="font-medium">{label}</TableCell>
            <TableCell className="text-right tabular-nums">{fmt(position.original[key])}</TableCell>
            <TableCell className="text-right tabular-nums text-amber-600">
                {position.returned[key] ? `- ${fmt(position.returned[key])}` : '—'}
            </TableCell>
            <TableCell className="text-right font-semibold tabular-nums">{fmt(position.net[key])}</TableCell>
        </TableRow>
    );

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={`${invoice.invoice_number} — Summary`} />
            <div className="flex h-full w-full flex-col gap-4 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2 border-b pb-4">
                    <div>
                        <div className="flex items-center gap-2">
                            <h1 className="text-4xl font-bold">{invoice.invoice_number}</h1>
                            <Badge variant="default">{invoice.status}</Badge>
                        </div>
                        <p className={`mt-1 text-sm font-medium ${status.className}`}>{status.label}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {can('returns.manage') && position.status !== 'fully_returned' && (
                            <Button variant="outline" size="sm" asChild>
                                <Link href={route('returns.sales.create')}><Plus className="mr-1 size-4" /> New Return</Link>
                            </Button>
                        )}
                        <Button variant="outline" size="sm" asChild>
                            <a href={route('sales.print', invoice.id)} target="_blank" rel="noreferrer">
                                <Printer className="mr-1 size-4" /> Original Invoice
                            </a>
                        </Button>
                        <Button variant="outline" size="sm" asChild>
                            <a href={route('sales.net-position', invoice.id)} target="_blank" rel="noreferrer">
                                <FileDown className="mr-1 size-4" /> Net Position PDF
                            </a>
                        </Button>
                    </div>
                </div>

                {/* Section 1 — Original Invoice */}
                <Card>
                    <CardHeader>
                        <CardTitle>Original Invoice</CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-4">
                        <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                            <div><div className="text-muted-foreground">Customer</div><div>{invoice.customer?.name}</div></div>
                            <div><div className="text-muted-foreground">City</div><div>{invoice.customer?.city ?? '—'}</div></div>
                            <div><div className="text-muted-foreground">Date</div><div>{shortDate(invoice.invoice_date)}</div></div>
                            <div><div className="text-muted-foreground">Type</div><div className="capitalize">{invoice.sale_type.replace('_', ' ')}</div></div>
                        </div>
                        <div className="overflow-x-auto rounded-lg border">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Product</TableHead>
                                        <TableHead>Batch</TableHead>
                                        <TableHead className="text-right">Qty</TableHead>
                                        <TableHead className="text-right">Price</TableHead>
                                        <TableHead className="text-right">Disc</TableHead>
                                        <TableHead className="text-right">GST</TableHead>
                                        <TableHead className="text-right">Net</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {invoice.items.map((item) => (
                                        <TableRow key={item.id}>
                                            <TableCell>
                                                {item.product?.name}
                                                {!!item.incentives?.length && (
                                                    <div className="mt-1 flex flex-wrap gap-1">
                                                        {item.incentives.map((inc) => (
                                                            <Badge key={inc.id} variant="secondary" className="text-[10px] font-normal">
                                                                {inc.rule_name}
                                                                {Number(inc.value_given) > 0 && ` · ${money(inc.value_given)}`}
                                                            </Badge>
                                                        ))}
                                                    </div>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-muted-foreground">{item.batch?.batch_number ?? 'FIFO'}</TableCell>
                                            <TableCell className="text-right tabular-nums">
                                                {qty(item.quantity)}
                                                {Number(item.bonus_quantity) > 0 && (
                                                    <span className="ml-1 text-xs text-emerald-600">+{qty(item.bonus_quantity)}</span>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-right tabular-nums">{money(item.trade_price)}</TableCell>
                                            <TableCell className="text-right tabular-nums">
                                                {money(item.discount_amount)}
                                                {(() => {
                                                    const gross = Number(item.quantity) * Number(item.trade_price);
                                                    const pct = gross > 0 ? (Number(item.discount_amount) / gross) * 100 : 0;
                                                    return pct > 0 ? (
                                                        <span className="ml-1 text-xs text-muted-foreground">({dec2(pct)}%)</span>
                                                    ) : null;
                                                })()}
                                            </TableCell>
                                            <TableCell className="text-right tabular-nums">{money(item.gst_amount)}</TableCell>
                                            <TableCell className="text-right tabular-nums">{money(item.net_amount)}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    </CardContent>
                </Card>

                {/* Section 2 — Return History */}
                <Card>
                    <CardHeader>
                        <CardTitle>Return History</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {position.returns.length === 0 ? (
                            <p className="py-4 text-center text-sm text-muted-foreground">No returns against this invoice.</p>
                        ) : (
                            <div className="overflow-x-auto rounded-lg border">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Return #</TableHead>
                                            <TableHead>Date</TableHead>
                                            <TableHead>Status</TableHead>
                                            <TableHead className="text-right">Qty</TableHead>
                                            <TableHead className="text-right">Discount</TableHead>
                                            <TableHead className="text-right">Tax</TableHead>
                                            <TableHead className="text-right">Credit</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {position.returns.map((r) => {
                                            const off = r.status === 'cancelled';
                                            return (
                                                <TableRow key={r.id} className={off ? 'text-muted-foreground' : ''}>
                                                    <TableCell className={off ? 'line-through' : 'font-medium'}>
                                                        <Link href={route('returns.sales.show', r.id)} className="hover:underline">
                                                            {r.return_number}
                                                        </Link>
                                                    </TableCell>
                                                    <TableCell>{shortDate(r.date)}</TableCell>
                                                    <TableCell>
                                                        <Badge variant={off ? 'destructive' : 'default'}>{r.status}</Badge>
                                                    </TableCell>
                                                    <TableCell className="text-right tabular-nums">{qty(r.qty)}</TableCell>
                                                    <TableCell className="text-right tabular-nums">{money(r.discount)}</TableCell>
                                                    <TableCell className="text-right tabular-nums">{money(r.tax)}</TableCell>
                                                    <TableCell className={`text-right tabular-nums ${off ? 'line-through' : ''}`}>{money(r.amount)}</TableCell>
                                                </TableRow>
                                            );
                                        })}
                                    </TableBody>
                                </Table>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Section 3 — Net / Final Position */}
                <Card>
                    <CardHeader>
                        <CardTitle>Net / Final Position</CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-4">
                        <div className="overflow-x-auto rounded-lg border">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead />
                                        <TableHead className="text-right">Original</TableHead>
                                        <TableHead className="text-right">Returned</TableHead>
                                        <TableHead className="text-right">Net</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {netRow('Amount', 'amount', money)}
                                    {netRow('Quantity', 'qty', qty)}
                                    {netRow('Discount', 'discount', money)}
                                    {netRow('Tax (GST)', 'tax', money)}
                                    {netRow('Receivable', 'receivable', money)}
                                </TableBody>
                            </Table>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-3">
                            <div className="rounded-lg border p-3">
                                <div className="text-xs text-muted-foreground">Net Receivable</div>
                                <div className="text-lg font-semibold tabular-nums">{money(position.net.receivable)}</div>
                            </div>
                            <div className="rounded-lg border p-3">
                                <div className="text-xs text-muted-foreground">Amount Received</div>
                                <div className="text-lg font-semibold tabular-nums">{money(position.payments)}</div>
                            </div>
                            <div className="rounded-lg border p-3">
                                <div className="text-xs text-muted-foreground">
                                    {position.refund_due > 0 ? 'Refund Due to Customer' : 'Final Outstanding'}
                                </div>
                                <div className={`text-lg font-semibold tabular-nums ${position.refund_due > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                    {money(position.refund_due > 0 ? position.refund_due : position.final_outstanding)}
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </AppLayout>
    );
}
