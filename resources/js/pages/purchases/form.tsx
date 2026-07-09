import InputError from '@/components/input-error';
import { ProductSearchCell, type ProductHit } from '@/components/product-search-cell';
import { PurchaseBatchCell } from '@/components/purchase-batch-cell';
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
import { ALERT_FIX, splitItemErrors } from '@/lib/form-validation';
import { computeLine, computeTotals } from '@/lib/invoice-math';
import { type BreadcrumbItem } from '@/types';
import { Head, router } from '@inertiajs/react';
import { Copy, Plus, Printer, Save, Send, Trash2, XCircle } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

interface ItemRow {
    product_id: number | null;
    product_name: string;
    batch_id: string; // chosen existing batch to restock, '' = new batch
    batch_number: string;
    expiry_date: string;
    quantity: string;
    bonus_quantity: string;
    purchase_rate: string;
    trade_price: string;
    retail_price: string;
    discount_percent: string;
    gst_percent: string;
    remarks: string;
}

interface InvoiceDto {
    id: number;
    invoice_number: string;
    supplier_invoice_number: string | null;
    company_id: number;
    warehouse_id: number;
    invoice_date: string;
    due_date: string | null;
    purchase_type: string;
    status: string;
    discount_percent: string;
    gst_percent: string;
    notes: string | null;
    total_amount: string;
    items: {
        product_id: number;
        product?: { id: number; name: string };
        batch_id: number | null;
        batch_number: string | null;
        expiry_date: string | null;
        quantity: string;
        bonus_quantity: string;
        purchase_rate: string;
        trade_price: string;
        retail_price: string;
        discount_percent: string;
        gst_percent: string;
        remarks: string | null;
    }[];
}

interface Props {
    companies: { id: number; name: string }[];
    warehouse: { id: number; name: string };
    invoice: InvoiceDto | null;
}

const emptyRow = (): ItemRow => ({
    product_id: null, product_name: '', batch_id: '', batch_number: '', expiry_date: '',
    quantity: '1', bonus_quantity: '0', purchase_rate: '', trade_price: '',
    retail_price: '', discount_percent: '0.00', gst_percent: '0.00', remarks: '',
});

// Editable columns, in keyboard order.
const COLS = ['product', 'batch_number', 'expiry_date', 'quantity', 'bonus_quantity',
    'purchase_rate', 'trade_price', 'retail_price', 'discount_percent', 'gst_percent', 'remarks'] as const;

// Enter walks product → batch → expiry → qty → bonus → rate → trade → retail
// → disc% → next row. GST % (auto-filled) and remarks stay Tab-reachable.
const ENTER_ORDER = [0, 1, 2, 3, 4, 5, 6, 7, 8];

// Fields normalized to 0.00 on blur / auto-fill.
const DECIMAL_KEYS: ReadonlySet<keyof ItemRow> = new Set([
    'purchase_rate', 'trade_price', 'retail_price', 'discount_percent', 'gst_percent',
] as (keyof ItemRow)[]);

export default function PurchaseForm({ companies, warehouse, invoice }: Props) {
    const { can } = usePermissions();
    const isDraft = !invoice || invoice.status === 'draft';
    const readonly = !isDraft;

    const [header, setHeader] = useState({
        company_id: invoice ? String(invoice.company_id) : '',
        supplier_invoice_number: invoice?.supplier_invoice_number ?? '',
        invoice_date: invoice?.invoice_date?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
        due_date: invoice?.due_date?.slice(0, 10) ?? '',
        purchase_type: invoice?.purchase_type ?? 'credit',
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
                  batch_number: item.batch_number ?? '',
                  expiry_date: item.expiry_date?.slice(0, 10) ?? '',
                  quantity: String(Number(item.quantity)),
                  bonus_quantity: String(Number(item.bonus_quantity)),
                  purchase_rate: dec2(item.purchase_rate),
                  trade_price: dec2(item.trade_price),
                  retail_price: dec2(item.retail_price),
                  discount_percent: dec2(item.discount_percent),
                  gst_percent: dec2(item.gst_percent),
                  remarks: item.remarks ?? '',
              }))
            : [emptyRow()],
    );

    const [searchSignal, setSearchSignal] = useState({ row: -1, n: 0 });
    const [saving, setSaving] = useState(false);
    const [headerErrors, setHeaderErrors] = useState<Record<string, string>>({});
    const [rowErrors, setRowErrors] = useState<Record<number, Record<string, string>>>({});

    // Per-cell rule used both on blur and on save. Returns a message or null.
    const cellRule = (key: keyof ItemRow, value: string): string | null => {
        if (key === 'quantity') return toNumber(value) < 1 ? 'Quantity must be at least 1.' : null;
        if (key === 'discount_percent') {
            const n = toNumber(value);
            return n < 0 || n > 100 ? 'Discount % must be between 0 and 100.' : null;
        }
        if (key === 'gst_percent') {
            const n = toNumber(value);
            return n < 0 || n > 100 ? 'GST % must be between 0 and 100.' : null;
        }
        if (key === 'purchase_rate') return toNumber(value) < 0 ? 'Rate cannot be negative.' : null;
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
        if (!header.company_id) h.company_id = 'Supplier is required.';
        if (!rows.some((row) => row.product_id)) {
            r[0] = { product_id: 'Add at least one product.' };
        }
        rows.forEach((row, i) => {
            if (!row.product_id) return;
            const rowErr: Record<string, string> = {};
            if (!(row.batch_id || row.batch_number.trim())) rowErr.batch_number = 'Select or enter a batch.';
            (['quantity', 'discount_percent', 'gst_percent', 'purchase_rate'] as (keyof ItemRow)[]).forEach((key) => {
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
                        bonus_quantity: row.bonus_quantity,
                        rate: row.purchase_rate,
                        trade_price: row.trade_price,
                        discount_percent: row.discount_percent,
                        gst_percent: row.gst_percent,
                    },
                    true,
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
        colCount: COLS.length,
        enterOrder: ENTER_ORDER,
        onAppendRow: () => setRows((r) => [...r, emptyRow()]),
        onDeleteRow: (row) => setRows((r) => (r.length === 1 ? [emptyRow()] : r.filter((_, i) => i !== row))),
        onInsertRow: (row) => setRows((r) => { const c = [...r]; c.splice(row + 1, 0, emptyRow()); return c; }),
        onProductSearch: (row) => setSearchSignal((s) => ({ row, n: s.n + 1 })),
    });

    const setCell = (rowIndex: number, key: keyof ItemRow, value: string) => {
        setRows((r) => r.map((row, i) => (i === rowIndex ? { ...row, [key]: value } : row)));
    };

    // Prefill rate/trade/retail from the product's latest batch (fallback: the
    // master prices already set by applyProduct).
    const fetchLatestBatchPrices = async (rowIndex: number, productId: number) => {
        try {
            const res = await fetch(`/lookup/products/${productId}/all-batches?warehouse_id=${warehouse.id}`, { headers: { Accept: 'application/json' } });
            if (!res.ok) return;
            const batches: { purchase_rate: number; trade_price: number; retail_price: number }[] = await res.json();
            if (!batches.length) return;
            const latest = batches[0];
            setRows((r) => r.map((row, i) => (i === rowIndex && row.product_id === productId && !row.batch_id ? {
                ...row,
                purchase_rate: dec2(latest.purchase_rate),
                trade_price: dec2(latest.trade_price),
                retail_price: dec2(latest.retail_price),
            } : row)));
        } catch {
            /* ignore */
        }
    };

    const applyProduct = (rowIndex: number, product: ProductHit) => {
        // A product may repeat with a different batch, so no product-level guard.
        setRows((r) =>
            r.map((row, i) =>
                i === rowIndex
                    ? {
                          ...row,
                          product_id: product.id,
                          product_name: product.name,
                          batch_id: '',
                          batch_number: '',
                          expiry_date: '',
                          purchase_rate: dec2(product.purchase_price),
                          trade_price: dec2(product.trade_price),
                          retail_price: dec2(product.retail_price),
                          gst_percent: dec2(product.tax_percent ?? 0),
                          discount_percent: dec2(product.default_discount_percent ?? 0),
                      }
                    : row,
            ),
        );
        setRowError(rowIndex, 'product_id', null);
        grid.focusCell(rowIndex, 1); // jump to batch
        void fetchLatestBatchPrices(rowIndex, product.id);
    };

    const removeRow = (index: number) => {
        setRows((r) => (r.length === 1 ? [emptyRow()] : r.filter((_, i) => i !== index)));
    };

    const payload = () => ({
        ...header,
        company_id: header.company_id || null,
        due_date: header.due_date || null,
        warehouse_id: warehouse.id,
        items: rows
            .filter((row) => row.product_id && toNumber(row.quantity) > 0)
            .map((row) => ({
                product_id: row.product_id,
                batch_id: row.batch_id ? Number(row.batch_id) : null,
                batch_number: row.batch_number || null,
                expiry_date: row.expiry_date || null,
                quantity: toNumber(row.quantity),
                bonus_quantity: toNumber(row.bonus_quantity),
                purchase_rate: toNumber(row.purchase_rate),
                trade_price: toNumber(row.trade_price),
                retail_price: toNumber(row.retail_price),
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
        if (invoice) router.put(route('purchases.update', invoice.id), payload(), options);
        else router.post(route('purchases.store'), payload(), options);
    };

    const post = () => {
        if (!invoice || readonly || saving) return;
        if (!validate()) {
            toast.error(ALERT_FIX);
            return;
        }
        if (!confirm(`Post ${invoice.invoice_number}? Stock will be received and the supplier ledger updated.`)) return;
        setSaving(true);
        // Save latest edits first, then post.
        router.put(route('purchases.update', invoice.id), payload(), {
            preserveScroll: true,
            onSuccess: () => router.post(route('purchases.post', invoice.id), {}, { onError: handleServerErrors, onFinish: () => setSaving(false) }),
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
        { title: 'Purchases', href: '/purchases' },
        { title: invoice ? invoice.invoice_number : 'New Purchase Invoice', href: '#' },
    ];

    const statusBadge = invoice && (
        <Badge variant={invoice.status === 'posted' ? 'default' : invoice.status === 'cancelled' ? 'destructive' : 'secondary'}>
            {invoice.status}
        </Badge>
    );

    const cellInput = (rowIndex: number, colIndex: number, key: keyof ItemRow, type = 'text', className = '') => {
        const isQty = key === 'quantity';
        const onBlur = (e: React.FocusEvent<HTMLInputElement>) => {
            let value = e.target.value;
            if (isQty) value = String(Math.max(1, toNumber(value)));
            else if (DECIMAL_KEYS.has(key)) value = dec2(value);
            if (isQty || DECIMAL_KEYS.has(key)) setCell(rowIndex, key, value);
            if (rows[rowIndex].product_id) setRowError(rowIndex, key, cellRule(key, value));
        };
        const cellError = rowErrors[rowIndex]?.[key];
        // Row fields stay locked until a batch is chosen or typed.
        const row = rows[rowIndex];
        const locked = !readonly && !(row.batch_id || row.batch_number.trim());
        return (
            <Input
                ref={grid.registerCell(rowIndex, colIndex) as never}
                type={type}
                min={isQty ? 1 : undefined}
                value={rows[rowIndex][key] as string}
                disabled={readonly || locked}
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
            <Head title={invoice ? invoice.invoice_number : 'New Purchase'} />
            <div className="flex h-full flex-col gap-4 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-3">
                        <h1 className="text-3xl font-bold">
                            {invoice ? `Purchase ${invoice.invoice_number}` : 'New Purchase Invoice'}
                        </h1>
                        {statusBadge}
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {invoice && (
                            <>
                                <Button variant="outline" size="sm" asChild>
                                    <a href={route('purchases.print', invoice.id)} target="_blank" rel="noreferrer">
                                        <Printer className="mr-1 size-4" /> Print
                                    </a>
                                </Button>
                                <Button
                                    variant="outline" size="sm"
                                    onClick={() => router.post(route('purchases.duplicate', invoice.id))}
                                >
                                    <Copy className="mr-1 size-4" /> Duplicate
                                </Button>
                                {invoice.status === 'posted' && can('purchases.cancel') && (
                                    <Button
                                        variant="outline" size="sm"
                                        onClick={() => {
                                            if (confirm('Cancel this posted invoice? Stock and ledger will be reversed.')) {
                                                router.post(route('purchases.cancel', invoice.id));
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
                                {invoice && can('purchases.post') && (
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
                        <Label>Supplier *</Label>
                        <Select
                            value={header.company_id}
                            onValueChange={(v) => {
                                setHeader((h) => ({ ...h, company_id: v }));
                                setHeaderErrors((e) => { const n = { ...e }; delete n.company_id; return n; });
                            }}
                            disabled={readonly}
                        >
                            <SelectTrigger
                                autoFocus={!readonly}
                                aria-invalid={!!headerErrors.company_id}
                                className={headerErrors.company_id ? 'border-destructive ring-1 ring-destructive' : ''}
                            >
                                <SelectValue placeholder="Select supplier" />
                            </SelectTrigger>
                            <SelectContent>
                                {companies.map((company) => (
                                    <SelectItem key={company.id} value={String(company.id)}>{company.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <InputError message={headerErrors.company_id} className="mt-1 text-xs" />
                    </div>
                    <div>
                        <Label>Supplier Invoice #</Label>
                        <Input
                            value={header.supplier_invoice_number}
                            disabled={readonly}
                            onChange={(e) => setHeader((h) => ({ ...h, supplier_invoice_number: e.target.value }))}
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
                        <Label>Type</Label>
                        <Select
                            value={header.purchase_type}
                            onValueChange={(v) => setHeader((h) => ({ ...h, purchase_type: v }))}
                            disabled={readonly}
                        >
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="credit">Credit</SelectItem>
                                <SelectItem value="cash">Cash</SelectItem>
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
                </div>

                <div className="rounded-xl border">
                    <div className="max-h-[55dvh] overflow-auto">
                    <table className="w-full min-w-[1250px] text-sm">
                        <thead className="sticky top-0 z-10 bg-muted text-xs uppercase">
                            <tr className="[&>th]:border-b [&>th]:px-2 [&>th]:py-2 [&>th]:text-left">
                                <th className="w-8">#</th>
                                <th className="min-w-56">Product <kbd className="opacity-50">F2</kbd></th>
                                <th className="w-28">Batch</th>
                                <th className="w-36">Expiry</th>
                                <th className="w-20 text-right">Qty</th>
                                <th className="w-20 text-right">Bonus</th>
                                <th className="w-24 text-right">Rate</th>
                                <th className="w-24 text-right">Trade</th>
                                <th className="w-24 text-right">Retail</th>
                                <th className="w-20 text-right">Disc %</th>
                                <th className="w-20 text-right">GST %</th>
                                <th className="w-28 text-right">Net</th>
                                <th className="w-28 text-right">Margin</th>
                                <th className="w-28">Remarks</th>
                                <th className="w-10" />
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((row, rowIndex) => (
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
                                        className={rowErrors[rowIndex]?.batch_number ? 'ring-1 ring-inset ring-destructive' : ''}
                                        title={rowErrors[rowIndex]?.batch_number}
                                    >
                                        <PurchaseBatchCell
                                            productId={row.product_id}
                                            warehouseId={warehouse.id}
                                            value={row.batch_id}
                                            batchNumber={row.batch_number}
                                            disabled={readonly}
                                            invalid={!!rowErrors[rowIndex]?.batch_number}
                                            registerRef={grid.registerCell(rowIndex, 1)}
                                            onKeyDown={(e) => grid.handleKeyDown(e, rowIndex, 1)}
                                            onPickExisting={(b) => {
                                                const dup = rows.findIndex((r, i) => i !== rowIndex && r.product_id === row.product_id && r.batch_id === String(b.id));
                                                if (dup !== -1) {
                                                    setRowError(rowIndex, 'batch_number', `This product + batch is already on line ${dup + 1}.`);
                                                    return;
                                                }
                                                setRowError(rowIndex, 'batch_number', null);
                                                setRows((r) => r.map((rw, i) => (i === rowIndex ? {
                                                    ...rw,
                                                    batch_id: String(b.id),
                                                    batch_number: b.batch_number,
                                                    expiry_date: b.expiry_date ?? '',
                                                    purchase_rate: dec2(b.purchase_rate),
                                                    trade_price: dec2(b.trade_price),
                                                    retail_price: dec2(b.retail_price),
                                                } : rw)));
                                                grid.focusCell(rowIndex, 3); // proceed to Qty
                                            }}
                                            onCreateNew={(number) => {
                                                const dup = rows.findIndex((r, i) => i !== rowIndex && r.product_id === row.product_id && !r.batch_id && r.batch_number.trim().toLowerCase() === number.toLowerCase());
                                                if (dup !== -1) {
                                                    setRowError(rowIndex, 'batch_number', `This product + batch is already on line ${dup + 1}.`);
                                                    return;
                                                }
                                                setRowError(rowIndex, 'batch_number', null);
                                                setRows((r) => r.map((rw, i) => (i === rowIndex ? { ...rw, batch_id: '', batch_number: number } : rw)));
                                                grid.focusCell(rowIndex, 2); // proceed to Expiry (new batch)
                                            }}
                                        />
                                    </td>
                                    <td>{cellInput(rowIndex, 2, 'expiry_date', 'date')}</td>
                                    <td>{cellInput(rowIndex, 3, 'quantity', 'number', 'text-right')}</td>
                                    <td>{cellInput(rowIndex, 4, 'bonus_quantity', 'number', 'text-right')}</td>
                                    <td>{cellInput(rowIndex, 5, 'purchase_rate', 'number', 'text-right')}</td>
                                    <td>{cellInput(rowIndex, 6, 'trade_price', 'number', 'text-right')}</td>
                                    <td>{cellInput(rowIndex, 7, 'retail_price', 'number', 'text-right')}</td>
                                    <td>{cellInput(rowIndex, 8, 'discount_percent', 'number', 'text-right')}</td>
                                    <td>{cellInput(rowIndex, 9, 'gst_percent', 'number', 'text-right')}</td>
                                    <td className="px-2 text-right tabular-nums">{amount(computed[rowIndex].net_amount)}</td>
                                    <td className="px-2 text-right tabular-nums">
                                        <span className={computed[rowIndex].margin < 0 ? 'text-destructive' : ''}>
                                            {amount(computed[rowIndex].margin)}
                                        </span>
                                        <span className="ml-1 text-xs text-muted-foreground">
                                            {computed[rowIndex].margin_percent.toFixed(2)}%
                                        </span>
                                    </td>
                                    <td>{cellInput(rowIndex, 10, 'remarks')}</td>
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
                    </div>
                    {!readonly && (
                        <div className="border-t p-2">
                            <Button variant="ghost" size="sm" onClick={() => setRows((r) => [...r, emptyRow()])}>
                                <Plus className="mr-1 size-4" /> Add Row
                            </Button>
                        </div>
                    )}
                </div>

                <div className="sticky bottom-0 z-10 mt-auto flex flex-wrap items-start justify-between gap-4 bg-background pt-2">
                    <div className="w-full max-w-md">
                        <Label>Notes</Label>
                        <Textarea
                            rows={2} value={header.notes} disabled={readonly}
                            onChange={(e) => setHeader((h) => ({ ...h, notes: e.target.value }))}
                        />
                        <p className="mt-2 text-xs text-muted-foreground">
                            Keys: Enter next field · ↑↓ rows · F2 product search · Ctrl+D delete row · Ctrl+I add row · F8 save · F9 post
                        </p>
                    </div>
                    <div className="ml-auto w-80 space-y-1 rounded-xl border p-4 text-base">
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
                        <div className="flex justify-between border-t pt-2 text-xl font-bold">
                            <span>Total</span><span className="tabular-nums">{money(totals.total_amount)}</span>
                        </div>
                        <div className="flex justify-between text-xs text-muted-foreground">
                            <span>Expected Margin</span><span className="tabular-nums">{amount(totals.total_margin)}</span>
                        </div>
                    </div>
                </div>
            </div>

        </AppLayout>
    );
}
