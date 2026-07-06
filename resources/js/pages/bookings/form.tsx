import { ProductSearchCell, type ProductHit } from '@/components/product-search-cell';
import { RulePickerDialog, type RuleHit } from '@/components/rule-picker-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useInvoiceHotkeys, useKeyboardGrid } from '@/hooks/use-keyboard-grid';
import { usePermissions } from '@/hooks/use-permissions';
import AppLayout from '@/layouts/app-layout';
import { amount, dec2, money, toNumber } from '@/lib/format';
import { computeLine, computeTotals } from '@/lib/invoice-math';
import { type BreadcrumbItem } from '@/types';
import { Head, Link, router } from '@inertiajs/react';
import { ArrowRight, Check, Plus, Save, Send, Trash2, X, XCircle } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

interface ItemRow {
    product_id: number | null;
    product_name: string;
    quantity: string;
    requested_bonus: string;
    applied_rule_id: number | null;
    applied_rule_name: string;
    trade_price: string;
    discount_percent: string;
    gst_percent: string;
    remarks: string;
}

interface BookingDto {
    id: number;
    booking_number: string;
    customer_id: number;
    warehouse_id: number;
    booking_date: string;
    status: string;
    notes: string | null;
    total_amount: string;
    sales_invoice_id: number | null;
    booker?: { id: number; name: string };
    approver?: { id: number; name: string } | null;
    items: {
        product_id: number;
        product?: { id: number; name: string };
        quantity: string;
        requested_bonus: string;
        applied_rule_id: number | null;
        applied_rule?: { id: number; name: string } | null;
        trade_price: string;
        discount_percent: string;
        gst_percent: string;
        remarks: string | null;
    }[];
}

interface Props {
    customers: { id: number; name: string; city: string | null }[];
    warehouse: { id: number; name: string };
    booking: BookingDto | null;
}

const emptyRow = (): ItemRow => ({
    product_id: null, product_name: '', quantity: '', requested_bonus: '0',
    applied_rule_id: null, applied_rule_name: '', trade_price: '',
    discount_percent: '0.00', gst_percent: '0.00', remarks: '',
});

// Keyboard columns: 0 product, 1 qty, 2 bonus, 3 rule, 4 price, 5 disc, 6 gst, 7 remarks
const COL_COUNT = 8;

// Enter walks product → qty → bonus → price → disc% → next row.
// Rule (F4), GST %, and remarks stay Tab-reachable.
const ENTER_ORDER = [0, 1, 2, 4, 5];

const statusVariant = (status: string) =>
    status === 'approved' || status === 'converted' ? 'default'
        : status === 'rejected' || status === 'cancelled' ? 'destructive' : 'secondary';

export default function BookingForm({ customers, warehouse, booking }: Props) {
    const { can } = usePermissions();
    const isDraft = !booking || booking.status === 'draft';
    const readonly = !isDraft;

    const [header, setHeader] = useState({
        customer_id: booking ? String(booking.customer_id) : '',
        booking_date: booking?.booking_date?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
        notes: booking?.notes ?? '',
    });

    const [rows, setRows] = useState<ItemRow[]>(() =>
        booking && booking.items.length > 0
            ? booking.items.map((item) => ({
                  product_id: item.product_id,
                  product_name: item.product?.name ?? `#${item.product_id}`,
                  quantity: String(Number(item.quantity)),
                  requested_bonus: String(Number(item.requested_bonus)),
                  applied_rule_id: item.applied_rule_id,
                  applied_rule_name: item.applied_rule?.name ?? '',
                  trade_price: dec2(item.trade_price),
                  discount_percent: dec2(item.discount_percent),
                  gst_percent: dec2(item.gst_percent),
                  remarks: item.remarks ?? '',
              }))
            : [emptyRow()],
    );

    const [ruleOpen, setRuleOpen] = useState(false);
    const [activeRow, setActiveRow] = useState(0); // rule picker context
    const [searchSignal, setSearchSignal] = useState({ row: -1, n: 0 });
    const [saving, setSaving] = useState(false);

    const computed = useMemo(
        () =>
            rows.map((row) =>
                computeLine(
                    {
                        quantity: row.quantity,
                        rate: row.trade_price,
                        discount_percent: row.discount_percent,
                        gst_percent: row.gst_percent,
                    },
                    false,
                ),
            ),
        [rows],
    );

    const totals = useMemo(
        () => computeTotals(computed.filter((_, i) => rows[i].product_id), {}),
        [computed, rows],
    );

    const grid = useKeyboardGrid({
        rowCount: rows.length,
        colCount: COL_COUNT,
        enterOrder: ENTER_ORDER,
        onAppendRow: () => setRows((r) => [...r, emptyRow()]),
        onProductSearch: (row) => setSearchSignal((s) => ({ row, n: s.n + 1 })),
        onRulePicker: (row) => {
            if (!rows[row]?.product_id) return;
            setActiveRow(row);
            setRuleOpen(true);
        },
    });

    const setCell = (rowIndex: number, key: keyof ItemRow, value: string) => {
        setRows((r) => r.map((row, i) => (i === rowIndex ? { ...row, [key]: value } : row)));
    };

    const applyProduct = (rowIndex: number, product: ProductHit) => {
        const dup = rows.findIndex((r, i) => i !== rowIndex && r.product_id === product.id);
        if (dup !== -1) {
            toast.error(`${product.name} is already on line ${dup + 1} — change the quantity there instead.`);
            return;
        }
        setRows((r) =>
            r.map((row, i) =>
                i === rowIndex
                    ? {
                          ...row,
                          product_id: product.id,
                          product_name: product.name,
                          applied_rule_id: null,
                          applied_rule_name: '',
                          trade_price: dec2(product.trade_price),
                          gst_percent: dec2(product.tax_percent ?? 0),
                          discount_percent: dec2(product.default_discount_percent ?? 0),
                      }
                    : row,
            ),
        );
        grid.focusCell(rowIndex, 1);
    };

    const applyRule = (rowIndex: number, rule: RuleHit | null) => {
        setRows((r) =>
            r.map((row, i) => {
                if (i !== rowIndex) return row;
                if (!rule) {
                    return { ...row, applied_rule_id: null, applied_rule_name: '' };
                }
                return {
                    ...row,
                    applied_rule_id: rule.id,
                    applied_rule_name: rule.name,
                    requested_bonus: rule.effect.bonus_qty !== undefined ? String(rule.effect.bonus_qty) : row.requested_bonus,
                    discount_percent: rule.effect.discount_percent !== undefined ? dec2(rule.effect.discount_percent) : row.discount_percent,
                    trade_price: rule.effect.trade_price !== undefined ? dec2(rule.effect.trade_price) : row.trade_price,
                };
            }),
        );
    };

    const removeRow = (index: number) => {
        setRows((r) => (r.length === 1 ? [emptyRow()] : r.filter((_, i) => i !== index)));
    };

    const payload = () => ({
        ...header,
        customer_id: header.customer_id || null,
        warehouse_id: warehouse.id,
        items: rows
            .filter((row) => row.product_id && toNumber(row.quantity) > 0)
            .map((row) => ({
                product_id: row.product_id,
                quantity: toNumber(row.quantity),
                requested_bonus: toNumber(row.requested_bonus),
                applied_rule_id: row.applied_rule_id,
                trade_price: toNumber(row.trade_price),
                discount_percent: toNumber(row.discount_percent),
                gst_percent: toNumber(row.gst_percent),
                remarks: row.remarks || null,
            })),
    });

    const save = () => {
        if (readonly || saving) return;
        setSaving(true);
        const options = { preserveScroll: true, onFinish: () => setSaving(false) };
        if (booking) router.put(route('bookings.update', booking.id), payload(), options);
        else router.post(route('bookings.store'), payload(), options);
    };

    const submit = () => {
        if (!booking || readonly || saving) return;
        setSaving(true);
        router.put(route('bookings.update', booking.id), payload(), {
            preserveScroll: true,
            onSuccess: () => router.post(route('bookings.submit', booking.id), {}, { onFinish: () => setSaving(false) }),
            onError: () => setSaving(false),
        });
    };

    const hotkeys = useInvoiceHotkeys({ onSave: save, onPost: submit });
    useEffect(() => {
        const listener = (e: KeyboardEvent) => hotkeys.handleKeyDown(e);
        window.addEventListener('keydown', listener);
        return () => window.removeEventListener('keydown', listener);
    }, [hotkeys]);

    const breadcrumbs: BreadcrumbItem[] = [
        { title: 'Bookings', href: '/bookings' },
        { title: booking ? booking.booking_number : 'New Booking', href: '#' },
    ];

    const activeRowData = rows[activeRow];

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={booking ? booking.booking_number : 'New Booking'} />
            <div className="flex h-full flex-col gap-4 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-3">
                        <h1 className="text-xl font-semibold">
                            {booking ? `Booking ${booking.booking_number}` : 'New Booking'}
                        </h1>
                        {booking && <Badge variant={statusVariant(booking.status)}>{booking.status}</Badge>}
                        {booking?.booker && <span className="text-sm text-muted-foreground">by {booking.booker.name}</span>}
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {booking?.status === 'converted' && booking.sales_invoice_id && (
                            <Button variant="outline" size="sm" asChild>
                                <Link href={route('sales.edit', booking.sales_invoice_id)}>
                                    <ArrowRight className="mr-1 size-4" /> View Invoice
                                </Link>
                            </Button>
                        )}
                        {booking?.status === 'pending' && can('bookings.approve') && (
                            <>
                                <Button size="sm" onClick={() => router.post(route('bookings.approve', booking.id))}>
                                    <Check className="mr-1 size-4" /> Approve
                                </Button>
                                <Button
                                    variant="outline" size="sm"
                                    onClick={() => {
                                        if (confirm('Reject this booking?')) router.post(route('bookings.reject', booking.id));
                                    }}
                                >
                                    <X className="mr-1 size-4 text-destructive" /> Reject
                                </Button>
                            </>
                        )}
                        {booking?.status === 'approved' && can('bookings.convert') && (
                            <Button size="sm" onClick={() => router.post(route('bookings.convert', booking.id))}>
                                <ArrowRight className="mr-1 size-4" /> Convert to Sale
                            </Button>
                        )}
                        {booking && !['converted', 'cancelled'].includes(booking.status) && (
                            <Button
                                variant="outline" size="sm"
                                onClick={() => {
                                    if (confirm('Cancel this booking?')) router.post(route('bookings.cancel', booking.id));
                                }}
                            >
                                <XCircle className="mr-1 size-4 text-destructive" /> Cancel
                            </Button>
                        )}
                        {isDraft && (
                            <>
                                <Button variant="outline" size="sm" onClick={save} disabled={saving}>
                                    <Save className="mr-1 size-4" /> Save Draft <kbd className="ml-1 text-xs opacity-60">F8</kbd>
                                </Button>
                                {booking && (
                                    <Button size="sm" onClick={submit} disabled={saving}>
                                        <Send className="mr-1 size-4" /> Submit <kbd className="ml-1 text-xs opacity-60">F9</kbd>
                                    </Button>
                                )}
                            </>
                        )}
                    </div>
                </div>

                <div data-enter-nav className="grid grid-cols-2 gap-3 rounded-xl border p-4 md:grid-cols-4">
                    <div>
                        <Label>Pharmacy *</Label>
                        <Select
                            value={header.customer_id}
                            onValueChange={(v) => setHeader((h) => ({ ...h, customer_id: v }))}
                            disabled={readonly}
                        >
                            <SelectTrigger><SelectValue placeholder="Select pharmacy" /></SelectTrigger>
                            <SelectContent>
                                {customers.map((customer) => (
                                    <SelectItem key={customer.id} value={String(customer.id)}>
                                        {customer.name}{customer.city ? ` — ${customer.city}` : ''}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div>
                        <Label>Booking Date *</Label>
                        <Input
                            type="date" value={header.booking_date} disabled={readonly}
                            onChange={(e) => setHeader((h) => ({ ...h, booking_date: e.target.value }))}
                            onKeyDown={(e) => {
                                // Last editable header field: Enter drops into the grid.
                                if (e.key === 'Enter' && !readonly) {
                                    e.preventDefault();
                                    grid.focusCell(0, 0);
                                }
                            }}
                        />
                    </div>
                    <div>
                        <Label>Warehouse</Label>
                        <Input value={warehouse.name} disabled />
                    </div>
                    {booking?.approver && (
                        <div>
                            <Label>{booking.status === 'rejected' ? 'Rejected by' : 'Approved by'}</Label>
                            <Input value={booking.approver.name} disabled />
                        </div>
                    )}
                </div>

                <div className="overflow-x-auto rounded-xl border">
                    <table className="w-full min-w-[1050px] text-sm">
                        <thead className="bg-muted/50 text-xs uppercase">
                            <tr className="[&>th]:border-b [&>th]:px-2 [&>th]:py-2 [&>th]:text-left">
                                <th className="w-8">#</th>
                                <th className="min-w-56">Product <kbd className="opacity-50">F2</kbd></th>
                                <th className="w-20 text-right">Qty</th>
                                <th className="w-20 text-right">Bonus</th>
                                <th className="w-36">Rule <kbd className="opacity-50">F4</kbd></th>
                                <th className="w-24 text-right">Price</th>
                                <th className="w-20 text-right">Disc %</th>
                                <th className="w-20 text-right">GST %</th>
                                <th className="w-28 text-right">Net</th>
                                <th className="w-28">Remarks</th>
                                <th className="w-10" />
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((row, rowIndex) => (
                                <tr key={rowIndex} className="border-b last:border-0 [&>td]:border-r [&>td]:p-0 [&>td:last-child]:border-r-0">
                                    <td className="px-2 text-center text-muted-foreground">{rowIndex + 1}</td>
                                    <td>
                                        <ProductSearchCell
                                            value={row.product_name}
                                            warehouseId={warehouse.id}
                                            disabled={readonly}
                                            openSignal={searchSignal.row === rowIndex ? searchSignal.n : 0}
                                            onSelect={(product) => applyProduct(rowIndex, product)}
                                            onGridKeyDown={(e) => grid.handleKeyDown(e, rowIndex, 0)}
                                            inputRef={grid.registerCell(rowIndex, 0)}
                                        />
                                    </td>
                                    <td>
                                        <Input
                                            ref={grid.registerCell(rowIndex, 1) as never}
                                            type="number" value={row.quantity} disabled={readonly}
                                            onChange={(e) => setCell(rowIndex, 'quantity', e.target.value)}
                                            onKeyDown={(e) => grid.handleKeyDown(e, rowIndex, 1)}
                                            className="h-8 rounded-none border-0 px-2 text-right text-sm focus-visible:ring-1"
                                        />
                                    </td>
                                    <td>
                                        <Input
                                            ref={grid.registerCell(rowIndex, 2) as never}
                                            type="number" value={row.requested_bonus} disabled={readonly}
                                            onChange={(e) => setCell(rowIndex, 'requested_bonus', e.target.value)}
                                            onKeyDown={(e) => grid.handleKeyDown(e, rowIndex, 2)}
                                            className="h-8 rounded-none border-0 px-2 text-right text-sm focus-visible:ring-1"
                                        />
                                    </td>
                                    <td>
                                        <button
                                            type="button"
                                            ref={grid.registerCell(rowIndex, 3) as never}
                                            disabled={readonly || !row.product_id}
                                            onClick={() => {
                                                setActiveRow(rowIndex);
                                                setRuleOpen(true);
                                            }}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') {
                                                    e.preventDefault();
                                                    setActiveRow(rowIndex);
                                                    setRuleOpen(true);
                                                    return;
                                                }
                                                grid.handleKeyDown(e, rowIndex, 3);
                                            }}
                                            className="h-8 w-full truncate px-2 text-left text-sm outline-none focus:ring-1 focus:ring-ring disabled:opacity-70"
                                        >
                                            {row.applied_rule_name
                                                ? <Badge variant="outline" className="max-w-full truncate">{row.applied_rule_name}</Badge>
                                                : <span className="text-muted-foreground">F4…</span>}
                                        </button>
                                    </td>
                                    <td>
                                        <Input
                                            ref={grid.registerCell(rowIndex, 4) as never}
                                            type="number" value={row.trade_price} disabled={readonly}
                                            onChange={(e) => setCell(rowIndex, 'trade_price', e.target.value)}
                                            onBlur={(e) => setCell(rowIndex, 'trade_price', dec2(e.target.value))}
                                            onKeyDown={(e) => grid.handleKeyDown(e, rowIndex, 4)}
                                            className="h-8 rounded-none border-0 px-2 text-right text-sm focus-visible:ring-1"
                                        />
                                    </td>
                                    <td>
                                        <Input
                                            ref={grid.registerCell(rowIndex, 5) as never}
                                            type="number" value={row.discount_percent} disabled={readonly}
                                            onChange={(e) => setCell(rowIndex, 'discount_percent', e.target.value)}
                                            onBlur={(e) => setCell(rowIndex, 'discount_percent', dec2(e.target.value))}
                                            onKeyDown={(e) => grid.handleKeyDown(e, rowIndex, 5)}
                                            className="h-8 rounded-none border-0 px-2 text-right text-sm focus-visible:ring-1"
                                        />
                                    </td>
                                    <td>
                                        <Input
                                            ref={grid.registerCell(rowIndex, 6) as never}
                                            type="number" value={row.gst_percent} disabled={readonly}
                                            onChange={(e) => setCell(rowIndex, 'gst_percent', e.target.value)}
                                            onBlur={(e) => setCell(rowIndex, 'gst_percent', dec2(e.target.value))}
                                            onKeyDown={(e) => grid.handleKeyDown(e, rowIndex, 6)}
                                            className="h-8 rounded-none border-0 px-2 text-right text-sm focus-visible:ring-1"
                                        />
                                    </td>
                                    <td className="px-2 text-right tabular-nums">{amount(computed[rowIndex].net_amount)}</td>
                                    <td>
                                        <Input
                                            ref={grid.registerCell(rowIndex, 7) as never}
                                            value={row.remarks} disabled={readonly}
                                            onChange={(e) => setCell(rowIndex, 'remarks', e.target.value)}
                                            onKeyDown={(e) => grid.handleKeyDown(e, rowIndex, 7)}
                                            className="h-8 rounded-none border-0 px-2 text-sm focus-visible:ring-1"
                                        />
                                    </td>
                                    <td className="px-1 text-center">
                                        {!readonly && (
                                            <button type="button" tabIndex={-1} onClick={() => removeRow(rowIndex)}>
                                                <Trash2 className="size-4 text-muted-foreground hover:text-destructive" />
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {!readonly && (
                        <div className="border-t p-2">
                            <Button variant="ghost" size="sm" onClick={() => setRows((r) => [...r, emptyRow()])}>
                                <Plus className="mr-1 size-4" /> Add Row
                            </Button>
                        </div>
                    )}
                </div>

                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="w-full max-w-md">
                        <Label>Notes</Label>
                        <Textarea
                            rows={2} value={header.notes} disabled={readonly}
                            onChange={(e) => setHeader((h) => ({ ...h, notes: e.target.value }))}
                        />
                        <p className="mt-2 text-xs text-muted-foreground">
                            Keys: Enter next field · ↑↓ rows · F2 product · F4 rule · F8 save · F9 submit.
                            Stock is not reserved — availability is checked when the invoice is posted.
                        </p>
                    </div>
                    <div className="ml-auto w-72 space-y-1 rounded-xl border p-4 text-sm">
                        <div className="flex justify-between"><span>Subtotal</span><span className="tabular-nums">{amount(totals.subtotal)}</span></div>
                        <div className="flex justify-between text-muted-foreground">
                            <span>Discounts</span><span className="tabular-nums">−{amount(totals.item_discount_total)}</span>
                        </div>
                        <div className="flex justify-between text-muted-foreground">
                            <span>GST</span><span className="tabular-nums">+{amount(totals.item_gst_total)}</span>
                        </div>
                        <div className="flex justify-between border-t pt-1 text-base font-semibold">
                            <span>Total</span><span className="tabular-nums">{money(totals.total_amount)}</span>
                        </div>
                    </div>
                </div>
            </div>

            <RulePickerDialog
                open={ruleOpen}
                onOpenChange={setRuleOpen}
                productId={activeRowData?.product_id ?? null}
                customerId={header.customer_id ? Number(header.customer_id) : null}
                qty={toNumber(activeRowData?.quantity)}
                price={toNumber(activeRowData?.trade_price)}
                appliedRuleId={activeRowData?.applied_rule_id ?? null}
                onApply={(rule) => applyRule(activeRow, rule)}
            />
        </AppLayout>
    );
}
