import { Paginator, type PaginatedData } from '@/components/paginator';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { RecordPaymentDialog } from '@/components/record-payment-dialog';
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { SummaryBar } from '@/components/summary-bar';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { usePermissions } from '@/hooks/use-permissions';
import AppLayout from '@/layouts/app-layout';
import { money, shortDate } from '@/lib/format';
import { type BreadcrumbItem } from '@/types';
import { Head, router } from '@inertiajs/react';
import { Ban, Plus } from 'lucide-react';
import { useState } from 'react';

interface PaymentRow {
    id: number;
    payment_number: string;
    direction: 'in' | 'out';
    method: string;
    amount: string;
    payment_date: string;
    status: string;
    notes: string | null;
    party?: { id: number; name: string } | null;
}

interface Option { id: number; name: string }

interface Props {
    payments: PaginatedData<PaymentRow>;
    customers: Option[];
    companies: Option[];
    filters: { direction?: string; method?: string; search?: string; from?: string; to?: string };
    summary: { receipts: number; payments: number; net: number };
}

const breadcrumbs: BreadcrumbItem[] = [{ title: 'Payments', href: '/payments' }];

export default function PaymentsIndex({ payments, customers, companies, filters, summary }: Props) {
    const { can } = usePermissions();
    const [dialogOpen, setDialogOpen] = useState(false);

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Payments" />
            <div className="flex h-full flex-col gap-4 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-4">
                    <div>
                        <h1 className="text-4xl font-bold">Payments & Receipts</h1>
                        <p className="text-sm text-muted-foreground">Customer receipts and supplier payments</p>
                    </div>
                    {can('payments.manage') && (
                        <Button onClick={() => setDialogOpen(true)}>
                            <Plus className="mr-1 size-4" /> Record Payment
                        </Button>
                    )}
                </div>

                <SummaryBar
                    items={[
                        { label: 'Total Receipts', value: summary.receipts, tone: 'positive' },
                        { label: 'Total Payments', value: summary.payments, tone: 'negative' },
                        { label: 'Net', value: summary.net, tone: summary.net >= 0 ? 'positive' : 'negative' },
                    ]}
                />

                <div className="flex flex-wrap gap-2">
                    <Select
                        value={filters.direction ?? 'all'}
                        onValueChange={(v) => router.get('/payments', { ...filters, direction: v === 'all' ? undefined : v }, { preserveState: true })}
                    >
                        <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All directions</SelectItem>
                            <SelectItem value="in">Receipts (from customers)</SelectItem>
                            <SelectItem value="out">Payments (to suppliers)</SelectItem>
                        </SelectContent>
                    </Select>
                    <Select
                        value={filters.method ?? 'all'}
                        onValueChange={(v) => router.get('/payments', { ...filters, method: v === 'all' ? undefined : v }, { preserveState: true })}
                    >
                        <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All methods</SelectItem>
                            <SelectItem value="cash">Cash</SelectItem>
                            <SelectItem value="bank">Bank</SelectItem>
                            <SelectItem value="cheque">Cheque</SelectItem>
                            <SelectItem value="online">Online</SelectItem>
                            <SelectItem value="adjustment">Adjustment</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                <div className="rounded-xl border">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Number</TableHead>
                                <TableHead>Party</TableHead>
                                <TableHead>Direction</TableHead>
                                <TableHead>Method</TableHead>
                                <TableHead>Date</TableHead>
                                <TableHead className="text-right">Amount</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="w-12" />
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {payments.data.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                                        No payments recorded yet.
                                    </TableCell>
                                </TableRow>
                            )}
                            {payments.data.map((payment) => (
                                <TableRow key={payment.id}>
                                    <TableCell className="font-medium">{payment.payment_number}</TableCell>
                                    <TableCell>{payment.party?.name ?? '—'}</TableCell>
                                    <TableCell>
                                        <Badge variant={payment.direction === 'in' ? 'default' : 'secondary'}>
                                            {payment.direction === 'in' ? 'Receipt' : 'Payment'}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="capitalize">{payment.method}</TableCell>
                                    <TableCell>{shortDate(payment.payment_date)}</TableCell>
                                    <TableCell className="text-right tabular-nums">{money(payment.amount)}</TableCell>
                                    <TableCell>
                                        <Badge variant={payment.status === 'completed' ? 'outline' : 'destructive'}>
                                            {payment.status}
                                        </Badge>
                                    </TableCell>
                                    <TableCell>
                                        {payment.status === 'completed' && can('payments.manage') && (
                                            <Button
                                                variant="ghost" size="icon" title="Cancel & reverse"
                                                onClick={() => {
                                                    if (confirm(`Cancel ${payment.payment_number}? The ledger entry will be reversed.`)) {
                                                        router.post(route('payments.cancel', payment.id), {}, { preserveScroll: true });
                                                    }
                                                }}
                                            >
                                                <Ban className="size-4 text-destructive" />
                                            </Button>
                                        )}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                    <Paginator meta={payments} />
                </div>
            </div>

            {dialogOpen && can('payments.manage') && <RecordPaymentDialog
                selection={{ type: 'customer' }}
                parties={{ customer: customers, company: companies }}
                close={() => setDialogOpen(false)}
            />}
        </AppLayout>
    );
}
