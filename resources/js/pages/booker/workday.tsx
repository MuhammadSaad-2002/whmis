import { Paginator, type PaginatedData } from '@/components/paginator';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { money, shortDate } from '@/lib/format';
import { Link, router, useForm } from '@inertiajs/react';
import { useState } from 'react';
import { Errors, Field, Layout, selectClass, Status } from '../operations/shared';

type Customer = { id: number; name: string; city: string | null; account_balance: string | null; visit: { outcome: string; notes: string | null } | null; last_booking: { id: number; booking_number: string; booking_date: string; status: string } | null };
export default function Workday({ customers, filters }: { customers: PaginatedData<Customer>; filters: { date: string; search: string } }) {
    const [date, setDate] = useState(filters.date); const [search, setSearch] = useState(filters.search);
    return <Layout title="My Booker Workday" description="Plan visits, follow up with assigned pharmacies and take repeat orders." actions={<Button variant="outline" asChild><Link href="/bookings">My bookings</Link></Button>}>
        <form className="flex flex-wrap gap-2" onSubmit={e => { e.preventDefault(); router.get('/booker/workday', { date, search }); }}><Input aria-label="Visit date" type="date" className="w-full sm:w-44" value={date} onChange={e => setDate(e.target.value)}/><Input aria-label="Search assigned customers" placeholder="Customer or city…" className="w-full sm:w-72" value={search} onChange={e => setSearch(e.target.value)}/><Button>Apply</Button></form>
        {!customers.data.length && <div className="rounded-xl border p-6 text-sm">No assigned active customers match. Your administrator can assign customers from your Sales Booker employee profile.</div>}
        <div className="grid gap-3 md:grid-cols-2">{customers.data.map(customer => <article className="min-w-0 space-y-3 rounded-xl border p-4" key={customer.id}><div className="flex flex-wrap items-start justify-between gap-2"><div><h2 className="break-words font-semibold">{customer.name}</h2><p className="text-xs text-muted-foreground">{customer.city}</p></div>{customer.visit && <Status value={customer.visit.outcome}/>}</div><p className="text-sm">Account balance: <span className="font-medium tabular-nums">{money(customer.account_balance)}</span>{Number(customer.account_balance) < 0 && ' (customer credit)'}</p>
            {customer.last_booking && <p className="text-xs text-muted-foreground">Last order: {customer.last_booking.booking_number} · {shortDate(customer.last_booking.booking_date)} · {customer.last_booking.status}</p>}
            <div className="flex flex-wrap gap-2"><Button size="sm" asChild><Link href={`/bookings/create?customer_id=${customer.id}`}>New order</Link></Button>{customer.last_booking && <Button size="sm" variant="outline" asChild><Link href={`/bookings/create?repeat_booking_id=${customer.last_booking.id}`}>Repeat last order</Link></Button>}</div>
            <Visit key={`${filters.date}-${customer.visit?.outcome ?? ''}`} customer={customer} date={filters.date}/>
        </article>)}</div><div className="overflow-x-auto"><Paginator meta={customers}/></div>
    </Layout>;
}
function Visit({ customer, date }: { customer: Customer; date: string }) {
    const form = useForm({ visit_date: date, outcome: customer.visit?.outcome ?? 'planned', notes: customer.visit?.notes ?? '' });
    return <details className="rounded-lg bg-muted/30 p-3"><summary className="cursor-pointer text-sm font-medium">Plan / update visit</summary><form className="mt-3 space-y-3" onSubmit={e => { e.preventDefault(); form.put(`/booker/customers/${customer.id}/visit`, { preserveScroll: true }); }}><Field label="Visit outcome"><select className={selectClass} value={form.data.outcome} onChange={e => form.setData('outcome', e.target.value)}>{['planned', 'visited', 'no_order', 'closed'].map(v => <option key={v} value={v}>{v.replaceAll('_', ' ')}</option>)}</select></Field><Field label="Visit notes"><textarea maxLength={1000} className="min-h-20 w-full rounded-md border p-2 text-base" value={form.data.notes} onChange={e => form.setData('notes', e.target.value)}/></Field><Errors errors={form.errors}/><Button size="sm" disabled={form.processing}>Save visit</Button></form></details>;
}
