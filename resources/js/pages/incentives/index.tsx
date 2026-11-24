import { MasterFilterSelect, MasterRegister, MasterStatus, useMasterFilters } from '@/components/master-register';
import { type PaginatedData } from '@/components/paginator';
import { Button } from '@/components/ui/button';
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
import { shortDate } from '@/lib/format';
import { type BreadcrumbItem } from '@/types';
import { useListKeyboardNav } from '@/hooks/use-list-keyboard-nav';
import { ALERT_FIX, required, useClientValidation, type Validator } from '@/lib/form-validation';
import { Head, router, useForm } from '@inertiajs/react';
import { ListFilter, Pencil, Plus, Trash2 } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { toast } from 'sonner';

interface Slab {
    min_qty: number | string;
    max_qty: number | string | null;
    bonus_qty: number | string;
    [key: string]: number | string | null;
}

interface Rule {
    id: number;
    name: string;
    rule_type: string;
    product_id: number | null;
    company_id: number | null;
    customer_id: number | null;
    base_qty: string | null;
    bonus_qty: string | null;
    slabs: Slab[] | null;
    value: string | null;
    min_qty: string | null;
    date_from: string | null;
    date_to: string | null;
    priority: number;
    active: boolean;
    summary: string;
    product?: { id: number; name: string } | null;
    company?: { id: number; name: string } | null;
    customer?: { id: number; name: string } | null;
}

interface Option { id: number; name: string }

interface Props {
    rules: PaginatedData<Rule>;
    products: Option[];
    companies: Option[];
    customers: Option[];
    filters: { search?: string; rule_type?: string; active?: string };
}

const breadcrumbs: BreadcrumbItem[] = [{ title: 'Incentive Rules', href: '/incentives' }];

const RULE_TYPES: Record<string, string> = {
    qty_bonus: 'Buy X Get Y (repeats)',
    slab_bonus: 'Quantity Slabs → Bonus',
    percent_discount: 'Percentage Discount',
    fixed_discount: 'Fixed Discount (Rs)',
    price_override: 'Special Trade Price',
};

const emptyForm = {
    name: '', rule_type: 'qty_bonus', product_id: '', company_id: '', customer_id: '',
    base_qty: 10, bonus_qty: 1, slabs: [{ min_qty: 10, max_qty: '', bonus_qty: 1 }] as Slab[],
    value: 0, min_qty: '', date_from: '', date_to: '', priority: 0, active: true,
};

// A rule that only applies when the incentive is of `type`.
const whenType = (type: string, message: string, ok: (value: unknown) => boolean): Validator =>
    (value, data) => (data?.rule_type === type && !ok(value) ? message : null);

export default function IncentivesIndex({ rules, products, companies, customers, filters }: Props) {
    const { can } = usePermissions();
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editing, setEditing] = useState<Rule | null>(null);
    const state = useMasterFilters('/incentives', filters);
    const manage = can('incentives.manage');
    const statusFilter = filters.active ? ['1', 'true', 'on', 'yes'].includes(filters.active.toLowerCase()) ? 'active' : 'inactive' : undefined;
    const { searchRef, onSearchKeyDown, rowProps } = useListKeyboardNav({
        rowCount: rules.data.length,
        onActivate: (i) => { if (manage) openEdit(rules.data[i]); },
    });

    const form = useForm(emptyForm);
    const { validateField, validateForm } = useClientValidation(form, {
        name: required('Rule name'),
        base_qty: whenType('qty_bonus', 'Buy quantity must be at least 1.', (v) => Number(v) >= 1),
        bonus_qty: whenType('qty_bonus', 'Free quantity must be at least 1.', (v) => Number(v) >= 1),
        value: [
            whenType('percent_discount', 'Discount % must be between 0 and 100.', (v) => Number(v) >= 0 && Number(v) <= 100),
            whenType('fixed_discount', 'Discount amount cannot be negative.', (v) => Number(v) >= 0),
            whenType('price_override', 'Special price cannot be negative.', (v) => Number(v) >= 0),
        ],
    });

    const openCreate = () => {
        setEditing(null);
        form.setData(emptyForm);
        form.clearErrors();
        setDialogOpen(true);
    };

    const openEdit = (rule: Rule) => {
        setEditing(rule);
        form.setData({
            name: rule.name,
            rule_type: rule.rule_type,
            product_id: rule.product_id ? String(rule.product_id) : '',
            company_id: rule.company_id ? String(rule.company_id) : '',
            customer_id: rule.customer_id ? String(rule.customer_id) : '',
            base_qty: Number(rule.base_qty ?? 10),
            bonus_qty: Number(rule.bonus_qty ?? 1),
            slabs: rule.slabs?.length ? rule.slabs : [{ min_qty: 10, max_qty: '', bonus_qty: 1 }],
            value: Number(rule.value ?? 0),
            min_qty: rule.min_qty ? String(Number(rule.min_qty)) : '',
            date_from: rule.date_from?.slice(0, 10) ?? '',
            date_to: rule.date_to?.slice(0, 10) ?? '',
            priority: rule.priority,
            active: rule.active,
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
            product_id: data.product_id || null,
            company_id: data.company_id || null,
            customer_id: data.customer_id || null,
            min_qty: data.min_qty === '' ? null : data.min_qty,
            date_from: data.date_from || null,
            date_to: data.date_to || null,
            base_qty: data.rule_type === 'qty_bonus' ? data.base_qty : null,
            bonus_qty: data.rule_type === 'qty_bonus' ? data.bonus_qty : null,
            slabs: data.rule_type === 'slab_bonus'
                ? data.slabs.map((s) => ({
                      min_qty: Number(s.min_qty || 0),
                      max_qty: s.max_qty === '' || s.max_qty === null ? null : Number(s.max_qty),
                      bonus_qty: Number(s.bonus_qty || 0),
                  }))
                : null,
            value: ['percent_discount', 'fixed_discount', 'price_override'].includes(data.rule_type) ? data.value : null,
        }));
        const options = {
            preserveScroll: true,
            onSuccess: () => setDialogOpen(false),
            onError: () => toast.error(ALERT_FIX),
        };
        if (editing) form.put(route('incentives.update', editing.id), options);
        else form.post(route('incentives.store'), options);
    };

    const err = (key: string) => (form.errors as Record<string, string>)[key];
    const setSlab = (index: number, key: keyof Slab, value: string) => {
        form.setData('slabs', form.data.slabs.map((slab, i) => (i === index ? { ...slab, [key]: value } : slab)));
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Incentive Rules" />
            <MasterRegister title="Incentive Rules" description="Bonus schemes, discounts, and special prices for invoice and booking lines"
                label="rule" page={rules} state={state} searchRef={searchRef} onSearchKeyDown={onSearchKeyDown} placeholder="Rule name…"
                actions={manage && <button type="button" className="hbtn pri" onClick={openCreate}><Plus className="i" aria-hidden="true" />Add Rule</button>}
                status={{ value: statusFilter,
                    onChange: status => state.change({ active: status === 'active' ? '1' : status === 'inactive' ? '0' : undefined }) }}
                filters={<MasterFilterSelect label="Rule type" icon={ListFilter} value={filters.rule_type ?? ''} onChange={value => state.change({ rule_type: value || undefined })}>
                    <option value="">All types</option>
                    {Object.entries(RULE_TYPES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </MasterFilterSelect>}>
                {dense => <Table className={dense ? 'incentive-table dense' : 'incentive-table'}>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Rule</TableHead>
                                <TableHead>What it does</TableHead>
                                <TableHead>Scope</TableHead>
                                <TableHead>Valid</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="w-24"><span className="sr-only">Actions</span></TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {rules.data.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={6} className="empty">
                                        {state.applied ? 'No incentive rules match these filters.' : 'No incentive rules yet.'}
                                    </TableCell>
                                </TableRow>
                            )}
                            {rules.data.map((rule, index) => (
                                <TableRow key={rule.id} {...rowProps(index)}>
                                    <TableCell>
                                        <div className="font-bold">{rule.name}</div>
                                        <div className="row-secondary">{RULE_TYPES[rule.rule_type] ?? rule.rule_type}</div>
                                    </TableCell>
                                    <TableCell className="wrap-cell">{rule.summary}</TableCell>
                                    <TableCell className="wrap-cell">
                                        {[
                                            rule.customer?.name && `Customer: ${rule.customer.name}`,
                                            rule.product?.name && `Product: ${rule.product.name}`,
                                            rule.company?.name && `Supplier: ${rule.company.name}`,
                                        ].filter(Boolean).join(' · ') || <span className="text-muted-foreground">Everyone</span>}
                                    </TableCell>
                                    <TableCell className="text-sm">
                                        {rule.date_from || rule.date_to
                                            ? `${rule.date_from ? shortDate(rule.date_from) : '…'} – ${rule.date_to ? shortDate(rule.date_to) : '…'}`
                                            : <span className="text-muted-foreground">Always</span>}
                                    </TableCell>
                                    <TableCell>
                                        <MasterStatus status={rule.active ? 'active' : 'inactive'} />
                                    </TableCell>
                                    <TableCell>
                                        {manage && (
                                            <div className="acts">
                                                <button type="button" className="ib" aria-label={`Edit ${rule.name}`} onClick={() => openEdit(rule)}>
                                                    <Pencil className="i" aria-hidden="true" />
                                                </button>
                                                <button
                                                    type="button" className="ib master-delete" aria-label={`Delete ${rule.name}`}
                                                    onClick={() => {
                                                        if (confirm(`Delete rule "${rule.name}"?`)) {
                                                            router.delete(route('incentives.destroy', rule.id), { preserveScroll: true });
                                                        }
                                                    }}
                                                >
                                                    <Trash2 className="i" aria-hidden="true" />
                                                </button>
                                            </div>
                                        )}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                </Table>}
            </MasterRegister>

            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent appearance="form" className="max-w-2xl" aria-describedby={undefined}>
                    <DialogHeader>
                        <DialogTitle>{editing ? `Edit ${editing.name}` : 'Add Incentive Rule'}</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={submit}>
                        <DialogBody className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div>
                            <Label>Rule Name *</Label>
                            <Input
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
                            <Label>Rule Type *</Label>
                            <Select value={form.data.rule_type} onValueChange={(v) => form.setData('rule_type', v)}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    {Object.entries(RULE_TYPES).map(([value, label]) => (
                                        <SelectItem key={value} value={value}>{label}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {form.data.rule_type === 'qty_bonus' && (
                            <>
                                <div>
                                    <Label>Buy Quantity *</Label>
                                    <Input
                                        type="number" min={1} value={form.data.base_qty}
                                        onChange={(e) => form.setData('base_qty', Number(e.target.value))}
                                        onBlur={() => validateField('base_qty')}
                                        aria-invalid={!!err('base_qty')}
                                        className={err('base_qty') ? 'border-destructive ring-1 ring-destructive' : ''}
                                    />
                                    {err('base_qty') && <p className="text-xs text-destructive">{err('base_qty')}</p>}
                                </div>
                                <div>
                                    <Label>Free Quantity *</Label>
                                    <Input
                                        type="number" min={1} value={form.data.bonus_qty}
                                        onChange={(e) => form.setData('bonus_qty', Number(e.target.value))}
                                        onBlur={() => validateField('bonus_qty')}
                                        aria-invalid={!!err('bonus_qty')}
                                        className={err('bonus_qty') ? 'border-destructive ring-1 ring-destructive' : ''}
                                    />
                                    {err('bonus_qty') && <p className="text-xs text-destructive">{err('bonus_qty')}</p>}
                                    <p className="text-xs text-muted-foreground">
                                        e.g. Buy {form.data.base_qty || 'X'} get {form.data.bonus_qty || 'Y'} free — repeats every {form.data.base_qty || 'X'}
                                    </p>
                                </div>
                            </>
                        )}

                        {form.data.rule_type === 'slab_bonus' && (
                            <div className="col-span-2 rounded-lg border p-3">
                                <Label className="mb-2 block">Quantity Slabs</Label>
                                {form.data.slabs.map((slab, index) => (
                                    <div key={index} className="mb-2 flex items-center gap-2 text-sm">
                                        <Input
                                            type="number" placeholder="Min qty" className="w-28"
                                            value={slab.min_qty} onChange={(e) => setSlab(index, 'min_qty', e.target.value)}
                                        />
                                        <span className="text-muted-foreground">to</span>
                                        <Input
                                            type="number" placeholder="Max (blank = ∞)" className="w-32"
                                            value={slab.max_qty ?? ''} onChange={(e) => setSlab(index, 'max_qty', e.target.value)}
                                        />
                                        <span className="text-muted-foreground">→ bonus</span>
                                        <Input
                                            type="number" placeholder="Bonus" className="w-24"
                                            value={slab.bonus_qty} onChange={(e) => setSlab(index, 'bonus_qty', e.target.value)}
                                        />
                                        <Button
                                            type="button" variant="ghost" size="icon" tabIndex={-1}
                                            onClick={() => form.setData('slabs', form.data.slabs.filter((_, i) => i !== index))}
                                            disabled={form.data.slabs.length === 1}
                                        >
                                            <Trash2 className="size-4 text-muted-foreground" />
                                        </Button>
                                    </div>
                                ))}
                                <Button
                                    type="button" variant="outline" size="sm"
                                    onClick={() => form.setData('slabs', [...form.data.slabs, { min_qty: '', max_qty: '', bonus_qty: '' }])}
                                >
                                    <Plus className="mr-1 size-4" /> Add Slab
                                </Button>
                            </div>
                        )}

                        {['percent_discount', 'fixed_discount', 'price_override'].includes(form.data.rule_type) && (
                            <div>
                                <Label>
                                    {form.data.rule_type === 'percent_discount' ? 'Discount % *'
                                        : form.data.rule_type === 'fixed_discount' ? 'Discount Amount (Rs) *'
                                        : 'Special Trade Price (Rs) *'}
                                </Label>
                                <Input
                                    type="number" min={0} step="0.01" value={form.data.value}
                                    onChange={(e) => form.setData('value', Number(e.target.value))}
                                    onBlur={() => validateField('value')}
                                    aria-invalid={!!err('value')}
                                    className={err('value') ? 'border-destructive ring-1 ring-destructive' : ''}
                                />
                                {err('value') && <p className="text-xs text-destructive">{err('value')}</p>}
                            </div>
                        )}

                        <div>
                            <Label>Product (optional)</Label>
                            <Select value={form.data.product_id || 'any'} onValueChange={(v) => form.setData('product_id', v === 'any' ? '' : v)}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="any">Any product</SelectItem>
                                    {products.map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <Label>Supplier (optional)</Label>
                            <Select value={form.data.company_id || 'any'} onValueChange={(v) => form.setData('company_id', v === 'any' ? '' : v)}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="any">Any supplier</SelectItem>
                                    {companies.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <Label>Customer (optional)</Label>
                            <Select value={form.data.customer_id || 'any'} onValueChange={(v) => form.setData('customer_id', v === 'any' ? '' : v)}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="any">Any customer</SelectItem>
                                    {customers.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <Label>Minimum Qty (optional)</Label>
                            <Input
                                type="number" min={0} value={form.data.min_qty}
                                onChange={(e) => form.setData('min_qty', e.target.value)}
                            />
                        </div>
                        <div>
                            <Label>Valid From</Label>
                            <Input type="date" value={form.data.date_from} onChange={(e) => form.setData('date_from', e.target.value)} />
                        </div>
                        <div>
                            <Label>Valid To</Label>
                            <Input type="date" value={form.data.date_to} onChange={(e) => form.setData('date_to', e.target.value)} />
                            {err('date_to') && <p className="text-xs text-destructive">{err('date_to')}</p>}
                        </div>
                        <div>
                            <Label>Priority</Label>
                            <Input
                                type="number" value={form.data.priority}
                                onChange={(e) => form.setData('priority', Number(e.target.value))}
                            />
                            <p className="text-xs text-muted-foreground">Higher wins when equally specific</p>
                        </div>
                        <div>
                            <Label>Status</Label>
                            <Select value={form.data.active ? '1' : '0'} onValueChange={(v) => form.setData('active', v === '1')}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="1">Active</SelectItem>
                                    <SelectItem value="0">Inactive</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        </DialogBody>
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                            <Button type="submit" disabled={form.processing}>{editing ? 'Save Changes' : 'Create Rule'}</Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </AppLayout>
    );
}
