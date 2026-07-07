import { ImportDialog } from '@/components/import-dialog';
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
import { amount, dec2, money, qty } from '@/lib/format';
import { type BreadcrumbItem } from '@/types';
import { useListKeyboardNav } from '@/hooks/use-list-keyboard-nav';
import { ALERT_FIX, positive, required, useClientValidation } from '@/lib/form-validation';
import { Head, router, useForm } from '@inertiajs/react';
import { Pencil, Plus, Search, Trash2, Upload } from 'lucide-react';
import { FormEvent, useEffect, useState } from 'react';
import { toast } from 'sonner';

interface Product {
    id: number;
    name: string;
    generic_name: string | null;
    brand_name: string | null;
    company_id: number;
    category_id: number | null;
    product_type: string | null;
    sku: string | null;
    barcode: string | null;
    pack_size: string | null;
    purchase_price: string;
    trade_price: string;
    retail_price: string;
    mrp: string;
    tax_percent: string;
    default_discount_percent: string;
    min_stock: string;
    reorder_level: string;
    status: string;
    notes: string | null;
    stock: string | null;
    company?: { id: number; name: string };
    category?: { id: number; name: string } | null;
}

interface Option { id: number; name: string }

interface Props {
    products: PaginatedData<Product>;
    companies: Option[];
    categories: Option[];
    filters: { search?: string; company_id?: string; category_id?: string; status?: string };
}

const breadcrumbs: BreadcrumbItem[] = [{ title: 'Products', href: '/products' }];

// Money/percent fields are held as strings so they can display 0.00; qty
// fields (min_stock, reorder_level) stay plain numbers.
const emptyForm = {
    name: '', generic_name: '', brand_name: '', company_id: '', category_id: '', product_type: '',
    sku: '', barcode: '', pack_size: '',
    purchase_price: '0.00', trade_price: '0.00', retail_price: '0.00', mrp: '0.00',
    tax_percent: '0.00', default_discount_percent: '0.00',
    min_stock: 0, reorder_level: 0, status: 'active', notes: '',
};

const DECIMAL_FIELDS = ['purchase_price', 'trade_price', 'retail_price', 'mrp', 'tax_percent', 'default_discount_percent'] as const;

export default function ProductsIndex({ products, companies, categories, filters }: Props) {
    const { can } = usePermissions();
    const [dialogOpen, setDialogOpen] = useState(false);
    const [importOpen, setImportOpen] = useState(false);
    const [editing, setEditing] = useState<Product | null>(null);
    const [search, setSearch] = useState(filters.search ?? '');
    const { searchRef, onSearchKeyDown, rowProps } = useListKeyboardNav({
        rowCount: products.data.length,
        onActivate: (i) => openEdit(products.data[i]),
    });

    const form = useForm(emptyForm);
    const { validateField, validateForm } = useClientValidation(form, {
        name: required('Product name'),
        company_id: required('Supplier'),
        purchase_price: positive('Purchase price'),
        trade_price: positive('Trade price'),
        retail_price: positive('Retail price'),
        mrp: positive('MRP'),
    });

    useEffect(() => {
        const timeout = setTimeout(() => {
            if ((filters.search ?? '') !== search) {
                router.get('/products', { ...filters, search: search || undefined }, { preserveState: true, replace: true });
            }
        }, 350);
        return () => clearTimeout(timeout);
    }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

    const openCreate = () => {
        setEditing(null);
        form.setData(emptyForm);
        form.clearErrors();
        setDialogOpen(true);
    };

    const openEdit = (product: Product) => {
        setEditing(product);
        form.setData({
            name: product.name,
            generic_name: product.generic_name ?? '',
            brand_name: product.brand_name ?? '',
            company_id: String(product.company_id),
            category_id: product.category_id ? String(product.category_id) : '',
            product_type: product.product_type ?? '',
            sku: product.sku ?? '',
            barcode: product.barcode ?? '',
            pack_size: product.pack_size ?? '',
            purchase_price: dec2(product.purchase_price),
            trade_price: dec2(product.trade_price),
            retail_price: dec2(product.retail_price),
            mrp: dec2(product.mrp),
            tax_percent: dec2(product.tax_percent),
            default_discount_percent: dec2(product.default_discount_percent),
            min_stock: Number(product.min_stock),
            reorder_level: Number(product.reorder_level),
            status: product.status,
            notes: product.notes ?? '',
        });
        form.clearErrors();
        setDialogOpen(true);
    };

    const submit = (e: FormEvent) => {
        e.preventDefault();
        if (!validateForm()) {
            toast.error(ALERT_FIX);
            return;
        }
        form.transform((data) => ({
            ...data,
            company_id: data.company_id || null,
            category_id: data.category_id || null,
        }));
        const options = {
            preserveScroll: true,
            onSuccess: () => setDialogOpen(false),
            onError: () => toast.error(ALERT_FIX),
        };
        if (editing) form.put(route('products.update', editing.id), options);
        else form.post(route('products.store'), options);
    };

    const err = (key: string) => (form.errors as Record<string, string>)[key];

    // Live margins from the current (string) price fields.
    const priceNum = (key: (typeof DECIMAL_FIELDS)[number]) => Number(form.data[key]) || 0;
    const pPurchase = priceNum('purchase_price');
    const pTrade = priceNum('trade_price');
    const pRetail = priceNum('retail_price');
    const pMrp = priceNum('mrp');
    const yourMarginPct = pPurchase > 0 ? ((pTrade - pPurchase) / pPurchase) * 100 : 0;
    const pharmacyMarginPct = pTrade > 0 ? ((pRetail - pTrade) / pTrade) * 100 : 0;
    const priceWarnings = [
        pTrade > 0 && pTrade < pPurchase ? 'Trade price is below purchase cost' : null,
        pRetail > 0 && pRetail < pTrade ? 'Retail is below trade price' : null,
        pMrp > 0 && pRetail > pMrp ? 'Retail exceeds MRP' : null,
    ].filter(Boolean) as string[];

    const numberField = (
        key: keyof typeof emptyForm,
        label: string,
        opts: { dec?: boolean; step?: string; hint?: string } = {},
    ) => {
        const { dec = false, step = '0.01', hint } = opts;
        return (
            <div>
                <Label htmlFor={key}>{label}</Label>
                <Input
                    id={key} type="number" min={0} step={step}
                    value={form.data[key] as string | number}
                    onChange={(e) => form.setData(key, (dec ? e.target.value : Number(e.target.value)) as never)}
                    onBlur={(e) => {
                        if (dec) form.setData(key, dec2(e.target.value) as never);
                        validateField(key);
                    }}
                    aria-invalid={!!err(key)}
                    className={err(key) ? 'border-destructive ring-1 ring-destructive' : ''}
                />
                {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
                {err(key) && <p className="text-xs text-destructive">{err(key)}</p>}
            </div>
        );
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Products" />
            <div className="flex h-full flex-col gap-4 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                        <h1 className="text-xl font-semibold">Products</h1>
                        <p className="text-sm text-muted-foreground">Medicine and product master</p>
                    </div>
                    {can('products.manage') && (
                        <div className="flex gap-2">
                            <Button variant="outline" onClick={() => setImportOpen(true)}>
                                <Upload className="mr-1 size-4" /> Import
                            </Button>
                            <Button onClick={openCreate}>
                                <Plus className="mr-1 size-4" /> Add Product
                            </Button>
                        </div>
                    )}
                </div>

                <div className="flex flex-wrap gap-2">
                    <div className="relative w-full sm:w-72">
                        <Search className="absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
                        <Input
                            ref={searchRef}
                            onKeyDown={onSearchKeyDown}
                            placeholder="Search name, generic, barcode…"
                            className="pl-8"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </div>
                    <Select
                        value={filters.company_id ?? 'all'}
                        onValueChange={(v) =>
                            router.get('/products', { ...filters, company_id: v === 'all' ? undefined : v }, { preserveState: true })
                        }
                    >
                        <SelectTrigger className="w-48"><SelectValue placeholder="Supplier" /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All suppliers</SelectItem>
                            {companies.map((company) => (
                                <SelectItem key={company.id} value={String(company.id)}>{company.name}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <Select
                        value={filters.status ?? 'all'}
                        onValueChange={(v) =>
                            router.get('/products', { ...filters, status: v === 'all' ? undefined : v }, { preserveState: true })
                        }
                    >
                        <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All statuses</SelectItem>
                            <SelectItem value="active">Active</SelectItem>
                            <SelectItem value="inactive">Inactive</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                <div className="rounded-xl border">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Product</TableHead>
                                <TableHead>Supplier</TableHead>
                                <TableHead className="text-right">Purchase</TableHead>
                                <TableHead className="text-right">Trade</TableHead>
                                <TableHead className="text-right">Retail</TableHead>
                                <TableHead className="text-right">GST %</TableHead>
                                <TableHead className="text-right">Stock</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="w-24" />
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {products.data.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={9} className="py-10 text-center text-muted-foreground">
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
                                        <TableCell className="text-right tabular-nums">{amount(product.purchase_price)}</TableCell>
                                        <TableCell className="text-right tabular-nums">{amount(product.trade_price)}</TableCell>
                                        <TableCell className="text-right tabular-nums">{amount(product.retail_price)}</TableCell>
                                        <TableCell className="text-right tabular-nums">{Number(product.tax_percent)}</TableCell>
                                        <TableCell className="text-right tabular-nums">
                                            <span className={low ? 'font-semibold text-destructive' : ''}>{qty(stock)}</span>
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant={product.status === 'active' ? 'default' : 'secondary'}>
                                                {product.status}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>
                                            {can('products.manage') && (
                                                <div className="flex justify-end gap-1">
                                                    <Button variant="ghost" size="icon" onClick={() => openEdit(product)}>
                                                        <Pencil className="size-4" />
                                                    </Button>
                                                    <Button
                                                        variant="ghost" size="icon"
                                                        onClick={() => {
                                                            if (confirm(`Delete product "${product.name}"?`)) {
                                                                router.delete(route('products.destroy', product.id), { preserveScroll: true });
                                                            }
                                                        }}
                                                    >
                                                        <Trash2 className="size-4 text-destructive" />
                                                    </Button>
                                                </div>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                    <Paginator meta={products} />
                </div>
            </div>

            <ImportDialog
                open={importOpen}
                onOpenChange={setImportOpen}
                title="Import Products"
                importUrl={route('products.import')}
                templateUrl={route('products.template')}
            />

            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>{editing ? `Edit ${editing.name}` : 'Add Product'}</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={submit} className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
                        <div className="col-span-2">
                            <Label htmlFor="name">Product Name *</Label>
                            <Input
                                id="name"
                                value={form.data.name}
                                onChange={(e) => form.setData('name', e.target.value)}
                                onBlur={() => validateField('name')}
                                aria-invalid={!!err('name')}
                                className={err('name') ? 'border-destructive ring-1 ring-destructive' : ''}
                                autoFocus
                            />
                            {err('name') && <p className="text-xs text-destructive">{err('name')}</p>}
                        </div>
                        <div>
                            <Label htmlFor="generic_name">Generic Name</Label>
                            <Input id="generic_name" value={form.data.generic_name} onChange={(e) => form.setData('generic_name', e.target.value)} />
                        </div>
                        <div>
                            <Label>Supplier *</Label>
                            <Select value={form.data.company_id} onValueChange={(v) => { form.setData('company_id', v); form.clearErrors('company_id'); }}>
                                <SelectTrigger aria-invalid={!!err('company_id')} className={err('company_id') ? 'border-destructive ring-1 ring-destructive' : ''}><SelectValue placeholder="Select company" /></SelectTrigger>
                                <SelectContent>
                                    {companies.map((company) => (
                                        <SelectItem key={company.id} value={String(company.id)}>{company.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            {err('company_id') && <p className="text-xs text-destructive">{err('company_id')}</p>}
                        </div>
                        <div>
                            <Label>Category</Label>
                            <Select
                                value={form.data.category_id || 'none'}
                                onValueChange={(v) => form.setData('category_id', v === 'none' ? '' : v)}
                            >
                                <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="none">No category</SelectItem>
                                    {categories.map((category) => (
                                        <SelectItem key={category.id} value={String(category.id)}>{category.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <Label htmlFor="pack_size">Pack Size</Label>
                            <Input id="pack_size" placeholder="e.g. 10x10" value={form.data.pack_size} onChange={(e) => form.setData('pack_size', e.target.value)} />
                        </div>
                        <div>
                            <Label htmlFor="sku">SKU</Label>
                            <Input id="sku" value={form.data.sku} onChange={(e) => form.setData('sku', e.target.value)} />
                        </div>
                        <div>
                            <Label htmlFor="barcode">Barcode</Label>
                            <Input id="barcode" value={form.data.barcode} onChange={(e) => form.setData('barcode', e.target.value)} />
                        </div>
                        <div>
                            <Label>Status</Label>
                            <Select value={form.data.status} onValueChange={(v) => form.setData('status', v)}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="active">Active</SelectItem>
                                    <SelectItem value="inactive">Inactive</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        {numberField('purchase_price', 'Purchase Price', { dec: true, hint: 'Your cost from the supplier' })}
                        {numberField('trade_price', 'Trade Price', { dec: true, hint: 'Price to the pharmacy (fills sales lines)' })}
                        {numberField('retail_price', 'Retail Price', { dec: true, hint: 'Pharmacy → customer price' })}
                        {numberField('mrp', 'MRP', { dec: true, hint: 'Printed maximum retail price' })}
                        {numberField('tax_percent', 'GST %', { dec: true })}
                        {numberField('default_discount_percent', 'Default Discount %', { dec: true })}
                        {numberField('min_stock', 'Minimum Stock', { step: '1' })}
                        {numberField('reorder_level', 'Reorder Level', { step: '1' })}

                        <div className="col-span-3 rounded-lg border bg-muted/30 p-3 text-sm">
                            <div className="grid gap-1 sm:grid-cols-2">
                                <div className="flex items-center justify-between gap-2">
                                    <span className="text-muted-foreground">Your margin (Trade − Purchase)</span>
                                    <span className="tabular-nums font-medium">
                                        {money(pTrade - pPurchase)} · {yourMarginPct.toFixed(2)}%
                                    </span>
                                </div>
                                <div className="flex items-center justify-between gap-2">
                                    <span className="text-muted-foreground">Pharmacy margin (Retail − Trade)</span>
                                    <span className="tabular-nums font-medium">
                                        {money(pRetail - pTrade)} · {pharmacyMarginPct.toFixed(2)}%
                                    </span>
                                </div>
                            </div>
                            {priceWarnings.length > 0 && (
                                <p className="mt-2 text-xs text-amber-600 dark:text-amber-500">
                                    ⚠ {priceWarnings.join(' · ')}
                                </p>
                            )}
                        </div>

                        <DialogFooter className="col-span-3">
                            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                            <Button type="submit" disabled={form.processing}>
                                {editing ? 'Save Changes' : 'Create Product'}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </AppLayout>
    );
}
