import { MasterRegister, MasterStatus, useMasterFilters } from '@/components/master-register';
import { type PaginatedData } from '@/components/paginator';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
    Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { usePage, useForm, router, Head } from '@inertiajs/react';
import AppLayout from '@/layouts/app-layout';
import { ALERT_FIX } from '@/lib/form-validation';
import { type BreadcrumbItem, type SharedData } from '@/types';
import { KeyRound, Pencil, Plus, Power, Trash2 } from 'lucide-react';
import { FormEvent, useState } from 'react';
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
    const { auth } = usePage<SharedData>().props;
    const currentUserId = auth.user.id;
    const [dialogOpen, setDialogOpen] = useState(false);
    const [pwOpen, setPwOpen] = useState(false);
    const [editing, setEditing] = useState<UserRow | null>(null);
    const [pwUser, setPwUser] = useState<UserRow | null>(null);
    const state = useMasterFilters('/users', filters);

    const form = useForm(emptyForm);
    const pwForm = useForm({ password: '', password_confirmation: '' });

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
            <MasterRegister title="Users" description="Accounts, roles, and access" label="user" page={users} state={state} placeholder="Name or email…"
                actions={<button type="button" className="hbtn pri" onClick={openCreate}><Plus className="i" aria-hidden="true" />Add User</button>}>
                {dense => <Table className={dense ? 'dense' : undefined}>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Name</TableHead>
                            <TableHead>Email</TableHead>
                            <TableHead>Roles</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="r"><span className="sr-only">Actions</span></TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {users.data.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={5} className="empty">
                                    No users found.
                                </TableCell>
                            </TableRow>
                        )}
                        {users.data.map((user) => (
                            <TableRow key={user.id}>
                                <TableCell className="entity-name"><strong>{user.name}</strong></TableCell>
                                <TableCell className="lowercase">{user.email}</TableCell>
                                <TableCell>
                                    <div className="flex flex-wrap gap-1">
                                        {user.roles.length === 0 && <span className="text-muted-foreground">—</span>}
                                        {user.roles.map((r) => (
                                            <span key={r.id} className="st master-tag">{r.name}</span>
                                        ))}
                                    </div>
                                </TableCell>
                                <TableCell>
                                    <MasterStatus status={user.is_active ? 'active' : 'inactive'} />
                                </TableCell>
                                <TableCell>
                                    <div className="acts">
                                        {(user.id !== currentUserId || auth.canManageOwnAccount) && (
                                            <>
                                                <button type="button" className="ib" title="Edit" aria-label="Edit" onClick={() => openEdit(user)}>
                                                    <Pencil className="i" aria-hidden="true" />
                                                </button>
                                                <button
                                                    type="button" className="ib" title="Reset password" aria-label="Reset password"
                                                    onClick={() => { setPwUser(user); pwForm.reset(); pwForm.clearErrors(); setPwOpen(true); }}
                                                >
                                                    <KeyRound className="i" aria-hidden="true" />
                                                </button>
                                            </>
                                        )}
                                        {user.id !== currentUserId && (
                                            <>
                                                <button
                                                    type="button" className="ib" title={user.is_active ? 'Deactivate' : 'Activate'} aria-label={user.is_active ? 'Deactivate' : 'Activate'}
                                                    onClick={() => router.post(route('users.toggle', user.id), {}, { preserveScroll: true })}
                                                >
                                                    <Power className={`size-4 ${user.is_active ? 'text-destructive' : 'text-green-600'}`} />
                                                </button>
                                                <button
                                                    type="button" className="ib" title="Delete" aria-label="Delete"
                                                    onClick={() => {
                                                        if (confirm(`Delete user "${user.name}"?`)) {
                                                            router.delete(route('users.destroy', user.id), { preserveScroll: true });
                                                        }
                                                    }}
                                                >
                                                    <Trash2 className="i text-destructive" aria-hidden="true" />
                                                </button>
                                            </>
                                        )}
                                    </div>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>}
            </MasterRegister>

            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent appearance="form" className="max-w-lg" aria-describedby={undefined}>
                    <DialogHeader>
                        <DialogTitle>{editing ? `Edit ${editing.name}` : 'Add User'}</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={submit}>
                        <DialogBody className="grid gap-3">
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
                        </DialogBody>
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                            <Button type="submit" disabled={form.processing}>{editing ? 'Save Changes' : 'Create User'}</Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            <Dialog open={pwOpen} onOpenChange={setPwOpen}>
                <DialogContent appearance="form" className="max-w-sm" aria-describedby={undefined}>
                    <DialogHeader>
                        <DialogTitle>Reset password{pwUser ? ` — ${pwUser.name}` : ''}</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={submitPassword}>
                        <DialogBody className="grid gap-3">
                        <div>
                            <Label htmlFor="new_password">New password</Label>
                            <Input id="new_password" type="password" value={pwForm.data.password} onChange={(e) => pwForm.setData('password', e.target.value)} autoFocus />
                            {pwForm.errors.password && <p className="text-xs text-destructive">{pwForm.errors.password}</p>}
                        </div>
                        <div>
                            <Label htmlFor="new_password_confirmation">Confirm password</Label>
                            <Input id="new_password_confirmation" type="password" value={pwForm.data.password_confirmation} onChange={(e) => pwForm.setData('password_confirmation', e.target.value)} />
                        </div>
                        </DialogBody>
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
