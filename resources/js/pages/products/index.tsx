import { ImportDialog } from '@/components/import-dialog';
import { MasterFilterSelect, MasterRegister, MasterStatus, useMasterFilters } from '@/components/master-register';
import { type PaginatedData } from '@/components/paginator';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
    Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle,
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
import { Building2, Pencil, Plus, Tags, Trash2, Upload } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { toast } from 'sonner';

interface Product {
    id: number;
    name: string;
    generic_name: string | null;
    brand_name?: string | null;
    company_id?: number;
    category_id?: number | null;
    product_type?: string | null;
    sku?: string | null;
    barcode?: string | null;
    pack_size: string | null;
    purchase_price?: string;
    trade_price: string;
    retail_price: string;
    mrp?: string;
    tax_percent: string;
    default_discount_percent?: string;
    min_stock?: string;
    reorder_level: string;
    status: string;
    visible_to_bookers?: boolean;
    notes?: string | null;
    stock: string | null;
    company?: { id: number; name: string };
    category?: { id: number; name: string } | null;
}

interface Option { id: number; name: string }

interface Props {
    products: PaginatedData<Product>;
    companies?: Option[];
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
    min_stock: 0, reorder_level: 0, status: 'active', visible_to_bookers: true, notes: '',
};

type PriceField = 'purchase_price' | 'trade_price' | 'retail_price' | 'mrp';

export default function ProductsIndex({ products, companies = [], categories, filters }: Props) {
    const { can, canViewSupplierDetails: showSupplier } = usePermissions();
    const showCost = showSupplier && can('products.view_cost');
    const canManage = showSupplier && can('products.manage');
    const [dialogOpen, setDialogOpen] = useState(false);
    const [importOpen, setImportOpen] = useState(false);
    const [editing, setEditing] = useState<Product | null>(null);
    const filterState = useMasterFilters('/products', filters);
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

    const openCreate = () => {
        setEditing(null);
        form.setData(emptyForm);
        form.clearErrors();
        setDialogOpen(true);
    };

    const openEdit = (product: Product) => {
        if (!canManage) return;
        setEditing(product);
        form.setData({
            name: product.name,
            generic_name: product.generic_name ?? '',
            brand_name: product.brand_name ?? '',
            company_id: String(product.company_id ?? ''),
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
            min_stock: Number(product.min_stock ?? 0),
            reorder_level: Number(product.reorder_level),
            status: product.status,
            visible_to_bookers: product.visible_to_bookers ?? true,
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
    const priceNum = (key: PriceField) => Number(form.data[key]) || 0;
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
            <MasterRegister title="Products" description="Medicine and product catalogue" label="product" page={products}
                state={filterState} searchRef={searchRef} onSearchKeyDown={onSearchKeyDown} placeholder="Product name, generic or barcode"
                status={{ value: filters.status, onChange: status => filterState.change({ status }) }}
                actions={canManage && <>
                    <button type="button" className="hbtn" onClick={() => setImportOpen(true)}><Upload className="i" aria-hidden="true" />Import</button>
                    <button type="button" className="hbtn pri" onClick={openCreate}><Plus className="i" aria-hidden="true" />Add Product</button>
                </>}
                filters={<>
                    {showSupplier && <MasterFilterSelect label="Supplier" icon={Building2} value={filters.company_id ?? ''} onChange={value => filterState.change({ company_id: value || undefined })}>
                        <option value="">All suppliers</option>{companies.map(company => <option key={company.id} value={company.id}>{company.name}</option>)}
                    </MasterFilterSelect>}
                    <MasterFilterSelect label="Category" icon={Tags} value={filters.category_id ?? ''} onChange={value => filterState.change({ category_id: value || undefined })}>
                        <option value="">All categories</option>{categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}
                    </MasterFilterSelect>
                </>}>
                    {dense => <Table className={`product-table${dense ? ' dense' : ''}`}>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Product</TableHead>
                                {showSupplier && <TableHead>Supplier</TableHead>}
                                {showCost && <TableHead className="r">Purchase</TableHead>}
                                <TableHead className="r">Trade</TableHead>
                                <TableHead className="r">Retail</TableHead>
                                <TableHead className="r">GST %</TableHead>
                                <TableHead className="r">Stock</TableHead>
                                <TableHead>Status</TableHead>
                                {canManage && <TableHead className="r acts-head">Actions</TableHead>}
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {products.data.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={6 + Number(showSupplier) + Number(showCost) + Number(canManage)} className="empty">
                                        {filterState.applied ? 'No products match these filters.' : 'No products found.'}
                                    </TableCell>
                                </TableRow>
                            )}
                            {products.data.map((product, index) => {
                                const stock = Number(product.stock ?? 0);
                                const low = Number(product.reorder_level) > 0 && stock <= Number(product.reorder_level);
                                return (
                                    <TableRow key={product.id} {...rowProps(index)}>
                                        <TableCell className="entity-name">
                                            <strong>{product.name}</strong>
                                            {(product.generic_name || product.pack_size) && <small>{[product.generic_name, product.pack_size].filter(Boolean).join(' · ')}</small>}
                                        </TableCell>
                                        {showSupplier && <TableCell className="wrap-cell">{product.company?.name || '—'}</TableCell>}
                                        {showCost && <TableCell className="r num">{amount(product.purchase_price)}</TableCell>}
                                        <TableCell className="r num">{amount(product.trade_price)}</TableCell>
                                        <TableCell className="r num">{amount(product.retail_price)}</TableCell>
                                        <TableCell className="r num">{Number(product.tax_percent)}</TableCell>
                                        <TableCell className="r num">
                                            <span className={low ? 'font-semibold neg' : ''}>{qty(stock)}</span>
                                        </TableCell>
                                        <TableCell>
                                            <MasterStatus status={product.status} />
                                            {canManage && product.visible_to_bookers === false && <span className="st master-tag">Hidden from Bookers</span>}
                                        </TableCell>
                                        {canManage && (
                                            <TableCell>
                                                <div className="acts">
                                                    <button type="button" className="ib" title="Edit product" aria-label={`Edit ${product.name}`} onClick={() => openEdit(product)}><Pencil className="i" aria-hidden="true" /></button>
                                                    <button type="button" className="ib master-delete" title="Delete product" aria-label={`Delete ${product.name}`}
                                                        onClick={() => {
                                                            if (confirm(`Delete product "${product.name}"?`)) {
                                                                router.delete(route('products.destroy', product.id), { preserveScroll: true });
                                                            }
                                                        }}
                                                    >
                                                        <Trash2 className="i" aria-hidden="true" />
                                                    </button>
                                                </div>
                                            </TableCell>
                                        )}
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>}
            </MasterRegister>

            <ImportDialog
                open={importOpen}
                onOpenChange={setImportOpen}
                title="Import Products"
                importUrl={route('products.import')}
                templateUrl={route('products.template')}
            />

            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent appearance="form" className="max-w-3xl" aria-describedby={undefined}>
                    <DialogHeader>
                        <DialogTitle>{editing ? `Edit ${editing.name}` : 'Add Product'}</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={submit}>
                        <DialogBody className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
                        <div className="sm:col-span-2">
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
                        <div className="flex items-start gap-2.5 rounded-lg border p-3 sm:col-span-2">
                            <Checkbox
                                id="visible-to-bookers"
                                checked={form.data.visible_to_bookers}
                                onCheckedChange={(checked) => form.setData('visible_to_bookers', checked === true)}
                                aria-describedby="booker-visibility-hint"
                                className="mt-0.5"
                            />
                            <div className="space-y-1">
                                <Label htmlFor="visible-to-bookers" className="cursor-pointer">Show to Bookers</Label>
                                <p id="booker-visibility-hint" className="text-xs text-muted-foreground">
                                    Turning this off hides the product from Booker searches and new orders. Saved order history is kept.
                                </p>
                                {err('visible_to_bookers') && <p className="text-xs text-destructive">{err('visible_to_bookers')}</p>}
                            </div>
                        </div>
                        {numberField('purchase_price', 'Purchase Price', { dec: true, hint: 'Your cost from the supplier' })}
                        {numberField('trade_price', 'Trade Price', { dec: true, hint: 'Price to the pharmacy (fills sales lines)' })}
                        {numberField('retail_price', 'Retail Price', { dec: true, hint: 'Pharmacy → customer price' })}
                        {numberField('mrp', 'MRP', { dec: true, hint: 'Printed maximum retail price' })}
                        {numberField('tax_percent', 'GST %', { dec: true })}
                        {numberField('default_discount_percent', 'Default Discount %', { dec: true })}
                        {numberField('min_stock', 'Minimum Stock', { step: '1' })}
                        {numberField('reorder_level', 'Reorder Level', { step: '1' })}

                        <div className="col-span-full rounded-lg border bg-muted/30 p-3 text-sm">
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

                        </DialogBody>
                        <DialogFooter>
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
