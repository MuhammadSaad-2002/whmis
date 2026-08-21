import InputError from '@/components/input-error';
import { ProductSearchCell, type ProductHit } from '@/components/product-search-cell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useInvoiceHotkeys, useKeyboardGrid } from '@/hooks/use-keyboard-grid';
import { usePermissions } from '@/hooks/use-permissions';
import AppLayout from '@/layouts/app-layout';
import { qty as fmtQty, toNumber } from '@/lib/format';
import { ALERT_FIX, splitItemErrors } from '@/lib/form-validation';
import { type BreadcrumbItem } from '@/types';
import { Head, router } from '@inertiajs/react';
import { Plus, Printer, Save, Send, Trash2, XCircle } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

interface ItemRow {
    product_id: number | null;
    product_name: string;
    quantity: string;
    remarks: string;
}

interface IssueDto {
    id: number;
    issue_number: string;
    customer_id: number;
    warehouse_id: number;
    issue_date: string;
    recipient_name: string | null;
    representative_name: string | null;
    status: string;
    notes: string | null;
    total_quantity: string;
    items: {
        product_id: number;
        product?: { id: number; name: string };
        quantity: string;
        remarks: string | null;
    }[];
}

interface Props {
    customers: { id: number; name: string; city?: string | null }[];
    warehouse: { id: number; name: string };
    issue: IssueDto | null;
}

const emptyRow = (): ItemRow => ({ product_id: null, product_name: '', quantity: '1', remarks: '' });

const COLS = ['product', 'quantity', 'remarks'] as const;
// Enter walks product → qty → next row. Remarks stays Tab-reachable.
const ENTER_ORDER = [0, 1];

export default function SampleIssueForm({ customers, warehouse, issue }: Props) {
    const { can } = usePermissions();
    const isDraft = !issue || issue.status === 'draft';
    const readonly = !isDraft;

    const [header, setHeader] = useState({
        customer_id: issue ? String(issue.customer_id) : '',
        issue_date: issue?.issue_date?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
        recipient_name: issue?.recipient_name ?? '',
        representative_name: issue?.representative_name ?? '',
        notes: issue?.notes ?? '',
    });

    const [rows, setRows] = useState<ItemRow[]>(() =>
        issue && issue.items.length > 0
            ? issue.items.map((item) => ({
                  product_id: item.product_id,
                  product_name: item.product?.name ?? `#${item.product_id}`,
                  quantity: String(Number(item.quantity)),
                  remarks: item.remarks ?? '',
              }))
            : [emptyRow()],
    );

    const [searchSignal, setSearchSignal] = useState({ row: -1, n: 0 });
    const [saving, setSaving] = useState(false);
    const [headerErrors, setHeaderErrors] = useState<Record<string, string>>({});
    const [rowErrors, setRowErrors] = useState<Record<number, Record<string, string>>>({});

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
        if (!header.customer_id) h.customer_id = 'Customer is required.';
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

    const applyProduct = (rowIndex: number, product: ProductHit) => {
        setRows((r) => r.map((row, i) => (i === rowIndex ? {
            ...row, product_id: product.id, product_name: product.name,
        } : row)));
        setRowError(rowIndex, 'product_id', null);
        grid.focusCell(rowIndex, 1); // jump to qty
    };

    const removeRow = (index: number) => {
        setRows((r) => (r.length === 1 ? [emptyRow()] : r.filter((_, i) => i !== index)));
    };

    const payload = () => ({
        ...header,
        customer_id: header.customer_id || null,
        recipient_name: header.recipient_name || null,
        representative_name: header.representative_name || null,
        warehouse_id: warehouse.id,
        items: rows
            .filter((row) => row.product_id && toNumber(row.quantity) > 0)
            .map((row) => ({
                product_id: row.product_id,
                batch_id: null, // auto FIFO: sample stock first, then normal
                quantity: toNumber(row.quantity),
                remarks: row.remarks || null,
            })),
    });

    const save = () => {
        if (readonly || saving) return;
        if (!validate()) { toast.error(ALERT_FIX); return; }
        setSaving(true);
        const options = { preserveScroll: true, onError: handleServerErrors, onFinish: () => setSaving(false) };
        if (issue) router.put(route('samples.issues.update', issue.id), payload(), options);
        else router.post(route('samples.issues.store'), payload(), options);
    };

    const post = () => {
        if (!issue || readonly || saving) return;
        if (!validate()) { toast.error(ALERT_FIX); return; }
        if (!confirm(`Post ${issue.issue_number}? Samples will be dispatched (sample stock first, then normal stock).`)) return;
        setSaving(true);
        router.put(route('samples.issues.update', issue.id), payload(), {
            preserveScroll: true,
            onSuccess: () => router.post(route('samples.issues.post', issue.id), {}, { onError: handleServerErrors, onFinish: () => setSaving(false) }),
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
        { title: 'Sample Issues', href: '/samples/issues' },
        { title: issue ? issue.issue_number : 'New Sample Issue', href: '#' },
    ];

    const statusBadge = issue && (
        <Badge variant={issue.status === 'posted' ? 'default' : issue.status === 'cancelled' ? 'destructive' : 'secondary'}>
            {issue.status}
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

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={issue ? issue.issue_number : 'New Sample Issue'} />
            <div className="flex h-full flex-col gap-4 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-4">
                    <div className="flex items-center gap-3">
                        <h1 className="text-4xl font-bold">
                            {issue ? `Sample Issue ${issue.issue_number}` : 'New Sample Issue'}
                        </h1>
                        {statusBadge}
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {issue && (
                            <Button variant="outline" size="sm" asChild>
                                <a href={route('samples.issues.print', issue.id)} target="_blank" rel="noreferrer">
                                    <Printer className="mr-1 size-4" /> Print
                                </a>
                            </Button>
                        )}
                        {issue?.status === 'posted' && can('samples.cancel') && (
                            <Button
                                variant="outline" size="sm"
                                onClick={() => {
                                    if (confirm('Cancel this posted issue? Sample/normal stock will be restored.')) {
                                        router.post(route('samples.issues.cancel', issue.id));
                                    }
                                }}
                            >
                                <XCircle className="mr-1 size-4 text-destructive" /> Cancel Issue
                            </Button>
                        )}
                        {isDraft && (
                            <>
                                <Button variant="outline" size="sm" onClick={save} disabled={saving}>
                                    <Save className="mr-1 size-4" /> Save Draft <kbd className="ml-1 text-xs opacity-60">F8</kbd>
                                </Button>
                                {issue && can('samples.post') && (
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
                        <Select
                            value={header.customer_id}
                            onValueChange={(v) => {
                                setHeader((h) => ({ ...h, customer_id: v }));
                                setHeaderErrors((e) => { const n = { ...e }; delete n.customer_id; return n; });
                            }}
                            disabled={readonly}
                        >
                            <SelectTrigger
                                autoFocus={!readonly}
                                aria-invalid={!!headerErrors.customer_id}
                                className={headerErrors.customer_id ? 'border-destructive ring-1 ring-destructive' : ''}
                            >
                                <SelectValue placeholder="Select customer" />
                            </SelectTrigger>
                            <SelectContent>
                                {customers.map((customer) => (
                                    <SelectItem key={customer.id} value={String(customer.id)}>{customer.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <InputError message={headerErrors.customer_id} className="mt-1 text-xs" />
                    </div>
                    <div>
                        <Label>Recipient / Doctor</Label>
                        <Input
                            value={header.recipient_name} disabled={readonly}
                            placeholder="e.g. Dr. Ahmed"
                            onChange={(e) => setHeader((h) => ({ ...h, recipient_name: e.target.value }))}
                        />
                    </div>
                    <div>
                        <Label>Representative (MR)</Label>
                        <Input
                            value={header.representative_name} disabled={readonly}
                            placeholder="Optional"
                            onChange={(e) => setHeader((h) => ({ ...h, representative_name: e.target.value }))}
                        />
                    </div>
                    <div>
                        <Label>Issue Date *</Label>
                        <Input
                            type="date" value={header.issue_date} disabled={readonly}
                            onChange={(e) => setHeader((h) => ({ ...h, issue_date: e.target.value }))}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !readonly) { e.preventDefault(); grid.focusCell(0, 0); }
                            }}
                        />
                    </div>
                    <div>
                        <Label>Warehouse</Label>
                        <Input value={warehouse.name} disabled />
                    </div>
                    <div className="col-span-2">
                        <Label>Remarks</Label>
                        <Input
                            value={header.notes} disabled={readonly}
                            placeholder="Optional note"
                            onChange={(e) => setHeader((h) => ({ ...h, notes: e.target.value }))}
                        />
                    </div>
                </div>

                <div className="rounded-xl border">
                    <div className="max-h-[55dvh] overflow-auto">
                    <table className="w-full min-w-[700px] text-sm">
                        <thead className="sticky top-0 z-10 bg-muted text-xs uppercase">
                            <tr className="[&>th]:border-b [&>th]:px-2 [&>th]:py-2 [&>th]:text-left">
                                <th className="w-8">#</th>
                                <th className="min-w-56">Product <kbd className="opacity-50">F2</kbd></th>
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
                                    <td>{cellInput(rowIndex, 1, 'quantity', 'number', 'text-right')}</td>
                                    <td>{cellInput(rowIndex, 2, 'remarks')}</td>
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

                <div className="sticky bottom-0 z-10 mt-auto bg-background pt-2">
                    <div className="flex flex-wrap items-center gap-x-8 gap-y-1 rounded-xl border bg-muted px-5 py-3 text-base font-bold tabular-nums">
                        <span className="text-muted-foreground">Free samples — no charge, no receivable. Sample stock is consumed before normal stock.</span>
                        <span className="ml-auto text-2xl text-primary">Total Qty <span className="ml-1">{fmtQty(totalQty)}</span></span>
                    </div>
                </div>
            </div>
        </AppLayout>
    );
}
