import { ProductSearchDialog, type ProductHit } from '@/components/product-search-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import AppLayout from '@/layouts/app-layout';
import { amount, money, qty as fmtQty, toNumber } from '@/lib/format';
import { type BreadcrumbItem } from '@/types';
import { ALERT_FIX } from '@/lib/form-validation';
import { Head, router } from '@inertiajs/react';
import { Plus, Trash2, Undo2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

interface LineRow {
    batch_id: number;
    product: string;
    batch_number: string;
    expiry_date: string | null;
    available: number;
    quantity: string;
    rate: string;
}

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Purchase Returns', href: '/returns/purchases' },
    { title: 'New Return', href: '#' },
];

interface Props {
    companies: { id: number; name: string }[];
    warehouse: { id: number; name: string };
}

export default function PurchaseReturnForm({ companies, warehouse }: Props) {
    const [companyId, setCompanyId] = useState('');
    const [returnDate, setReturnDate] = useState(new Date().toISOString().slice(0, 10));
    const [reason, setReason] = useState('');
    const [rows, setRows] = useState<LineRow[]>([]);
    const [searchOpen, setSearchOpen] = useState(false);
    const [saving, setSaving] = useState(false);

    const addProductBatches = async (product: ProductHit) => {
        const response = await fetch(`/lookup/products/${product.id}/batches?warehouse_id=${warehouse.id}`, {
            headers: { Accept: 'application/json' },
        });
        if (!response.ok) return;
        const batches: { id: number; batch_number: string; expiry_date: string | null; qty_available: number }[] =
            await response.json();

        setRows((current) => {
            const existing = new Set(current.map((row) => row.batch_id));
            const additions = batches
                .filter((batch) => !existing.has(batch.id) && batch.qty_available > 0)
                .map((batch) => ({
                    batch_id: batch.id,
                    product: product.name,
                    batch_number: batch.batch_number,
                    expiry_date: batch.expiry_date,
                    available: batch.qty_available,
                    quantity: '',
                    rate: String(product.purchase_price || ''),
                }));
            return [...current, ...additions];
        });
    };

    const total = useMemo(
        () => rows.reduce((sum, row) => sum + toNumber(row.quantity) * toNumber(row.rate), 0),
        [rows],
    );

    const hasInvalid = rows.some((row) => toNumber(row.quantity) > row.available + 1e-9);

    const submit = () => {
        if (saving) return;
        if (!companyId) {
            toast.error('Select a supplier first.');
            return;
        }
        if (hasInvalid) {
            toast.error('One or more return quantities exceed the available stock.');
            return;
        }
        const lines = rows
            .filter((row) => toNumber(row.quantity) > 0)
            .map((row) => ({ batch_id: row.batch_id, quantity: toNumber(row.quantity), rate: toNumber(row.rate) || null }));
        if (lines.length === 0) {
            toast.error('Enter a return quantity on at least one batch.');
            return;
        }
        if (!confirm(`Post this return for ${money(total)}? Stock and the supplier ledger update immediately.`)) return;
        setSaving(true);
        router.post(route('returns.purchases.store'), {
            company_id: Number(companyId),
            warehouse_id: warehouse.id,
            return_date: returnDate,
            reason: reason || null,
            lines,
        }, {
            onError: () => toast.error(ALERT_FIX),
            onFinish: () => setSaving(false),
        });
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="New Purchase Return" />
            <div className="flex h-full flex-col gap-4 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                        <h1 className="text-xl font-semibold">New Purchase Return</h1>
                        <p className="text-sm text-muted-foreground">Return in-stock batches to a supplier — debit note is issued immediately</p>
                    </div>
                    <Button size="sm" onClick={submit} disabled={saving}>
                        <Undo2 className="mr-1 size-4" /> Post Return
                    </Button>
                </div>

                <div data-enter-nav className="grid grid-cols-2 gap-3 rounded-xl border p-4 md:grid-cols-4">
                    <div>
                        <Label>Supplier *</Label>
                        <Select
                            value={companyId}
                            onValueChange={(v) => {
                                setCompanyId(v);
                                setRows([]);
                            }}
                        >
                            <SelectTrigger autoFocus><SelectValue placeholder="Select supplier" /></SelectTrigger>
                            <SelectContent>
                                {companies.map((company) => (
                                    <SelectItem key={company.id} value={String(company.id)}>{company.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div>
                        <Label>Return Date</Label>
                        <Input type="date" value={returnDate} onChange={(e) => setReturnDate(e.target.value)} />
                    </div>
                    <div>
                        <Label>Reason</Label>
                        <Input placeholder="e.g. near expiry, damaged" value={reason} onChange={(e) => setReason(e.target.value)} />
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
                                <TableHead>Batch</TableHead>
                                <TableHead>Expiry</TableHead>
                                <TableHead className="text-right">Available</TableHead>
                                <TableHead className="w-28 text-right">Return Qty</TableHead>
                                <TableHead className="w-28 text-right">Rate</TableHead>
                                <TableHead className="text-right">Amount</TableHead>
                                <TableHead className="w-10" />
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {rows.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                                        {companyId ? 'Add products to load their in-stock batches.' : 'Select a supplier first.'}
                                    </TableCell>
                                </TableRow>
                            )}
                            {rows.map((row, index) => {
                                const over = toNumber(row.quantity) > row.available + 1e-9;
                                return (
                                    <TableRow key={row.batch_id}>
                                        <TableCell className="font-medium">{row.product}</TableCell>
                                        <TableCell className="font-mono text-sm">{row.batch_number}</TableCell>
                                        <TableCell>{row.expiry_date?.slice(0, 7) ?? '—'}</TableCell>
                                        <TableCell className="text-right tabular-nums">{fmtQty(row.available)}</TableCell>
                                        <TableCell>
                                            <Input
                                                type="number" min={0} max={row.available}
                                                className={`h-8 text-right ${over ? 'border-destructive' : ''}`}
                                                value={row.quantity} placeholder="0"
                                                onChange={(e) =>
                                                    setRows((r) => r.map((x, i) => (i === index ? { ...x, quantity: e.target.value } : x)))
                                                }
                                            />
                                        </TableCell>
                                        <TableCell>
                                            <Input
                                                type="number" min={0} step="0.01"
                                                className="h-8 text-right"
                                                value={row.rate}
                                                onChange={(e) =>
                                                    setRows((r) => r.map((x, i) => (i === index ? { ...x, rate: e.target.value } : x)))
                                                }
                                            />
                                        </TableCell>
                                        <TableCell className="text-right tabular-nums">
                                            {amount(toNumber(row.quantity) * toNumber(row.rate))}
                                        </TableCell>
                                        <TableCell>
                                            <button type="button" tabIndex={-1} onClick={() => setRows((r) => r.filter((_, i) => i !== index))}>
                                                <Trash2 className="size-4 text-muted-foreground hover:text-destructive" />
                                            </button>
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                    <div className="border-t p-2">
                        <Button variant="ghost" size="sm" disabled={!companyId} onClick={() => setSearchOpen(true)}>
                            <Plus className="mr-1 size-4" /> Add Product Batches
                        </Button>
                    </div>
                </div>

                <div className="ml-auto w-72 space-y-1 rounded-xl border p-4 text-sm">
                    <div className="flex justify-between text-base font-semibold">
                        <span>Debit Note Total</span>
                        <span className="tabular-nums">{money(total)}</span>
                    </div>
                </div>
            </div>

            <ProductSearchDialog
                open={searchOpen}
                onOpenChange={setSearchOpen}
                warehouseId={warehouse.id}
                companyId={companyId ? Number(companyId) : undefined}
                onSelect={(product) => void addProductBatches(product)}
            />
        </AppLayout>
    );
}
