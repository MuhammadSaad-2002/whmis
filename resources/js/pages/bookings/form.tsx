import InputError from '@/components/input-error';
import { BookingActivity, type BookingTimestamps } from '@/components/booking-timestamps';
import { ProductSearchCell, type ProductHit } from '@/components/product-search-cell';
import { ProductSearchDialog } from '@/components/product-search-dialog';
import { RulePickerDialog, type RuleHit } from '@/components/rule-picker-dialog';
import { SearchableSelect } from '@/components/searchable-select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useInvoiceHotkeys, useKeyboardGrid } from '@/hooks/use-keyboard-grid';
import { useIsMobile } from '@/hooks/use-mobile';
import { usePermissions } from '@/hooks/use-permissions';
import { draftWasSaved, useDraftLeave } from '@/hooks/use-draft-leave';
import AppLayout from '@/layouts/app-layout';
import type { VisitOptions } from '@inertiajs/core';
import { amount, dec2, money, qty, toNumber } from '@/lib/format';
import { ALERT_FIX, splitItemErrors } from '@/lib/form-validation';
import { combineEffects } from '@/lib/incentive';
import { computeLine, computeTotals, effectiveDiscountPercent } from '@/lib/invoice-math';
import { type BreadcrumbItem } from '@/types';
import { Head, Link, router } from '@inertiajs/react';
import { ArrowRight, Check, ChevronDown, ChevronsUpDown, MoreHorizontal, Plus, Save, Search, Send, Trash2, X, XCircle } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

interface ItemRow {
    product_id: number | null;
    product_name: string;
    quantity: string;
    requested_bonus: string;
    incentives: RuleHit[]; // stacked incentive rules (≤1 per rule_type)
    trade_price: string;
    discount_percent: string;
    gst_percent: string;
    remarks: string;
    // Display-only (from the product picker or saved booking payload): supplier, live stock, retail price.
    // Helps the booker take the order; never sent back / recomputed on the server.
    retail_price: string;
    company?: string | null;
    stock: number;
}

interface BookingDto extends BookingTimestamps {
    id: number;
    booking_number: string;
    customer_id: number;
    warehouse_id: number;
    booking_date: string;
    status: string;
    notes: string | null;
    total_amount: string;
    sales_invoice_id: number | null;
    customer?: { id: number; name: string; city: string | null };
    booker?: { id: number; name: string };
    approver?: { id: number; name: string } | null;
    items: {
        product_id: number;
        product?: { id: number; name: string; company?: { id: number; name: string } | null; retail_price: string | number; stock: string | number | null };
        quantity: string;
        requested_bonus: string;
        trade_price: string;
        discount_percent: string;
        gst_percent: string;
        remarks: string | null;
        incentives?: {
            incentive_rule_id: number | null;
            rule_type: string;
            rule_name: string;
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

interface Props {
    bookingPrefill?: { customer_id: number; items: ItemRow[]; source: string | null; skipped: string[]; hidden_count?: number } | null;
    customers: { id: number; name: string; city: string | null }[];
    warehouse: { id: number; name: string };
    // Present only for approvers/admin (who may credit a booking to a booker);
    // null for field bookers, who are always booked as themselves.
    bookers?: { id: number; name: string }[] | null;
    booking: BookingDto | null;
}

const emptyRow = (): ItemRow => ({
    product_id: null, product_name: '', quantity: '1', requested_bonus: '0',
    incentives: [], trade_price: '',
    discount_percent: '0.00', gst_percent: '0.00', remarks: '',
    retail_price: '', company: null, stock: 0,
});

/** Rebuild the stacked RuleHit list from a saved booking item's incentive rows. */
const hydrateIncentives = (item: BookingDto['items'][number]): RuleHit[] =>
    (item.incentives ?? []).map((inc) => {
        const rule = inc.rule;
        return {
            id: inc.incentive_rule_id ?? rule?.id ?? 0,
            name: inc.rule_name,
            rule_type: inc.rule_type,
            base_qty: rule ? Number(rule.base_qty) : undefined,
            bonus_qty: rule ? Number(rule.bonus_qty) : undefined,
            slabs: rule?.slabs ?? undefined,
            value: rule ? Number(rule.value) : undefined,
            summary: '',
            scope: '',
            effect: {},
        } satisfies RuleHit;
    });

const isBonusType = (t: string) => t === 'qty_bonus' || t === 'slab_bonus';
const isDiscountType = (t: string) => t === 'percent_discount' || t === 'fixed_discount';

// Keyboard columns: 0 product, 1 qty, 2 bonus, 3 rule, 4 price, 5 disc, 6 gst, 7 remarks
const COL_COUNT = 8;

// Enter walks product → qty → bonus → price → disc% → next row.
// Rule (F4), GST %, and remarks stay Tab-reachable.
const ENTER_ORDER = [0, 1, 2, 4, 5];

const statusVariant = (status: string) =>
    status === 'approved' || status === 'converted' ? 'default'
        : status === 'rejected' || status === 'cancelled' ? 'destructive' : 'secondary';

export default function BookingForm({ customers, warehouse, bookers, booking, bookingPrefill }: Props) {
    const { can, canViewSupplierDetails } = usePermissions();
    const showAdminDetails = can('bookings.approve');
    const showSupplier = showAdminDetails && canViewSupplierDetails;
    const isMobile = useIsMobile(1024);
    const isDraft = !booking || booking.status === 'draft';
    const readonly = !isDraft || !can('bookings.create');

    const [header, setHeader] = useState({
        customer_id: booking ? String(booking.customer_id) : bookingPrefill ? String(bookingPrefill.customer_id) : '',
        booker_id: booking?.booker?.id ? String(booking.booker.id) : '',
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
                  incentives: hydrateIncentives(item),
                  trade_price: dec2(item.trade_price),
                  discount_percent: dec2(item.discount_percent),
                  gst_percent: dec2(item.gst_percent),
                  remarks: item.remarks ?? '',
                  retail_price: item.product ? dec2(item.product.retail_price) : '',
                  company: item.product?.company?.name ?? null,
                  stock: Number(item.product?.stock ?? 0),
              }))
            : bookingPrefill?.items.length ? bookingPrefill.items : [emptyRow()],
    );

    const [ruleOpen, setRuleOpen] = useState(false);
    const [productRow, setProductRow] = useState<number | null>(null);
    const [activeRow, setActiveRow] = useState(0); // rule picker context
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

    const ringClass = (row: number, key: keyof ItemRow) =>
        rowErrors[row]?.[key] ? 'bg-destructive/10 ring-1 ring-destructive' : '';

    // Source-row indices that survive payload()'s filter, so a server `items.N`
    // error maps back to the row on screen.
    const includedRowIndexes = () =>
        rows.map((_, i) => i).filter((i) => rows[i].product_id && toNumber(rows[i].quantity) > 0);

    const validate = (): boolean => {
        const h: Record<string, string> = {};
        const r: Record<number, Record<string, string>> = {};
        if (!header.customer_id) h.customer_id = 'Customer is required.';
        if (!rows.some((row) => row.product_id)) {
            r[0] = { product_id: 'Add at least one product.' };
        }
        rows.forEach((row, i) => {
            if (!row.product_id) return;
            const rowErr: Record<string, string> = {};
            (['quantity', 'discount_percent', 'gst_percent', 'trade_price'] as (keyof ItemRow)[]).forEach((key) => {
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
        if (!isMobile) toast.error(ALERT_FIX);
    };

    const computed = useMemo(
        () =>
            rows.map((row) => {
                const eff = combineEffects(row.incentives, toNumber(row.quantity), toNumber(row.trade_price));
                return computeLine(
                    {
                        quantity: row.quantity,
                        rate: eff.trade_price,
                        discount_percent: row.discount_percent,
                        incentive_discount: eff.incentive_discount,
                        gst_percent: row.gst_percent,
                    },
                    false,
                );
            }),
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
        setRows((r) =>
            r.map((row, i) => {
                if (i !== rowIndex) return row;
                const next = { ...row, [key]: value };
                // Stacked qty/slab bonus rules recompute their bonus live as qty changes.
                if (key === 'quantity' && next.incentives.some((inc) => isBonusType(inc.rule_type))) {
                    const eff = combineEffects(next.incentives, toNumber(value), toNumber(next.trade_price));
                    next.requested_bonus = String(eff.bonus_qty);
                }
                return next;
            }),
        );
    };

    const applyProduct = (rowIndex: number, product: ProductHit) => {
        const dup = rows.findIndex((r, i) => i !== rowIndex && r.product_id === product.id);
        if (dup !== -1) {
            toast.error(`${product.name} is already on line ${dup + 1} — change the quantity there instead.`);
            return;
        }
        setRows((r) =>
            (rowIndex === r.length ? [...r, emptyRow()] : r).map((row, i) =>
                i === rowIndex
                    ? {
                          ...row,
                          product_id: product.id,
                          product_name: product.name,
                          incentives: [],
                          trade_price: dec2(product.trade_price),
                          gst_percent: dec2(product.tax_percent ?? 0),
                          discount_percent: dec2(product.default_discount_percent ?? 0),
                          retail_price: dec2(product.retail_price),
                          company: product.company,
                          stock: product.stock,
                      }
                    : row,
            ),
        );
        setRowError(rowIndex, 'product_id', null);
        grid.focusCell(rowIndex, 1);
    };

    // Stack a rule on a line. At most one per rule_type; a bonus rule (re)derives
    // the line's bonus qty. Discount/price effects are shown live via combineEffects
    // and recomputed authoritatively by the server on save — trade_price stays the
    // base price so a price_override can be removed without losing it.
    const addRule = (rowIndex: number, rule: RuleHit) => {
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
                    requested_bonus: incentives.some((inc) => isBonusType(inc.rule_type))
                        ? String(eff.bonus_qty)
                        : row.requested_bonus,
                };
            }),
        );
    };

    const removeRule = (rowIndex: number, rule: RuleHit) => {
        setRows((r) =>
            r.map((row, i) => {
                if (i !== rowIndex) return row;
                const incentives = row.incentives.filter((inc) => inc.id !== rule.id);
                const eff = combineEffects(incentives, toNumber(row.quantity), toNumber(row.trade_price));
                let requested_bonus = row.requested_bonus;
                if (incentives.some((inc) => isBonusType(inc.rule_type))) requested_bonus = String(eff.bonus_qty);
                else if (isBonusType(rule.rule_type)) requested_bonus = '0';
                return { ...row, incentives, requested_bonus };
            }),
        );
    };

    const removeRow = (index: number) => {
        setRows((r) => (r.length === 1 ? [emptyRow()] : r.filter((_, i) => i !== index)));
    };

    const payload = () => ({
        ...header,
        customer_id: header.customer_id || null,
        booker_id: header.booker_id || null,
        warehouse_id: warehouse.id,
        items: rows
            .filter((row) => row.product_id && toNumber(row.quantity) > 0)
            .map((row) => ({
                product_id: row.product_id,
                quantity: toNumber(row.quantity),
                requested_bonus: toNumber(row.requested_bonus),
                incentive_rule_ids: row.incentives.map((inc) => inc.id),
                trade_price: toNumber(row.trade_price),
                discount_percent: toNumber(row.discount_percent),
                gst_percent: toNumber(row.gst_percent),
                remarks: row.remarks || null,
            })),
    });

    const draftVersion = JSON.stringify([header, rows]);
    const draft = useDraftLeave({ version: draftVersion, editable: !readonly && can('bookings.create'), saving, save });

    function save(done?: (saved: boolean) => void) {
        if (readonly || saving) {
            done?.(false);
            return;
        }
        if (!validate()) {
            if (!isMobile) toast.error(ALERT_FIX);
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
        if (booking) router.put(route('bookings.update', booking.id), payload(), options);
        else router.post(route('bookings.store'), payload(), options);
    }

    const submit = () => {
        if (!booking || readonly || saving) return;
        if (!validate()) {
            if (!isMobile) toast.error(ALERT_FIX);
            return;
        }
        setSaving(true);
        router.put(route('bookings.update', booking.id), payload(), {
            preserveScroll: true,
            onSuccess: (page) => {
                if (!draftWasSaved(page.props.flash)) {
                    setSaving(false);
                    return;
                }
                draft.markSaved(draftVersion);
                router.post(route('bookings.submit', booking.id), {}, { onError: handleServerErrors, onFinish: () => setSaving(false) });
            },
            onError: (errors) => { handleServerErrors(errors); setSaving(false); },
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
    const prefilledCustomerName = customers.find((customer) => customer.id === bookingPrefill?.customer_id)?.name;
    const tabTitle = booking?.booking_number ?? (bookingPrefill?.source
        ? `Repeat ${bookingPrefill.source}`
        : prefilledCustomerName ? `New Booking · ${prefilledCustomerName}` : 'New Booking');
    const selectedCustomer = customers.find((customer) => String(customer.id) === header.customer_id) ?? booking?.customer;
    const cancelBooking = () => {
        if (booking && confirm('Cancel this booking?')) router.post(route('bookings.cancel', booking.id));
    };
    const canCancel = booking && !['converted', 'cancelled'].includes(booking.status);
    const mobileActionClass = 'h-11 flex-1 min-w-0 px-2';
    const hasMobileErrors = isMobile && (Object.keys(headerErrors).length > 0 || Object.keys(rowErrors).length > 0);
    const actions = (mobile: boolean) => (
        <>
            {booking?.status === 'converted' && booking.sales_invoice_id && can('sales.view') && (
                <Button variant="outline" size="sm" className={mobile ? mobileActionClass : undefined} asChild>
                    <Link href={route('sales.edit', booking.sales_invoice_id)}><ArrowRight aria-hidden="true" /> View Invoice</Link>
                </Button>
            )}
            {booking?.status === 'pending' && can('bookings.approve') && (
                <>
                    <Button size="sm" className={mobile ? mobileActionClass : undefined} onClick={() => router.post(route('bookings.approve', booking.id))}><Check aria-hidden="true" /> Approve</Button>
                    <Button variant="outline" size="sm" className={mobile ? mobileActionClass : undefined}
                        onClick={() => { if (confirm('Reject this booking?')) router.post(route('bookings.reject', booking.id)); }}>
                        <X aria-hidden="true" className="text-destructive" /> Reject
                    </Button>
                </>
            )}
            {booking?.status === 'approved' && can('bookings.convert') && (
                <Button size="sm" className={mobile ? mobileActionClass : undefined} onClick={() => router.post(route('bookings.convert', booking.id))}>
                    <ArrowRight aria-hidden="true" /> Convert to Sale
                </Button>
            )}
            {!mobile && canCancel && <Button variant="outline" size="sm" onClick={cancelBooking}><XCircle aria-hidden="true" className="text-destructive" /> Cancel</Button>}
            {!readonly && (
                <>
                    <Button variant={mobile && !booking ? 'default' : 'outline'} size="sm" className={mobile ? mobileActionClass : undefined} onClick={() => save()} disabled={saving}>
                        <Save aria-hidden="true" /> Save Draft {!mobile && <kbd className="ml-1 text-xs opacity-60">F8</kbd>}
                    </Button>
                    {booking && <Button size="sm" className={mobile ? mobileActionClass : undefined} onClick={submit} disabled={saving}>
                        <Send aria-hidden="true" /> Submit {!mobile && <kbd className="ml-1 text-xs opacity-60">F9</kbd>}
                    </Button>}
                </>
            )}
        </>
    );
    const additionalFields = (
        <>
            {bookers && <div>
                <Label htmlFor="booking-booker">Booker</Label>
                <SearchableSelect id="booking-booker" value={header.booker_id}
                    onValueChange={(v) => setHeader((h) => ({ ...h, booker_id: v }))}
                    disabled={readonly} touch={isMobile} placeholder="Select booker" searchPlaceholder="Search booker…" emptyText="No bookers found."
                    options={[{ value: '', label: '— None —' }, ...bookers.map((b) => ({ value: String(b.id), label: b.name }))]} />
            </div>}
            {showAdminDetails && <>
                <div>
                    <Label htmlFor="booking-date">Booking Date *</Label>
                    <Input id="booking-date" type="date" value={header.booking_date} disabled={readonly}
                        onChange={(e) => setHeader((h) => ({ ...h, booking_date: e.target.value }))}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !readonly && !isMobile) {
                                e.preventDefault();
                                grid.focusCell(0, 0);
                            }
                        }} />
                </div>
                <div>
                    <Label htmlFor="booking-warehouse">Warehouse</Label>
                    <Input id="booking-warehouse" value={warehouse.name} disabled />
                </div>
            </>}
            {!readonly && <div className="sm:col-span-2 xl:col-span-1">
                <Label htmlFor="booking-remarks">Remarks</Label>
                <Input id="booking-remarks" value={header.notes} placeholder="Optional note for this booking" onChange={(e) => setHeader((h) => ({ ...h, notes: e.target.value }))} />
            </div>}
            {readonly && header.notes && <div className="sm:col-span-2 xl:col-span-1">
                <p className="text-xs text-muted-foreground">Remarks</p>
                <p className="break-words text-sm">{header.notes}</p>
            </div>}
            {booking?.approver && <div>
                <Label htmlFor="booking-approver">{booking.status === 'rejected' ? 'Rejected by' : 'Approved by'}</Label>
                <Input id="booking-approver" value={booking.approver.name} disabled />
            </div>}
        </>
    );
    const hasAdditionalFields = !readonly || !!header.notes || !!bookers || showAdminDetails || !!booking?.approver;

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            {draft.dialog}
            <Head title={tabTitle} />
            <div className="flex min-h-dvh min-w-0 flex-col gap-3 p-3 md:gap-4 md:p-4 lg:min-h-full">
                <header className="flex min-w-0 items-start justify-between gap-2 lg:flex-wrap lg:items-center lg:border-b lg:pb-4">
                    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1 md:gap-x-3">
                        <h1 className="min-w-0 break-words text-xl font-bold tracking-tight sm:text-3xl md:text-4xl">
                            {booking ? <><span className="sr-only lg:not-sr-only">Booking </span>{booking.booking_number}</> : 'New Booking'}
                        </h1>
                        {booking && <Badge variant={statusVariant(booking.status)} className="capitalize">{booking.status === 'pending' ? 'Pending approval' : booking.status}</Badge>}
                        {booking?.booker && <span className="hidden text-sm text-muted-foreground lg:inline">by {booking.booker.name}</span>}
                    </div>
                    <div className="hidden flex-wrap gap-2 lg:flex">{actions(false)}</div>
                    {canCancel && <DropdownMenu>
                        <DropdownMenuTrigger asChild><Button type="button" variant="outline" size="icon" aria-label="Booking options" className="size-11 shrink-0 lg:hidden"><MoreHorizontal aria-hidden="true" /></Button></DropdownMenuTrigger>
                        <DropdownMenuContent align="end"><DropdownMenuItem className="min-h-11 text-destructive" onSelect={cancelBooking}><XCircle aria-hidden="true" /> Cancel booking</DropdownMenuItem></DropdownMenuContent>
                    </DropdownMenu>}
                </header>

                {customers.length === 0 && !readonly && <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100">
                    {can('bookings.approve') ? 'No active customers are available. Add or activate a customer in Customers first.' : 'No active customers are assigned to your login. Ask your administrator to open Employees → your profile → Assign Customers. Then reopen New Booking.'}
                </div>}
                {booking && !isMobile && <BookingActivity booking={booking} />}
                {bookingPrefill?.source && <div className="rounded-lg border bg-muted/40 p-3 text-sm">
                    Repeating quantities from {bookingPrefill.source}. Current catalogue prices apply; review bonus quantities, discounts and incentive rules before saving.
                    {bookingPrefill.skipped.length > 0 && <p className="mt-1 text-destructive">Unavailable products omitted: {bookingPrefill.skipped.join(', ')}.</p>}
                    {!!bookingPrefill.hidden_count && <p className="mt-1 text-destructive">
                        {bookingPrefill.hidden_count === 1
                            ? 'One product is no longer available to Bookers and was omitted.'
                            : `${bookingPrefill.hidden_count} products are no longer available to Bookers and were omitted.`}
                    </p>}
                </div>}
                <div
                    data-enter-nav={isMobile ? undefined : ''}
                    className="grid grid-cols-1 gap-2.5 rounded-xl border bg-card p-3 [&>div]:min-w-0 [&>div>label]:mb-1 [&>div>label]:block lg:grid-cols-4 lg:gap-3 lg:p-2.5 xl:grid-cols-5 xl:gap-x-2 xl:gap-y-1.5 xl:[&>div>button]:h-8 xl:[&>div>input]:h-8 xl:[&>div>label]:whitespace-nowrap xl:[&>div>label]:text-[11px]"
                >
                    <div>
                        {readonly && isMobile ? <>
                            <p className="text-xs font-medium text-muted-foreground">Customer</p>
                            <p className="mt-0.5 break-words text-sm font-semibold">{selectedCustomer?.name ?? 'Customer not recorded'}</p>
                            {selectedCustomer?.city && <p className="break-words text-xs text-muted-foreground">{selectedCustomer.city}</p>}
                        </> : <>
                        <Label htmlFor="booking-customer">Customer *</Label>
                        <SearchableSelect
                            id="booking-customer"
                            value={header.customer_id}
                            onValueChange={(v) => {
                                setHeader((h) => ({ ...h, customer_id: v }));
                                setHeaderErrors((e) => { const n = { ...e }; delete n.customer_id; return n; });
                            }}
                            disabled={readonly}
                            touch={isMobile}
                            autoFocus={!readonly && !isMobile}
                            className="h-11 lg:h-10"
                            placeholder="Select customer"
                            searchPlaceholder="Search customer…"
                            emptyText="No customers found."
                            options={customers.map((customer) => ({
                                value: String(customer.id),
                                label: customer.name + (customer.city ? ` — ${customer.city}` : ''),
                            }))}
                        />
                        <InputError message={headerErrors.customer_id} className="mt-1 text-xs" />
                        </>}
                    </div>
                    {isMobile ? hasAdditionalFields && <details className="group rounded-lg bg-muted/50">
                        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-2.5 text-xs font-medium [&::-webkit-details-marker]:hidden">
                            <span>{showAdminDetails ? 'Booking details' : readonly ? 'Booking details' : 'Booking remarks'}{header.notes && !readonly && ' · Note added'}</span>
                            <ChevronDown aria-hidden="true" className="size-4 shrink-0 group-open:rotate-180" />
                        </summary>
                        <div className="grid min-w-0 gap-2.5 px-2.5 pb-2.5 [&_input]:h-11 [&_label]:mb-1 [&_label]:block">
                            {additionalFields}
                            {booking?.booker && !bookers && showAdminDetails && <p className="text-xs text-muted-foreground">Booked by {booking.booker.name}</p>}
                        </div>
                    </details> : additionalFields}
                </div>

                <div className={isMobile ? '' : 'rounded-xl border'}>
                    {isMobile && (
                        <div className="space-y-3">
                            <h2 className="px-0.5 text-base font-semibold">Products</h2>
                            {readonly && !rows.some((row) => row.product_id) && <p className="text-sm text-muted-foreground">No products recorded.</p>}
                            {rows.map((row, rowIndex) => {
                                if (readonly && !row.product_id) return null;
                                const line = computed[rowIndex];
                                const hasDiscountIncentive = row.incentives.some((inc) => isDiscountType(inc.rule_type));
                                return (
                                    <article key={rowIndex} className="min-w-0 space-y-2.5 rounded-xl border bg-card p-3 shadow-xs [&_input]:min-w-0 [&_input]:text-base [&_label]:mb-1 [&_label]:block">
                                        <div>
                                            <div className="flex min-w-0 items-start gap-1.5">
                                                {readonly ? (
                                                    <h3 className="min-w-0 flex-1 break-words text-sm font-semibold">{row.product_name || 'No product recorded'}</h3>
                                                ) : (
                                                    <Button type="button" variant="outline"
                                                        aria-label={row.product_name ? `Change product ${rowIndex + 1}: ${row.product_name}` : `Select product ${rowIndex + 1}`}
                                                        aria-invalid={!!rowErrors[rowIndex]?.product_id}
                                                        onClick={() => setProductRow(rowIndex)}
                                                        className="h-auto min-h-11 min-w-0 flex-1 justify-between gap-2 px-2.5 text-left whitespace-normal aria-invalid:border-destructive">
                                                        <span className="min-w-0 break-words">{row.product_name || 'Select a product'}</span>
                                                        {row.product_name ? <ChevronsUpDown aria-hidden="true" /> : <Search aria-hidden="true" />}
                                                    </Button>
                                                )}
                                                {!readonly && (row.product_id || rows.length > 1) && <Button type="button" variant="ghost" size="icon" aria-label={`Remove item ${rowIndex + 1}`}
                                                    onClick={() => removeRow(rowIndex)} className="size-11 shrink-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
                                                    <Trash2 aria-hidden="true" />
                                                </Button>}
                                            </div>
                                            {rowErrors[rowIndex]?.product_id && (
                                                <p className="mt-1 text-xs text-destructive">{rowErrors[rowIndex].product_id}</p>
                                            )}
                                            {row.product_id && (
                                                <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                                                    {showSupplier && <span className="break-words">{row.company ?? '—'}</span>}
                                                    <span className={`rounded bg-muted px-1.5 py-0.5 ${row.stock <= 0 ? 'text-destructive' : ''}`}>Stock {qty(row.stock)}</span>
                                                    {row.retail_price && <span>Retail {amount(row.retail_price)}</span>}
                                                </div>
                                            )}
                                        </div>

                                        {row.product_id && <>
                                        {readonly ? <dl className="grid grid-cols-3 gap-2 rounded-lg bg-muted/50 px-2.5 py-2 text-sm tabular-nums">
                                            <div><dt className="text-xs text-muted-foreground">Qty</dt><dd className="font-medium">{qty(row.quantity)}</dd></div>
                                            <div><dt className="text-xs text-muted-foreground">Bonus</dt><dd className="font-medium">{qty(row.requested_bonus)}</dd></div>
                                            <div className="text-right"><dt className="text-xs text-muted-foreground">Unit price</dt><dd className="break-words font-medium">{amount(row.trade_price)}</dd></div>
                                        </dl> : <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.4fr)] gap-2 [&_input]:h-11 [&_input]:px-2">
                                            <div>
                                                <Label htmlFor={`qty-${rowIndex}`} className="text-xs text-muted-foreground">Qty</Label>
                                                <Input
                                                    id={`qty-${rowIndex}`}
                                                    type="number" min={1} inputMode="numeric" value={row.quantity} disabled={readonly}
                                                    aria-invalid={!!rowErrors[rowIndex]?.quantity}
                                                    onChange={(e) => { setCell(rowIndex, 'quantity', e.target.value); if (rowErrors[rowIndex]?.quantity) setRowError(rowIndex, 'quantity', null); }}
                                                    onBlur={(e) => {
                                                        const v = String(Math.max(1, toNumber(e.target.value)));
                                                        setCell(rowIndex, 'quantity', v);
                                                        if (row.product_id) setRowError(rowIndex, 'quantity', cellRule('quantity', v));
                                                    }}
                                                    className={`text-right ${rowErrors[rowIndex]?.quantity ? 'border-destructive' : ''}`}
                                                />
                                            </div>
                                            <div>
                                                <Label htmlFor={`bonus-${rowIndex}`} className="text-xs text-muted-foreground">Bonus</Label>
                                                <Input
                                                    id={`bonus-${rowIndex}`}
                                                    type="number" inputMode="numeric" value={row.requested_bonus} disabled={readonly}
                                                    onChange={(e) => setCell(rowIndex, 'requested_bonus', e.target.value)}
                                                    className="text-right"
                                                />
                                            </div>
                                            <div>
                                                <Label htmlFor={`price-${rowIndex}`} className="text-xs text-muted-foreground">Unit price</Label>
                                                <Input
                                                    id={`price-${rowIndex}`}
                                                    type="number" inputMode="decimal" value={row.trade_price} disabled={readonly}
                                                    aria-invalid={!!rowErrors[rowIndex]?.trade_price}
                                                    onChange={(e) => { setCell(rowIndex, 'trade_price', e.target.value); if (rowErrors[rowIndex]?.trade_price) setRowError(rowIndex, 'trade_price', null); }}
                                                    onBlur={(e) => {
                                                        const v = dec2(e.target.value);
                                                        setCell(rowIndex, 'trade_price', v);
                                                        if (row.product_id) setRowError(rowIndex, 'trade_price', cellRule('trade_price', v));
                                                    }}
                                                    className={`text-right ${rowErrors[rowIndex]?.trade_price ? 'border-destructive' : ''}`}
                                                />
                                            </div>
                                        </div>}
                                        <InputError message={rowErrors[rowIndex]?.quantity || rowErrors[rowIndex]?.trade_price} className="text-xs" />

                                        {readonly && (line.discount_amount > 0 || Number(row.gst_percent) > 0) && (
                                            <p className="text-xs text-muted-foreground">{qty(effectiveDiscountPercent(line.gross, line.discount_amount))}% off · {qty(row.gst_percent)}% GST</p>
                                        )}
                                        {(!readonly || row.remarks) &&
                                        <details className="group rounded-lg bg-muted/50 px-2.5" open={rowErrors[rowIndex]?.discount_percent || rowErrors[rowIndex]?.gst_percent || rowErrors[rowIndex]?.remarks ? true : undefined}>
                                            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-1.5 py-1 text-xs font-medium text-muted-foreground [&::-webkit-details-marker]:hidden">
                                                <span>{readonly ? 'Line notes' : 'Discount, tax & notes'}
                                                {!readonly && (Number(row.discount_percent) > 0 || Number(row.gst_percent) > 0 || hasDiscountIncentive || row.remarks) && (
                                                    <span className="ml-1"> · {qty(effectiveDiscountPercent(line.gross, line.discount_amount))}% off · {qty(row.gst_percent)}% GST{row.remarks ? ' · Note added' : ''}</span>
                                                )}
                                                </span>
                                                <ChevronDown aria-hidden="true" className="size-4 shrink-0 group-open:rotate-180" />
                                            </summary>
                                        {readonly ? row.remarks && <p className="break-words pb-2.5 text-xs">{row.remarks}</p> : <div className="pb-2.5">
                                        <div className="mt-2 grid grid-cols-2 gap-2">
                                            <div>
                                                <Label htmlFor={`discount-${rowIndex}`} className="text-xs text-muted-foreground">Disc %</Label>
                                                {hasDiscountIncentive ? (
                                                    <Input
                                                        id={`discount-${rowIndex}`}
                                                        readOnly
                                                        value={dec2(effectiveDiscountPercent(line.gross, line.discount_amount))}
                                                        className="bg-emerald-50 text-right text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
                                                    />
                                                ) : (
                                                    <Input
                                                        id={`discount-${rowIndex}`}
                                                        type="number" inputMode="decimal" value={row.discount_percent} disabled={readonly}
                                                        aria-invalid={!!rowErrors[rowIndex]?.discount_percent}
                                                        onChange={(e) => { setCell(rowIndex, 'discount_percent', e.target.value); if (rowErrors[rowIndex]?.discount_percent) setRowError(rowIndex, 'discount_percent', null); }}
                                                        onBlur={(e) => {
                                                            const v = dec2(e.target.value);
                                                            setCell(rowIndex, 'discount_percent', v);
                                                            if (row.product_id) setRowError(rowIndex, 'discount_percent', cellRule('discount_percent', v));
                                                        }}
                                                        className={`text-right ${rowErrors[rowIndex]?.discount_percent ? 'border-destructive' : ''}`}
                                                    />
                                                )}
                                            </div>
                                            <div>
                                                <Label htmlFor={`gst-${rowIndex}`} className="text-xs text-muted-foreground">GST %</Label>
                                                <Input
                                                    id={`gst-${rowIndex}`}
                                                    aria-invalid={!!rowErrors[rowIndex]?.gst_percent}
                                                    type="number" inputMode="decimal" value={row.gst_percent} disabled={readonly}
                                                    onChange={(e) => { setCell(rowIndex, 'gst_percent', e.target.value); if (rowErrors[rowIndex]?.gst_percent) setRowError(rowIndex, 'gst_percent', null); }}
                                                    onBlur={(e) => {
                                                        const v = dec2(e.target.value);
                                                        setCell(rowIndex, 'gst_percent', v);
                                                        if (row.product_id) setRowError(rowIndex, 'gst_percent', cellRule('gst_percent', v));
                                                    }}
                                                    className="text-right"
                                                />
                                            </div>
                                        </div>
                                            <div className="mt-2">
                                                <Label htmlFor={`remarks-${rowIndex}`} className="text-xs text-muted-foreground">Remarks</Label>
                                                <Input id={`remarks-${rowIndex}`} value={row.remarks} placeholder="Add a note (optional)"
                                                    onChange={(e) => setCell(rowIndex, 'remarks', e.target.value)} />
                                            </div>
                                            <InputError message={rowErrors[rowIndex]?.discount_percent || rowErrors[rowIndex]?.gst_percent || rowErrors[rowIndex]?.remarks} className="mt-1 text-xs" />
                                        </div>}
                                        </details>}

                                        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-2">
                                            <div className="flex min-w-0 flex-wrap items-center gap-1">
                                                {row.incentives.map((inc) => (
                                                    <Badge key={inc.id} variant="outline" className="max-w-full gap-1 pr-1">
                                                        <span className="truncate">{inc.name}</span>
                                                        {!readonly && (
                                                            <button type="button" aria-label={`Remove ${inc.name}`} onClick={() => removeRule(rowIndex, inc)} className="flex size-8 shrink-0 items-center justify-center rounded-sm hover:text-destructive">
                                                                <X className="size-3" />
                                                            </button>
                                                        )}
                                                    </Badge>
                                                ))}
                                                {!readonly && (
                                                    <Button
                                                        type="button" variant="outline" size="sm"
                                                        className="h-11"
                                                        onClick={() => { setActiveRow(rowIndex); setRuleOpen(true); }}
                                                    >
                                                        <Plus aria-hidden="true" /> Incentive
                                                    </Button>
                                                )}
                                            </div>
                                            <div className="ml-auto text-right">
                                                <div className="text-[11px] text-muted-foreground">Line total</div>
                                                <div className="text-base font-semibold tabular-nums">{money(line.net_amount)}</div>
                                            </div>
                                        </div>
                                        </>}
                                    </article>
                                );
                            })}
                        </div>
                    )}
                    {!isMobile && (
                    <div className="max-h-[55dvh] overflow-auto">
                    <table className="w-full min-w-[1280px] text-sm">
                        <thead className="sticky top-0 z-10 bg-muted text-xs uppercase">
                            <tr className="[&>th]:border-b [&>th]:px-2 [&>th]:py-2 [&>th]:text-left">
                                <th className="w-8">#</th>
                                <th className="min-w-56">Product <kbd className="opacity-50">F2</kbd></th>
                                {showSupplier && <th className="w-32">Supplier</th>}
                                <th className="w-16 text-right">Stock</th>
                                <th className="w-20 text-right">Qty</th>
                                <th className="w-20 text-right">Bonus</th>
                                <th className="w-36">Rule <kbd className="opacity-50">F4</kbd></th>
                                <th className="w-24 text-right">Price</th>
                                <th className="w-24 text-right">Retail</th>
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
                                    <td
                                        className={rowErrors[rowIndex]?.product_id ? 'ring-1 ring-inset ring-destructive' : ''}
                                        title={rowErrors[rowIndex]?.product_id}
                                    >
                                        <ProductSearchCell
                                            showSupplier={showSupplier}
                                            value={row.product_name}
                                            warehouseId={warehouse.id}
                                            disabled={readonly}
                                            openSignal={searchSignal.row === rowIndex ? searchSignal.n : 0}
                                            onSelect={(product) => applyProduct(rowIndex, product)}
                                            onGridKeyDown={(e) => grid.handleKeyDown(e, rowIndex, 0)}
                                            inputRef={grid.registerCell(rowIndex, 0)}
                                        />
                                    </td>
                                    {showSupplier && <td className="truncate px-2 text-muted-foreground" title={row.company ?? undefined}>
                                        {row.product_id ? (row.company ?? '—') : ''}
                                    </td>}
                                    <td className={`px-2 text-right tabular-nums ${row.stock <= 0 && row.product_id ? 'text-destructive' : 'text-muted-foreground'}`}>
                                        {row.product_id ? qty(row.stock) : ''}
                                    </td>
                                    <td>
                                        <Input
                                            ref={grid.registerCell(rowIndex, 1) as never}
                                            type="number" min={1} value={row.quantity} disabled={readonly}
                                            title={rowErrors[rowIndex]?.quantity}
                                            aria-invalid={!!rowErrors[rowIndex]?.quantity}
                                            onChange={(e) => { setCell(rowIndex, 'quantity', e.target.value); if (rowErrors[rowIndex]?.quantity) setRowError(rowIndex, 'quantity', null); }}
                                            onBlur={(e) => {
                                                const v = String(Math.max(1, toNumber(e.target.value)));
                                                setCell(rowIndex, 'quantity', v);
                                                if (row.product_id) setRowError(rowIndex, 'quantity', cellRule('quantity', v));
                                            }}
                                            onKeyDown={(e) => grid.handleKeyDown(e, rowIndex, 1)}
                                            className={`h-8 rounded-none border-0 px-2 text-right text-sm focus-visible:ring-1 ${ringClass(rowIndex, 'quantity')}`}
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
                                        <div className="flex flex-wrap items-center gap-1 p-1">
                                            {row.incentives.map((inc) => (
                                                <Badge key={inc.id} variant="outline" className="max-w-full gap-1 pr-1">
                                                    <span className="truncate">{inc.name}</span>
                                                    {!readonly && (
                                                        <button
                                                            type="button"
                                                            tabIndex={-1}
                                                            onClick={() => removeRule(rowIndex, inc)}
                                                            className="rounded-sm hover:text-destructive"
                                                        >
                                                            <X className="size-3" />
                                                        </button>
                                                    )}
                                                </Badge>
                                            ))}
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
                                                className="rounded px-1 text-sm text-muted-foreground outline-none focus:ring-1 focus:ring-ring disabled:opacity-70"
                                            >
                                                {row.incentives.length ? '+ add' : <>Add rule <kbd className="opacity-60">F4</kbd></>}
                                            </button>
                                        </div>
                                    </td>
                                    <td>
                                        <Input
                                            ref={grid.registerCell(rowIndex, 4) as never}
                                            type="number" value={row.trade_price} disabled={readonly}
                                            title={rowErrors[rowIndex]?.trade_price}
                                            aria-invalid={!!rowErrors[rowIndex]?.trade_price}
                                            onChange={(e) => { setCell(rowIndex, 'trade_price', e.target.value); if (rowErrors[rowIndex]?.trade_price) setRowError(rowIndex, 'trade_price', null); }}
                                            onBlur={(e) => {
                                                const v = dec2(e.target.value);
                                                setCell(rowIndex, 'trade_price', v);
                                                if (row.product_id) setRowError(rowIndex, 'trade_price', cellRule('trade_price', v));
                                            }}
                                            onKeyDown={(e) => grid.handleKeyDown(e, rowIndex, 4)}
                                            className={`h-8 rounded-none border-0 px-2 text-right text-sm focus-visible:ring-1 ${ringClass(rowIndex, 'trade_price')}`}
                                        />
                                    </td>
                                    <td className="px-2 text-right tabular-nums text-muted-foreground">
                                        {row.product_id && row.retail_price ? amount(row.retail_price) : ''}
                                    </td>
                                    <td>
                                        {row.incentives.some((inc) => isDiscountType(inc.rule_type)) ? (
                                            // A discount incentive drives the line discount; the cell shows
                                            // the effective combined percent (read-only) instead of the manual %.
                                            <Input
                                                ref={grid.registerCell(rowIndex, 5) as never}
                                                type="text"
                                                readOnly
                                                tabIndex={0}
                                                value={dec2(effectiveDiscountPercent(computed[rowIndex].gross, computed[rowIndex].discount_amount))}
                                                title="Effective discount from applied incentive(s). Remove the incentive to edit manually."
                                                onKeyDown={(e) => grid.handleKeyDown(e, rowIndex, 5)}
                                                className="h-8 rounded-none border-0 bg-emerald-50 px-2 text-right text-sm text-emerald-700 focus-visible:ring-1 dark:bg-emerald-950/40 dark:text-emerald-400"
                                            />
                                        ) : (
                                            <Input
                                                ref={grid.registerCell(rowIndex, 5) as never}
                                                type="number" value={row.discount_percent} disabled={readonly}
                                                title={rowErrors[rowIndex]?.discount_percent}
                                                aria-invalid={!!rowErrors[rowIndex]?.discount_percent}
                                                onChange={(e) => { setCell(rowIndex, 'discount_percent', e.target.value); if (rowErrors[rowIndex]?.discount_percent) setRowError(rowIndex, 'discount_percent', null); }}
                                                onBlur={(e) => {
                                                    const v = dec2(e.target.value);
                                                    setCell(rowIndex, 'discount_percent', v);
                                                    if (row.product_id) setRowError(rowIndex, 'discount_percent', cellRule('discount_percent', v));
                                                }}
                                                onKeyDown={(e) => grid.handleKeyDown(e, rowIndex, 5)}
                                                className={`h-8 rounded-none border-0 px-2 text-right text-sm focus-visible:ring-1 ${ringClass(rowIndex, 'discount_percent')}`}
                                            />
                                        )}
                                    </td>
                                    <td>
                                        <Input
                                            ref={grid.registerCell(rowIndex, 6) as never}
                                            type="number" value={row.gst_percent} disabled={readonly}
                                            title={rowErrors[rowIndex]?.gst_percent}
                                            aria-invalid={!!rowErrors[rowIndex]?.gst_percent}
                                            onChange={(e) => { setCell(rowIndex, 'gst_percent', e.target.value); if (rowErrors[rowIndex]?.gst_percent) setRowError(rowIndex, 'gst_percent', null); }}
                                            onBlur={(e) => {
                                                const v = dec2(e.target.value);
                                                setCell(rowIndex, 'gst_percent', v);
                                                if (row.product_id) setRowError(rowIndex, 'gst_percent', cellRule('gst_percent', v));
                                            }}
                                            onKeyDown={(e) => grid.handleKeyDown(e, rowIndex, 6)}
                                            className={`h-8 rounded-none border-0 px-2 text-right text-sm focus-visible:ring-1 ${ringClass(rowIndex, 'gst_percent')}`}
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
                    </div>
                    )}
                    {!readonly && (!isMobile || rows.every((row) => row.product_id)) && (
                        <div className="pt-2.5 lg:border-t lg:p-2">
                            <Button variant={isMobile ? 'outline' : 'ghost'} size="sm" className="h-11 w-full lg:h-9 lg:w-auto" onClick={() => {
                                if (isMobile) setProductRow(rows.length);
                                else setRows((r) => [...r, emptyRow()]);
                            }}>
                                <Plus aria-hidden="true" /> {isMobile ? 'Add product' : 'Add Row'}
                            </Button>
                        </div>
                    )}
                </div>

                {booking && isMobile && <BookingActivity booking={booking} />}
                {isMobile ? <footer aria-label="Booking totals and actions" className="sticky bottom-0 z-20 -mx-3 -mb-3 mt-auto border-t bg-card/95 px-3 pt-1 pb-[max(0.5rem,env(safe-area-inset-bottom))] shadow-[0_-4px_16px_rgb(16_36_58/0.08)] backdrop-blur md:-mx-4 md:-mb-4 md:px-4">
                    <details className="group">
                        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 text-sm [&::-webkit-details-marker]:hidden">
                            <span className="inline-flex items-center gap-1.5 font-medium text-muted-foreground">
                                Total <ChevronDown aria-hidden="true" className="size-4 group-open:rotate-180" />
                            </span>
                            <span className="break-words text-right text-lg font-bold tabular-nums">{money(totals.total_amount)}</span>
                        </summary>
                        <dl className="mb-2 grid grid-cols-3 gap-2 rounded-lg bg-muted px-2.5 py-2 text-xs tabular-nums">
                            <div><dt className="text-muted-foreground">Subtotal</dt><dd>{amount(totals.subtotal)}</dd></div>
                            <div><dt className="text-muted-foreground">Discounts</dt><dd>−{amount(totals.item_discount_total)}</dd></div>
                            <div><dt className="text-muted-foreground">GST</dt><dd>+{amount(totals.item_gst_total)}</dd></div>
                        </dl>
                    </details>
                    {hasMobileErrors && <p role="alert" className="mb-1.5 text-xs font-medium text-destructive">{ALERT_FIX}</p>}
                    <div className="flex flex-wrap gap-2 empty:hidden">{actions(true)}</div>
                </footer> : <div className="sticky bottom-0 z-10 mt-auto bg-background pt-2">
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border bg-muted px-3 py-2 text-sm font-bold tabular-nums sm:gap-x-8 sm:px-5 sm:py-3 sm:text-base">
                        <span>Subtotal <span className="ml-1">{amount(totals.subtotal)}</span></span>
                        <span>Discounts <span className="ml-1">−{amount(totals.item_discount_total)}</span></span>
                        <span>GST <span className="ml-1">+{amount(totals.item_gst_total)}</span></span>
                        <span className="ml-auto text-lg text-primary sm:text-2xl">Total <span className="ml-1">{money(totals.total_amount)}</span></span>
                    </div>
                </div>}
            </div>

            {productRow !== null && !readonly && isMobile && (
                <ProductSearchDialog
                    open
                    onOpenChange={(open) => { if (!open) setProductRow(null); }}
                    warehouseId={warehouse.id}
                    onSelect={(product) => applyProduct(productRow, product)}
                />
            )}
            <RulePickerDialog
                open={ruleOpen}
                onOpenChange={setRuleOpen}
                productId={activeRowData?.product_id ?? null}
                customerId={header.customer_id ? Number(header.customer_id) : null}
                qty={toNumber(activeRowData?.quantity)}
                price={toNumber(activeRowData?.trade_price)}
                date={header.booking_date}
                applied={activeRowData?.incentives ?? []}
                onAdd={(rule) => addRule(activeRow, rule)}
                onRemove={(rule) => removeRule(activeRow, rule)}
            />
        </AppLayout>
    );
}
