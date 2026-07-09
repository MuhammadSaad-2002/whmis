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
import { Textarea } from '@/components/ui/textarea';
import { usePermissions } from '@/hooks/use-permissions';
import AppLayout from '@/layouts/app-layout';
import { money } from '@/lib/format';
import { type BreadcrumbItem } from '@/types';
import { useListKeyboardNav } from '@/hooks/use-list-keyboard-nav';
import { ALERT_FIX, positive, required, useClientValidation } from '@/lib/form-validation';
import { Head, Link, router, useForm } from '@inertiajs/react';
import { BookUser, Pencil, Plus, Search, Trash2, Upload } from 'lucide-react';
import { FormEvent, useEffect, useState } from 'react';
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
    const { can } = usePermissions();
    const [dialogOpen, setDialogOpen] = useState(false);
    const [importOpen, setImportOpen] = useState(false);
    const [editing, setEditing] = useState<Customer | null>(null);
    const [search, setSearch] = useState(filters.search ?? '');
    const { searchRef, onSearchKeyDown, rowProps } = useListKeyboardNav({
        rowCount: customers.data.length,
        onActivate: (i) => openEdit(customers.data[i]),
    });

    const form = useForm(emptyForm);
    const { validateField, validateForm } = useClientValidation(form, {
        name: required('Customer name'),
        credit_limit: positive('Credit limit'),
        credit_days: positive('Credit days'),
    });

    useEffect(() => {
        const timeout = setTimeout(() => {
            if ((filters.search ?? '') !== search) {
                router.get('/customers', { ...filters, search: search || undefined }, { preserveState: true, replace: true });
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
            booker_id: (customer as Customer & { booker_id?: number | null }).booker_id
                ? String((customer as Customer & { booker_id?: number | null }).booker_id)
                : '',
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
            <div className="flex h-full flex-col gap-4 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-4">
                    <div>
                        <h1 className="text-4xl font-bold">Customers</h1>
                        <p className="text-sm text-muted-foreground">Pharmacies you sell to</p>
                    </div>
                    {can('customers.manage') && (
                        <div className="flex gap-2">
                            <Button variant="outline" onClick={() => setImportOpen(true)}>
                                <Upload className="mr-1 size-4" /> Import
                            </Button>
                            <Button onClick={openCreate}>
                                <Plus className="mr-1 size-4" /> Add Customer
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
                            placeholder="Search customer, owner, phone, city…"
                            className="pl-8"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </div>
                    <Select
                        value={filters.city ?? 'all'}
                        onValueChange={(v) =>
                            router.get('/customers', { ...filters, city: v === 'all' ? undefined : v }, { preserveState: true })
                        }
                    >
                        <SelectTrigger className="w-40"><SelectValue placeholder="City" /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All cities</SelectItem>
                            {cities.map((city) => (
                                <SelectItem key={city} value={city}>{city}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <Select
                        value={filters.status ?? 'all'}
                        onValueChange={(v) =>
                            router.get('/customers', { ...filters, status: v === 'all' ? undefined : v }, { preserveState: true })
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
                                <TableHead>Customer</TableHead>
                                <TableHead>Owner / Contact</TableHead>
                                <TableHead>City</TableHead>
                                <TableHead>License</TableHead>
                                <TableHead className="text-right">Balance</TableHead>
                                <TableHead className="text-right">Credit Limit</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="w-32" />
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {customers.data.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                                        No customers found.
                                    </TableCell>
                                </TableRow>
                            )}
                            {customers.data.map((customer, index) => {
                                const balance = Number(customer.debit_sum ?? 0) - Number(customer.credit_sum ?? 0);
                                const overLimit = Number(customer.credit_limit) > 0 && balance > Number(customer.credit_limit);
                                return (
                                    <TableRow key={customer.id} {...rowProps(index)}>
                                        <TableCell className="font-medium">{customer.name}</TableCell>
                                        <TableCell>
                                            <div className="text-sm">{customer.owner_name || customer.contact_person || '—'}</div>
                                            <div className="text-xs text-muted-foreground">{customer.phone}</div>
                                        </TableCell>
                                        <TableCell>{customer.city || '—'}</TableCell>
                                        <TableCell>{customer.drug_license_no || '—'}</TableCell>
                                        <TableCell className="text-right tabular-nums">
                                            <span className={overLimit ? 'font-semibold text-destructive' : ''}>{money(balance)}</span>
                                        </TableCell>
                                        <TableCell className="text-right tabular-nums">{money(customer.credit_limit)}</TableCell>
                                        <TableCell>
                                            <Badge variant={customer.status === 'active' ? 'default' : 'secondary'}>
                                                {customer.status}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex justify-end gap-1">
                                                <Button variant="ghost" size="icon" asChild title="Ledger">
                                                    <Link href={route('ledger.customer', customer.id)}>
                                                        <BookUser className="size-4" />
                                                    </Link>
                                                </Button>
                                                {can('customers.manage') && (
                                                    <>
                                                        <Button variant="ghost" size="icon" onClick={() => openEdit(customer)}>
                                                            <Pencil className="size-4" />
                                                        </Button>
                                                        <Button
                                                            variant="ghost" size="icon"
                                                            onClick={() => {
                                                                if (confirm(`Delete customer "${customer.name}"?`)) {
                                                                    router.delete(route('customers.destroy', customer.id), { preserveScroll: true });
                                                                }
                                                            }}
                                                        >
                                                            <Trash2 className="size-4 text-destructive" />
                                                        </Button>
                                                    </>
                                                )}
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                    <Paginator meta={customers} />
                </div>
            </div>

            <ImportDialog
                open={importOpen}
                onOpenChange={setImportOpen}
                title="Import Customers"
                importUrl={route('customers.import')}
                templateUrl={route('customers.template')}
            />

            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>{editing ? `Edit ${editing.name}` : 'Add Customer'}</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={submit} className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
                        <div className="col-span-3">
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
                        <div className="col-span-3">
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
                            <Label>Assigned Booker</Label>
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
                        </div>
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
                        <div className="col-span-3">
                            <Label htmlFor="notes">Notes</Label>
                            <Textarea id="notes" rows={2} value={form.data.notes} onChange={(e) => form.setData('notes', e.target.value)} />
                        </div>
                        <DialogFooter className="col-span-3">
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
