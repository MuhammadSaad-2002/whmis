import { BatchSelectCell } from '@/components/batch-select-cell';
import InputError from '@/components/input-error';
import { ProductSearchCell, type ProductHit } from '@/components/product-search-cell';
import { RulePickerDialog, type RuleHit } from '@/components/rule-picker-dialog';
import { SearchableSelect } from '@/components/searchable-select';
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
import { amount, dec2, money, qty as fmtQty, toNumber } from '@/lib/format';
import { ALERT_FIX, splitItemErrors } from '@/lib/form-validation';
import { computeLine, computeTotals } from '@/lib/invoice-math';
import { type BreadcrumbItem } from '@/types';
import { Head, router } from '@inertiajs/react';
import { Plus, Printer, Save, Send, Trash2, XCircle } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

interface ItemRow {
    product_id: number | null;
    product_name: string;
    batch_id: string; // selected batch id ('' = none); required before save
    batch_fallback: { id: number; batch_number: string; expiry_date: string | null } | null;
    stock: number;
    quantity: string;
    bonus_quantity: string;
    applied_rule_id: number | null;
    applied_rule_name: string;
    trade_price: string;
    discount_percent: string;
    gst_percent: string;
    remarks: string;
}

interface InvoiceDto {
    id: number;
    invoice_number: string;
    customer_id: number;
    warehouse_id: number;
    invoice_date: string;
    due_date: string | null;
    sale_type: string;
    sale_terms: string | null;
    status: string;
    discount_percent: string;
    gst_percent: string;
    notes: string | null;
    total_amount: string;
    total_profit: string;
    items: {
        product_id: number;
        product?: { id: number; name: string };
        batch_id: number | null;
        batch?: { id: number; batch_number: string; expiry_date: string | null } | null;
        quantity: string;
        bonus_quantity: string;
        applied_rule_id: number | null;
        applied_rule?: { id: number; name: string } | null;
        trade_price: string;
        discount_percent: string;
        gst_percent: string;
        remarks: string | null;
    }[];
}

interface CustomerOption { id: number; name: string; city: string | null; credit_limit: string }

interface Props {
    customers: CustomerOption[];
    warehouse: { id: number; name: string };
    invoice: InvoiceDto | null;
}

const emptyRow = (): ItemRow => ({
    product_id: null, product_name: '', batch_id: '', batch_fallback: null, stock: 0,
    quantity: '1', bonus_quantity: '0', applied_rule_id: null, applied_rule_name: '',
    trade_price: '', discount_percent: '0.00', gst_percent: '0.00', remarks: '',
});

// Editable columns in keyboard order: product, batch, qty, bonus, rule, price, disc, gst, remarks
const COL_COUNT = 9;

// Enter walks product → batch → qty → bonus → price → disc% → next row.
// Rule (F4), GST % (auto-filled), and remarks stay Tab-reachable.
const ENTER_ORDER = [0, 1, 2, 3, 5, 6];

// Fields normalized to 0.00 on blur / auto-fill.
const DECIMAL_KEYS: ReadonlySet<keyof ItemRow> = new Set([
    'trade_price', 'discount_percent', 'gst_percent',
] as (keyof ItemRow)[]);

export default function SalesForm({ customers, warehouse, invoice }: Props) {
    const { can } = usePermissions();
    const isDraft = !invoice || invoice.status === 'draft';
    const readonly = !isDraft;

    const [header, setHeader] = useState({
        invoice_number: '',
        customer_id: invoice ? String(invoice.customer_id) : '',
        invoice_date: invoice?.invoice_date?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
        due_date: invoice?.due_date?.slice(0, 10) ?? '',
        sale_type: invoice?.sale_type ?? 'credit',
        sale_terms: invoice?.sale_terms ?? '',
        discount_percent: invoice ? dec2(invoice.discount_percent) : '0.00',
        gst_percent: invoice ? dec2(invoice.gst_percent) : '0.00',
        notes: invoice?.notes ?? '',
    });

    const [rows, setRows] = useState<ItemRow[]>(() =>
        invoice && invoice.items.length > 0
            ? invoice.items.map((item) => ({
                  product_id: item.product_id,
                  product_name: item.product?.name ?? `#${item.product_id}`,
                  batch_id: item.batch_id ? String(item.batch_id) : '',
                  batch_fallback: item.batch ?? null,
                  stock: 0,
                  quantity: String(Number(item.quantity)),
                  bonus_quantity: String(Number(item.bonus_quantity)),
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
    const [headerErrors, setHeaderErrors] = useState<Record<string, string>>({});
    const [rowErrors, setRowErrors] = useState<Record<number, Record<string, string>>>({});

    // Per-cell rule used both on blur and on save. Returns a message or null.
    const cellRule = (key: keyof ItemRow, value: string): string | null => {
        if (key === 'batch_id') return !value ? 'Select a batch.' : null;
        if (key === 'quantity') return toNumber(value) < 1 ? 'Quantity must be at least 1.' : null;
        if (key === 'discount_percent') {
            const n = toNumber(value);
            return n < 0 || n > 100 ? 'Discount % must be between 0 and 100.' : null;
        }
        if (key === 'gst_percent') {
            const n = toNumber(value);
            return n < 0 || n > 100 ? 'GST % must be between 0 and 100.' : null;
        }
        if (key === 'trade_price') return toNumber(value) < 0 ? 'Price cannot be negative.' : null;
        return null;
    };

    const setRowError = (row: number, key: string, message: string | null) => {
        setRowErrors((prev) => {
            const next = { ...prev };
            const cur = { ...(next[row] ?? {}) };
            if (message) cur[key] = message;
            else delete cur[key];
            if (Object.keys(cur).length) next[row] = cur;
            else delete next[row];
            return next;
        });
    };

    // Source-row indices that survive payload()'s filter, so a server `items.N`
    // error maps back to the row on screen.
    const includedRowIndexes = () =>
        rows.map((_, i) => i).filter((i) => rows[i].product_id && toNumber(rows[i].quantity) > 0);

    const validate = (): boolean => {
        const h: Record<string, string> = {};
        const r: Record<number, Record<string, string>> = {};
        if (!header.customer_id) h.customer_id = 'Customer is required.';
        if (header.sale_type === 'sale_base' && !header.sale_terms.trim()) {
            h.sale_terms = 'Terms are required for a Sale Base invoice.';
        }
        if (!rows.some((row) => row.product_id)) {
            r[0] = { product_id: 'Add at least one product.' };
        }
        rows.forEach((row, i) => {
            if (!row.product_id) return;
            const rowErr: Record<string, string> = {};
            (['batch_id', 'quantity', 'discount_percent', 'gst_percent', 'trade_price'] as (keyof ItemRow)[]).forEach((key) => {
                const message = cellRule(key, row[key] as string);
                if (message) rowErr[key] = message;
            });
            if (Object.keys(rowErr).length) r[i] = { ...(r[i] ?? {}), ...rowErr };
        });
        setHeaderErrors(h);
        setRowErrors(r);
        return Object.keys(h).length === 0 && Object.keys(r).length === 0;
    };

    const handleServerErrors = (errors: Record<string, string>) => {
        const { header: h, rows: serverRows } = splitItemErrors(errors);
        const map = includedRowIndexes();
        const remapped: Record<number, Record<string, string>> = {};
        for (const [idx, errs] of Object.entries(serverRows)) {
            const src = map[Number(idx)] ?? Number(idx);
            remapped[src] = { ...(remapped[src] ?? {}), ...errs };
        }
        setHeaderErrors(h);
        setRowErrors(remapped);
        toast.error(ALERT_FIX);
    };

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
        () => computeTotals(computed.filter((_, i) => rows[i].product_id), header),
        [computed, rows, header],
    );

    const grid = useKeyboardGrid({
        rowCount: rows.length,
        colCount: COL_COUNT,
        enterOrder: ENTER_ORDER,
        onAppendRow: () => setRows((r) => [...r, emptyRow()]),
        onDeleteRow: (row) => setRows((r) => (r.length === 1 ? [emptyRow()] : r.filter((_, i) => i !== row))),
        onInsertRow: (row) => setRows((r) => { const c = [...r]; c.splice(row + 1, 0, emptyRow()); return c; }),
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
                          batch_id: '',
                          batch_fallback: null,
                          stock: product.stock,
                          applied_rule_id: null,
                          applied_rule_name: '',
                          trade_price: dec2(product.trade_price),
                          gst_percent: dec2(product.tax_percent ?? 0),
                          discount_percent: dec2(product.default_discount_percent ?? 0),
                      }
                    : row,
            ),
        );
        setRowError(rowIndex, 'product_id', null);
        grid.focusCell(rowIndex, 1); // jump to batch
    };

    const removeRow = (index: number) => {
        setRows((r) => (r.length === 1 ? [emptyRow()] : r.filter((_, i) => i !== index)));
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
                    bonus_quantity: rule.effect.bonus_qty !== undefined ? String(rule.effect.bonus_qty) : row.bonus_quantity,
                    discount_percent: rule.effect.discount_percent !== undefined ? dec2(rule.effect.discount_percent) : row.discount_percent,
                    trade_price: rule.effect.trade_price !== undefined ? dec2(rule.effect.trade_price) : row.trade_price,
                };
            }),
        );
    };

    const payload = () => ({
        ...header,
        invoice_number: header.invoice_number || null,
        customer_id: header.customer_id || null,
        due_date: header.due_date || null,
        // Terms only apply to Sale Base; cleared otherwise.
        sale_terms: header.sale_type === 'sale_base' ? header.sale_terms.trim() || null : null,
        warehouse_id: warehouse.id,
        items: rows
            .filter((row) => row.product_id && toNumber(row.quantity) > 0)
            .map((row) => ({
                product_id: row.product_id,
                batch_id: row.batch_id ? Number(row.batch_id) : null,
                quantity: toNumber(row.quantity),
                bonus_quantity: toNumber(row.bonus_quantity),
                applied_rule_id: row.applied_rule_id,
                trade_price: toNumber(row.trade_price),
                discount_percent: toNumber(row.discount_percent),
                gst_percent: toNumber(row.gst_percent),
                remarks: row.remarks || null,
            })),
    });

    const save = () => {
        if (readonly || saving) return;
        if (!validate()) {
            toast.error(ALERT_FIX);
            return;
        }
        setSaving(true);
        const options = { preserveScroll: true, onError: handleServerErrors, onFinish: () => setSaving(false) };
        if (invoice) router.put(route('sales.update', invoice.id), payload(), options);
        else router.post(route('sales.store'), payload(), options);
    };

    const post = () => {
        if (!invoice || readonly || saving) return;
        if (!validate()) {
            toast.error(ALERT_FIX);
            return;
        }
        if (!confirm(`Post ${invoice.invoice_number}? Stock will be dispatched (FIFO) and the customer ledger charged.`)) return;
        setSaving(true);
        router.put(route('sales.update', invoice.id), payload(), {
            preserveScroll: true,
            onSuccess: () => router.post(route('sales.post', invoice.id), {}, { onError: handleServerErrors, onFinish: () => setSaving(false) }),
            onError: (errors) => { handleServerErrors(errors); setSaving(false); },
        });
    };

    const hotkeys = useInvoiceHotkeys({ onSave: save, onPost: post });
    useEffect(() => {
        const listener = (e: KeyboardEvent) => hotkeys.handleKeyDown(e);
        window.addEventListener('keydown', listener);
        return () => window.removeEventListener('keydown', listener);
    }, [hotkeys]);

    const breadcrumbs: BreadcrumbItem[] = [
        { title: 'Sales', href: '/sales' },
        { title: invoice ? invoice.invoice_number : 'New Sales Invoice', href: '#' },
    ];

    const selectedCustomer = customers.find((c) => String(c.id) === header.customer_id);

    const cellInput = (rowIndex: number, colIndex: number, key: keyof ItemRow, type = 'text', className = '') => {
        const isQty = key === 'quantity';
        const onBlur = (e: React.FocusEvent<HTMLInputElement>) => {
            let value = e.target.value;
            if (isQty) value = String(Math.max(1, toNumber(value)));
            else if (DECIMAL_KEYS.has(key)) value = dec2(value);
            if (isQty || DECIMAL_KEYS.has(key)) setCell(rowIndex, key, value);
            // Only real product lines are validated; the trailing blank row isn't.
            if (rows[rowIndex].product_id) setRowError(rowIndex, key, cellRule(key, value));
        };
        const cellError = rowErrors[rowIndex]?.[key];
        return (
            <Input
                ref={grid.registerCell(rowIndex, colIndex) as never}
                type={type}
                min={isQty ? 1 : undefined}
                value={rows[rowIndex][key] as string}
                disabled={readonly}
                title={cellError}
                aria-invalid={!!cellError}
                onChange={(e) => {
                    setCell(rowIndex, key, e.target.value);
                    if (cellError) setRowError(rowIndex, key, null);
                }}
                onBlur={onBlur}
                onKeyDown={(e) => grid.handleKeyDown(e, rowIndex, colIndex)}
                className={`h-8 rounded-none border-0 px-2 text-sm focus-visible:ring-1 ${cellError ? 'bg-destructive/10 ring-1 ring-destructive' : ''} ${className}`}
            />
        );
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={invoice ? invoice.invoice_number : 'New Sale'} />
            <div className="flex h-full flex-col gap-4 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-3">
                        <h1 className="text-3xl font-bold">
                            {invoice ? `Sale ${invoice.invoice_number}` : 'New Sales Invoice'}
                        </h1>
                        {invoice && (
                            <Badge variant={invoice.status === 'posted' ? 'default' : invoice.status === 'cancelled' ? 'destructive' : 'secondary'}>
                                {invoice.status}
                            </Badge>
                        )}
                        {invoice?.status === 'posted' && (
                            <span className="text-sm text-muted-foreground">
                                Profit: <span className="font-medium tabular-nums">{money(invoice.total_profit)}</span>
                            </span>
                        )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {invoice && (
                            <>
                                <Button variant="outline" size="sm" asChild>
                                    <a href={route('sales.print', invoice.id)} target="_blank" rel="noreferrer">
                                        <Printer className="mr-1 size-4" /> Print
                                    </a>
                                </Button>
                                {invoice.status === 'posted' && can('sales.cancel') && (
                                    <Button
                                        variant="outline" size="sm"
                                        onClick={() => {
                                            if (confirm('Cancel this posted invoice? Stock returns and the ledger is reversed.')) {
                                                router.post(route('sales.cancel', invoice.id));
                                            }
                                        }}
                                    >
                                        <XCircle className="mr-1 size-4 text-destructive" /> Cancel Invoice
                                    </Button>
                                )}
                            </>
                        )}
                        {isDraft && (
                            <>
                                <Button variant="outline" size="sm" onClick={save} disabled={saving}>
                                    <Save className="mr-1 size-4" /> Save Draft <kbd className="ml-1 text-xs opacity-60">F8</kbd>
                                </Button>
                                {invoice && can('sales.post') && (
                                    <Button size="sm" onClick={post} disabled={saving}>
                                        <Send className="mr-1 size-4" /> Post <kbd className="ml-1 text-xs opacity-60">F9</kbd>
                                    </Button>
                                )}
                            </>
                        )}
                    </div>
                </div>

                <div data-enter-nav className="grid grid-cols-2 gap-3 rounded-xl border p-4 md:grid-cols-4">
                    <div>
                        <Label>Customer *</Label>
                        <SearchableSelect
                            value={header.customer_id}
                            onValueChange={(v) => {
                                setHeader((h) => ({ ...h, customer_id: v }));
                                setHeaderErrors((e) => { const n = { ...e }; delete n.customer_id; return n; });
                            }}
                            disabled={readonly}
                            autoFocus={!readonly}
                            placeholder="Select customer"
                            searchPlaceholder="Search customer…"
                            emptyText="No customers found."
                            options={customers.map((customer) => ({
                                value: String(customer.id),
                                label: customer.name + (customer.city ? ` — ${customer.city}` : ''),
                            }))}
                        />
                        <InputError message={headerErrors.customer_id} className="mt-1 text-xs" />
                        {selectedCustomer && Number(selectedCustomer.credit_limit) > 0 && (
                            <p className="mt-1 text-xs text-muted-foreground">
                                Credit limit: {money(selectedCustomer.credit_limit)}
                            </p>
                        )}
                    </div>
                    <div>
                        <Label>Invoice # {invoice ? '' : '(blank = auto)'}</Label>
                        <Input
                            value={invoice ? invoice.invoice_number : header.invoice_number}
                            disabled={!!invoice || readonly}
                            placeholder="Auto-generated"
                            onChange={(e) => setHeader((h) => ({ ...h, invoice_number: e.target.value }))}
                        />
                    </div>
                    <div>
                        <Label>Invoice Date *</Label>
                        <Input
                            type="date" value={header.invoice_date} disabled={readonly}
                            onChange={(e) => setHeader((h) => ({ ...h, invoice_date: e.target.value }))}
                        />
                    </div>
                    <div>
                        <Label>Due Date</Label>
                        <Input
                            type="date" value={header.due_date} disabled={readonly}
                            onChange={(e) => setHeader((h) => ({ ...h, due_date: e.target.value }))}
                        />
                    </div>
                    <div>
                        <Label>Sale Type</Label>
                        <Select
                            value={header.sale_type}
                            onValueChange={(v) => setHeader((h) => ({ ...h, sale_type: v }))}
                            disabled={readonly}
                        >
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="credit">Credit</SelectItem>
                                <SelectItem value="cash">Cash</SelectItem>
                                <SelectItem value="sale_base">Sale Base</SelectItem>
                                {/* Keep converted/legacy types displayable when editing an existing invoice. */}
                                {header.sale_type === 'booking' && <SelectItem value="booking">Booking</SelectItem>}
                                {header.sale_type === 'direct' && <SelectItem value="direct">Direct</SelectItem>}
                            </SelectContent>
                        </Select>
                    </div>
                    <div>
                        <Label>Warehouse</Label>
                        <Input value={warehouse.name} disabled />
                    </div>
                    <div>
                        <Label>Invoice Discount %</Label>
                        <Input
                            type="number" min={0} max={100} step="0.01" value={header.discount_percent} disabled={readonly}
                            onChange={(e) => setHeader((h) => ({ ...h, discount_percent: e.target.value }))}
                            onBlur={(e) => setHeader((h) => ({ ...h, discount_percent: dec2(e.target.value) || '0.00' }))}
                        />
                    </div>
                    <div>
                        <Label>Invoice GST %</Label>
                        <Input
                            type="number" min={0} max={100} step="0.01" value={header.gst_percent} disabled={readonly}
                            onChange={(e) => setHeader((h) => ({ ...h, gst_percent: e.target.value }))}
                            onBlur={(e) => setHeader((h) => ({ ...h, gst_percent: dec2(e.target.value) || '0.00' }))}
                            onKeyDown={(e) => {
                                // Last header field: Enter drops into the grid's product cell.
                                if (e.key === 'Enter' && !readonly) {
                                    e.preventDefault();
                                    grid.focusCell(0, 0);
                                }
                            }}
                        />
                    </div>
                    {header.sale_type === 'sale_base' && (
                        <div className="col-span-2 md:col-span-4">
                            <Label>Terms *</Label>
                            <Textarea
                                rows={2}
                                value={header.sale_terms}
                                disabled={readonly}
                                aria-invalid={!!headerErrors.sale_terms}
                                className={headerErrors.sale_terms ? 'border-destructive ring-1 ring-destructive' : ''}
                                placeholder="Payment / return terms for this Sale Base invoice — printed on the invoice"
                                onChange={(e) => {
                                    setHeader((h) => ({ ...h, sale_terms: e.target.value }));
                                    setHeaderErrors((er) => { const n = { ...er }; delete n.sale_terms; return n; });
                                }}
                            />
                            <InputError message={headerErrors.sale_terms} className="mt-1 text-xs" />
                        </div>
                    )}
                </div>

                <div className="rounded-xl border">
                    <div className="max-h-[55dvh] overflow-auto">
                    <table className="w-full min-w-[1250px] text-sm">
                        <thead className="sticky top-0 z-10 bg-muted text-xs uppercase">
                            <tr className="[&>th]:border-b [&>th]:px-2 [&>th]:py-2 [&>th]:text-left">
                                <th className="w-8">#</th>
                                <th className="min-w-56">Product <kbd className="opacity-50">F2</kbd></th>
                                <th className="w-40">Batch</th>
                                <th className="w-24 text-right">Stock</th>
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
                            {rows.map((row, rowIndex) => {
                                const requested = toNumber(row.quantity) + toNumber(row.bonus_quantity);
                                const short = row.product_id && row.stock > 0 && requested > row.stock;
                                return (
                                    <tr key={rowIndex} className="border-b last:border-0 [&>td]:border-r [&>td]:p-0 [&>td:last-child]:border-r-0">
                                        <td className="px-2 text-center text-muted-foreground">{rowIndex + 1}</td>
                                        <td
                                            className={rowErrors[rowIndex]?.product_id ? 'ring-1 ring-inset ring-destructive' : ''}
                                            title={rowErrors[rowIndex]?.product_id}
                                        >
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
                                        <td
                                            className={rowErrors[rowIndex]?.batch_id ? 'ring-1 ring-inset ring-destructive' : ''}
                                            title={rowErrors[rowIndex]?.batch_id}
                                        >
                                            <BatchSelectCell
                                                productId={row.product_id}
                                                warehouseId={warehouse.id}
                                                value={row.batch_id}
                                                disabled={readonly}
                                                invalid={!!rowErrors[rowIndex]?.batch_id}
                                                fallback={row.batch_fallback}
                                                registerRef={grid.registerCell(rowIndex, 1)}
                                                onKeyDown={(e) => grid.handleKeyDown(e, rowIndex, 1)}
                                                onSelect={(id, qtyAvailable) => {
                                                    setCell(rowIndex, 'batch_id', id);
                                                    setRowError(rowIndex, 'batch_id', null);
                                                    setRows((r) => r.map((row, i) => (i === rowIndex ? { ...row, stock: qtyAvailable } : row)));
                                                }}
                                            />
                                        </td>
                                        <td className={`px-2 text-right tabular-nums ${short ? 'font-semibold text-destructive' : ''}`}>
                                            {row.product_id ? fmtQty(row.stock) : ''}
                                        </td>
                                        <td>{cellInput(rowIndex, 2, 'quantity', 'number', 'text-right')}</td>
                                        <td>{cellInput(rowIndex, 3, 'bonus_quantity', 'number', 'text-right')}</td>
                                        <td>
                                            <button
                                                type="button"
                                                ref={grid.registerCell(rowIndex, 4) as never}
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
                                                    grid.handleKeyDown(e, rowIndex, 4);
                                                }}
                                                className="h-8 w-full truncate px-2 text-left text-sm outline-none focus:ring-1 focus:ring-ring disabled:opacity-70"
                                            >
                                                {row.applied_rule_name
                                                    ? <Badge variant="outline" className="max-w-full truncate">{row.applied_rule_name}</Badge>
                                                    : <span className="text-muted-foreground">F4…</span>}
                                            </button>
                                        </td>
                                        <td>{cellInput(rowIndex, 5, 'trade_price', 'number', 'text-right')}</td>
                                        <td>{cellInput(rowIndex, 6, 'discount_percent', 'number', 'text-right')}</td>
                                        <td>{cellInput(rowIndex, 7, 'gst_percent', 'number', 'text-right')}</td>
                                        <td className="px-2 text-right tabular-nums">{amount(computed[rowIndex].net_amount)}</td>
                                        <td>{cellInput(rowIndex, 8, 'remarks')}</td>
                                        <td className="px-1 text-center">
                                            {!readonly && (
                                                <button type="button" tabIndex={-1} onClick={() => removeRow(rowIndex)}>
                                                    <Trash2 className="size-4 text-muted-foreground hover:text-destructive" />
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                    </div>
                    {!readonly && (
                        <div className="border-t p-2">
                            <Button variant="ghost" size="sm" onClick={() => setRows((r) => [...r, emptyRow()])}>
                                <Plus className="mr-1 size-4" /> Add Row
                            </Button>
                        </div>
                    )}
                </div>

                <div className="sticky bottom-0 z-10 flex flex-wrap items-start justify-between gap-4 bg-background pt-2">
                    <div className="w-full max-w-md">
                        <Label>Notes</Label>
                        <Textarea
                            rows={2} value={header.notes} disabled={readonly}
                            onChange={(e) => setHeader((h) => ({ ...h, notes: e.target.value }))}
                        />
                        <p className="mt-2 text-xs text-muted-foreground">
                            Keys: Enter next field · ↑↓ rows · F2 product search · F4 incentive rule · Ctrl+D delete row · Ctrl+I add row · F8 save · F9 post
                        </p>
                    </div>
                    <div className="ml-auto w-72 space-y-1 rounded-xl border p-4 text-sm">
                        <div className="flex justify-between"><span>Subtotal</span><span className="tabular-nums">{amount(totals.subtotal)}</span></div>
                        <div className="flex justify-between text-muted-foreground">
                            <span>Item Discounts</span><span className="tabular-nums">−{amount(totals.item_discount_total)}</span>
                        </div>
                        <div className="flex justify-between text-muted-foreground">
                            <span>Item GST</span><span className="tabular-nums">+{amount(totals.item_gst_total)}</span>
                        </div>
                        {totals.discount_amount > 0 && (
                            <div className="flex justify-between text-muted-foreground">
                                <span>Invoice Discount</span><span className="tabular-nums">−{amount(totals.discount_amount)}</span>
                            </div>
                        )}
                        {totals.gst_amount > 0 && (
                            <div className="flex justify-between text-muted-foreground">
                                <span>Invoice GST</span><span className="tabular-nums">+{amount(totals.gst_amount)}</span>
                            </div>
                        )}
                        <div className="flex justify-between border-t pt-1 text-base font-semibold">
                            <span>Total</span><span className="tabular-nums">{money(totals.total_amount)}</span>
                        </div>
                    </div>
                </div>
            </div>

            <RulePickerDialog
                open={ruleOpen}
                onOpenChange={setRuleOpen}
                productId={rows[activeRow]?.product_id ?? null}
                customerId={header.customer_id ? Number(header.customer_id) : null}
                qty={toNumber(rows[activeRow]?.quantity)}
                price={toNumber(rows[activeRow]?.trade_price)}
                appliedRuleId={rows[activeRow]?.applied_rule_id ?? null}
                onApply={(rule) => applyRule(activeRow, rule)}
            />
        </AppLayout>
    );
}
