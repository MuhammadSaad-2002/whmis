import { Paginator, type PaginatedData } from '@/components/paginator';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { usePermissions } from '@/hooks/use-permissions';
import AppLayout from '@/layouts/app-layout';
import { amount, qty, shortDate } from '@/lib/format';
import { type BreadcrumbItem } from '@/types';
import { Head, router, useForm } from '@inertiajs/react';
import { Search, SlidersHorizontal } from 'lucide-react';
import { FormEvent, useEffect, useState } from 'react';

interface BatchRow {
    id: number;
    batch_number: string;
    expiry_date: string | null;
    purchase_rate: string;
    effective_cost: string;
    trade_price: string;
    qty_purchased: string;
    qty_bonus: string;
    qty_sold: string;
    qty_available: string;
    product?: { id: number; name: string; company?: { id: number; name: string } };
    warehouse?: { id: number; name: string };
}

interface Props {
    batches: PaginatedData<BatchRow>;
    filters: { search?: string; expiry?: string; in_stock?: boolean };
}

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Inventory', href: '/inventory' },
    { title: 'Batches', href: '/inventory/batches' },
];

function expiryBadge(expiry: string | null) {
    if (!expiry) return <span className="text-muted-foreground">—</span>;
    const days = Math.floor((new Date(expiry).getTime() - Date.now()) / 86400000);
    if (days < 0) return <Badge variant="destructive">Expired</Badge>;
    if (days <= 90) return <Badge variant="destructive">{days}d left</Badge>;
    if (days <= 180) return <Badge variant="secondary">{days}d left</Badge>;
    return <span className="text-muted-foreground">{shortDate(expiry)}</span>;
}

export default function InventoryBatches({ batches, filters }: Props) {
    const { can } = usePermissions();
    const [search, setSearch] = useState(filters.search ?? '');
    const [adjusting, setAdjusting] = useState<BatchRow | null>(null);

    const form = useForm({
        batch_id: 0,
        type: 'decrease',
        quantity: 0,
        adjustment_date: new Date().toISOString().slice(0, 10),
        reason: '',
    });

    useEffect(() => {
        const timeout = setTimeout(() => {
            if ((filters.search ?? '') !== search) {
                router.get('/inventory/batches', { ...filters, search: search || undefined }, { preserveState: true, replace: true });
            }
        }, 350);
        return () => clearTimeout(timeout);
    }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

    const openAdjust = (batch: BatchRow) => {
        setAdjusting(batch);
        form.setData({
            batch_id: batch.id,
            type: 'decrease',
            quantity: 0,
            adjustment_date: new Date().toISOString().slice(0, 10),
            reason: '',
        });
        form.clearErrors();
    };

    const submit = (e: FormEvent) => {
        e.preventDefault();
        form.post(route('inventory.adjustments.store'), {
            preserveScroll: true,
            onSuccess: () => setAdjusting(null),
        });
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Batches" />
            <div className="flex h-full flex-col gap-4 p-4">
                <div>
                    <h1 className="text-2xl font-bold">Batches & Expiry</h1>
                    <p className="text-sm text-muted-foreground">Batch-wise stock, FIFO order, expiry monitoring</p>
                </div>

                <div className="flex flex-wrap gap-2">
                    <div className="relative w-full sm:w-72">
                        <Search className="absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
                        <Input placeholder="Search batch or product…" className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} />
                    </div>
                    <Select
                        value={filters.expiry ?? 'all'}
                        onValueChange={(v) =>
                            router.get('/inventory/batches', { ...filters, expiry: v === 'all' ? undefined : v }, { preserveState: true })
                        }
                    >
                        <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All expiries</SelectItem>
                            <SelectItem value="expired">Expired</SelectItem>
                            <SelectItem value="30">Within 30 days</SelectItem>
                            <SelectItem value="90">Within 90 days</SelectItem>
                            <SelectItem value="180">Within 180 days</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                <div className="rounded-xl border">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Product</TableHead>
                                <TableHead>Batch</TableHead>
                                <TableHead>Expiry</TableHead>
                                <TableHead className="text-right">Purchased</TableHead>
                                <TableHead className="text-right">Bonus</TableHead>
                                <TableHead className="text-right">Sold</TableHead>
                                <TableHead className="text-right">Available</TableHead>
                                <TableHead className="text-right">Eff. Cost</TableHead>
                                <TableHead className="text-right">Trade</TableHead>
                                <TableHead className="w-12" />
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {batches.data.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={10} className="py-10 text-center text-muted-foreground">
                                        No batches found.
                                    </TableCell>
                                </TableRow>
                            )}
                            {batches.data.map((batch) => (
                                <TableRow key={batch.id}>
                                    <TableCell>
                                        <div className="font-medium">{batch.product?.name}</div>
                                        <div className="text-xs text-muted-foreground">{batch.product?.company?.name}</div>
                                    </TableCell>
                                    <TableCell className="font-mono text-sm">{batch.batch_number}</TableCell>
                                    <TableCell>{expiryBadge(batch.expiry_date)}</TableCell>
                                    <TableCell className="text-right tabular-nums">{qty(batch.qty_purchased)}</TableCell>
                                    <TableCell className="text-right tabular-nums">{qty(batch.qty_bonus)}</TableCell>
                                    <TableCell className="text-right tabular-nums">{qty(batch.qty_sold)}</TableCell>
                                    <TableCell className="text-right font-medium tabular-nums">{qty(batch.qty_available)}</TableCell>
                                    <TableCell className="text-right tabular-nums">{amount(batch.effective_cost)}</TableCell>
                                    <TableCell className="text-right tabular-nums">{amount(batch.trade_price)}</TableCell>
                                    <TableCell>
                                        {can('inventory.adjust') && (
                                            <Button variant="ghost" size="icon" title="Adjust stock" onClick={() => openAdjust(batch)}>
                                                <SlidersHorizontal className="size-4" />
                                            </Button>
                                        )}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                    <Paginator meta={batches} />
                </div>
            </div>

            <Dialog open={!!adjusting} onOpenChange={(open) => !open && setAdjusting(null)}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>
                            Adjust Stock — {adjusting?.product?.name} ({adjusting?.batch_number})
                        </DialogTitle>
                    </DialogHeader>
                    <form onSubmit={submit} className="grid gap-3">
                        <p className="text-sm text-muted-foreground">
                            Available: <span className="font-medium tabular-nums">{qty(adjusting?.qty_available)}</span>
                        </p>
                        <div>
                            <Label>Adjustment Type</Label>
                            <Select value={form.data.type} onValueChange={(v) => form.setData('type', v)}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="increase">Increase (found stock)</SelectItem>
                                    <SelectItem value="decrease">Decrease (shortage)</SelectItem>
                                    <SelectItem value="damage">Damaged</SelectItem>
                                    <SelectItem value="expired">Expired write-off</SelectItem>
                                    <SelectItem value="recount">Recount addition</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <Label>Quantity *</Label>
                            <Input
                                type="number" min={0.01} step="0.01" value={form.data.quantity}
                                onChange={(e) => form.setData('quantity', Number(e.target.value))}
                            />
                            {form.errors.quantity && <p className="text-xs text-destructive">{form.errors.quantity}</p>}
                        </div>
                        <div>
                            <Label>Date</Label>
                            <Input
                                type="date" value={form.data.adjustment_date}
                                onChange={(e) => form.setData('adjustment_date', e.target.value)}
                            />
                        </div>
                        <div>
                            <Label>Reason</Label>
                            <Input value={form.data.reason} onChange={(e) => form.setData('reason', e.target.value)} />
                        </div>
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setAdjusting(null)}>Cancel</Button>
                            <Button type="submit" disabled={form.processing}>Apply Adjustment</Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </AppLayout>
    );
}
