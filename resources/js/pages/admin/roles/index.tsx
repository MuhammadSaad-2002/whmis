import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
    Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
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
            <div className="flex h-full flex-col gap-4 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-4">
                    <div>
                        <h1 className="text-4xl font-bold">Roles &amp; Permissions</h1>
                        <p className="text-sm text-muted-foreground">Define roles and what each can do</p>
                    </div>
                    <div className="flex gap-2">
                        <Button variant="outline" asChild>
                            <Link href={route('permissions.index')}>
                                <ShieldCheck className="mr-1 size-4" /> Permission Catalog
                            </Link>
                        </Button>
                        <Button onClick={openCreate}>
                            <Plus className="mr-1 size-4" /> Add Role
                        </Button>
                    </div>
                </div>

                <div className="rounded-xl border">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Role</TableHead>
                                <TableHead className="text-right">Users</TableHead>
                                <TableHead className="text-right">Permissions</TableHead>
                                <TableHead className="w-24" />
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {roles.map((role) => (
                                <TableRow key={role.id}>
                                    <TableCell className="font-medium">{role.name}</TableCell>
                                    <TableCell className="text-right tabular-nums">{role.users_count}</TableCell>
                                    <TableCell className="text-right tabular-nums">{role.permissions.length}</TableCell>
                                    <TableCell>
                                        <div className="flex justify-end gap-1">
                                            <Button variant="ghost" size="icon" title="Edit" onClick={() => openEdit(role)}>
                                                <Pencil className="size-4" />
                                            </Button>
                                            {role.name !== 'Super Admin' && (
                                                <Button
                                                    variant="ghost" size="icon" title="Delete"
                                                    onClick={() => {
                                                        if (confirm(`Delete role "${role.name}"?`)) {
                                                            router.delete(route('roles.destroy', role.id), { preserveScroll: true });
                                                        }
                                                    }}
                                                >
                                                    <Trash2 className="size-4 text-destructive" />
                                                </Button>
                                            )}
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            </div>

            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>{editing ? `Edit ${editing.name}` : 'Add Role'}</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={submit} className="grid gap-4">
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
                                            {module}
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
