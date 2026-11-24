import InputError from '@/components/input-error';
import { RegisterHeader } from '@/components/master-register';
import { ProductSearchCell, type ProductHit } from '@/components/product-search-cell';
import { PurchaseBatchCell } from '@/components/purchase-batch-cell';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useInvoiceHotkeys, useKeyboardGrid } from '@/hooks/use-keyboard-grid';
import { usePermissions } from '@/hooks/use-permissions';
import { useTreasuryPayment } from '@/hooks/use-treasury-payment';
import { draftWasSaved, useDraftLeave } from '@/hooks/use-draft-leave';
import AppLayout from '@/layouts/app-layout';
import type { VisitOptions } from '@inertiajs/core';
import { amount, dec2, money, pakistanDate, qty, shortDate, toNumber, totalMoney, totalAmount } from '@/lib/format';
import { ALERT_FIX, splitItemErrors } from '@/lib/form-validation';
import { computeLine, computeTotals } from '@/lib/invoice-math';
import { Head, Link, router } from '@inertiajs/react';
import { ArrowUp, Check, ChevronLeft, Copy, Landmark, Package, Plus, Printer, Save, Trash2, TrendingUp, XCircle } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import './purchase-form.css';

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
    financial_account_id?: number | null;
    status: string;
    discount_percent: string;
    gst_percent: string;
    notes: string | null;
    updated_at: string | null;
    posted_at: string | null;
    subtotal: string;
    item_discount_total: string;
    item_gst_total: string;
    discount_amount: string;
    gst_amount: string;
    total_margin: string;
    total_amount: string;
    rounding_amount?: string | null;
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
        net_amount: string;
        margin: string;
        margin_percent: string;
        remarks: string | null;
    }[];
}

interface Props {
    companies: { id: number; name: string; payment_terms?: string | null; payable_balance?: number | string | null }[];
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

const CELL_LABELS = ['Product', 'Batch', 'Expiry', 'Qty', 'Bonus', 'Rate', 'Trade', 'Retail', 'Disc %', 'GST %', 'Remarks'];
const tableColumns = ['#', 'Product', 'Batch', 'Expiry', 'Qty', 'Bonus', 'Rate', 'Trade', 'Retail', 'Disc %', 'GST %', 'Net', 'Margin', 'Remarks', ''];
const clockPKT = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Karachi', hour: '2-digit', minute: '2-digit' });

export default function PurchaseForm({ companies, warehouse, invoice }: Props) {
    const treasury = useTreasuryPayment();
    const { can } = usePermissions();
    const isDraft = !invoice || invoice.status === 'draft';
    const readonly = !isDraft;
    const canSave = isDraft && can('purchases.create');
    const canPost = canSave && can('purchases.post');

    const [header, setHeader] = useState({
        company_id: invoice ? String(invoice.company_id) : '',
        supplier_invoice_number: invoice?.supplier_invoice_number ?? '',
        invoice_date: invoice?.invoice_date?.slice(0, 10) ?? pakistanDate(),
        due_date: invoice?.due_date?.slice(0, 10) ?? '',
        purchase_type: invoice?.purchase_type ?? 'credit',
        financial_account_id: String(invoice?.financial_account_id ?? ''),
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
    const [confirmAction, setConfirmAction] = useState<'post' | 'cancel' | null>(null);
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
    const displayTotals = readonly && invoice ? invoice : totals;
    const filledRows = rows.filter(row => row.product_id);
    const units = filledRows.reduce((sum, row) => sum + toNumber(row.quantity) + toNumber(row.bonus_quantity), 0);
    const batches = `${filledRows.length} ${filledRows.length === 1 ? 'batch' : 'batches'}`;
    const stockSummary = `${qty(units)} units · ${batches}`;
    const supplier = companies.find(company => String(company.id) === header.company_id);
    const isCash = header.purchase_type === 'cash';
    const marginValue = toNumber(displayTotals.total_margin);
    const invoiceTotal = toNumber(displayTotals.total_amount);
    const marginPercent = invoiceTotal > 0 ? `${(marginValue / invoiceTotal * 100).toFixed(0)}%` : '';

    const grid = useKeyboardGrid({
        appendOnArrowDown: false,
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
        financial_account_id: header.financial_account_id || null,
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

    const draftVersion = JSON.stringify([header, rows]);
    const draft = useDraftLeave({ version: draftVersion, editable: canSave, saving, save });

    function persistDraft(options: VisitOptions) {
        if (invoice) router.put(route('purchases.update', invoice.id), payload(), options);
        else router.post(route('purchases.store'), payload(), options);
    }

    function save(done?: (saved: boolean) => void) {
        if (!canSave || saving) {
            done?.(false);
            return;
        }
        if (!validate()) {
            toast.error(ALERT_FIX);
            done?.(false);
            return;
        }
        setSaving(true);
        let saved = false;
        const options: VisitOptions = {
            replace: true,
            preserveScroll: true,
            onError: handleServerErrors,
            onSuccess: (page) => {
                saved = draftWasSaved(page.props.flash);
                if (saved) draft.markSaved(draftVersion);
            },
            onFinish: () => {
                setSaving(false);
                done?.(saved && draft.canLeaveAfterSave());
            },
        };
        persistDraft(options);
    }

    const askPost = () => {
        if (!canPost || saving || confirmAction) return;
        if (!validate()) {
            toast.error(ALERT_FIX);
            return;
        }
        setConfirmAction('post');
    };

    const post = () => {
        if (!canPost || saving) return;
        setConfirmAction(null);
        setSaving(true);
        // Store/update first, then use the existing posting route. If posting
        // is rejected by stock or finance checks, the saved draft remains.
        let posting = false;
        persistDraft({
            replace: true,
            preserveScroll: true,
            onSuccess: (page) => {
                if (!draftWasSaved(page.props.flash)) return;
                const id = (page.props.invoice as InvoiceDto | undefined)?.id ?? invoice?.id;
                if (!id) return;
                draft.markSaved(draftVersion);
                posting = true;
                router.post(route('purchases.post', id), {}, { preserveScroll: true, onError: handleServerErrors, onFinish: () => setSaving(false) });
            },
            onError: handleServerErrors,
            onFinish: () => { if (!posting) setSaving(false); },
        });
    };

    const cancel = () => {
        if (!invoice || saving || invoice.status !== 'posted' || !can('purchases.cancel')) return;
        setConfirmAction(null);
        setSaving(true);
        router.post(route('purchases.cancel', invoice.id), {}, { preserveScroll: true, onFinish: () => setSaving(false) });
    };

    const hotkeys = useInvoiceHotkeys({ onSave: save, onPost: askPost });
    useEffect(() => {
        if (readonly || confirmAction) return;
        const listener = (event: KeyboardEvent) => {
            if (event.defaultPrevented || event.repeat || event.isComposing || document.querySelector('[role="dialog"], [role="alertdialog"]')) return;
            if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && canPost) {
                event.preventDefault();
                event.stopPropagation();
                askPost();
                return;
            }
            hotkeys.handleKeyDown(event);
        };
        window.addEventListener('keydown', listener, true);
        return () => window.removeEventListener('keydown', listener, true);
    });

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
                aria-label={`${CELL_LABELS[colIndex]}, line ${rowIndex + 1}`}
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
                className={`purchase-cell ${className}`}
            />
        );
    };

    return (
        <AppLayout>
            {draft.dialog}
            <Head title={invoice ? invoice.invoice_number : 'New Purchase Invoice'} />
            <main className={`purchase-doc${readonly ? ' purchase-doc--view' : ''}`} aria-busy={saving}>
                <div className="master-register purchase-header">
                    <RegisterHeader title={invoice?.invoice_number ?? 'New Purchase Invoice'}
                        description={<>
                            <Link className="purchase-back" href={route('purchases.index')}><ChevronLeft className="i" aria-hidden="true" />Purchase Invoices</Link>
                            <span className={`st ${invoice?.status ?? 'draft'}`}>{invoice?.status ?? 'draft'}</span>
                            {isDraft && invoice?.updated_at && draft.canLeaveAfterSave() && <span className="purchase-saved"><Check className="i" aria-hidden="true" />Draft saved {clockPKT.format(new Date(invoice.updated_at))}</span>}
                        </>}
                        actions={(invoice || canSave || canPost) && <div className="register-hero-actions" role="group" aria-label="Invoice actions">
                            {invoice && <>
                                <a className="hbtn" href={route('purchases.print', invoice.id)} target="_blank" rel="noreferrer"><Printer className="i" aria-hidden="true" />Print</a>
                                {can('purchases.create') && <button type="button" className="hbtn" disabled={saving} onClick={() => router.post(route('purchases.duplicate', invoice.id), {}, { preserveState: false })}><Copy className="i" aria-hidden="true" />Duplicate</button>}
                                {invoice.status === 'posted' && can('purchases.cancel') && <button type="button" className="hbtn purchase-cancel" disabled={saving} onClick={() => setConfirmAction('cancel')}><XCircle className="i" aria-hidden="true" />Cancel Invoice</button>}
                            </>}
                            {canSave && <button type="button" className="hbtn" onClick={() => save()} disabled={saving}><Save className="i" aria-hidden="true" />Save Draft <kbd>F8</kbd></button>}
                            {canPost && <button type="button" className="hbtn pri" onClick={askPost} disabled={saving}><Check className="i" aria-hidden="true" />Post invoice <kbd>Ctrl ↵</kbd></button>}
                        </div>}
                    />
                </div>

                <section data-enter-nav className="purchase-fields" aria-label="Invoice details">
                    <div className="purchase-field purchase-supplier">
                        <Label htmlFor="purchase-supplier">Supplier <em>*</em></Label>
                        <Select
                            value={header.company_id}
                            onValueChange={(v) => {
                                setHeader((h) => ({ ...h, company_id: v }));
                                setHeaderErrors((e) => { const n = { ...e }; delete n.company_id; return n; });
                            }}
                            disabled={readonly}
                        >
                            <SelectTrigger
                                id="purchase-supplier"
                                aria-invalid={!!headerErrors.company_id}
                            >
                                <SelectValue placeholder="Select supplier" />
                            </SelectTrigger>
                            <SelectContent>
                                {companies.map((company) => (
                                    <SelectItem key={company.id} value={String(company.id)}>{company.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        {supplier && (supplier.payable_balance !== undefined || supplier.payment_terms) && <p className="purchase-field-note" title={supplier.payment_terms ?? undefined}>
                            {supplier.payable_balance !== undefined && <>Payable {money(supplier.payable_balance)}{supplier.payment_terms ? ' · ' : ''}</>}{supplier.payment_terms}
                        </p>}
                        <InputError message={headerErrors.company_id} className="text-xs" />
                    </div>
                    <div className="purchase-field">
                        <Label htmlFor="purchase-supplier-reference">Supplier Invoice #</Label>
                        <Input
                            id="purchase-supplier-reference" placeholder="e.g. 11622"
                            value={header.supplier_invoice_number}
                            disabled={readonly}
                            aria-invalid={!!headerErrors.supplier_invoice_number}
                            onChange={(e) => setHeader((h) => ({ ...h, supplier_invoice_number: e.target.value }))}
                        />
                    </div>
                    <div className="purchase-field">
                        <Label htmlFor="purchase-invoice-date">Invoice Date <em>*</em></Label>
                        <Input
                            id="purchase-invoice-date" aria-invalid={!!headerErrors.invoice_date}
                            type="date" value={header.invoice_date} disabled={readonly}
                            onChange={(e) => setHeader((h) => ({ ...h, invoice_date: e.target.value }))}
                        />
                    </div>
                    <div className="purchase-field">
                        <Label htmlFor="purchase-due-date">Due Date</Label>
                        <Input
                            id="purchase-due-date" aria-invalid={!!headerErrors.due_date}
                            type="date" value={header.due_date} disabled={readonly}
                            onChange={(e) => setHeader((h) => ({ ...h, due_date: e.target.value }))}
                        />
                    </div>
                    <div className="purchase-field">
                        <Label id="purchase-type-label">Type</Label>
                        <div className="purchase-types" role="group" aria-labelledby="purchase-type-label">
                            {['credit', 'cash'].map(type => <button key={type} type="button" aria-pressed={header.purchase_type === type} disabled={readonly}
                                onClick={() => setHeader(h => ({ ...h, purchase_type: type, financial_account_id: type === 'cash' ? h.financial_account_id : '' }))}>{type === 'cash' ? 'Cash' : 'Credit'}</button>)}
                        </div>
                    </div>
                    <div className="purchase-field">
                        <Label htmlFor="purchase-warehouse">Warehouse</Label>
                        <Input id="purchase-warehouse" value={warehouse.name} disabled />
                    </div>
                    <div className="purchase-field purchase-remarks">
                        <Label htmlFor="purchase-remarks">Remarks</Label>
                        <Input
                            id="purchase-remarks" aria-invalid={!!headerErrors.notes}
                            value={header.notes} disabled={readonly}
                            placeholder="Optional note for this invoice"
                            onChange={(e) => setHeader((h) => ({ ...h, notes: e.target.value }))}
                            onKeyDown={(e) => { if (e.key === 'Enter' && !readonly) { e.preventDefault(); grid.focusCell(0, 0); } }}
                        />
                    </div>
                    {treasury.required && isCash && !readonly && <div className="purchase-field"><Label htmlFor="purchase-cash-account">Pay from cash account</Label><select id="purchase-cash-account" aria-invalid={!!headerErrors.financial_account_id} value={header.financial_account_id} onChange={e => setHeader(h => ({ ...h, financial_account_id: e.target.value }))}><option value="">Select an account</option>{treasury.accounts.filter(a => ['cash', 'petty_cash'].includes(a.kind)).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></div>}
                </section>

                {readonly && invoice && (invoice.status === 'posted' || invoice.posted_at) && <section className="purchase-strip" aria-label="Posted invoice summary">
                    <SummaryTile icon={Package} tone="teal" label={invoice.status === 'cancelled' ? 'Stock reversed' : 'Stock added'} value={stockSummary} />
                    <SummaryTile icon={ArrowUp} tone="red" label={invoice.status === 'cancelled' ? (isCash ? 'Cash payment reversed' : 'Payable reversed') : isCash ? 'Paid in cash' : 'Added to payable'} value={totalMoney(invoiceTotal)} />
                    <SummaryTile icon={Landmark} tone="blue" label={supplier?.payable_balance !== undefined ? 'Supplier balance now' : 'Supplier'} value={supplier?.payable_balance !== undefined ? money(supplier.payable_balance) : supplier?.name ?? '—'} />
                    <SummaryTile icon={TrendingUp} tone={marginValue < 0 ? 'red' : 'green'} label="Expected margin" value={`${totalMoney(marginValue)}${marginPercent ? ` · ${marginPercent}` : ''}`} />
                </section>}

                <section className="purchase-lines" aria-label="Invoice items">
                    <div className="purchase-lines-scroll" tabIndex={0} role="region" aria-label="Scrollable invoice line items">
                    <table className="purchase-table">
                        <thead><tr>{tableColumns.map((label, index) => <th key={index} scope="col" className={index >= 4 && index <= 12 ? 'text-right' : ''}>
                            {label || <span className="sr-only">Actions</span>}{index === 1 && !readonly && <kbd>F2</kbd>}
                        </th>)}</tr></thead>
                        <tbody>
                            {rows.map((row, rowIndex) => {
                                const stored = readonly ? invoice?.items[rowIndex] : undefined;
                                const net = toNumber(stored?.net_amount ?? computed[rowIndex].net_amount);
                                const margin = toNumber(stored?.margin ?? computed[rowIndex].margin);
                                const percent = toNumber(stored?.margin_percent ?? computed[rowIndex].margin_percent);
                                return <tr key={rowIndex} data-issue={!!rowErrors[rowIndex]}>
                                    <td className="purchase-line-no">{rowIndex + 1}</td>
                                    <td
                                        className="purchase-product" data-invalid={!!rowErrors[rowIndex]?.product_id}
                                        title={rowErrors[rowIndex]?.product_id}
                                    >
                                        {readonly ? <span title={row.product_name}>{row.product_name}</span> : <ProductSearchCell
                                            value={row.product_name}
                                            warehouseId={warehouse.id}
                                            disabled={readonly}
                                            openSignal={searchSignal.row === rowIndex ? searchSignal.n : 0}
                                            onSelect={(product) => applyProduct(rowIndex, product)}
                                            onGridKeyDown={(e) => grid.handleKeyDown(e, rowIndex, 0)}
                                            inputRef={grid.registerCell(rowIndex, 0)}
                                        />}
                                    </td>
                                    <td
                                        data-invalid={!!rowErrors[rowIndex]?.batch_number}
                                        title={rowErrors[rowIndex]?.batch_number}
                                    >
                                        {readonly ? <span className="purchase-cell-value">{row.batch_number}</span> : <PurchaseBatchCell
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
                                        />}
                                    </td>
                                    <td>{cellInput(rowIndex, 2, 'expiry_date', 'date')}</td>
                                    <td>{cellInput(rowIndex, 3, 'quantity', 'number', 'text-right')}</td>
                                    <td>{cellInput(rowIndex, 4, 'bonus_quantity', 'number', 'text-right')}</td>
                                    <td>{cellInput(rowIndex, 5, 'purchase_rate', 'number', 'text-right')}</td>
                                    <td>{cellInput(rowIndex, 6, 'trade_price', 'number', 'text-right')}</td>
                                    <td>{cellInput(rowIndex, 7, 'retail_price', 'number', 'text-right')}</td>
                                    <td>{cellInput(rowIndex, 8, 'discount_percent', 'number', 'text-right')}</td>
                                    <td>{cellInput(rowIndex, 9, 'gst_percent', 'number', 'text-right')}</td>
                                    <td className="purchase-calc"><b data-empty={!row.product_id}>{amount(net)}</b></td>
                                    <td className="purchase-calc">
                                        {row.product_id && (stored || toNumber(row.purchase_rate)) ?
                                            <div className="purchase-margin">{amount(margin)}<span data-tone={percent < 0 ? 'red' : percent < 20 ? 'amber' : 'green'}>{percent.toFixed(0)}%</span></div> : <span className="purchase-muted">—</span>}
                                    </td>
                                    <td>{cellInput(rowIndex, 10, 'remarks')}</td>
                                    <td className="purchase-line-action">
                                        {!readonly && (
                                            <button type="button" title="Remove line" aria-label={`Remove line ${rowIndex + 1}`} onClick={() => removeRow(rowIndex)}>
                                                <Trash2 />
                                            </button>
                                        )}
                                    </td>
                                </tr>;
                            })}
                        </tbody>
                    </table>
                    </div>
                    {!readonly && (
                        <div className="purchase-add-row">
                            <button type="button" onClick={() => { setRows((r) => [...r, emptyRow()]); grid.focusCell(rows.length, 0); }}><Plus /> Add line</button>
                            <div className="purchase-keys"><span><kbd>Enter</kbd> next cell</span><span><kbd>↑ ↓</kbd> move between lines</span><span><kbd>Ctrl + I</kbd> insert</span><span><kbd>Ctrl + D</kbd> delete</span><span><kbd>F2</kbd> product search</span></div>
                        </div>
                    )}
                </section>

                {!readonly && (Object.keys(headerErrors).length > 0 || Object.keys(rowErrors).length > 0) && <div className="purchase-issues" role="alert">
                    <b>Check these fields</b><ul>
                        {Object.entries(headerErrors).map(([key, message]) => <li key={key}>{message}</li>)}
                        {Object.entries(rowErrors).flatMap(([index, errors]) => Object.entries(errors).map(([key, message]) => {
                            const col = key === 'product_id' ? 0 : COLS.findIndex(name => name === key);
                            return <li key={`${index}-${key}`}>{col < 0 ? `Line ${Number(index) + 1}: ${message}` : <button type="button" onClick={() => grid.focusCell(Number(index), col)}>Line {Number(index) + 1}: {message}</button>}</li>;
                        }))}
                    </ul>
                </div>}

                <section className="purchase-totals" aria-label="Invoice totals">
                    <div className="purchase-total-part"><span>Subtotal</span><b>{amount(displayTotals.subtotal)}</b></div>
                    {(['discount_percent', 'gst_percent'] as const).map(key => {
                        const discount = key === 'discount_percent';
                        const adjustment = discount ? toNumber(displayTotals.discount_amount) + toNumber(displayTotals.item_discount_total) : toNumber(displayTotals.gst_amount) + toNumber(displayTotals.item_gst_total);
                        const name = discount ? 'Discount' : 'GST';
                        return <label className="purchase-total-part" key={key}><span>{name}</span><span className="purchase-percent">
                            <input aria-label={`Invoice ${name.toLowerCase()} %`} aria-invalid={!!headerErrors[key]} type="number" min="0" max="100" step="0.01" value={header[key]} disabled={readonly}
                                onChange={e => setHeader(h => ({ ...h, [key]: e.target.value }))} onBlur={e => setHeader(h => ({ ...h, [key]: dec2(e.target.value) || '0.00' }))} />
                            <i aria-hidden="true">%</i></span><b data-empty={adjustment === 0}>{discount ? '−' : '+'}{amount(adjustment)}</b></label>;
                    })}
                    <div className="purchase-total-part"><span>Items</span><b className="purchase-muted">{filledRows.length} · {qty(units)} units</b></div>
                    <div className="purchase-margin-total" data-loss={marginValue < 0}><span>Exp. margin</span><b>{totalAmount(marginValue)}</b>{marginPercent && <small>{marginPercent}</small>}</div>
                    {!!toNumber(displayTotals.rounding_amount) && <div className="purchase-total-part"><span>Rounding</span><b>{amount(displayTotals.rounding_amount)}</b></div>}
                    <div className="purchase-grand"><span>Total</span><b>{totalMoney(invoiceTotal)}</b></div>
                </section>
            </main>

            <Dialog open={confirmAction !== null} onOpenChange={open => { if (!open) setConfirmAction(null); }}>
                <DialogContent appearance="form" className="purchase-dialog max-w-md">
                    <DialogHeader>
                        <DialogTitle>{confirmAction === 'cancel' ? `Cancel ${invoice?.invoice_number}?` : 'Post this purchase invoice?'}</DialogTitle>
                        <DialogDescription>{confirmAction === 'cancel' ? 'Cancelling reverses the invoice’s stock and ledger entries. This can’t be undone.' : 'Stock and the supplier ledger update when you post. A posted invoice can’t be edited.'}</DialogDescription>
                    </DialogHeader>
                    {confirmAction === 'post' && <DialogBody><dl className="purchase-dialog-details">
                        <div><dt>Supplier</dt><dd>{supplier?.name}</dd></div>
                        <div><dt>Stock into {warehouse.name.toLowerCase()}</dt><dd>{stockSummary}</dd></div>
                        <div><dt>{isCash ? 'Paid in cash' : 'Added to payable'}</dt><dd>{totalMoney(invoiceTotal)}</dd></div>
                        {!isCash && <div><dt>Due</dt><dd>{header.due_date ? shortDate(header.due_date) : 'No due date'}</dd></div>}
                    </dl></DialogBody>}
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setConfirmAction(null)}>{confirmAction === 'cancel' ? 'Keep invoice' : 'Back'}</Button>
                        <Button variant={confirmAction === 'cancel' ? 'destructive' : 'default'} disabled={saving} onClick={confirmAction === 'cancel' ? cancel : post}>{confirmAction === 'cancel' ? 'Cancel invoice' : 'Post invoice'}</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

        </AppLayout>
    );
}

function SummaryTile({ icon: Icon, tone, label, value }: { icon: typeof Package; tone: string; label: string; value: string }) {
    return <div className="purchase-summary-tile"><span className="purchase-summary-icon" data-tone={tone}><Icon aria-hidden="true" /></span><div><small>{label}</small><b>{value}</b></div></div>;
}
