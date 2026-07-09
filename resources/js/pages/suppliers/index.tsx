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
import { BookUser, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { FormEvent, useEffect, useState } from 'react';
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
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editing, setEditing] = useState<Company | null>(null);
    const [search, setSearch] = useState(filters.search ?? '');
    const { searchRef, onSearchKeyDown, rowProps } = useListKeyboardNav({
        rowCount: companies.data.length,
        onActivate: (i) => openEdit(companies.data[i]),
    });

    const form = useForm(emptyForm);
    const { validateField, validateForm } = useClientValidation(form, {
        name: required('Supplier name'),
        credit_days: positive('Credit days'),
        credit_limit: positive('Credit limit'),
    });

    useEffect(() => {
        const timeout = setTimeout(() => {
            if ((filters.search ?? '') !== search) {
                router.get('/suppliers', { ...filters, search: search || undefined }, { preserveState: true, replace: true });
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
            <div className="flex h-full flex-col gap-4 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-4">
                    <div>
                        <h1 className="text-4xl font-bold">Suppliers</h1>
                        <p className="text-sm text-muted-foreground">Pharmaceutical companies you purchase stock from</p>
                    </div>
                    {can('suppliers.manage') && (
                        <Button onClick={openCreate}>
                            <Plus className="mr-1 size-4" /> Add Supplier
                        </Button>
                    )}
                </div>

                <div className="flex flex-wrap gap-2">
                    <div className="relative w-full sm:w-72">
                        <Search className="absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
                        <Input
                            ref={searchRef}
                            onKeyDown={onSearchKeyDown}
                            placeholder="Search name, contact, phone…"
                            className="pl-8"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </div>
                    <Select
                        value={filters.status ?? 'all'}
                        onValueChange={(v) =>
                            router.get('/suppliers', { ...filters, status: v === 'all' ? undefined : v }, { preserveState: true })
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
                                <TableHead>Name</TableHead>
                                <TableHead>Contact</TableHead>
                                <TableHead>City</TableHead>
                                <TableHead>NTN</TableHead>
                                <TableHead className="text-right">Credit Limit</TableHead>
                                <TableHead className="text-right">Products</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="w-32" />
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {companies.data.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                                        No suppliers found.
                                    </TableCell>
                                </TableRow>
                            )}
                            {companies.data.map((company, index) => (
                                <TableRow key={company.id} {...rowProps(index)}>
                                    <TableCell className="font-medium">{company.name}</TableCell>
                                    <TableCell>
                                        <div className="text-sm">{company.contact_person || '—'}</div>
                                        <div className="text-xs text-muted-foreground">{company.phone}</div>
                                    </TableCell>
                                    <TableCell>{company.city || '—'}</TableCell>
                                    <TableCell>{company.ntn_number || '—'}</TableCell>
                                    <TableCell className="text-right tabular-nums">{money(company.credit_limit)}</TableCell>
                                    <TableCell className="text-right">{company.products_count}</TableCell>
                                    <TableCell>
                                        <Badge variant={company.status === 'active' ? 'default' : 'secondary'}>
                                            {company.status}
                                        </Badge>
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex justify-end gap-1">
                                            <Button variant="ghost" size="icon" asChild title="Ledger">
                                                <Link href={route('ledger.supplier', company.id)}>
                                                    <BookUser className="size-4" />
                                                </Link>
                                            </Button>
                                            {can('suppliers.manage') && (
                                                <>
                                                    <Button variant="ghost" size="icon" onClick={() => openEdit(company)}>
                                                        <Pencil className="size-4" />
                                                    </Button>
                                                    <Button variant="ghost" size="icon" onClick={() => destroy(company)}>
                                                        <Trash2 className="size-4 text-destructive" />
                                                    </Button>
                                                </>
                                            )}
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                    <Paginator meta={companies} />
                </div>
            </div>

            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>{editing ? `Edit ${editing.name}` : 'Add Supplier'}</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={submit} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div className="col-span-2">
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
                        <div className="col-span-2">
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
                        <div className="col-span-2">
                            <Label htmlFor="notes">Notes</Label>
                            <Textarea id="notes" rows={2} value={form.data.notes} onChange={(e) => form.setData('notes', e.target.value)} />
                        </div>
                        <DialogFooter className="col-span-2">
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
