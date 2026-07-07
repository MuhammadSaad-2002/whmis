import { Button } from '@/components/ui/button';
import {
    CommandDialog, CommandEmpty, CommandInput, CommandItem, CommandList,
} from '@/components/ui/command';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import AppLayout from '@/layouts/app-layout';
import { amount, money, qty as fmtQty, shortDate, toNumber } from '@/lib/format';
import { type BreadcrumbItem } from '@/types';
import { ALERT_FIX } from '@/lib/form-validation';
import { Head, router } from '@inertiajs/react';
import { FileSearch, Undo2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

interface InvoiceHit {
    id: number;
    invoice_number: string;
    customer: string | null;
    city: string | null;
    invoice_date: string;
    total_amount: number;
}

interface ReturnableLine {
    sales_invoice_item_id: number;
    product: string;
    sold_qty: number;
    already_returned: number;
    returnable: number;
    unit_refund: number;
}

interface LoadedInvoice {
    id: number;
    invoice_number: string;
    customer: string;
    invoice_date: string;
}

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Sales Returns', href: '/returns/sales' },
    { title: 'New Return', href: '#' },
];

export default function SalesReturnForm({ warehouse }: { warehouse: { id: number; name: string } }) {
    const [pickerOpen, setPickerOpen] = useState(true);
    const [query, setQuery] = useState('');
    const [hits, setHits] = useState<InvoiceHit[]>([]);
    const [invoice, setInvoice] = useState<LoadedInvoice | null>(null);
    const [lines, setLines] = useState<ReturnableLine[]>([]);
    const [quantities, setQuantities] = useState<Record<number, string>>({});
    const [returnDate, setReturnDate] = useState(new Date().toISOString().slice(0, 10));
    const [reason, setReason] = useState('');
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!pickerOpen) return;
        const controller = new AbortController();
        const timeout = setTimeout(async () => {
            try {
                const response = await fetch(`/returns/lookup/invoices?q=${encodeURIComponent(query)}`, {
                    signal: controller.signal,
                    headers: { Accept: 'application/json' },
                });
                if (response.ok) setHits(await response.json());
            } catch {
                /* aborted */
            }
        }, 250);
        return () => {
            clearTimeout(timeout);
            controller.abort();
        };
    }, [query, pickerOpen]);

    const loadInvoice = async (hit: InvoiceHit) => {
        setPickerOpen(false);
        const response = await fetch(`/returns/lookup/invoices/${hit.id}/returnable`, { headers: { Accept: 'application/json' } });
        if (!response.ok) return;
        const data = await response.json();
        setInvoice(data.invoice);
        setLines(data.lines);
        setQuantities({});
    };

    const totalRefund = useMemo(
        () => lines.reduce((sum, line) => sum + toNumber(quantities[line.sales_invoice_item_id]) * line.unit_refund, 0),
        [lines, quantities],
    );

    const submit = () => {
        if (!invoice || saving) return;
        if (!returnDate) {
            toast.error('Enter a return date.');
            return;
        }
        if (hasOverReturn) {
            toast.error('One or more return quantities exceed the returnable amount.');
            return;
        }
        const payload = {
            sales_invoice_id: invoice.id,
            return_date: returnDate,
            reason: reason || null,
            lines: lines
                .filter((line) => toNumber(quantities[line.sales_invoice_item_id]) > 0)
                .map((line) => ({
                    sales_invoice_item_id: line.sales_invoice_item_id,
                    quantity: toNumber(quantities[line.sales_invoice_item_id]),
                })),
        };
        if (payload.lines.length === 0) {
            toast.error('Enter a return quantity on at least one line.');
            return;
        }
        if (!confirm(`Post this return for ${money(totalRefund)}? Stock and the customer ledger update immediately.`)) return;
        setSaving(true);
        router.post(route('returns.sales.store'), payload, {
            onError: () => toast.error(ALERT_FIX),
            onFinish: () => setSaving(false),
        });
    };

    const hasOverReturn = lines.some(
        (line) => toNumber(quantities[line.sales_invoice_item_id]) > line.returnable + 1e-9,
    );

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="New Sales Return" />
            <div className="flex h-full flex-col gap-4 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                        <h1 className="text-xl font-semibold">New Sales Return</h1>
                        <p className="text-sm text-muted-foreground">
                            {invoice
                                ? <>Against <span className="font-medium">{invoice.invoice_number}</span> — {invoice.customer} ({shortDate(invoice.invoice_date)})</>
                                : 'Pick a posted invoice to return against'}
                        </p>
                    </div>
                    <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => setPickerOpen(true)}>
                            <FileSearch className="mr-1 size-4" /> {invoice ? 'Change Invoice' : 'Find Invoice'}
                        </Button>
                        <Button size="sm" onClick={submit} disabled={!invoice || saving}>
                            <Undo2 className="mr-1 size-4" /> Post Return
                        </Button>
                    </div>
                </div>

                {invoice && (
                    <>
                        <div data-enter-nav className="grid grid-cols-2 gap-3 rounded-xl border p-4 md:grid-cols-4">
                            <div>
                                <Label>Return Date</Label>
                                <Input type="date" value={returnDate} onChange={(e) => setReturnDate(e.target.value)} />
                            </div>
                            <div className="md:col-span-2">
                                <Label>Reason</Label>
                                <Input placeholder="e.g. damaged, near expiry, over-supplied" value={reason} onChange={(e) => setReason(e.target.value)} />
                            </div>
                            <div>
                                <Label>Warehouse</Label>
                                <Input value={warehouse.name} disabled />
                            </div>
                        </div>

                        <div className="rounded-xl border">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Product</TableHead>
                                        <TableHead className="text-right">Sold</TableHead>
                                        <TableHead className="text-right">Already Returned</TableHead>
                                        <TableHead className="text-right">Returnable</TableHead>
                                        <TableHead className="text-right">Refund / Unit</TableHead>
                                        <TableHead className="w-32 text-right">Return Qty</TableHead>
                                        <TableHead className="text-right">Refund</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {lines.map((line) => {
                                        const returnQty = toNumber(quantities[line.sales_invoice_item_id]);
                                        const over = returnQty > line.returnable + 1e-9;
                                        return (
                                            <TableRow key={line.sales_invoice_item_id}>
                                                <TableCell className="font-medium">{line.product}</TableCell>
                                                <TableCell className="text-right tabular-nums">{fmtQty(line.sold_qty)}</TableCell>
                                                <TableCell className="text-right tabular-nums">{fmtQty(line.already_returned)}</TableCell>
                                                <TableCell className="text-right tabular-nums">{fmtQty(line.returnable)}</TableCell>
                                                <TableCell className="text-right tabular-nums">{amount(line.unit_refund)}</TableCell>
                                                <TableCell>
                                                    <Input
                                                        type="number" min={0} max={line.returnable}
                                                        className={`h-8 text-right ${over ? 'border-destructive' : ''}`}
                                                        value={quantities[line.sales_invoice_item_id] ?? ''}
                                                        placeholder="0"
                                                        disabled={line.returnable <= 0}
                                                        onChange={(e) =>
                                                            setQuantities((q) => ({ ...q, [line.sales_invoice_item_id]: e.target.value }))
                                                        }
                                                    />
                                                </TableCell>
                                                <TableCell className="text-right tabular-nums">
                                                    {amount(returnQty * line.unit_refund)}
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        </div>

                        <div className="ml-auto w-72 space-y-1 rounded-xl border p-4 text-sm">
                            <div className="flex justify-between text-base font-semibold">
                                <span>Credit Note Total</span>
                                <span className="tabular-nums">{money(totalRefund)}</span>
                            </div>
                            <p className="text-xs text-muted-foreground">
                                Bonus (free) units are not refundable and stay excluded. Posting restores stock to the original batches.
                            </p>
                        </div>
                    </>
                )}
            </div>

            <CommandDialog open={pickerOpen} onOpenChange={setPickerOpen}>
                <CommandInput placeholder="Search invoice number or customer…" value={query} onValueChange={setQuery} />
                <CommandList>
                    <CommandEmpty>No posted invoices found.</CommandEmpty>
                    {hits.map((hit) => (
                        <CommandItem
                            key={hit.id}
                            value={`${hit.invoice_number} ${hit.customer} ${hit.id}`}
                            onSelect={() => void loadInvoice(hit)}
                            className="flex items-center justify-between gap-3"
                        >
                            <div>
                                <div className="font-medium">{hit.invoice_number}</div>
                                <div className="text-xs text-muted-foreground">
                                    {hit.customer}{hit.city ? ` · ${hit.city}` : ''} · {shortDate(hit.invoice_date)}
                                </div>
                            </div>
                            <span className="text-xs tabular-nums text-muted-foreground">{money(hit.total_amount)}</span>
                        </CommandItem>
                    ))}
                </CommandList>
            </CommandDialog>
        </AppLayout>
    );
}
