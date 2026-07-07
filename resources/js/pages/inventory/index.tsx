import { Paginator, type PaginatedData } from '@/components/paginator';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import AppLayout from '@/layouts/app-layout';
import { amount, money, qty } from '@/lib/format';
import { type BreadcrumbItem } from '@/types';
import { useListKeyboardNav } from '@/hooks/use-list-keyboard-nav';
import { Head, Link, router } from '@inertiajs/react';
import { History, Layers, Search } from 'lucide-react';
import { useEffect, useState } from 'react';

interface ProductRow {
    id: number;
    name: string;
    generic_name: string | null;
    pack_size: string | null;
    min_stock: string;
    reorder_level: string;
    stock: string | null;
    reserved: string | null;
    stock_value: string | null;
    company?: { id: number; name: string };
}

interface Props {
    products: PaginatedData<ProductRow>;
    companies: { id: number; name: string }[];
    filters: { search?: string; company_id?: string; low_stock?: boolean };
    totals: { inventory_value: number };
}

const breadcrumbs: BreadcrumbItem[] = [{ title: 'Inventory', href: '/inventory' }];

export default function InventoryIndex({ products, companies, filters, totals }: Props) {
    const [search, setSearch] = useState(filters.search ?? '');
    const { searchRef, onSearchKeyDown, rowProps } = useListKeyboardNav({
        rowCount: products.data.length,
        onActivate: () => {}, // stock rows have no detail page
    });

    useEffect(() => {
        const timeout = setTimeout(() => {
            if ((filters.search ?? '') !== search) {
                router.get('/inventory', { ...filters, search: search || undefined }, { preserveState: true, replace: true });
            }
        }, 350);
        return () => clearTimeout(timeout);
    }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Inventory" />
            <div className="flex h-full flex-col gap-4 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                        <h1 className="text-xl font-semibold">Stock Position</h1>
                        <p className="text-sm text-muted-foreground">Product-wise available stock and value at cost</p>
                    </div>
                    <div className="flex gap-2">
                        <Button variant="outline" size="sm" asChild>
                            <Link href="/inventory/batches"><Layers className="mr-1 size-4" /> Batches & Expiry</Link>
                        </Button>
                        <Button variant="outline" size="sm" asChild>
                            <Link href="/inventory/movements"><History className="mr-1 size-4" /> Movements</Link>
                        </Button>
                    </div>
                </div>

                <Card className="w-fit">
                    <CardHeader className="pb-1">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Total Inventory Value (at cost)</CardTitle>
                    </CardHeader>
                    <CardContent className="text-2xl font-semibold tabular-nums">{money(totals.inventory_value)}</CardContent>
                </Card>

                <div className="flex flex-wrap items-center gap-2">
                    <div className="relative w-72">
                        <Search className="absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
                        <Input ref={searchRef} onKeyDown={onSearchKeyDown} placeholder="Search product…" className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} />
                    </div>
                    <Select
                        value={filters.company_id ?? 'all'}
                        onValueChange={(v) => router.get('/inventory', { ...filters, company_id: v === 'all' ? undefined : v }, { preserveState: true })}
                    >
                        <SelectTrigger className="w-48"><SelectValue placeholder="Supplier" /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All suppliers</SelectItem>
                            {companies.map((company) => (
                                <SelectItem key={company.id} value={String(company.id)}>{company.name}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <label className="flex items-center gap-2 text-sm">
                        <Checkbox
                            checked={!!filters.low_stock}
                            onCheckedChange={(checked) =>
                                router.get('/inventory', { ...filters, low_stock: checked ? 1 : undefined }, { preserveState: true })
                            }
                        />
                        Low stock only
                    </label>
                </div>

                <div className="rounded-xl border">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Product</TableHead>
                                <TableHead>Supplier</TableHead>
                                <TableHead className="text-right">Available</TableHead>
                                <TableHead className="text-right">Reserved</TableHead>
                                <TableHead className="text-right">Reorder Level</TableHead>
                                <TableHead className="text-right">Value at Cost</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {products.data.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                                        No products found.
                                    </TableCell>
                                </TableRow>
                            )}
                            {products.data.map((product, index) => {
                                const stock = Number(product.stock ?? 0);
                                const low = Number(product.reorder_level) > 0 && stock <= Number(product.reorder_level);
                                return (
                                    <TableRow key={product.id} {...rowProps(index)}>
                                        <TableCell>
                                            <div className="font-medium">{product.name}</div>
                                            <div className="text-xs text-muted-foreground">
                                                {product.generic_name}{product.pack_size ? ` · ${product.pack_size}` : ''}
                                            </div>
                                        </TableCell>
                                        <TableCell>{product.company?.name}</TableCell>
                                        <TableCell className="text-right tabular-nums">
                                            <span className={low ? 'font-semibold text-destructive' : ''}>{qty(stock)}</span>
                                        </TableCell>
                                        <TableCell className="text-right tabular-nums">{qty(product.reserved)}</TableCell>
                                        <TableCell className="text-right tabular-nums">{qty(product.reorder_level)}</TableCell>
                                        <TableCell className="text-right tabular-nums">{amount(product.stock_value)}</TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                    <Paginator meta={products} />
                </div>
            </div>
        </AppLayout>
    );
}
