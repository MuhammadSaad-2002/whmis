import { ReturnGrid, emptyReturnRow, type ReturnRow, type ReturnableLine } from '@/components/return-grid';
import { Button } from '@/components/ui/button';
import {
    CommandDialog, CommandEmpty, CommandInput, CommandItem, CommandList,
} from '@/components/ui/command';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useInvoiceHotkeys } from '@/hooks/use-keyboard-grid';
import AppLayout from '@/layouts/app-layout';
import { money, shortDate, toNumber } from '@/lib/format';
import { ALERT_FIX } from '@/lib/form-validation';
import { type BreadcrumbItem } from '@/types';
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

interface ReturnableDto {
    sales_invoice_item_id: number;
    product: string;
    company: string | null;
    batch_number: string | null;
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
    const [rows, setRows] = useState<ReturnRow[]>([emptyReturnRow()]);
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
        let data;
        try {
            const response = await fetch(`/returns/lookup/invoices/${hit.id}/returnable`, { headers: { Accept: 'application/json' } });
            if (!response.ok) throw new Error(String(response.status));
            data = await response.json();
        } catch {
            toast.error("Couldn't load this invoice's returnable items. Please try again.");
            setPickerOpen(true);
            return;
        }
        setInvoice(data.invoice);
        setLines(
            (data.lines as ReturnableDto[])
                .filter((l) => l.returnable > 0)
                .map((l) => ({
                    line_id: l.sales_invoice_item_id,
                    product: l.product,
                    company: l.company,
                    batch_number: l.batch_number,
                    returnable: l.returnable,
                    unit_amount: l.unit_refund,
                })),
        );
        setRows([emptyReturnRow()]);
    };

    const lineById = useMemo(() => new Map(lines.map((l) => [String(l.line_id), l])), [lines]);
    const totalRefund = useMemo(
        () => rows.reduce((sum, r) => sum + toNumber(r.qty) * (lineById.get(r.line_id)?.unit_amount ?? 0), 0),
        [rows, lineById],
    );

    const submit = () => {
        if (!invoice || saving) return;
        if (!returnDate) {
            toast.error('Enter a return date.');
            return;
        }
        const payloadLines = rows
            .filter((r) => r.line_id && toNumber(r.qty) > 0)
            .map((r) => ({ sales_invoice_item_id: Number(r.line_id), quantity: toNumber(r.qty) }));
        if (payloadLines.length === 0) {
            toast.error('Add a product and a return quantity on at least one line.');
            return;
        }
        const over = rows.some((r) => {
            const line = lineById.get(r.line_id);
            return line && toNumber(r.qty) > line.returnable + 1e-9;
        });
        if (over) {
            toast.error('One or more return quantities exceed the returnable amount.');
            return;
        }
        if (!confirm(`Post this return for ${money(totalRefund)}? Stock and the customer ledger update immediately.`)) return;
        setSaving(true);
        router.post(route('returns.sales.store'), {
            sales_invoice_id: invoice.id,
            return_date: returnDate,
            reason: reason || null,
            lines: payloadLines,
        }, {
            onError: () => toast.error(ALERT_FIX),
            onFinish: () => setSaving(false),
        });
    };

    const hotkeys = useInvoiceHotkeys({ onPost: submit });
    useEffect(() => {
        const listener = (e: KeyboardEvent) => hotkeys.handleKeyDown(e);
        window.addEventListener('keydown', listener);
        return () => window.removeEventListener('keydown', listener);
    }, [hotkeys]);

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="New Sales Return" />
            <div className="flex h-full flex-col gap-4 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-4">
                    <div>
                        <h1 className="text-4xl font-bold">New Sales Return</h1>
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

                        <ReturnGrid lines={lines} rows={rows} setRows={setRows} amountHeader="Refund" />

                        <div className="sticky bottom-0 z-10 mt-auto ml-auto w-80 space-y-1 rounded-xl border bg-background p-4 text-base">
                            <div className="flex justify-between text-xl font-bold">
                                <span>Credit Note Total</span>
                                <span className="tabular-nums">{money(totalRefund)}</span>
                            </div>
                            <p className="text-xs text-muted-foreground">
                                The dropdown lists only this invoice's products. Bonus (free) units are not refundable; posting restores stock to the original batches.
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
