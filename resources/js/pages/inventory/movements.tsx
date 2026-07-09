import { Paginator, type PaginatedData } from '@/components/paginator';
import { Badge } from '@/components/ui/badge';
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import AppLayout from '@/layouts/app-layout';
import { qty } from '@/lib/format';
import { type BreadcrumbItem } from '@/types';
import { Head, router } from '@inertiajs/react';

interface MovementRow {
    id: number;
    type: string;
    quantity: string;
    remarks: string | null;
    created_at: string;
    product?: { id: number; name: string };
    batch?: { id: number; batch_number: string };
    user?: { id: number; name: string } | null;
}

interface Props {
    movements: PaginatedData<MovementRow>;
    filters: { product_id?: string; type?: string };
}

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Inventory', href: '/inventory' },
    { title: 'Movements', href: '/inventory/movements' },
];

const TYPES = ['purchase', 'sale', 'sale_return', 'purchase_return', 'adjustment_in', 'adjustment_out', 'damage', 'expired'];

export default function InventoryMovements({ movements, filters }: Props) {
    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Stock Movements" />
            <div className="flex h-full flex-col gap-4 p-4">
                <div>
                    <h1 className="text-2xl font-bold">Stock Movements</h1>
                    <p className="text-sm text-muted-foreground">Append-only ledger of every stock change</p>
                </div>

                <Select
                    value={filters.type ?? 'all'}
                    onValueChange={(v) =>
                        router.get('/inventory/movements', { ...filters, type: v === 'all' ? undefined : v }, { preserveState: true })
                    }
                >
                    <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All types</SelectItem>
                        {TYPES.map((type) => (
                            <SelectItem key={type} value={type} className="capitalize">{type.replace('_', ' ')}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>

                <div className="rounded-xl border">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Date / Time</TableHead>
                                <TableHead>Product</TableHead>
                                <TableHead>Batch</TableHead>
                                <TableHead>Type</TableHead>
                                <TableHead className="text-right">Qty</TableHead>
                                <TableHead>By</TableHead>
                                <TableHead>Remarks</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {movements.data.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                                        No movements yet.
                                    </TableCell>
                                </TableRow>
                            )}
                            {movements.data.map((movement) => {
                                const isIn = Number(movement.quantity) > 0;
                                return (
                                    <TableRow key={movement.id}>
                                        <TableCell className="whitespace-nowrap text-sm">
                                            {new Date(movement.created_at).toLocaleString('en-GB', {
                                                day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
                                            })}
                                        </TableCell>
                                        <TableCell className="font-medium">{movement.product?.name}</TableCell>
                                        <TableCell className="font-mono text-sm">{movement.batch?.batch_number}</TableCell>
                                        <TableCell>
                                            <Badge variant={isIn ? 'default' : 'secondary'} className="capitalize">
                                                {movement.type.replace('_', ' ')}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className={`text-right tabular-nums ${isIn ? 'text-green-600 dark:text-green-400' : 'text-destructive'}`}>
                                            {isIn ? '+' : ''}{qty(movement.quantity)}
                                        </TableCell>
                                        <TableCell>{movement.user?.name ?? '—'}</TableCell>
                                        <TableCell className="text-sm text-muted-foreground">{movement.remarks ?? '—'}</TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                    <Paginator meta={movements} />
                </div>
            </div>
        </AppLayout>
    );
}
