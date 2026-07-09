import { Paginator, type PaginatedData } from '@/components/paginator';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
    Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { usePage, useForm, router, Head } from '@inertiajs/react';
import AppLayout from '@/layouts/app-layout';
import { ALERT_FIX } from '@/lib/form-validation';
import { type BreadcrumbItem } from '@/types';
import { KeyRound, Pencil, Plus, Power, Search, Trash2 } from 'lucide-react';
import { FormEvent, useEffect, useState } from 'react';
import { toast } from 'sonner';

interface UserRow {
    id: number;
    name: string;
    email: string;
    is_active: boolean;
    roles: { id: number; name: string }[];
}

interface Props {
    users: PaginatedData<UserRow>;
    roles: string[];
    filters: { search?: string };
}

const breadcrumbs: BreadcrumbItem[] = [{ title: 'Users', href: '/users' }];

const emptyForm = { name: '', email: '', password: '', password_confirmation: '', is_active: true, roles: [] as string[] };

export default function UsersIndex({ users, roles, filters }: Props) {
    const currentUserId = (usePage().props as { auth?: { user?: { id: number } } }).auth?.user?.id;
    const [dialogOpen, setDialogOpen] = useState(false);
    const [pwOpen, setPwOpen] = useState(false);
    const [editing, setEditing] = useState<UserRow | null>(null);
    const [pwUser, setPwUser] = useState<UserRow | null>(null);
    const [search, setSearch] = useState(filters.search ?? '');

    const form = useForm(emptyForm);
    const pwForm = useForm({ password: '', password_confirmation: '' });

    useEffect(() => {
        const timeout = setTimeout(() => {
            if ((filters.search ?? '') !== search) {
                router.get('/users', { search: search || undefined }, { preserveState: true, replace: true });
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

    const openEdit = (user: UserRow) => {
        setEditing(user);
        form.setData({
            ...emptyForm,
            name: user.name,
            email: user.email,
            is_active: user.is_active,
            roles: user.roles.map((r) => r.name),
        });
        form.clearErrors();
        setDialogOpen(true);
    };

    const toggleRole = (role: string) => {
        const has = form.data.roles.includes(role);
        form.setData('roles', has ? form.data.roles.filter((r) => r !== role) : [...form.data.roles, role]);
    };

    const submit = (e: FormEvent) => {
        e.preventDefault();
        const options = {
            preserveScroll: true,
            onSuccess: () => setDialogOpen(false),
            onError: () => toast.error(ALERT_FIX),
        };
        if (editing) form.put(route('users.update', editing.id), options);
        else form.post(route('users.store'), options);
    };

    const submitPassword = (e: FormEvent) => {
        e.preventDefault();
        if (!pwUser) return;
        pwForm.put(route('users.password', pwUser.id), {
            preserveScroll: true,
            onSuccess: () => { setPwOpen(false); pwForm.reset(); },
            onError: () => toast.error(ALERT_FIX),
        });
    };

    const err = (key: string) => (form.errors as Record<string, string>)[key];

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Users" />
            <div className="flex h-full flex-col gap-4 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-4">
                    <div>
                        <h1 className="text-4xl font-bold">Users</h1>
                        <p className="text-sm text-muted-foreground">Accounts, roles, and access</p>
                    </div>
                    <Button onClick={openCreate}>
                        <Plus className="mr-1 size-4" /> Add User
                    </Button>
                </div>

                <div className="relative w-full sm:w-72">
                    <Search className="absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
                    <Input
                        placeholder="Search name or email…"
                        className="pl-8"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>

                <div className="rounded-xl border">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Name</TableHead>
                                <TableHead>Email</TableHead>
                                <TableHead>Roles</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="w-36" />
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {users.data.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                                        No users found.
                                    </TableCell>
                                </TableRow>
                            )}
                            {users.data.map((user) => (
                                <TableRow key={user.id}>
                                    <TableCell className="font-medium">{user.name}</TableCell>
                                    <TableCell className="lowercase">{user.email}</TableCell>
                                    <TableCell>
                                        <div className="flex flex-wrap gap-1">
                                            {user.roles.length === 0 && <span className="text-muted-foreground">—</span>}
                                            {user.roles.map((r) => (
                                                <Badge key={r.id} variant="secondary">{r.name}</Badge>
                                            ))}
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant={user.is_active ? 'default' : 'destructive'}>
                                            {user.is_active ? 'Active' : 'Inactive'}
                                        </Badge>
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex justify-end gap-1">
                                            <Button variant="ghost" size="icon" title="Edit" onClick={() => openEdit(user)}>
                                                <Pencil className="size-4" />
                                            </Button>
                                            <Button
                                                variant="ghost" size="icon" title="Reset password"
                                                onClick={() => { setPwUser(user); pwForm.reset(); pwForm.clearErrors(); setPwOpen(true); }}
                                            >
                                                <KeyRound className="size-4" />
                                            </Button>
                                            {user.id !== currentUserId && (
                                                <>
                                                    <Button
                                                        variant="ghost" size="icon" title={user.is_active ? 'Deactivate' : 'Activate'}
                                                        onClick={() => router.post(route('users.toggle', user.id), {}, { preserveScroll: true })}
                                                    >
                                                        <Power className={`size-4 ${user.is_active ? 'text-destructive' : 'text-green-600'}`} />
                                                    </Button>
                                                    <Button
                                                        variant="ghost" size="icon" title="Delete"
                                                        onClick={() => {
                                                            if (confirm(`Delete user "${user.name}"?`)) {
                                                                router.delete(route('users.destroy', user.id), { preserveScroll: true });
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
                            ))}
                        </TableBody>
                    </Table>
                    <Paginator meta={users} />
                </div>
            </div>

            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>{editing ? `Edit ${editing.name}` : 'Add User'}</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={submit} className="grid gap-3">
                        <div>
                            <Label htmlFor="name">Name *</Label>
                            <Input id="name" value={form.data.name} onChange={(e) => form.setData('name', e.target.value)} autoFocus />
                            {err('name') && <p className="text-xs text-destructive">{err('name')}</p>}
                        </div>
                        <div>
                            <Label htmlFor="email">Email *</Label>
                            <Input id="email" type="email" value={form.data.email} onChange={(e) => form.setData('email', e.target.value)} />
                            {err('email') && <p className="text-xs text-destructive">{err('email')}</p>}
                        </div>
                        {!editing && (
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <Label htmlFor="password">Password *</Label>
                                    <Input id="password" type="password" value={form.data.password} onChange={(e) => form.setData('password', e.target.value)} />
                                    {err('password') && <p className="text-xs text-destructive">{err('password')}</p>}
                                </div>
                                <div>
                                    <Label htmlFor="password_confirmation">Confirm *</Label>
                                    <Input id="password_confirmation" type="password" value={form.data.password_confirmation} onChange={(e) => form.setData('password_confirmation', e.target.value)} />
                                </div>
                            </div>
                        )}
                        <div>
                            <Label>Roles</Label>
                            <div className="grid grid-cols-2 gap-2 rounded-md border p-3">
                                {roles.map((role) => (
                                    <label key={role} className="flex items-center gap-2 text-sm">
                                        <Checkbox checked={form.data.roles.includes(role)} onCheckedChange={() => toggleRole(role)} />
                                        {role}
                                    </label>
                                ))}
                            </div>
                        </div>
                        <label className="flex items-center gap-2 text-sm">
                            <Checkbox checked={form.data.is_active} onCheckedChange={(v) => form.setData('is_active', !!v)} />
                            Active (can sign in)
                        </label>
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                            <Button type="submit" disabled={form.processing}>{editing ? 'Save Changes' : 'Create User'}</Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            <Dialog open={pwOpen} onOpenChange={setPwOpen}>
                <DialogContent className="max-w-sm">
                    <DialogHeader>
                        <DialogTitle>Reset password{pwUser ? ` — ${pwUser.name}` : ''}</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={submitPassword} className="grid gap-3">
                        <div>
                            <Label htmlFor="new_password">New password</Label>
                            <Input id="new_password" type="password" value={pwForm.data.password} onChange={(e) => pwForm.setData('password', e.target.value)} autoFocus />
                            {pwForm.errors.password && <p className="text-xs text-destructive">{pwForm.errors.password}</p>}
                        </div>
                        <div>
                            <Label htmlFor="new_password_confirmation">Confirm password</Label>
                            <Input id="new_password_confirmation" type="password" value={pwForm.data.password_confirmation} onChange={(e) => pwForm.setData('password_confirmation', e.target.value)} />
                        </div>
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setPwOpen(false)}>Cancel</Button>
                            <Button type="submit" disabled={pwForm.processing}>Reset</Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </AppLayout>
    );
}
