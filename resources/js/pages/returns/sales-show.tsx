import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { usePermissions } from '@/hooks/use-permissions';
import AppLayout from '@/layouts/app-layout';
import { money, qty, shortDate } from '@/lib/format';
import { type BreadcrumbItem } from '@/types';
import { Head, Link, router } from '@inertiajs/react';
import { Ban, FileText } from 'lucide-react';

interface ReturnItem {
    id: number;
    quantity: string;
    unit_price: string;
    net_amount: string;
    cost_amount: string;
    product?: { name: string };
    batch?: { batch_number: string };
}

interface SalesReturn {
    id: number;
    return_number: string;
    return_date: string;
    status: string;
    reason: string | null;
    cancelled_at: string | null;
    total_amount: string;
    total_cost: string;
    customer?: { name: string; city: string | null };
    warehouse?: { name: string };
    invoice?: { id: number; invoice_number: string; invoice_date: string };
    creator?: { name: string };
    cancelledBy?: { name: string };
    items: ReturnItem[];
}

interface Props {
    salesReturn: SalesReturn;
}

export default function SalesReturnShow({ salesReturn }: Props) {
    const { can } = usePermissions();
    const cancelled = salesReturn.status === 'cancelled';
    const breadcrumbs: BreadcrumbItem[] = [
        { title: 'Sales Returns', href: '/returns/sales' },
        { title: salesReturn.return_number, href: route('returns.sales.show', salesReturn.id) },
    ];

    const cancel = () => {
        if (confirm(`Cancel return ${salesReturn.return_number}? This withdraws the restored stock and reverses the credit note.`)) {
            router.post(route('returns.sales.cancel', salesReturn.id), {}, { preserveScroll: true });
        }
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={salesReturn.return_number} />
            <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2 border-b pb-4">
                    <div>
                        <div className="flex items-center gap-2">
                            <h1 className="text-4xl font-bold">{salesReturn.return_number}</h1>
                            <Badge variant={cancelled ? 'destructive' : 'default'}>{salesReturn.status}</Badge>
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">Sales return — credit note on the customer ledger</p>
                    </div>
                    <div className="flex gap-2">
                        {salesReturn.invoice && (
                            <Button variant="outline" size="sm" asChild>
                                <Link href={route('sales.summary', salesReturn.invoice.id)}>
                                    <FileText className="mr-1 size-4" /> Invoice Summary
                                </Link>
                            </Button>
                        )}
                        {can('returns.manage') && !cancelled && (
                            <Button variant="destructive" size="sm" onClick={cancel}>
                                <Ban className="mr-1 size-4" /> Cancel Return
                            </Button>
                        )}
                    </div>
                </div>

                {cancelled && (
                    <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
                        This return was cancelled{salesReturn.cancelled_at ? ` on ${shortDate(salesReturn.cancelled_at)}` : ''}
                        {salesReturn.cancelledBy ? ` by ${salesReturn.cancelledBy.name}` : ''}. Its stock and credit note have been reversed;
                        it no longer counts toward the invoice's net position or reports.
                    </div>
                )}

                <Card>
                    <CardHeader><CardTitle>Details</CardTitle></CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                            <div><div className="text-muted-foreground">Customer</div><div>{salesReturn.customer?.name}</div></div>
                            <div>
                                <div className="text-muted-foreground">Against Invoice</div>
                                <div>
                                    {salesReturn.invoice ? (
                                        <Link href={route('sales.summary', salesReturn.invoice.id)} className="hover:underline">
                                            {salesReturn.invoice.invoice_number}
                                        </Link>
                                    ) : '—'}
                                </div>
                            </div>
                            <div><div className="text-muted-foreground">Return Date</div><div>{shortDate(salesReturn.return_date)}</div></div>
                            <div><div className="text-muted-foreground">Warehouse</div><div>{salesReturn.warehouse?.name ?? '—'}</div></div>
                            <div><div className="text-muted-foreground">Reason</div><div>{salesReturn.reason || '—'}</div></div>
                            <div><div className="text-muted-foreground">Created By</div><div>{salesReturn.creator?.name ?? '—'}</div></div>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader><CardTitle>Returned Items</CardTitle></CardHeader>
                    <CardContent>
                        <div className="overflow-x-auto rounded-lg border">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Product</TableHead>
                                        <TableHead>Batch</TableHead>
                                        <TableHead className="text-right">Qty</TableHead>
                                        <TableHead className="text-right">Unit Refund</TableHead>
                                        <TableHead className="text-right">Credit</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {salesReturn.items.map((item) => (
                                        <TableRow key={item.id}>
                                            <TableCell>{item.product?.name}</TableCell>
                                            <TableCell className="text-muted-foreground">{item.batch?.batch_number ?? '—'}</TableCell>
                                            <TableCell className="text-right tabular-nums">{qty(item.quantity)}</TableCell>
                                            <TableCell className="text-right tabular-nums">{money(item.unit_price)}</TableCell>
                                            <TableCell className="text-right tabular-nums">{money(item.net_amount)}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                        <div className="mt-3 flex justify-end">
                            <div className="rounded-lg border p-3 text-right">
                                <div className="text-xs text-muted-foreground">Total Credit</div>
                                <div className={`text-lg font-semibold tabular-nums ${cancelled ? 'text-muted-foreground line-through' : ''}`}>
                                    {money(salesReturn.total_amount)}
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </AppLayout>
    );
}
