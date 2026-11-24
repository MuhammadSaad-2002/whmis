import { MasterRegister, MasterStatus, useMasterFilters } from '@/components/master-register';
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
import { Textarea } from '@/components/ui/textarea';
import { usePermissions } from '@/hooks/use-permissions';
import AppLayout from '@/layouts/app-layout';
import { money } from '@/lib/format';
import { type BreadcrumbItem } from '@/types';
import { useListKeyboardNav } from '@/hooks/use-list-keyboard-nav';
import { ALERT_FIX, positive, required, useClientValidation } from '@/lib/form-validation';
import { Head, Link, router, useForm } from '@inertiajs/react';
import { BookUser, Pencil, Plus, Trash2 } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { toast } from 'sonner';

interface Company {
    id: number;
    name: string;
    contact_person: string | null;
    phone: string | null;
    whatsapp: string | null;
    email: string | null;
    address: string | null;
    city: string | null;
    gst_number: string | null;
    ntn_number: string | null;
    payment_terms: string | null;
    credit_days: number;
    credit_limit: string;
    status: string;
    notes: string | null;
    products_count: number;
}

interface Props {
    companies: PaginatedData<Company>;
    filters: { search?: string; status?: string };
}

const breadcrumbs: BreadcrumbItem[] = [{ title: 'Suppliers', href: '/suppliers' }];

const emptyForm = {
    name: '', contact_person: '', phone: '', whatsapp: '', email: '', address: '', city: '',
    gst_number: '', ntn_number: '', payment_terms: '', credit_days: 0, credit_limit: 0,
    status: 'active', notes: '',
};

export default function SuppliersIndex({ companies, filters }: Props) {
    const { can } = usePermissions();
    const canManage = can('suppliers.manage');
    const canViewLedger = can('ledger.view');
    const showActions = canManage || canViewLedger;
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editing, setEditing] = useState<Company | null>(null);
    const filterState = useMasterFilters('/suppliers', filters);
    const { searchRef, onSearchKeyDown, rowProps } = useListKeyboardNav({
        rowCount: companies.data.length,
        onActivate: (i) => { if (canManage) openEdit(companies.data[i]); },
    });

    const form = useForm(emptyForm);
    const { validateField, validateForm } = useClientValidation(form, {
        name: required('Supplier name'),
        credit_days: positive('Credit days'),
        credit_limit: positive('Credit limit'),
    });

    const openCreate = () => {
        setEditing(null);
        form.setData(emptyForm);
        form.clearErrors();
        setDialogOpen(true);
    };

    const openEdit = (company: Company) => {
        setEditing(company);
        form.setData({
            name: company.name,
            contact_person: company.contact_person ?? '',
            phone: company.phone ?? '',
            whatsapp: company.whatsapp ?? '',
            email: company.email ?? '',
            address: company.address ?? '',
            city: company.city ?? '',
            gst_number: company.gst_number ?? '',
            ntn_number: company.ntn_number ?? '',
            payment_terms: company.payment_terms ?? '',
            credit_days: company.credit_days ?? 0,
            credit_limit: Number(company.credit_limit ?? 0),
            status: company.status,
            notes: company.notes ?? '',
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
        const options = {
            preserveScroll: true,
            onSuccess: () => setDialogOpen(false),
            onError: () => toast.error(ALERT_FIX),
        };
        if (editing) form.put(route('suppliers.update', editing.id), options);
        else form.post(route('suppliers.store'), options);
    };

    const destroy = (company: Company) => {
        if (confirm(`Delete supplier "${company.name}"?`)) {
            router.delete(route('suppliers.destroy', company.id), { preserveScroll: true });
        }
    };

    const err = (key: string) => (form.errors as Record<string, string>)[key];

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Suppliers" />
            <MasterRegister title="Suppliers" description="Pharmaceutical companies you purchase stock from" label="supplier" page={companies}
                state={filterState} searchRef={searchRef} onSearchKeyDown={onSearchKeyDown} placeholder="Supplier name, contact or phone"
                status={{ value: filters.status, onChange: status => filterState.change({ status }) }}
                actions={canManage && <button type="button" className="hbtn pri" onClick={openCreate}><Plus className="i" aria-hidden="true" />Add Supplier</button>}>
                    {dense => <Table className={`supplier-table${dense ? ' dense' : ''}`}>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Name</TableHead>
                                <TableHead>Contact</TableHead>
                                <TableHead>City</TableHead>
                                <TableHead>NTN</TableHead>
                                <TableHead className="r">Credit Limit</TableHead>
                                <TableHead className="r">Products</TableHead>
                                <TableHead>Status</TableHead>
                                {showActions && <TableHead className="r acts-head">Actions</TableHead>}
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {companies.data.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={showActions ? 8 : 7} className="empty">
                                        {filterState.applied ? 'No suppliers match these filters.' : 'No suppliers found.'}
                                    </TableCell>
                                </TableRow>
                            )}
                            {companies.data.map((company, index) => (
                                <TableRow key={company.id} {...rowProps(index)}>
                                    <TableCell className="entity-name"><strong>{company.name}</strong></TableCell>
                                    <TableCell>
                                        <span>{company.contact_person || '—'}</span>
                                        {company.phone && <small className="row-secondary">{company.phone}</small>}
                                    </TableCell>
                                    <TableCell>{company.city || '—'}</TableCell>
                                    <TableCell>{company.ntn_number || '—'}</TableCell>
                                    <TableCell className="r num">{money(company.credit_limit)}</TableCell>
                                    <TableCell className="r num">{company.products_count}</TableCell>
                                    <TableCell><MasterStatus status={company.status} /></TableCell>
                                    {showActions && <TableCell>
                                        <div className="acts">
                                            {canViewLedger && <Link className="ib" title="Ledger" aria-label={`Ledger for ${company.name}`} href={route('ledger.supplier', company.id)}><BookUser className="i" aria-hidden="true" /></Link>}
                                            {canManage && (
                                                <>
                                                    <button type="button" className="ib" title="Edit supplier" aria-label={`Edit ${company.name}`} onClick={() => openEdit(company)}><Pencil className="i" aria-hidden="true" /></button>
                                                    <button type="button" className="ib master-delete" title="Delete supplier" aria-label={`Delete ${company.name}`} onClick={() => destroy(company)}><Trash2 className="i" aria-hidden="true" /></button>
                                                </>
                                            )}
                                        </div>
                                    </TableCell>}
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>}
            </MasterRegister>

            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent appearance="form" className="max-w-2xl" aria-describedby={undefined}>
                    <DialogHeader>
                        <DialogTitle>{editing ? `Edit ${editing.name}` : 'Add Supplier'}</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={submit}>
                        <DialogBody className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div className="col-span-full">
                            <Label htmlFor="name">Supplier Name *</Label>
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
                        {(
                            [
                                ['contact_person', 'Contact Person'],
                                ['phone', 'Phone'],
                                ['whatsapp', 'WhatsApp'],
                                ['email', 'Email'],
                                ['city', 'City'],
                                ['gst_number', 'GST Number'],
                                ['ntn_number', 'NTN Number'],
                                ['payment_terms', 'Payment Terms'],
                            ] as const
                        ).map(([key, label]) => (
                            <div key={key}>
                                <Label htmlFor={key}>{label}</Label>
                                <Input
                                    id={key}
                                    value={String(form.data[key] ?? '')}
                                    onChange={(e) => form.setData(key, e.target.value)}
                                />
                                {err(key) && <p className="text-xs text-destructive">{err(key)}</p>}
                            </div>
                        ))}
                        <div>
                            <Label htmlFor="credit_days">Credit Days</Label>
                            <Input
                                id="credit_days" type="number" min={0}
                                value={form.data.credit_days}
                                onChange={(e) => form.setData('credit_days', Number(e.target.value))}
                            />
                        </div>
                        <div>
                            <Label htmlFor="credit_limit">Credit Limit (Rs)</Label>
                            <Input
                                id="credit_limit" type="number" min={0} step="0.01"
                                value={form.data.credit_limit}
                                onChange={(e) => form.setData('credit_limit', Number(e.target.value))}
                            />
                        </div>
                        <div className="col-span-full">
                            <Label htmlFor="address">Address</Label>
                            <Input id="address" value={form.data.address} onChange={(e) => form.setData('address', e.target.value)} />
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
                        <div className="col-span-full">
                            <Label htmlFor="notes">Notes</Label>
                            <Textarea id="notes" rows={2} value={form.data.notes} onChange={(e) => form.setData('notes', e.target.value)} />
                        </div>
                        </DialogBody>
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                            <Button type="submit" disabled={form.processing}>
                                {editing ? 'Save Changes' : 'Create Supplier'}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </AppLayout>
    );
}
