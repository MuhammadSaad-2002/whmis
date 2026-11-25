import { BatchSelectCell } from '@/components/batch-select-cell';
import InputError from '@/components/input-error';
import { InvoiceLineNumberHeading, InvoiceSummaryTile } from '@/components/invoice-document';
import { RegisterHeader } from '@/components/master-register';
import { ProductSearchCell, type ProductHit } from '@/components/product-search-cell';
import { RulePickerDialog, type RuleHit } from '@/components/rule-picker-dialog';
import { SearchableSelect } from '@/components/searchable-select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useInvoiceHotkeys, useKeyboardGrid } from '@/hooks/use-keyboard-grid';
import { usePermissions } from '@/hooks/use-permissions';
import { draftWasSaved, useDraftLeave } from '@/hooks/use-draft-leave';
import AppLayout from '@/layouts/app-layout';
import type { VisitOptions } from '@inertiajs/core';
import { amount, dec2, money, pakistanDate, qty as fmtQty, shortDate, toNumber, totalAmount, totalMoney } from '@/lib/format';
import { ALERT_FIX, splitItemErrors } from '@/lib/form-validation';
import { combineEffects, savedBasePrice } from '@/lib/incentive';
import { computeLine, computeTotals, effectiveDiscountPercent } from '@/lib/invoice-math';
import { Head, Link, router } from '@inertiajs/react';
import { Check, ChevronLeft, CreditCard, Package, Printer, Save, Trash2, TrendingUp, UserRound, X, XCircle } from 'lucide-react';
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
    incentives: RuleHit[]; // stacked incentive rules (≤1 per rule_type)
    unallocated_discount?: number;
    trade_price: string;
    discount_percent: string;
    gst_percent: string;
    remarks: string;
}

interface InvoiceDto {
    id: number;
    invoice_number: string;
    customer_id: number;
    customer?: { id: number; name: string; city: string | null; credit_limit: string } | null;
    booker_id: number | null;
    planned_salesman_id?: number | null;
    booker?: { id: number; name: string } | null;
    warehouse_id: number;
    invoice_date: string;
    due_date: string | null;
    sale_type: string;
    sale_terms: string | null;
    status: string;
    updated_at?: string | null;
    posted_at?: string | null;
    discount_percent: string;
    gst_percent: string;
    notes: string | null;
    subtotal: string;
    item_discount_total: string;
    item_gst_total: string;
    discount_amount: string;
    gst_amount: string;
    total_amount: string;
    rounding_amount?: string | null;
    total_profit: string;
    items: {
        product_id: number;
        product?: { id: number; name: string };
        batch_id: number | null;
        batch?: { id: number; batch_number: string; expiry_date: string | null } | null;
        quantity: string;
        bonus_quantity: string;
        trade_price: string;
        discount_percent: string;
        gst_percent: string;
        discount_amount: string;
        incentive_discount: string;
        net_amount: string;
        remarks: string | null;
        incentives?: {
            incentive_rule_id: number | null;
            rule_type: string;
            rule_name: string;
            value_given: string;
            trade_price: string | null;
            allocated_discount?: number | null;
            rule?: {
                id: number;
                name: string;
                rule_type: string;
                base_qty: string | number;
                bonus_qty: string | number;
                slabs: { min_qty: number | string; max_qty: number | string | null; bonus_qty: number | string }[] | null;
                value: string | number;
            } | null;
        }[];
    }[];
}

interface CustomerOption { id: number; name: string; city: string | null; credit_limit: string; booker_id: number | null }

interface Props {
    customers: CustomerOption[];
    warehouse: { id: number; name: string };
    bookers: { id: number; name: string }[];
    salesmen?: { id: number; name: string }[];
    invoice: InvoiceDto | null;
    trackedConversion?: boolean;
}

const emptyRow = (): ItemRow => ({
    product_id: null, product_name: '', batch_id: '', batch_fallback: null, stock: 0,
    quantity: '1', bonus_quantity: '0', incentives: [],
    trade_price: '', discount_percent: '0.00', gst_percent: '0.00', remarks: '',
});

/** Rebuild the stacked RuleHit list from a saved item's incentive rows. */
const hydrateIncentives = (item: InvoiceDto['items'][number]): RuleHit[] =>
    (item.incentives ?? []).map((inc) => {
        const rule = inc.rule;
        return {
            id: inc.incentive_rule_id ?? rule?.id ?? 0,
            name: inc.rule_name,
            rule_type: inc.rule_type,
            base_qty: rule ? Number(rule.base_qty) : undefined,
            bonus_qty: rule ? Number(rule.bonus_qty) : undefined,
            slabs: rule?.slabs ?? undefined,
            value: inc.rule_type === 'price_override' && inc.trade_price !== null ? Number(inc.trade_price) : rule ? Number(rule.value) : undefined,
            summary: '',
            scope: '',
            effect: {},
        } satisfies RuleHit;
    });

const isBonusType = (t: string) => t === 'qty_bonus' || t === 'slab_bonus';
const isDiscountType = (t: string) => t === 'percent_discount' || t === 'fixed_discount';

// Editable columns in keyboard order: product, batch, qty, bonus, rule, price, disc, gst, remarks
const COL_COUNT = 9;

// Enter walks product → batch → qty → bonus → price → disc% → next row.
// Rule (F4), GST % (auto-filled), and remarks stay Tab-reachable.
const ENTER_ORDER = [0, 1, 2, 3, 5, 6];

// Fields normalized to 0.00 on blur / auto-fill.
const DECIMAL_KEYS: ReadonlySet<keyof ItemRow> = new Set([
    'trade_price', 'discount_percent', 'gst_percent',
] as (keyof ItemRow)[]);

const clockPKT = new Intl.DateTimeFormat('en-PK', { timeZone: 'Asia/Karachi', hour: 'numeric', minute: '2-digit' });
const saleTypes = [['credit', 'Credit'], ['cash', 'Cash'], ['sale_base', 'Sale Base']];
const gridColumns = ['product_id', 'batch_id', 'quantity', 'bonus_quantity', 'incentive_rule_ids', 'trade_price', 'discount_percent', 'gst_percent', 'remarks'];

export default function SalesForm({ customers, warehouse, bookers, invoice, salesmen = [], trackedConversion = false }: Props) {
    const { can } = usePermissions();
    const isDraft = !invoice || invoice.status === 'draft';
    const canSave = isDraft && can('sales.create');
    const canPost = canSave && !!invoice && can('sales.post');
    const readonly = !canSave;

    const [header, setHeader] = useState({
        invoice_number: '',
        customer_id: invoice ? String(invoice.customer_id) : '',
        booker_id: invoice?.booker_id ? String(invoice.booker_id) : '',
        planned_salesman_id: invoice?.planned_salesman_id ? String(invoice.planned_salesman_id) : '',
        invoice_date: invoice?.invoice_date?.slice(0, 10) ?? pakistanDate(),
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
                  incentives: hydrateIncentives(item),
                  trade_price: dec2(readonly ? item.trade_price : savedBasePrice(item)),
                  unallocated_discount: trackedConversion && !item.incentives?.some((rule) => isDiscountType(rule.rule_type)) ? toNumber(item.incentive_discount) : 0,
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
    const [confirmAction, setConfirmAction] = useState<'post' | 'cancel' | null>(null);
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
        () => {
            const savedByProduct = new Map(trackedConversion ? invoice?.items.map(item => [item.product_id, item.incentives]) : []);
            return rows.map((row) => {
                const saved = row.product_id ? savedByProduct.get(row.product_id) : undefined;
                const rules = saved?.length ? row.incentives.map(rule => ({
                    ...rule,
                    allocated_discount: saved.find(award => award.rule_type === rule.rule_type && (award.incentive_rule_id ?? 0) === rule.id)?.allocated_discount ?? undefined,
                })) : row.incentives;
                const eff = combineEffects(rules, toNumber(row.quantity), toNumber(row.trade_price));
                return computeLine(
                    {
                        quantity: row.quantity,
                        rate: eff.trade_price,
                        discount_percent: row.discount_percent,
                        incentive_discount: eff.incentive_discount + (row.unallocated_discount ?? 0),
                        gst_percent: row.gst_percent,
                    },
                    false,
                );
            });
        },
        [invoice?.items, rows, trackedConversion],
    );

    const totals = useMemo(
        () => computeTotals(computed.filter((_, i) => rows[i].product_id), header),
        [computed, rows, header],
    );
    const displayTotals = readonly && invoice ? invoice : totals;
    const invoiceTotal = toNumber(displayTotals.total_amount);
    const rounding = toNumber(displayTotals.rounding_amount);
    const filledRows = rows.filter(row => row.product_id);
    const units = filledRows.reduce((sum, row) => sum + toNumber(row.quantity) + toNumber(row.bonus_quantity), 0);
    const stockSummary = `${fmtQty(units)} units · ${filledRows.length} ${filledRows.length === 1 ? 'line' : 'lines'}`;
    const profit = toNumber(invoice?.total_profit);
    const profitPercent = invoiceTotal > 0 ? `${(profit / invoiceTotal * 100).toFixed(0)}%` : '';

    const grid = useKeyboardGrid({
        appendOnArrowDown: false,
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
        setRows((r) => r.map((row, i) => {
            if (i !== rowIndex) return row;
            const next = { ...row, [key]: value };
            // Stacked qty/slab bonus rules recompute their bonus live as qty changes.
            if (key === 'quantity' && next.incentives.some((inc) => isBonusType(inc.rule_type))) {
                const eff = combineEffects(next.incentives, toNumber(value), toNumber(next.trade_price));
                next.bonus_quantity = String(eff.bonus_qty);
            }
            return next;
        }));
    };

    const applyProduct = (rowIndex: number, product: ProductHit) => {
        // A product may repeat with a different batch, so no product-level guard
        // here — the same product + batch is blocked when the batch is chosen.
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
                          incentives: [],
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

    // Stack a rule on a line. At most one per rule_type; a bonus rule (re)derives
    // the line's bonus qty. Discount/price effects are shown live via combineEffects
    // and recomputed authoritatively by the server on save — trade_price stays the
    // base price so a price_override can be removed without losing it.
    const addRule = (rowIndex: number, rule: RuleHit) => {
        if (trackedConversion && isBonusType(rule.rule_type)) return;
        setRows((r) =>
            r.map((row, i) => {
                if (i !== rowIndex) return row;
                if (row.incentives.some((inc) => inc.id === rule.id)) return row;
                if (row.incentives.some((inc) => inc.rule_type === rule.rule_type)) {
                    toast.error(`This line already has a ${rule.rule_type.replace('_', ' ')} incentive.`);
                    return row;
                }
                const incentives = [...row.incentives, rule];
                const eff = combineEffects(incentives, toNumber(row.quantity), toNumber(row.trade_price));
                return {
                    ...row,
                    incentives,
                    bonus_quantity: incentives.some((inc) => isBonusType(inc.rule_type))
                        ? String(eff.bonus_qty)
                        : row.bonus_quantity,
                };
            }),
        );
    };

    const removeRule = (rowIndex: number, rule: RuleHit) => {
        if (trackedConversion && (isBonusType(rule.rule_type) || !rule.id)) return;
        setRows((r) =>
            r.map((row, i) => {
                if (i !== rowIndex) return row;
                const incentives = row.incentives.filter((inc) => inc.id !== rule.id);
                const eff = combineEffects(incentives, toNumber(row.quantity), toNumber(row.trade_price));
                let bonus_quantity = row.bonus_quantity;
                if (incentives.some((inc) => isBonusType(inc.rule_type))) bonus_quantity = String(eff.bonus_qty);
                else if (isBonusType(rule.rule_type)) bonus_quantity = '0';
                return { ...row, incentives, bonus_quantity };
            }),
        );
    };

    const payload = () => ({
        ...header,
        invoice_number: header.invoice_number || null,
        customer_id: header.customer_id || null,
        booker_id: header.booker_id || null,
        planned_salesman_id: header.planned_salesman_id || null,
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
                incentive_rule_ids: row.incentives.map((inc) => inc.id).filter(Boolean),
                trade_price: toNumber(row.trade_price),
                discount_percent: toNumber(row.discount_percent),
                gst_percent: toNumber(row.gst_percent),
                remarks: row.remarks || null,
            })),
    });

    const draftVersion = JSON.stringify([header, rows]);
    const draft = useDraftLeave({ version: draftVersion, editable: canSave, saving, save });

    function save(done?: (saved: boolean) => void) {
        if (readonly || saving) {
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
        if (invoice) router.put(route('sales.update', invoice.id), payload(), options);
        else router.post(route('sales.store'), payload(), options);
    }

    const askPost = () => {
        if (!canPost || saving) return;
        if (!validate()) {
            toast.error(ALERT_FIX);
            return;
        }
        setConfirmAction('post');
    };

    const post = () => {
        if (!invoice || !canPost || saving) return;
        setConfirmAction(null);
        setSaving(true);
        router.put(route('sales.update', invoice.id), payload(), {
            preserveScroll: true,
            onSuccess: (page) => {
                if (!draftWasSaved(page.props.flash)) {
                    setSaving(false);
                    return;
                }
                draft.markSaved(draftVersion);
                router.post(route('sales.post', invoice.id), {}, { onError: handleServerErrors, onFinish: () => setSaving(false) });
            },
            onError: (errors) => { handleServerErrors(errors); setSaving(false); },
        });
    };

    const cancel = () => {
        if (!invoice || invoice.status !== 'posted' || !can('sales.cancel') || saving) return;
        setConfirmAction(null);
        setSaving(true);
        router.post(route('sales.cancel', invoice.id), {}, { preserveScroll: true, onFinish: () => setSaving(false) });
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

    const customerOptions = invoice?.customer && !customers.some(c => c.id === invoice.customer_id) ? [...customers, invoice.customer] : customers;
    const selectedCustomer = customerOptions.find(c => String(c.id) === header.customer_id);
    const bookerOptions = invoice?.booker && !bookers.some(b => b.id === invoice.booker_id) ? [...bookers, invoice.booker] : bookers;
    const visibleSaleTypes = [...saleTypes, ...(['booking', 'direct'].includes(header.sale_type) ? [[header.sale_type, header.sale_type === 'booking' ? 'Booking' : 'Direct']] : [])];

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
        // Row fields stay locked until a batch is selected.
        const locked = !readonly && (!rows[rowIndex].batch_id || (trackedConversion && (key === 'quantity' || key === 'bonus_quantity')));
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
                className={className}
            />
        );
    };

    return (
        <AppLayout>
            {draft.dialog}
            <Head title={invoice?.invoice_number ?? 'New Sales Invoice'} />
            <main className="invoice-doc invoice-doc--sales" aria-busy={saving}>
                <div className="master-register invoice-header">
                    <RegisterHeader title={invoice?.invoice_number ?? 'New Sales Invoice'}
                        description={<>
                            <Link className="invoice-back" href={route('sales.index')}><ChevronLeft className="i" aria-hidden="true" />Sales Invoices</Link>
                            <span className={`st ${invoice?.status ?? 'draft'}`}>{invoice?.status ?? 'draft'}</span>
                            {canSave && invoice?.updated_at && draft.canLeaveAfterSave() && <span className="invoice-saved"><Check className="i" aria-hidden="true" />Draft saved {clockPKT.format(new Date(invoice.updated_at))}</span>}
                        </>}
                        actions={(invoice || canSave) && <div className="register-hero-actions" role="group" aria-label="Invoice actions">
                            {invoice && <>
                                <a className="hbtn" href={route('sales.print', invoice.id)} target="_blank" rel="noreferrer"><Printer className="i" aria-hidden="true" />Print</a>
                                {invoice.status === 'posted' && can('sales.cancel') && <button type="button" className="hbtn invoice-cancel" disabled={saving}
                                    onClick={() => setConfirmAction('cancel')}><XCircle className="i" aria-hidden="true" />Cancel Invoice</button>}
                            </>}
                            {canSave && <button type="button" className="hbtn" onClick={() => save()} disabled={saving}><Save className="i" aria-hidden="true" />Save Draft <kbd>F8</kbd></button>}
                            {canPost && <button type="button" className="hbtn pri" onClick={askPost} disabled={saving}><Check className="i" aria-hidden="true" />Post invoice <kbd>Ctrl ↵</kbd></button>}
                        </div>}
                    />
                </div>

                <section data-enter-nav className="invoice-fields" aria-label="Invoice details">
                    <div className="invoice-field invoice-party">
                        <Label htmlFor="sale-customer">Customer <em>*</em></Label>
                        <SearchableSelect
                            id="sale-customer"
                            invalid={!!headerErrors.customer_id}
                            value={header.customer_id}
                            onValueChange={(v) => {
                                setHeader((h) => ({
                                    ...h,
                                    customer_id: v,
                                }));
                                setHeaderErrors((e) => { const n = { ...e }; delete n.customer_id; return n; });
                            }}
                            disabled={readonly}
                            autoFocus={!readonly}
                            placeholder="Select customer"
                            searchPlaceholder="Search customer…"
                            emptyText="No customers found."
                            options={customerOptions.map((customer) => ({
                                value: String(customer.id),
                                label: customer.name + (customer.city ? ` — ${customer.city}` : ''),
                            }))}
                        />
                        {selectedCustomer && toNumber(selectedCustomer.credit_limit) > 0 && <p className="invoice-field-note">Credit limit: {money(selectedCustomer.credit_limit)}</p>}
                        <InputError message={headerErrors.customer_id} className="text-xs" />
                    </div>
                    <div className="invoice-field">
                        <Label htmlFor="sale-booker">Booker / Sales Originator</Label>
                        <SearchableSelect
                            id="sale-booker"
                            invalid={!!headerErrors.booker_id}
                            value={header.booker_id}
                            onValueChange={(v) => setHeader((h) => ({ ...h, booker_id: v }))}
                            disabled={readonly}
                            placeholder="Select booker"
                            searchPlaceholder="Search booker…"
                            emptyText="No bookers found."
                            options={[
                                { value: '', label: '— None —' },
                                ...bookerOptions.map((b) => ({ value: String(b.id), label: b.name })),
                            ]}
                        />
                    </div>
                    <div className="invoice-field">
                        <Label htmlFor="sale-salesman">Planned Salesman</Label>
                        <SearchableSelect id="sale-salesman" value={header.planned_salesman_id} disabled={readonly} invalid={!!headerErrors.planned_salesman_id}
                            onValueChange={v => setHeader(h => ({ ...h, planned_salesman_id: v }))}
                            options={[{ value: '', label: 'Use customer schedule' }, ...salesmen.map(s => ({ value: String(s.id), label: s.name }))]}/>
                    </div>
                    <div className="invoice-field">
                        <Label htmlFor="sale-number">Invoice #</Label>
                        <Input
                            id="sale-number"
                            aria-invalid={!!headerErrors.invoice_number}
                            value={invoice ? invoice.invoice_number : header.invoice_number}
                            disabled={!!invoice || readonly}
                            placeholder="Auto-generated"
                            onChange={(e) => setHeader((h) => ({ ...h, invoice_number: e.target.value }))}
                        />
                    </div>
                    <div className="invoice-field">
                        <Label htmlFor="sale-date">Invoice Date <em>*</em></Label>
                        <Input
                            id="sale-date"
                            aria-invalid={!!headerErrors.invoice_date}
                            type="date" value={header.invoice_date} disabled={readonly}
                            onChange={(e) => setHeader((h) => ({ ...h, invoice_date: e.target.value }))}
                        />
                    </div>
                    <div className="invoice-field">
                        <Label htmlFor="sale-due">Due Date</Label>
                        <Input
                            id="sale-due"
                            aria-invalid={!!headerErrors.due_date}
                            type="date" value={header.due_date} disabled={readonly}
                            onChange={(e) => setHeader((h) => ({ ...h, due_date: e.target.value }))}
                        />
                    </div>
                    <div className="invoice-field invoice-sale-types">
                        <Label id="sale-type-label">Sale Type</Label>
                        <div className="invoice-types" role="group" aria-labelledby="sale-type-label" aria-invalid={!!headerErrors.sale_type}>
                            {visibleSaleTypes.map(([type, label]) => <button key={type} type="button" aria-pressed={header.sale_type === type} disabled={readonly}
                                onClick={() => setHeader(h => ({ ...h, sale_type: type }))}>{label}</button>)}
                        </div>
                    </div>
                    <div className="invoice-field">
                        <Label htmlFor="sale-warehouse">Warehouse</Label>
                        <Input id="sale-warehouse" value={warehouse.name} disabled />
                    </div>
                    <div className="invoice-field invoice-remarks">
                        <Label htmlFor="sale-remarks">Remarks</Label>
                        <Input
                            id="sale-remarks"
                            value={header.notes} disabled={readonly}
                            aria-invalid={!!headerErrors.notes}
                            placeholder="Optional note for this invoice"
                            onChange={(e) => setHeader((h) => ({ ...h, notes: e.target.value }))}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !readonly && header.sale_type !== 'sale_base') {
                                    e.preventDefault();
                                    grid.focusCell(0, 0);
                                }
                            }}
                        />
                    </div>
                    {header.sale_type === 'sale_base' && (
                        <div className="invoice-field invoice-terms">
                            <Label htmlFor="sale-terms">Terms <em>*</em></Label>
                            <Textarea
                                id="sale-terms"
                                rows={2}
                                value={header.sale_terms}
                                disabled={readonly}
                                aria-invalid={!!headerErrors.sale_terms}
                                placeholder="Payment / return terms for this Sale Base invoice — printed on the invoice"
                                onChange={(e) => {
                                    setHeader((h) => ({ ...h, sale_terms: e.target.value }));
                                    setHeaderErrors((er) => { const n = { ...er }; delete n.sale_terms; return n; });
                                }}
                            />
                            <InputError message={headerErrors.sale_terms} className="text-xs" />
                        </div>
                    )}
                </section>

                {invoice && (invoice.status === 'posted' || invoice.posted_at) && <section className="invoice-strip" aria-label="Posted invoice summary">
                    <InvoiceSummaryTile icon={Package} tone="teal" label={invoice.status === 'cancelled' ? 'Stock reversed' : 'Stock issued'} value={stockSummary} />
                    <InvoiceSummaryTile icon={CreditCard} tone="blue" label="Original invoice total" value={totalMoney(invoiceTotal)} />
                    <InvoiceSummaryTile icon={UserRound} tone="blue" label="Customer" value={selectedCustomer?.name ?? '—'} />
                    <InvoiceSummaryTile icon={TrendingUp} tone={profit < 0 ? 'red' : 'green'} label="Original profit" value={`${totalMoney(profit)}${profitPercent ? ` · ${profitPercent}` : ''}`} />
                </section>}

                <section className="invoice-lines" aria-label="Invoice items">
                    <div className="invoice-lines-scroll" tabIndex={0} role="region" aria-label="Scrollable invoice line items">
                    <table className="invoice-table">
                        <thead>
                            <tr>
                                <InvoiceLineNumberHeading onAdd={readonly ? undefined : () => {
                                    setRows(r => [...r, emptyRow()]);
                                    grid.focusCell(rows.length, 0);
                                }} />
                                <th scope="col">Product {!readonly && <kbd>F2</kbd>}</th>
                                <th scope="col" className="w-32">Batch</th>
                                <th scope="col" className="text-right">Stock</th>
                                <th scope="col" className="text-right">Qty</th>
                                <th scope="col" className="text-right">Bonus</th>
                                <th scope="col" className="w-36">Rule {!readonly && <kbd>F4</kbd>}</th>
                                <th scope="col" className="text-right">Price</th>
                                <th scope="col" className="text-right">Disc %</th>
                                <th scope="col" className="text-right">GST %</th>
                                <th scope="col" className="text-right">Net</th>
                                <th scope="col">Remarks</th>
                                <th scope="col"><span className="sr-only">Actions</span></th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((row, rowIndex) => {
                                const requested = toNumber(row.quantity) + toNumber(row.bonus_quantity);
                                const short = row.product_id && row.stock > 0 && requested > row.stock;
                                const stored = readonly ? invoice?.items[rowIndex] : undefined;
                                return (
                                    <tr key={rowIndex} data-issue={!!rowErrors[rowIndex]}>
                                        <td className="invoice-line-no">{rowIndex + 1}</td>
                                        <td
                                            className="invoice-product"
                                            data-invalid={!!rowErrors[rowIndex]?.product_id}
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
                                            data-invalid={!!rowErrors[rowIndex]?.batch_id}
                                            title={rowErrors[rowIndex]?.batch_id}
                                        >
                                            {readonly ? <span className="invoice-cell-value">{row.batch_fallback?.batch_number ?? '—'}</span> : <BatchSelectCell
                                                productId={row.product_id}
                                                warehouseId={warehouse.id}
                                                value={row.batch_id}
                                                disabled={readonly}
                                                invalid={!!rowErrors[rowIndex]?.batch_id}
                                                fallback={row.batch_fallback}
                                                registerRef={grid.registerCell(rowIndex, 1)}
                                                onKeyDown={(e) => grid.handleKeyDown(e, rowIndex, 1)}
                                                onSelect={(id, qtyAvailable, tradePrice) => {
                                                    const dup = rows.findIndex((r, i) => i !== rowIndex && r.product_id === row.product_id && r.batch_id === id);
                                                    if (dup !== -1) {
                                                        setRowError(rowIndex, 'batch_id', `This product + batch is already on line ${dup + 1}.`);
                                                        return;
                                                    }
                                                    setRowError(rowIndex, 'batch_id', null);
                                                    setRows((r) => r.map((rw, i) => (i === rowIndex ? { ...rw, batch_id: id, stock: qtyAvailable, trade_price: tradePrice > 0 ? dec2(tradePrice) : rw.trade_price } : rw)));
                                                    grid.focusCell(rowIndex, 2); // proceed to Qty
                                                }}
                                            />}
                                        </td>
                                        <td className={`invoice-calc ${!readonly && short ? 'font-semibold text-destructive' : ''}`}>
                                            {readonly ? <span className="invoice-muted">—</span> : row.product_id ? fmtQty(row.stock) : ''}
                                        </td>
                                        <td>{cellInput(rowIndex, 2, 'quantity', 'number', 'text-right')}</td>
                                        <td>{cellInput(rowIndex, 3, 'bonus_quantity', 'number', 'text-right')}</td>
                                        <td>
                                            <div className="invoice-rule">
                                                {row.incentives.map((inc) => (
                                                    <Badge key={inc.id} variant="outline" className="max-w-full gap-1 pr-1">
                                                        <span className="truncate">{inc.name}</span>
                                                        {!readonly && !(trackedConversion && (isBonusType(inc.rule_type) || !inc.id)) && (
                                                            <button
                                                                type="button"
                                                                tabIndex={-1}
                                                                aria-label={`Remove ${inc.name}`}
                                                                onClick={() => removeRule(rowIndex, inc)}
                                                                className="rounded-sm hover:text-destructive"
                                                            >
                                                                <X className="size-3" />
                                                            </button>
                                                        )}
                                                    </Badge>
                                                ))}
                                                {!readonly && <button
                                                    type="button"
                                                    ref={grid.registerCell(rowIndex, 4) as never}
                                                    disabled={!row.batch_id}
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
                                                    className="invoice-rule-add"
                                                >
                                                    {row.incentives.length ? '+ add' : 'Add rule'}
                                                </button>}
                                            </div>
                                        </td>
                                        <td>{cellInput(rowIndex, 5, 'trade_price', 'number', 'text-right')}</td>
                                        <td>
                                            {row.incentives.some((inc) => isDiscountType(inc.rule_type)) ? (
                                                // A discount incentive drives the line discount; the cell shows
                                                // the effective combined percent (read-only) instead of the manual %.
                                                <Input
                                                    ref={grid.registerCell(rowIndex, 6) as never}
                                                    type="text"
                                                    readOnly
                                                    tabIndex={0}
                                                    value={dec2(effectiveDiscountPercent(stored ? toNumber(stored.trade_price) * toNumber(stored.quantity) : computed[rowIndex].gross,
                                                        toNumber(stored?.discount_amount ?? computed[rowIndex].discount_amount)))}
                                                    title="Effective discount from applied incentive(s). Remove the incentive to edit manually."
                                                    onKeyDown={(e) => grid.handleKeyDown(e, rowIndex, 6)}
                                                    className="invoice-rule-discount text-right"
                                                />
                                            ) : (
                                                cellInput(rowIndex, 6, 'discount_percent', 'number', 'text-right')
                                            )}
                                        </td>
                                        <td>{cellInput(rowIndex, 7, 'gst_percent', 'number', 'text-right')}</td>
                                        <td className="invoice-calc"><b data-empty={!row.product_id}>{amount(stored?.net_amount ?? computed[rowIndex].net_amount)}</b></td>
                                        <td>{cellInput(rowIndex, 8, 'remarks')}</td>
                                        <td className="invoice-line-action">
                                            {!readonly && (
                                                <button type="button" tabIndex={-1} aria-label={`Remove line ${rowIndex + 1}`} onClick={() => removeRow(rowIndex)}>
                                                    <Trash2 aria-hidden="true" />
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                    </div>
                </section>

                {!readonly && (Object.keys(headerErrors).length > 0 || Object.keys(rowErrors).length > 0) && <div className="invoice-issues" role="alert">
                    <b>Check these fields</b><ul>
                        {Object.entries(headerErrors).map(([key, message]) => <li key={key}>{message}</li>)}
                        {Object.entries(rowErrors).flatMap(([index, errors]) => Object.entries(errors).map(([key, message]) => {
                            const col = gridColumns.indexOf(key);
                            return <li key={`${index}-${key}`}>{col < 0 ? `Line ${Number(index) + 1}: ${message}` : <button type="button"
                                onClick={() => grid.focusCell(Number(index), col)}>Line {Number(index) + 1}: {message}</button>}</li>;
                        }))}
                    </ul>
                </div>}

                <section className="invoice-totals" aria-label="Invoice totals">
                    <div className="invoice-total-part"><span>Subtotal</span><b>{amount(displayTotals.subtotal)}</b></div>
                    {(['discount_percent', 'gst_percent'] as const).map(key => {
                        const discount = key === 'discount_percent';
                        const adjustment = discount ? toNumber(displayTotals.discount_amount) + toNumber(displayTotals.item_discount_total) : toNumber(displayTotals.gst_amount) + toNumber(displayTotals.item_gst_total);
                        const name = discount ? 'Discount' : 'GST';
                        return <label className="invoice-total-part" key={key}><span>{name}</span><span className="invoice-percent">
                            <input aria-label={`Invoice ${name.toLowerCase()} %`} aria-invalid={!!headerErrors[key]} type="number" min="0" max="100" step="0.01"
                                value={header[key]} disabled={readonly} onChange={e => setHeader(h => ({ ...h, [key]: e.target.value }))}
                                onBlur={e => setHeader(h => ({ ...h, [key]: dec2(e.target.value) || '0.00' }))} />
                            <i aria-hidden="true">%</i></span><b data-empty={adjustment === 0}>{discount ? '−' : '+'}{amount(adjustment)}</b></label>;
                    })}
                    <div className="invoice-total-part"><span>Items</span><b className="invoice-muted">{filledRows.length} · {fmtQty(units)} units</b></div>
                    {invoice?.status === 'posted' && <div className="invoice-margin-total" data-loss={profit < 0}><span>Profit</span><b>{totalAmount(profit)}</b>{profitPercent && <small>{profitPercent}</small>}</div>}
                    {rounding !== 0 && <div className="invoice-total-part"><span>Rounding</span><b>{amount(rounding)}</b></div>}
                    <div className="invoice-grand"><span>Total</span><b>{totalMoney(invoiceTotal)}</b></div>
                </section>
            </main>

            <Dialog open={confirmAction !== null} onOpenChange={open => { if (!open) setConfirmAction(null); }}>
                <DialogContent appearance="form" className="invoice-dialog max-w-md">
                    <DialogHeader>
                        <DialogTitle>{confirmAction === 'cancel' ? `Cancel ${invoice?.invoice_number}?` : 'Post this sales invoice?'}</DialogTitle>
                        <DialogDescription>{confirmAction === 'cancel'
                            ? 'Cancelling reverses the invoice’s stock and ledger entries. This can’t be undone.'
                            : 'Posting updates stock and the customer ledger. A posted invoice can’t be edited.'}</DialogDescription>
                    </DialogHeader>
                    {confirmAction === 'post' && <DialogBody><dl className="invoice-dialog-details">
                        <div><dt>Customer</dt><dd>{selectedCustomer?.name}</dd></div>
                        <div><dt>Stock from {warehouse.name.toLowerCase()}</dt><dd>{stockSummary}</dd></div>
                        <div><dt>Invoice total</dt><dd>{totalMoney(invoiceTotal)}</dd></div>
                        <div><dt>Due</dt><dd>{header.due_date ? shortDate(header.due_date) : 'No due date'}</dd></div>
                    </dl></DialogBody>}
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setConfirmAction(null)}>{confirmAction === 'cancel' ? 'Keep invoice' : 'Back'}</Button>
                        <Button variant={confirmAction === 'cancel' ? 'destructive' : 'default'} disabled={saving}
                            onClick={confirmAction === 'cancel' ? cancel : post}>{confirmAction === 'cancel' ? 'Cancel invoice' : 'Post invoice'}</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <RulePickerDialog
                open={ruleOpen}
                onOpenChange={setRuleOpen}
                productId={rows[activeRow]?.product_id ?? null}
                customerId={header.customer_id ? Number(header.customer_id) : null}
                qty={toNumber(rows[activeRow]?.quantity)}
                price={toNumber(rows[activeRow]?.trade_price)}
                date={header.invoice_date}
                applied={rows[activeRow]?.incentives ?? []}
                bonusLocked={trackedConversion}
                onAdd={(rule) => addRule(activeRow, rule)}
                onRemove={(rule) => removeRule(activeRow, rule)}
            />
        </AppLayout>
    );
}
