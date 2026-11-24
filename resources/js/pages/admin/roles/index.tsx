import { RegisterLayout, RegisterList } from '@/components/master-register';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
    Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Head, Link, router, useForm } from '@inertiajs/react';
import AppLayout from '@/layouts/app-layout';
import { ALERT_FIX } from '@/lib/form-validation';
import { type BreadcrumbItem } from '@/types';
import { Pencil, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { toast } from 'sonner';

interface RoleRow {
    id: number;
    name: string;
    users_count: number;
    permissions: string[];
}

interface Props {
    roles: RoleRow[];
    permissionGroups: Record<string, string[]>;
}

const breadcrumbs: BreadcrumbItem[] = [{ title: 'Roles & Permissions', href: '/roles' }];

export default function RolesIndex({ roles, permissionGroups }: Props) {
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editing, setEditing] = useState<RoleRow | null>(null);
    const form = useForm({ name: '', permissions: [] as string[] });

    const openCreate = () => {
        setEditing(null);
        form.setData({ name: '', permissions: [] });
        form.clearErrors();
        setDialogOpen(true);
    };

    const openEdit = (role: RoleRow) => {
        setEditing(role);
        form.setData({ name: role.name, permissions: [...role.permissions] });
        form.clearErrors();
        setDialogOpen(true);
    };

    const togglePermission = (name: string) => {
        const has = form.data.permissions.includes(name);
        form.setData('permissions', has ? form.data.permissions.filter((p) => p !== name) : [...form.data.permissions, name]);
    };

    const toggleModule = (perms: string[], checked: boolean) => {
        const set = new Set(form.data.permissions);
        perms.forEach((p) => (checked ? set.add(p) : set.delete(p)));
        form.setData('permissions', [...set]);
    };

    const submit = (e: FormEvent) => {
        e.preventDefault();
        const options = {
            preserveScroll: true,
            onSuccess: () => setDialogOpen(false),
            onError: () => toast.error(ALERT_FIX),
        };
        if (editing) form.put(route('roles.update', editing.id), options);
        else form.post(route('roles.store'), options);
    };

    const isSuperAdmin = editing?.name === 'Super Admin';

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Roles & Permissions" />
            <RegisterLayout title="Roles & Permissions" description={<>Define roles and what each can do · {roles.length} {roles.length === 1 ? 'role' : 'roles'}</>}
                actions={<div className="register-hero-actions">
                    <Link className="hbtn" href={route('permissions.index')}><ShieldCheck className="i" aria-hidden="true" />Permission Catalog</Link>
                    <button type="button" className="hbtn pri" onClick={openCreate}><Plus className="i" aria-hidden="true" />Add Role</button>
                </div>}>
                <RegisterList title="Roles">
                    {dense => <Table className={dense ? 'dense' : undefined}>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Role</TableHead>
                                <TableHead className="r">Users</TableHead>
                                <TableHead className="r">Permissions</TableHead>
                                <TableHead className="r"><span className="sr-only">Actions</span></TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {roles.map((role) => (
                                <TableRow key={role.id}>
                                    <TableCell className="entity-name"><strong>{role.name}</strong></TableCell>
                                    <TableCell className="r num">{role.users_count}</TableCell>
                                    <TableCell className="r num">{role.permissions.length}</TableCell>
                                    <TableCell>
                                        <div className="acts">
                                            <button type="button" className="ib" title="Edit" aria-label="Edit" onClick={() => openEdit(role)}>
                                                <Pencil className="i" aria-hidden="true" />
                                            </button>
                                            {role.name !== 'Super Admin' && (
                                                <button
                                                    type="button" className="ib" title="Delete" aria-label="Delete"
                                                    onClick={() => {
                                                        if (confirm(`Delete role "${role.name}"?`)) {
                                                            router.delete(route('roles.destroy', role.id), { preserveScroll: true });
                                                        }
                                                    }}
                                                >
                                                    <Trash2 className="i text-destructive" aria-hidden="true" />
                                                </button>
                                            )}
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>}
                </RegisterList>
            </RegisterLayout>

            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent appearance="form" className="max-w-3xl" aria-describedby={undefined}>
                    <DialogHeader>
                        <DialogTitle>{editing ? `Edit ${editing.name}` : 'Add Role'}</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={submit}>
                        <DialogBody className="grid gap-4">
                        <div>
                            <Label htmlFor="role_name">Role Name *</Label>
                            <Input id="role_name" value={form.data.name} onChange={(e) => form.setData('name', e.target.value)} disabled={isSuperAdmin} autoFocus />
                            {form.errors.name && <p className="text-xs text-destructive">{form.errors.name}</p>}
                            {isSuperAdmin && <p className="text-xs text-muted-foreground">Super Admin always has every permission.</p>}
                        </div>
                        <div className="grid gap-3">
                            {Object.entries(permissionGroups).map(([module, perms]) => {
                                const allOn = perms.every((p) => form.data.permissions.includes(p));
                                return (
                                    <div key={module} className="rounded-md border p-3">
                                        <label className="mb-2 flex items-center gap-2 font-medium capitalize">
                                            <Checkbox checked={allOn} onCheckedChange={(v) => toggleModule(perms, !!v)} disabled={isSuperAdmin} />
                                            {module.replaceAll('-', ' ')}
                                        </label>
                                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                                            {perms.map((perm) => (
                                                <label key={perm} className="flex items-center gap-2 text-sm">
                                                    <Checkbox
                                                        checked={form.data.permissions.includes(perm)}
                                                        onCheckedChange={() => togglePermission(perm)}
                                                        disabled={isSuperAdmin}
                                                    />
                                                    <span className="text-muted-foreground">{perm.split('.')[1] ?? perm}</span>
                                                </label>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                        </DialogBody>
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                            <Button type="submit" disabled={form.processing}>{editing ? 'Save Changes' : 'Create Role'}</Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </AppLayout>
    );
}
