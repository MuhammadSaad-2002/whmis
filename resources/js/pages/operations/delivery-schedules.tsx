import { Paginator, type PaginatedData } from '@/components/paginator';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Link, router, useForm } from '@inertiajs/react';
import { useState } from 'react';
import { Errors, Field, Layout, selectClass, type Staff } from './shared';

type Schedule = { booking_days: number[]; delivery_days: number[]; salesman_id: number | null };
type Customer = { id: number; name: string; city: string | null; delivery_schedule: Schedule | null; primary_booker: Staff | null; bookers: Staff[] };
const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function Weekdays({ title, selected, change }: { title: string; selected: number[]; change: (days: number[]) => void }) {
    return <fieldset className="min-w-0 space-y-2">
        <legend className="text-sm font-medium">{title}</legend>
        <div className="flex flex-wrap gap-1.5">{days.map((day, index) => {
            const value = index + 1;
            const checked = selected.includes(value);
            return <label key={day} className={`flex min-h-10 cursor-pointer items-center gap-1 rounded-lg border px-2 text-xs ${checked ? 'border-primary bg-accent' : ''}`}>
                <input type="checkbox" className="accent-primary" value={value} checked={checked}
                    onChange={(event) => change(event.target.checked ? [...selected, value] : selected.filter((item) => item !== value))} />{day}
            </label>;
        })}</div>
    </fieldset>;
}

function CustomerSchedule({ customer, salesmen }: { customer: Customer; salesmen: Staff[] }) {
    const schedule = customer.delivery_schedule;
    const form = useForm({
        booking_days: schedule?.booking_days ?? [], delivery_days: schedule?.delivery_days ?? [],
        salesman_id: schedule?.salesman_id ? String(schedule.salesman_id) : '',
    });
    const members = new Map(customer.bookers.map((person) => [person.id, person.name]));
    if (customer.primary_booker) members.set(customer.primary_booker.id, customer.primary_booker.name);
    const unavailable = form.data.salesman_id && !salesmen.some((person) => String(person.id) === form.data.salesman_id);

    return <form className="space-y-3 rounded-xl border bg-card p-4" onSubmit={(event) => {
        event.preventDefault();
        form.put(route('dispatch.schedules.update', customer.id, false), { preserveScroll: true });
    }}>
        <div><h2 className="font-semibold">{customer.name}</h2>{customer.city && <p className="text-sm text-muted-foreground">{customer.city}</p>}
            <p className="mt-1 text-xs text-muted-foreground">Bookers: {members.size ? [...members.values()].join(', ') : 'None assigned'}</p>
        </div>
        <div className="grid gap-3 xl:grid-cols-2">
            <Weekdays title="Booking days" selected={form.data.booking_days} change={(value) => form.setData('booking_days', value)} />
            <Weekdays title="Delivery days" selected={form.data.delivery_days} change={(value) => form.setData('delivery_days', value)} />
        </div>
        <Field label="Default salesman"><select className={selectClass} required={form.data.delivery_days.length > 0} value={form.data.salesman_id}
            onChange={(event) => form.setData('salesman_id', event.target.value)}>
            <option value="">Unassigned</option>
            {unavailable && <option value={form.data.salesman_id}>Unavailable — choose a replacement</option>}
            {salesmen.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
        </select></Field>
        <Errors errors={form.errors} />
        <Button type="submit" size="sm" disabled={form.processing || !!unavailable}>{form.processing ? 'Saving…' : 'Save schedule'}</Button>
    </form>;
}

export default function DeliverySchedules({ customers, salesmen, search }: { customers: PaginatedData<Customer>; salesmen: Staff[]; search: string }) {
    const [query, setQuery] = useState(search);
    const [running, setRunning] = useState(false);
    return <Layout title="Booking & Delivery Schedules" description="Set the weekdays and default Salesman for each customer."
        actions={<div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild><Link href="/dispatch">Dispatch & delivery</Link></Button>
            <Button type="button" disabled={running} onClick={() => {
                setRunning(true);
                router.post(route('dispatch.schedules.generate', {}, false), {}, { preserveScroll: true, onFinish: () => setRunning(false) });
            }}>{running ? 'Generating…' : 'Generate plan now'}</Button>
        </div>}>
        <div className="rounded-xl border bg-muted/30 p-3 text-sm">
            Booking days create visits in My Workday. Posted invoices go to the customer’s default salesman on the next selected delivery day, or today if no days are selected. Saving a default also assigns eligible pending invoices without changing existing assignments.
        </div>
        {!salesmen.length && <p className="rounded-lg border p-3 text-sm">No active Salesmen yet. In Users, add the Salesman role to a staff login. A login can keep its Booker role.</p>}
        <form className="flex flex-wrap gap-2" onSubmit={(event) => {
            event.preventDefault();
            router.get(route('dispatch.schedules', {}, false), { search: query.trim() || undefined }, { preserveState: true });
        }}>
            <Input aria-label="Find customer" placeholder="Customer or city…" value={query} onChange={(event) => setQuery(event.target.value)} className="max-w-sm" />
            <Button type="submit" variant="outline">Search</Button>
        </form>
        <div className="grid gap-3 lg:grid-cols-2">{customers.data.map((customer) => <CustomerSchedule key={customer.id} customer={customer} salesmen={salesmen} />)}</div>
        {!customers.data.length && <p className="rounded-xl border p-8 text-center text-muted-foreground">No active customers match your search.</p>}
        <Paginator meta={customers} />
    </Layout>;
}
