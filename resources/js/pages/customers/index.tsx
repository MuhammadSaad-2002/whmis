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
import { Textarea } from '@/components/ui/textarea';
import { usePermissions } from '@/hooks/use-permissions';
import AppLayout from '@/layouts/app-layout';
import { money } from '@/lib/format';
import { type BreadcrumbItem } from '@/types';
import { useListKeyboardNav } from '@/hooks/use-list-keyboard-nav';
import { ALERT_FIX, positive, required, useClientValidation } from '@/lib/form-validation';
import { Head, Link, router, useForm } from '@inertiajs/react';
import { BookUser, MapPin, Pencil, Plus, Trash2, Upload } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { toast } from 'sonner';

interface Customer {
    id: number;
    name: string;
    drug_license_no: string | null;
    registration_no: string | null;
    ntn: string | null;
    strn: string | null;
    owner_name: string | null;
    contact_person: string | null;
    cnic: string | null;
    phone: string | null;
    whatsapp: string | null;
    email: string | null;
    website: string | null;
    address: string | null;
    city: string | null;
    region: string | null;
    credit_limit: string;
    payment_terms: string | null;
    credit_days: number;
    status: string;
    notes: string | null;
    debit_sum: string | null;
    credit_sum: string | null;
    booker_id: number | null;
    booker_ids: number[];
}

interface Props {
    customers: PaginatedData<Customer>;
    cities: string[];
    bookers: { id: number; name: string }[];
    filters: { search?: string; city?: string; status?: string };
}

const breadcrumbs: BreadcrumbItem[] = [{ title: 'Customers', href: '/customers' }];

const emptyForm = {
    name: '', drug_license_no: '', registration_no: '', ntn: '', strn: '', owner_name: '',
    contact_person: '', cnic: '', phone: '', whatsapp: '', email: '', website: '', address: '',
    city: '', region: '', credit_limit: 0, payment_terms: '', credit_days: 0, booker_id: '',
    booker_ids: [] as number[],
    status: 'active', notes: '', opening_balance: 0,
};

const textFields: [keyof typeof emptyForm, string][] = [
    ['owner_name', 'Owner Name'],
    ['contact_person', 'Contact Person'],
    ['phone', 'Phone'],
    ['whatsapp', 'WhatsApp'],
    ['email', 'Email'],
    ['cnic', 'CNIC'],
    ['drug_license_no', 'Drug License No'],
    ['registration_no', 'Registration No'],
    ['ntn', 'NTN'],
    ['strn', 'STRN'],
    ['city', 'City'],
    ['region', 'Region'],
    ['payment_terms', 'Payment Terms'],
    ['website', 'Website'],
];

export default function CustomersIndex({ customers, cities, bookers, filters }: Props) {
    const { can, canViewSupplierDetails } = usePermissions();
    const canViewLedger = can('ledger.view') && canViewSupplierDetails;
    const canManageCustomers = can('customers.manage');
    const showActions = canViewLedger || canManageCustomers;
    const [dialogOpen, setDialogOpen] = useState(false);
    const [importOpen, setImportOpen] = useState(false);
    const [editing, setEditing] = useState<Customer | null>(null);
    const filterState = useMasterFilters('/customers', filters);
    const { searchRef, onSearchKeyDown, rowProps } = useListKeyboardNav({
        rowCount: customers.data.length,
        onActivate: (i) => { if (canManageCustomers) openEdit(customers.data[i]); },
    });

    const form = useForm(emptyForm);
    const { validateField, validateForm } = useClientValidation(form, {
        name: required('Customer name'),
        credit_limit: positive('Credit limit'),
        credit_days: positive('Credit days'),
    });

    const openCreate = () => {
        setEditing(null);
        form.setData(emptyForm);
        form.clearErrors();
        setDialogOpen(true);
    };

    const openEdit = (customer: Customer) => {
        setEditing(customer);
        form.setData({
            ...emptyForm,
            name: customer.name,
            drug_license_no: customer.drug_license_no ?? '',
            registration_no: customer.registration_no ?? '',
            ntn: customer.ntn ?? '',
            strn: customer.strn ?? '',
            owner_name: customer.owner_name ?? '',
            contact_person: customer.contact_person ?? '',
            cnic: customer.cnic ?? '',
            phone: customer.phone ?? '',
            whatsapp: customer.whatsapp ?? '',
            email: customer.email ?? '',
            website: customer.website ?? '',
            address: customer.address ?? '',
            city: customer.city ?? '',
            region: customer.region ?? '',
            credit_limit: Number(customer.credit_limit ?? 0),
            payment_terms: customer.payment_terms ?? '',
            credit_days: customer.credit_days ?? 0,
            booker_id: customer.booker_id ? String(customer.booker_id) : '',
            booker_ids: customer.booker_ids ?? [],
            status: customer.status,
            notes: customer.notes ?? '',
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
        form.transform((data) => ({ ...data, booker_id: data.booker_id || null }));
        const options = {
            preserveScroll: true,
            onSuccess: () => setDialogOpen(false),
            onError: () => toast.error(ALERT_FIX),
        };
        if (editing) form.put(route('customers.update', editing.id), options);
        else form.post(route('customers.store'), options);
    };

    const err = (key: string) => (form.errors as Record<string, string>)[key];

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Customers" />
            <MasterRegister title="Customers" description="Pharmacies you sell to" label="customer" page={customers}
                state={filterState} searchRef={searchRef} onSearchKeyDown={onSearchKeyDown} placeholder="Customer, owner, phone or city"
                status={{ value: filters.status, onChange: status => filterState.change({ status }) }}
                actions={canManageCustomers && <>
                    <button type="button" className="hbtn" onClick={() => setImportOpen(true)}><Upload className="i" aria-hidden="true" />Import</button>
                    <button type="button" className="hbtn pri" onClick={openCreate}><Plus className="i" aria-hidden="true" />Add Customer</button>
                </>}
                filters={<MasterFilterSelect label="City" icon={MapPin} value={filters.city ?? ''} onChange={value => filterState.change({ city: value || undefined })}>
                    <option value="">All cities</option>{cities.map(city => <option key={city} value={city}>{city}</option>)}
                </MasterFilterSelect>}>
                    {dense => <Table className={`customer-table${dense ? ' dense' : ''}`}>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Customer</TableHead>
                                <TableHead>Owner / Contact</TableHead>
                                <TableHead>City</TableHead>
                                <TableHead>License</TableHead>
                                <TableHead className="r">Balance</TableHead>
                                <TableHead className="r">Credit Limit</TableHead>
                                <TableHead>Status</TableHead>
                                {showActions && <TableHead className="r acts-head">Actions</TableHead>}
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {customers.data.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={showActions ? 8 : 7} className="empty">
                                        {filterState.applied ? 'No customers match these filters.' : 'No customers found.'}
                                    </TableCell>
                                </TableRow>
                            )}
                            {customers.data.map((customer, index) => {
                                const balance = Number(customer.debit_sum ?? 0) - Number(customer.credit_sum ?? 0);
                                const overLimit = Number(customer.credit_limit) > 0 && balance > Number(customer.credit_limit);
                                return (
                                    <TableRow key={customer.id} {...rowProps(index)}>
                                        <TableCell className="entity-name"><strong>{customer.name}</strong></TableCell>
                                        <TableCell>
                                            <span>{customer.owner_name || customer.contact_person || '—'}</span>
                                            {customer.phone && <small className="row-secondary">{customer.phone}</small>}
                                        </TableCell>
                                        <TableCell>{customer.city || '—'}</TableCell>
                                        <TableCell>{customer.drug_license_no || '—'}</TableCell>
                                        <TableCell className="r num">
                                            <span className={overLimit ? 'font-semibold neg' : ''}>{money(balance)}</span>
                                        </TableCell>
                                        <TableCell className="r num">{money(customer.credit_limit)}</TableCell>
                                        <TableCell><MasterStatus status={customer.status} /></TableCell>
                                        {showActions && <TableCell>
                                            <div className="acts">
                                                {canViewLedger && (
                                                    <Link className="ib" href={route('ledger.customer', customer.id)} title="Ledger" aria-label={`Ledger for ${customer.name}`}><BookUser aria-hidden="true" className="i" /></Link>
                                                )}
                                                {canManageCustomers && (
                                                    <>
                                                        <button type="button" className="ib" title="Edit customer" aria-label={`Edit ${customer.name}`} onClick={() => openEdit(customer)}><Pencil className="i" aria-hidden="true" /></button>
                                                        <button type="button" className="ib master-delete" title="Delete customer" aria-label={`Delete ${customer.name}`}
                                                            onClick={() => {
                                                                if (confirm(`Delete customer "${customer.name}"?`)) {
                                                                    router.delete(route('customers.destroy', customer.id), { preserveScroll: true });
                                                                }
                                                            }}
                                                        >
                                                            <Trash2 className="i" aria-hidden="true" />
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                        </TableCell>}
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>}
            </MasterRegister>

            <ImportDialog
                open={importOpen}
                onOpenChange={setImportOpen}
                title="Import Customers"
                importUrl={route('customers.import')}
                templateUrl={route('customers.template')}
            />

            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent appearance="form" className="max-w-3xl" aria-describedby={undefined}>
                    <DialogHeader>
                        <DialogTitle>{editing ? `Edit ${editing.name}` : 'Add Customer'}</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={submit}>
                        <DialogBody className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
                        <div className="col-span-full">
                            <Label htmlFor="name">Customer Name *</Label>
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
                        {textFields.map(([key, label]) => (
                            <div key={key}>
                                <Label htmlFor={key}>{label}</Label>
                                <Input
                                    id={key}
                                    value={String(form.data[key] ?? '')}
                                    onChange={(e) => form.setData(key, e.target.value as never)}
                                />
                                {err(key) && <p className="text-xs text-destructive">{err(key)}</p>}
                            </div>
                        ))}
                        <div className="col-span-full">
                            <Label htmlFor="address">Address</Label>
                            <Input id="address" value={form.data.address} onChange={(e) => form.setData('address', e.target.value)} />
                        </div>
                        <div>
                            <Label htmlFor="credit_limit">Credit Limit (Rs)</Label>
                            <Input
                                id="credit_limit" type="number" min={0} step="0.01"
                                value={form.data.credit_limit}
                                onChange={(e) => form.setData('credit_limit', Number(e.target.value))}
                            />
                        </div>
                        <div>
                            <Label htmlFor="credit_days">Credit Days</Label>
                            <Input
                                id="credit_days" type="number" min={0}
                                value={form.data.credit_days}
                                onChange={(e) => form.setData('credit_days', Number(e.target.value))}
                            />
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
                        <div>
                            <Label>Primary Booker</Label>
                            <Select
                                value={form.data.booker_id || 'none'}
                                onValueChange={(v) => form.setData('booker_id', v === 'none' ? '' : v)}
                            >
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="none">No booker</SelectItem>
                                    {bookers.map((booker) => (
                                        <SelectItem key={booker.id} value={String(booker.id)}>{booker.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <p className="text-xs text-muted-foreground">Credited for this customer's sales</p>
                        </div>
                        {can('bookers.assign') && (
                            <div className="col-span-full">
                                <Label>Assigned Bookers (can book for this pharmacy)</Label>
                                {bookers.length === 0 ? (
                                    <p className="text-sm text-muted-foreground">No bookers exist yet.</p>
                                ) : (
                                    <div className="grid grid-cols-2 gap-2 rounded-lg border p-3 sm:grid-cols-3">
                                        {bookers.map((booker) => {
                                            const checked = form.data.booker_ids.includes(booker.id);
                                            return (
                                                <label key={booker.id} className="flex items-center gap-2 text-sm">
                                                    <Checkbox
                                                        checked={checked}
                                                        onCheckedChange={(v) =>
                                                            form.setData(
                                                                'booker_ids',
                                                                v
                                                                    ? [...form.data.booker_ids, booker.id]
                                                                    : form.data.booker_ids.filter((id) => id !== booker.id),
                                                            )
                                                        }
                                                    />
                                                    {booker.name}
                                                </label>
                                            );
                                        })}
                                    </div>
                                )}
                                <p className="text-xs text-muted-foreground">
                                    Every change is recorded in the assignment audit log.
                                </p>
                            </div>
                        )}
                        {!editing && (
                            <div>
                                <Label htmlFor="opening_balance">Opening Balance (Rs)</Label>
                                <Input
                                    id="opening_balance" type="number" step="0.01"
                                    value={form.data.opening_balance}
                                    onChange={(e) => form.setData('opening_balance', Number(e.target.value))}
                                />
                                <p className="text-xs text-muted-foreground">Positive = they owe you</p>
                            </div>
                        )}
                        <div className="col-span-full">
                            <Label htmlFor="notes">Notes</Label>
                            <Textarea id="notes" rows={2} value={form.data.notes} onChange={(e) => form.setData('notes', e.target.value)} />
                        </div>
                        </DialogBody>
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                            <Button type="submit" disabled={form.processing}>
                                {editing ? 'Save Changes' : 'Create Customer'}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </AppLayout>
    );
}
