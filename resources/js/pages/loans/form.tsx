import InputError from '@/components/input-error';
import { ProductSearchCell, type ProductHit } from '@/components/product-search-cell';
import { SearchableSelect, type SelectOption } from '@/components/searchable-select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useInvoiceHotkeys, useKeyboardGrid } from '@/hooks/use-keyboard-grid';
import { usePermissions } from '@/hooks/use-permissions';
import AppLayout from '@/layouts/app-layout';
import { qty as fmtQty, toNumber } from '@/lib/format';
import { ALERT_FIX, splitItemErrors } from '@/lib/form-validation';
import { type BreadcrumbItem } from '@/types';
import { Head, router } from '@inertiajs/react';
import { Plus, Save, Send, Trash2, Undo2, XCircle } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

type Direction = 'in' | 'out';

interface ItemRow {
    id: number | null;
    product_id: number | null;
    product_name: string;
    batch_number: string;
    expiry_date: string;
    quantity: string;
    returned_quantity: number;
    remarks: string;
}

interface UserRef { id: number; name: string }

interface LoanDto {
    id: number;
    loan_number: string;
    direction: Direction;
    company_id: number;
    warehouse_id: number;
    loan_date: string;
    status: string;
    notes: string | null;
    total_quantity: string;
    returned_quantity: string;
    requested_by_id: number | null;
    received_by_id: number | null;
    request_received_by_id: number | null;
    handed_over_by_id: number | null;
    items: {
        id: number;
        product_id: number;
        product?: { id: number; name: string };
        batch_number: string | null;
        expiry_date: string | null;
        quantity: string;
        returned_quantity: string;
        remarks: string | null;
    }[];
}

interface Props {
    direction: Direction;
    companies: { id: number; name: string }[];
    users: UserRef[];
    warehouse: { id: number; name: string };
    loan: LoanDto | null;
}

const emptyRow = (): ItemRow => ({
    id: null, product_id: null, product_name: '', batch_number: '', expiry_date: '',
    quantity: '1', returned_quantity: 0, remarks: '',
});

const statusLabels: Record<string, string> = {
    pending: 'Pending', loaned: 'Loaned', partially_returned: 'Partially Returned',
    returned: 'Returned', closed: 'Closed', cancelled: 'Cancelled',
};

export default function LoanForm({ direction, companies, users, warehouse, loan }: Props) {
    const { can } = usePermissions();
    const isOut = direction === 'out';
    const title = isOut ? 'Loan Stock Out' : 'Loan Stock In';
    const isPending = !loan || loan.status === 'pending';
    const readonly = !isPending;
    const isActive = loan ? loan.status === 'loaned' || loan.status === 'partially_returned' : false;

    // Grid columns depend on direction: loan-in captures batch/expiry, loan-out doesn't.
    const cols = isOut
        ? (['product', 'quantity', 'remarks'] as const)
        : (['product', 'batch_number', 'expiry_date', 'quantity', 'remarks'] as const);
    const qtyCol = cols.indexOf('quantity' as never);
    const enterOrder = cols.slice(0, qtyCol + 1).map((_, i) => i); // product … qty, then next row

    const userOptions: SelectOption[] = users.map((u) => ({ value: String(u.id), label: u.name }));

    const [header, setHeader] = useState({
        company_id: loan ? String(loan.company_id) : '',
        loan_date: loan?.loan_date?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
        requested_by_id: loan?.requested_by_id ? String(loan.requested_by_id) : '',
        received_by_id: loan?.received_by_id ? String(loan.received_by_id) : '',
        request_received_by_id: loan?.request_received_by_id ? String(loan.request_received_by_id) : '',
        handed_over_by_id: loan?.handed_over_by_id ? String(loan.handed_over_by_id) : '',
        notes: loan?.notes ?? '',
    });

    const [rows, setRows] = useState<ItemRow[]>(() =>
        loan && loan.items.length > 0
            ? loan.items.map((item) => ({
                  id: item.id,
                  product_id: item.product_id,
                  product_name: item.product?.name ?? `#${item.product_id}`,
                  batch_number: item.batch_number ?? '',
                  expiry_date: item.expiry_date?.slice(0, 10) ?? '',
                  quantity: String(Number(item.quantity)),
                  returned_quantity: Number(item.returned_quantity),
                  remarks: item.remarks ?? '',
              }))
            : [emptyRow()],
    );

    const [searchSignal, setSearchSignal] = useState({ row: -1, n: 0 });
    const [saving, setSaving] = useState(false);
    const [headerErrors, setHeaderErrors] = useState<Record<string, string>>({});
    const [rowErrors, setRowErrors] = useState<Record<number, Record<string, string>>>({});

    // Record-return state: item id → quantity being returned now.
    const [returns, setReturns] = useState<Record<number, string>>({});

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

    const includedRowIndexes = () =>
        rows.map((_, i) => i).filter((i) => rows[i].product_id && toNumber(rows[i].quantity) > 0);

    const validate = (): boolean => {
        const h: Record<string, string> = {};
        const r: Record<number, Record<string, string>> = {};
        if (!header.company_id) h.company_id = 'Supplier / partner is required.';
        if (isOut && !header.request_received_by_id) h.request_received_by_id = 'Required.';
        if (isOut && !header.handed_over_by_id) h.handed_over_by_id = 'Required.';
        if (!rows.some((row) => row.product_id)) r[0] = { product_id: 'Add at least one product.' };
        rows.forEach((row, i) => {
            if (!row.product_id) return;
            if (toNumber(row.quantity) < 1) r[i] = { ...(r[i] ?? {}), quantity: 'Quantity must be at least 1.' };
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

    const totalQty = useMemo(
        () => rows.filter((row) => row.product_id).reduce((sum, row) => sum + toNumber(row.quantity), 0),
        [rows],
    );

    const grid = useKeyboardGrid({
        rowCount: rows.length,
        colCount: cols.length,
        enterOrder,
        onAppendRow: () => setRows((r) => [...r, emptyRow()]),
        onDeleteRow: (row) => setRows((r) => (r.length === 1 ? [emptyRow()] : r.filter((_, i) => i !== row))),
        onInsertRow: (row) => setRows((r) => { const c = [...r]; c.splice(row + 1, 0, emptyRow()); return c; }),
        onProductSearch: (row) => setSearchSignal((s) => ({ row, n: s.n + 1 })),
    });

    const setCell = (rowIndex: number, key: keyof ItemRow, value: string) => {
        setRows((r) => r.map((row, i) => (i === rowIndex ? { ...row, [key]: value } : row)));
    };

    const applyProduct = (rowIndex: number, product: ProductHit) => {
        setRows((r) => r.map((row, i) => (i === rowIndex ? {
            ...row, product_id: product.id, product_name: product.name,
        } : row)));
        setRowError(rowIndex, 'product_id', null);
        grid.focusCell(rowIndex, 1);
    };

    const removeRow = (index: number) => {
        setRows((r) => (r.length === 1 ? [emptyRow()] : r.filter((_, i) => i !== index)));
    };

    const payload = () => ({
        direction,
        company_id: header.company_id || null,
        warehouse_id: warehouse.id,
        loan_date: header.loan_date,
        requested_by_id: header.requested_by_id || null,
        received_by_id: header.received_by_id || null,
        request_received_by_id: isOut ? header.request_received_by_id || null : null,
        handed_over_by_id: isOut ? header.handed_over_by_id || null : null,
        notes: header.notes,
        items: rows
            .filter((row) => row.product_id && toNumber(row.quantity) > 0)
            .map((row) => ({
                product_id: row.product_id,
                batch_number: isOut ? null : row.batch_number || null,
                expiry_date: isOut ? null : row.expiry_date || null,
                quantity: toNumber(row.quantity),
                remarks: row.remarks || null,
            })),
    });

    const save = () => {
        if (readonly || saving) return;
        if (!validate()) { toast.error(ALERT_FIX); return; }
        setSaving(true);
        const options = { preserveScroll: true, onError: handleServerErrors, onFinish: () => setSaving(false) };
        if (loan) router.put(route('loans.update', loan.id), payload(), options);
        else router.post(route('loans.store'), payload(), options);
    };

    const post = () => {
        if (!loan || readonly || saving) return;
        if (!validate()) { toast.error(ALERT_FIX); return; }
        const msg = isOut
            ? `Post ${loan.loan_number}? Stock will be drawn from sellable inventory and marked out on loan.`
            : `Post ${loan.loan_number}? Loaned-in stock will be received into a segregated loan bucket.`;
        if (!confirm(msg)) return;
        setSaving(true);
        router.put(route('loans.update', loan.id), payload(), {
            preserveScroll: true,
            onSuccess: () => router.post(route('loans.post', loan.id), {}, { onError: handleServerErrors, onFinish: () => setSaving(false) }),
            onError: (errors) => { handleServerErrors(errors); setSaving(false); },
        });
    };

    const submitReturns = () => {
        if (!loan || saving) return;
        const payloadReturns = Object.entries(returns)
            .map(([itemId, q]) => ({ item_id: Number(itemId), quantity: toNumber(q) }))
            .filter((r) => r.quantity > 0);
        if (payloadReturns.length === 0) { toast.error('Enter a quantity to return.'); return; }
        setSaving(true);
        router.post(route('loans.return', loan.id), { returns: payloadReturns }, {
            preserveScroll: true,
            onSuccess: () => setReturns({}),
            onFinish: () => setSaving(false),
        });
    };

    const hotkeys = useInvoiceHotkeys({ onSave: save, onPost: post });
    useEffect(() => {
        const listener = (e: KeyboardEvent) => hotkeys.handleKeyDown(e);
        window.addEventListener('keydown', listener);
        return () => window.removeEventListener('keydown', listener);
    }, [hotkeys]);

    const breadcrumbs: BreadcrumbItem[] = [
        { title, href: `/loans/${direction}` },
        { title: loan ? loan.loan_number : `New ${title}`, href: '#' },
    ];

    const statusBadge = loan && (
        <Badge variant={loan.status === 'cancelled' ? 'destructive' : loan.status === 'pending' ? 'secondary' : 'default'}>
            {statusLabels[loan.status] ?? loan.status}
        </Badge>
    );

    const cellInput = (rowIndex: number, colIndex: number, key: keyof ItemRow, type = 'text', className = '') => {
        const isQty = key === 'quantity';
        const cellError = rowErrors[rowIndex]?.[key];
        const locked = !readonly && !rows[rowIndex].product_id;
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
                onBlur={(e) => { if (isQty) setCell(rowIndex, key, String(Math.max(1, toNumber(e.target.value)))); }}
                onKeyDown={(e) => grid.handleKeyDown(e, rowIndex, colIndex)}
                className={`h-8 rounded-none border-0 px-2 text-sm focus-visible:ring-1 ${cellError ? 'bg-destructive/10 ring-1 ring-destructive' : ''} ${className}`}
            />
        );
    };

    const personField = (key: keyof typeof header, label: string, required = false) => (
        <div>
            <Label>{label}{required ? ' *' : ''}</Label>
            <SearchableSelect
                value={header[key] as string}
                onValueChange={(v) => {
                    setHeader((h) => ({ ...h, [key]: v }));
                    setHeaderErrors((e) => { const n = { ...e }; delete n[key]; return n; });
                }}
                options={userOptions}
                placeholder="Select user"
                disabled={readonly}
                className={headerErrors[key] ? 'border-destructive ring-1 ring-destructive' : ''}
            />
            <InputError message={headerErrors[key]} className="mt-1 text-xs" />
        </div>
    );

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={loan ? loan.loan_number : `New ${title}`} />
            <div className="flex h-full flex-col gap-4 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-4">
                    <div className="flex items-center gap-3">
                        <h1 className="text-4xl font-bold">
                            {loan ? `${title} ${loan.loan_number}` : `New ${title}`}
                        </h1>
                        {statusBadge}
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {isActive && can('loans.cancel') && (
                            <Button
                                variant="outline" size="sm"
                                onClick={() => {
                                    if (confirm('Close this loan? It will be marked settled and no more returns can be recorded.')) {
                                        router.post(route('loans.close', loan!.id));
                                    }
                                }}
                            >
                                Close Loan
                            </Button>
                        )}
                        {isActive && can('loans.cancel') && (
                            <Button
                                variant="outline" size="sm"
                                onClick={() => {
                                    if (confirm('Cancel this loan? All outstanding stock will be reversed.')) {
                                        router.post(route('loans.cancel', loan!.id));
                                    }
                                }}
                            >
                                <XCircle className="mr-1 size-4 text-destructive" /> Cancel Loan
                            </Button>
                        )}
                        {isPending && (
                            <>
                                <Button variant="outline" size="sm" onClick={save} disabled={saving}>
                                    <Save className="mr-1 size-4" /> Save Draft <kbd className="ml-1 text-xs opacity-60">F8</kbd>
                                </Button>
                                {loan && can('loans.post') && (
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
                        <Label>Supplier / Partner *</Label>
                        <SearchableSelect
                            value={header.company_id}
                            onValueChange={(v) => {
                                setHeader((h) => ({ ...h, company_id: v }));
                                setHeaderErrors((e) => { const n = { ...e }; delete n.company_id; return n; });
                            }}
                            options={companies.map((c) => ({ value: String(c.id), label: c.name }))}
                            placeholder="Select supplier"
                            disabled={readonly}
                            className={headerErrors.company_id ? 'border-destructive ring-1 ring-destructive' : ''}
                        />
                        <InputError message={headerErrors.company_id} className="mt-1 text-xs" />
                    </div>
                    <div>
                        <Label>Date *</Label>
                        <Input
                            type="date" value={header.loan_date} disabled={readonly}
                            onChange={(e) => setHeader((h) => ({ ...h, loan_date: e.target.value }))}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !readonly) { e.preventDefault(); grid.focusCell(0, 0); }
                            }}
                        />
                    </div>
                    <div>
                        <Label>Warehouse</Label>
                        <Input value={warehouse.name} disabled />
                    </div>
                    {personField('requested_by_id', 'Requested By')}
                    {personField('received_by_id', 'Received By')}
                    {isOut && personField('request_received_by_id', 'Request Received By', true)}
                    {isOut && personField('handed_over_by_id', 'Handed Over By', true)}
                    <div className={isOut ? 'md:col-span-4' : 'md:col-span-2'}>
                        <Label>Remarks</Label>
                        <Input
                            value={header.notes} disabled={readonly}
                            placeholder="Optional note"
                            onChange={(e) => setHeader((h) => ({ ...h, notes: e.target.value }))}
                        />
                    </div>
                </div>

                <div className="rounded-xl border">
                    <div className="max-h-[45dvh] overflow-auto">
                        <table className="w-full min-w-[720px] text-sm">
                            <thead className="sticky top-0 z-10 bg-muted text-xs uppercase">
                                <tr className="[&>th]:border-b [&>th]:px-2 [&>th]:py-2 [&>th]:text-left">
                                    <th className="w-8">#</th>
                                    <th className="min-w-56">Product <kbd className="opacity-50">F2</kbd></th>
                                    {!isOut && <th className="w-32">Batch</th>}
                                    {!isOut && <th className="w-40">Expiry</th>}
                                    <th className="w-24 text-right">Qty</th>
                                    <th className="min-w-40">Remarks</th>
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
                                        {!isOut && <td>{cellInput(rowIndex, 1, 'batch_number')}</td>}
                                        {!isOut && <td>{cellInput(rowIndex, 2, 'expiry_date', 'date')}</td>}
                                        <td>{cellInput(rowIndex, qtyCol, 'quantity', 'number', 'text-right')}</td>
                                        <td>{cellInput(rowIndex, qtyCol + 1, 'remarks')}</td>
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

                {isActive && can('loans.return') && (
                    <div className="rounded-xl border">
                        <div className="flex items-center justify-between border-b bg-muted/50 px-4 py-2">
                            <h2 className="font-semibold">Record Return</h2>
                            <Button size="sm" onClick={submitReturns} disabled={saving}>
                                <Undo2 className="mr-1 size-4" /> Record Return
                            </Button>
                        </div>
                        <table className="w-full text-sm">
                            <thead className="text-xs uppercase text-muted-foreground">
                                <tr className="[&>th]:px-3 [&>th]:py-2 [&>th]:text-left">
                                    <th>Product</th>
                                    <th className="text-right">Loaned</th>
                                    <th className="text-right">Returned</th>
                                    <th className="text-right">Outstanding</th>
                                    <th className="w-32 text-right">Return Now</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loan!.items.map((item) => {
                                    const outstanding = Number(item.quantity) - Number(item.returned_quantity);
                                    return (
                                        <tr key={item.id} className="border-t [&>td]:px-3 [&>td]:py-1.5">
                                            <td>{item.product?.name ?? `#${item.product_id}`}</td>
                                            <td className="text-right tabular-nums">{fmtQty(item.quantity)}</td>
                                            <td className="text-right tabular-nums">{fmtQty(item.returned_quantity)}</td>
                                            <td className="text-right tabular-nums font-medium">{fmtQty(outstanding)}</td>
                                            <td>
                                                <Input
                                                    type="number" min={0} max={outstanding}
                                                    disabled={outstanding <= 0}
                                                    value={returns[item.id] ?? ''}
                                                    placeholder="0"
                                                    onChange={(e) => setReturns((r) => ({ ...r, [item.id]: e.target.value }))}
                                                    className="h-8 text-right"
                                                />
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}

                <div className="sticky bottom-0 z-10 mt-auto bg-background pt-2">
                    <div className="flex flex-wrap items-center gap-x-8 gap-y-1 rounded-xl border bg-muted px-5 py-3 text-base font-bold tabular-nums">
                        <span className="text-muted-foreground">
                            {isOut ? 'Loaned out — no sale, no ledger impact.' : 'Received on loan — no purchase, no ledger impact.'}
                        </span>
                        <span className="ml-auto text-2xl text-primary">Total Qty <span className="ml-1">{fmtQty(totalQty)}</span></span>
                    </div>
                </div>
            </div>
        </AppLayout>
    );
}
