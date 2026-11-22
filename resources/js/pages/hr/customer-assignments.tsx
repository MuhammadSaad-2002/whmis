import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useForm } from '@inertiajs/react';
import { useState } from 'react';
import type { Option } from './shared';

export type AssignmentOption = Option & { city: string | null; status: string; primary: boolean };

export default function CustomerAssignments({ employeeId, linked, customers, options, issue }: {
    employeeId: number; linked: boolean; customers: Option[]; options: AssignmentOption[] | null; issue?: string | null;
}) {
    const [open, setOpen] = useState(false);
    return <section className="space-y-3 rounded-xl border p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
            <div><h2 className="text-lg font-semibold">Assigned Customers ({customers.length})</h2>
                <p className="text-sm text-muted-foreground">Active assigned customers appear in this Booker’s booking form.</p></div>
            {options !== null && <Button variant="outline" onClick={() => setOpen(true)}>Assign Customers</Button>}
        </div>
        {issue && <p role="status" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">{issue}</p>}
        {!linked ? !issue && <p className="text-sm text-amber-700">Edit this employee and select their Booker system login before assigning customers.</p>
            : <div className="flex max-h-40 flex-wrap gap-2 overflow-auto">{customers.map(c => <span key={c.id} className="rounded-md bg-muted px-3 py-1.5 text-sm">{c.name}</span>)}
                {!customers.length && <p className="text-sm text-muted-foreground">No customers assigned yet.</p>}</div>}
        {open && options !== null && <AssignmentDialog employeeId={employeeId} customers={customers} options={options} onClose={() => setOpen(false)}/>}
    </section>;
}

function AssignmentDialog({ employeeId, customers, options, onClose }: {
    employeeId: number; customers: Option[]; options: AssignmentOption[]; onClose: () => void;
}) {
    const [search, setSearch] = useState('');
    const form = useForm({ customer_ids: customers.map(c => c.id) });
    const visible = options.filter(c => `${c.name} ${c.city ?? ''}`.toLowerCase().includes(search.toLowerCase()));
    const selected = new Set(form.data.customer_ids);
    const toggle = (id: number, checked: boolean) => form.setData('customer_ids', checked ? [...new Set([...selected, id])] : [...selected].filter(v => v !== id));
    return <Dialog open onOpenChange={value => { if (!value && !form.processing) onClose(); }}>
        <DialogContent className="max-h-[85vh] overflow-auto sm:max-w-xl">
            <DialogHeader><DialogTitle>Assign Customers</DialogTitle><DialogDescription>Select the customers this Booker can book for, then save.</DialogDescription></DialogHeader>
            <form className="space-y-3" onSubmit={e => { e.preventDefault(); form.put(`/hr/employees/${employeeId}/customers`, { preserveScroll: true, onSuccess: onClose }); }}>
                <Input aria-label="Search customers" placeholder="Search by customer or city…" value={search} onChange={e => setSearch(e.target.value)}/>
                <div className="flex flex-wrap items-center gap-2 text-sm">
                    <Button type="button" size="sm" variant="outline" onClick={() => form.setData('customer_ids', [...new Set([...selected, ...visible.filter(c => c.status === 'active').map(c => c.id)])])}>Select all shown</Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => form.setData('customer_ids', [...selected].filter(id => !visible.some(c => c.id === id && !c.primary)))}>Clear shown</Button>
                    <span className="ml-auto text-muted-foreground">{selected.size} selected</span>
                </div>
                <div className="max-h-72 divide-y overflow-auto rounded-lg border">
                    {visible.map(c => <label key={c.id} className="flex cursor-pointer items-center gap-3 p-3 text-sm hover:bg-muted/50">
                        <input type="checkbox" checked={selected.has(c.id)} disabled={c.primary || form.processing} onChange={e => toggle(c.id, e.target.checked)}/>
                        <span className="min-w-0"><span className="block font-medium">{c.name}</span><span className="text-xs text-muted-foreground">{[c.city, c.status !== 'active' ? 'Inactive — unavailable in bookings' : null, c.primary ? 'Primary Booker assignment' : null].filter(Boolean).join(' · ')}</span></span>
                    </label>)}
                    {!visible.length && <p className="p-6 text-center text-sm text-muted-foreground">No matching customers.</p>}
                </div>
                {options.some(c => c.primary) && <p className="text-xs text-muted-foreground">Primary assignments are kept selected. Change the primary Booker in Customers to remove that assignment.</p>}
                {Object.values(form.errors).map((error, i) => <p key={i} className="text-sm text-destructive">{error}</p>)}
                <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={form.processing} onClick={onClose}>Cancel</Button><Button disabled={form.processing}>{form.processing ? 'Saving…' : 'Save Assignments'}</Button></div>
            </form>
        </DialogContent>
    </Dialog>;
}
