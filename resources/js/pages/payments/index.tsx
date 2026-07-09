import { Paginator, type PaginatedData } from '@/components/paginator';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { usePermissions } from '@/hooks/use-permissions';
import AppLayout from '@/layouts/app-layout';
import { amount, money, shortDate } from '@/lib/format';
import { type BreadcrumbItem } from '@/types';
import { ALERT_FIX, min, required, useClientValidation } from '@/lib/form-validation';
import { Head, router, useForm } from '@inertiajs/react';
import { Ban, Plus } from 'lucide-react';
import { FormEvent, useEffect, useState } from 'react';
import { toast } from 'sonner';

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

interface OpenInvoice {
    id: number;
    invoice_type: string;
    invoice_number: string;
    invoice_date: string;
    total_amount: number;
    outstanding: number;
}

interface Option { id: number; name: string }

interface Props {
    payments: PaginatedData<PaymentRow>;
    customers: Option[];
    companies: Option[];
    filters: { direction?: string; method?: string; search?: string; from?: string; to?: string };
}

const breadcrumbs: BreadcrumbItem[] = [{ title: 'Payments', href: '/payments' }];

export default function PaymentsIndex({ payments, customers, companies, filters }: Props) {
    const { can } = usePermissions();
    const [dialogOpen, setDialogOpen] = useState(false);
    const [openInvoices, setOpenInvoices] = useState<OpenInvoice[]>([]);
    const [allocations, setAllocations] = useState<Record<string, string>>({});

    const form = useForm({
        party_type: 'customer',
        party_id: '',
        method: 'cash',
        amount: 0,
        payment_date: new Date().toISOString().slice(0, 10),
        bank_name: '',
        cheque_number: '',
        cheque_date: '',
        reference_no: '',
        notes: '',
        allocations: [] as { invoice_type: string; invoice_id: number; amount: number }[],
    });
    const { validateField, validateForm } = useClientValidation(form, {
        party_id: required('Party'),
        amount: min(0.01, 'Amount'),
        payment_date: required('Date'),
    });

    const parties = form.data.party_type === 'customer' ? customers : companies;

    useEffect(() => {
        setOpenInvoices([]);
        setAllocations({});
        if (!form.data.party_id) return;
        const controller = new AbortController();
        (async () => {
            try {
                const params = new URLSearchParams({ party_type: form.data.party_type, party_id: form.data.party_id });
                const response = await fetch(`/lookup/open-invoices?${params}`, {
                    signal: controller.signal,
                    headers: { Accept: 'application/json' },
                });
                if (response.ok) setOpenInvoices(await response.json());
            } catch {
                /* ignore */
            }
        })();
        return () => controller.abort();
    }, [form.data.party_type, form.data.party_id]);

    const submit = (e: FormEvent) => {
        e.preventDefault();
        if (!validateForm()) {
            toast.error(ALERT_FIX);
            return;
        }
        form.transform((data) => ({
            ...data,
            party_id: Number(data.party_id),
            allocations: openInvoices
                .map((invoice) => ({
                    invoice_type: invoice.invoice_type,
                    invoice_id: invoice.id,
                    amount: Number(allocations[`${invoice.invoice_type}:${invoice.id}`] ?? 0),
                }))
                .filter((a) => a.amount > 0),
        }));
        form.post(route('payments.store'), {
            preserveScroll: true,
            onSuccess: () => {
                setDialogOpen(false);
                form.reset();
                setAllocations({});
            },
            onError: () => toast.error(ALERT_FIX),
        });
    };

    const err = (key: string) => (form.errors as Record<string, string>)[key];
    const allocatedTotal = Object.values(allocations).reduce((s, v) => s + Number(v || 0), 0);

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Payments" />
            <div className="flex h-full flex-col gap-4 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                        <h1 className="text-2xl font-bold">Payments & Receipts</h1>
                        <p className="text-sm text-muted-foreground">Customer receipts and supplier payments</p>
                    </div>
                    {can('payments.manage') && (
                        <Button onClick={() => setDialogOpen(true)}>
                            <Plus className="mr-1 size-4" /> Record Payment
                        </Button>
                    )}
                </div>

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

            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Record Payment / Receipt</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={submit} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div>
                            <Label>Party Type</Label>
                            <Select
                                value={form.data.party_type}
                                onValueChange={(v) => {
                                    form.setData('party_type', v);
                                    form.setData('party_id', '');
                                }}
                            >
                                <SelectTrigger autoFocus><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="customer">Customer (receipt)</SelectItem>
                                    <SelectItem value="company">Supplier (payment)</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <Label>{form.data.party_type === 'customer' ? 'Customer' : 'Supplier'} *</Label>
                            <Select value={form.data.party_id} onValueChange={(v) => { form.setData('party_id', v); form.clearErrors('party_id'); }}>
                                <SelectTrigger aria-invalid={!!err('party_id')} className={err('party_id') ? 'border-destructive ring-1 ring-destructive' : ''}><SelectValue placeholder="Select…" /></SelectTrigger>
                                <SelectContent>
                                    {parties.map((party) => (
                                        <SelectItem key={party.id} value={String(party.id)}>{party.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            {err('party_id') && <p className="text-xs text-destructive">{err('party_id')}</p>}
                        </div>
                        <div>
                            <Label>Method</Label>
                            <Select value={form.data.method} onValueChange={(v) => form.setData('method', v)}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="cash">Cash</SelectItem>
                                    <SelectItem value="bank">Bank Transfer</SelectItem>
                                    <SelectItem value="cheque">Cheque</SelectItem>
                                    <SelectItem value="online">Online</SelectItem>
                                    <SelectItem value="adjustment">Adjustment</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <Label>Amount (Rs) *</Label>
                            <Input
                                type="number" min={0} step="0.01" value={form.data.amount}
                                onChange={(e) => form.setData('amount', Number(e.target.value))}
                                onBlur={() => validateField('amount')}
                                aria-invalid={!!err('amount')}
                                className={err('amount') ? 'border-destructive ring-1 ring-destructive' : ''}
                            />
                            {err('amount') && <p className="text-xs text-destructive">{err('amount')}</p>}
                        </div>
                        <div>
                            <Label>Date *</Label>
                            <Input
                                type="date" value={form.data.payment_date}
                                onChange={(e) => form.setData('payment_date', e.target.value)}
                                onBlur={() => validateField('payment_date')}
                                aria-invalid={!!err('payment_date')}
                                className={err('payment_date') ? 'border-destructive ring-1 ring-destructive' : ''}
                            />
                            {err('payment_date') && <p className="text-xs text-destructive">{err('payment_date')}</p>}
                        </div>
                        <div>
                            <Label>Reference #</Label>
                            <Input value={form.data.reference_no} onChange={(e) => form.setData('reference_no', e.target.value)} />
                        </div>
                        {form.data.method === 'cheque' && (
                            <>
                                <div>
                                    <Label>Bank Name</Label>
                                    <Input value={form.data.bank_name} onChange={(e) => form.setData('bank_name', e.target.value)} />
                                </div>
                                <div>
                                    <Label>Cheque #</Label>
                                    <Input value={form.data.cheque_number} onChange={(e) => form.setData('cheque_number', e.target.value)} />
                                </div>
                                <div>
                                    <Label>Cheque Date</Label>
                                    <Input type="date" value={form.data.cheque_date} onChange={(e) => form.setData('cheque_date', e.target.value)} />
                                </div>
                            </>
                        )}
                        <div className="col-span-2">
                            <Label>Notes</Label>
                            <Input value={form.data.notes} onChange={(e) => form.setData('notes', e.target.value)} />
                        </div>

                        {openInvoices.length > 0 && (
                            <div className="col-span-2 rounded-lg border p-3">
                                <div className="mb-2 flex items-center justify-between text-sm font-medium">
                                    <span>Allocate to open invoices (optional)</span>
                                    <span className="tabular-nums text-muted-foreground">
                                        Allocated: {amount(allocatedTotal)} / {amount(form.data.amount)}
                                    </span>
                                </div>
                                <div className="max-h-48 space-y-1 overflow-y-auto">
                                    {openInvoices.map((invoice) => {
                                        const key = `${invoice.invoice_type}:${invoice.id}`;
                                        return (
                                            <div key={key} className="flex items-center gap-2 text-sm">
                                                <span className="w-32 font-medium">{invoice.invoice_number}</span>
                                                <span className="w-24 text-muted-foreground">{shortDate(invoice.invoice_date)}</span>
                                                <span className="w-28 text-right tabular-nums text-muted-foreground">
                                                    Due {amount(invoice.outstanding)}
                                                </span>
                                                <Input
                                                    type="number" min={0} max={invoice.outstanding} step="0.01"
                                                    className="h-8 w-28 text-right"
                                                    value={allocations[key] ?? ''}
                                                    placeholder="0.00"
                                                    onChange={(e) => setAllocations((a) => ({ ...a, [key]: e.target.value }))}
                                                />
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        <DialogFooter className="col-span-2">
                            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                            <Button type="submit" disabled={form.processing}>Record</Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </AppLayout>
    );
}
