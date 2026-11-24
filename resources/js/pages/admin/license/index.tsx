import { MasterStatus, RegisterLayout, RegisterList } from '@/components/master-register';
import { Button } from '@/components/ui/button';
import {
    Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import AppLayout from '@/layouts/app-layout';
import { ALERT_FIX } from '@/lib/form-validation';
import { shortDate } from '@/lib/format';
import { type BreadcrumbItem } from '@/types';
import { Head, useForm } from '@inertiajs/react';
import { KeyRound, ShieldCheck, ShieldX } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { toast } from 'sonner';

interface LicenseKey {
    id: number;
    key: string;
    expires_at: string;
    activated_at: string;
    activated_by: string | null;
    notes: string | null;
}

interface Props {
    keys: LicenseKey[];
    status: { expires_at: string | null; days_remaining: number | null; valid: boolean };
}

const breadcrumbs: BreadcrumbItem[] = [{ title: 'License', href: '/license' }];

// A date string (YYYY-MM-DD) one month from today, for the default expiry.
function defaultExpiry(): string {
    const d = new Date();
    d.setMonth(d.getMonth() + 1);
    return d.toISOString().slice(0, 10);
}

export default function LicenseIndex({ keys, status }: Props) {
    const [dialogOpen, setDialogOpen] = useState(false);
    const form = useForm({ expires_at: defaultExpiry(), notes: '' });

    const openActivate = () => {
        form.setData({ expires_at: defaultExpiry(), notes: '' });
        form.clearErrors();
        setDialogOpen(true);
    };

    const submit = (e: FormEvent) => {
        e.preventDefault();
        form.post(route('license.store'), {
            preserveScroll: true,
            onSuccess: () => setDialogOpen(false),
            onError: () => toast.error(ALERT_FIX),
        });
    };

    const days = status.days_remaining;
    const statusLabel = !status.valid
        ? 'Expired / inactive'
        : days !== null && days <= 5
            ? `Expires in ${days} day${days === 1 ? '' : 's'}`
            : 'Active';

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="License" />
            <RegisterLayout title="License" description="Activation keys that unlock the system"
                actions={<button type="button" className="hbtn pri" onClick={openActivate}><KeyRound className="i" aria-hidden="true" />Activate License</button>}>
                <section className="card register-panel flex items-center gap-3" aria-label="Current license">
                    <div className={`flex size-11 shrink-0 items-center justify-center rounded-full ${status.valid ? 'bg-emerald-500/10 text-emerald-700' : 'bg-destructive/10 text-destructive'}`}>
                        {status.valid ? <ShieldCheck className="size-6" aria-hidden="true" /> : <ShieldX className="size-6" aria-hidden="true" />}
                    </div>
                    <div>
                        <h2>Current license</h2>
                        <p className="muted">{status.expires_at ? `Valid until ${shortDate(status.expires_at)}` : 'No license has been activated yet.'}</p>
                    </div>
                    <div className="ml-auto"><MasterStatus status={statusLabel} tone={!status.valid ? 'negative' : days !== null && days <= 5 ? 'attention' : 'positive'} /></div>
                </section>
                <RegisterList title="License activation history" controls={<h2 className="font-bold">Activation history</h2>}>
                    {dense => <Table className={dense ? 'dense' : undefined}>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Key</TableHead>
                                <TableHead>Expires</TableHead>
                                <TableHead>Activated</TableHead>
                                <TableHead>By</TableHead>
                                <TableHead>Notes</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {keys.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={5} className="empty">
                                        No keys issued yet.
                                    </TableCell>
                                </TableRow>
                            )}
                            {keys.map((k) => (
                                <TableRow key={k.id}>
                                    <TableCell className="text-sm tabular-nums">{k.key}</TableCell>
                                    <TableCell>{shortDate(k.expires_at)}</TableCell>
                                    <TableCell>{shortDate(k.activated_at)}</TableCell>
                                    <TableCell>{k.activated_by ?? '—'}</TableCell>
                                    <TableCell className="wrap-cell muted">{k.notes ?? '—'}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>}
                </RegisterList>
            </RegisterLayout>

            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent appearance="form" aria-describedby={undefined}>
                    <DialogHeader>
                        <DialogTitle>Activate License</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={submit}>
                        <DialogBody className="grid gap-4">
                        <div>
                            <Label htmlFor="expires_at">Expiry date *</Label>
                            <Input
                                id="expires_at"
                                type="date"
                                value={form.data.expires_at}
                                onChange={(e) => form.setData('expires_at', e.target.value)}
                                autoFocus
                            />
                            <p className="mt-1 text-xs text-muted-foreground">Defaults to one month from today.</p>
                            {form.errors.expires_at && <p className="text-xs text-destructive">{form.errors.expires_at}</p>}
                        </div>
                        <div>
                            <Label htmlFor="notes">Notes</Label>
                            <Input
                                id="notes"
                                value={form.data.notes}
                                onChange={(e) => form.setData('notes', e.target.value)}
                                placeholder="e.g. paid up to Sept 2026"
                            />
                            {form.errors.notes && <p className="text-xs text-destructive">{form.errors.notes}</p>}
                        </div>
                        </DialogBody>
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                            <Button type="submit" disabled={form.processing}>Activate</Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </AppLayout>
    );
}
