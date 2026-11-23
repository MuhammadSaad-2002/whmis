import { Paginator, type PaginatedData } from '@/components/paginator';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { shortDate } from '@/lib/format';
import { Link, router } from '@inertiajs/react';
import { CalendarDays, Printer } from 'lucide-react';
import { useState } from 'react';
import { Field, Layout, selectClass, type Staff, Status } from './shared';

type Row = {
    id: number; invoice_number: string; invoice_date: string; dispatch_status: string;
    planned_date: string | null; assignee: string | null;
    customer: { name: string; city: string | null } | null;
};
type Filters = { search?: string; status?: string; date?: string; assignee_id?: string };
type Props = {
    invoices: PaginatedData<Row>; filters: Filters; staff: Staff[]; scoped: boolean; canPlan: boolean; today: string;
};
const states = ['untracked', 'pending', 'picking', 'packed', 'dispatched', 'partial', 'delivered', 'failed', 'closed'];

function DispatchFilters({ filters, staff, scoped, today }: Pick<Props, 'filters' | 'staff' | 'scoped' | 'today'>) {
    const [search, setSearch] = useState(filters.search ?? '');
    const [status, setStatus] = useState(filters.status ?? '');
    const [date, setDate] = useState(filters.date ?? '');
    const [assignee, setAssignee] = useState(filters.assignee_id ?? '');
    function apply(value = date) {
        router.get('/dispatch', { search, status, date: value || undefined, assignee_id: scoped ? undefined : assignee }, { preserveState: true });
    }

    return <form className="grid items-end gap-2 sm:flex sm:flex-wrap" onSubmit={(event) => { event.preventDefault(); apply(); }}>
        <Field label="Find invoice or customer"><Input placeholder="Invoice or customer…" value={search} onChange={(event) => setSearch(event.target.value)} /></Field>
        <Field label="Status"><select className={selectClass} value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">All statuses</option>{states.filter((state) => !scoped || state !== 'untracked').map((state) => <option key={state} value={state}>{state}</option>)}
        </select></Field>
        <Field label="Planned date"><Input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></Field>
        {!scoped && <Field label="Assigned staff"><select className={selectClass} value={assignee} onChange={(event) => setAssignee(event.target.value)}>
            <option value="">Any assignee</option>{staff.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
        </select></Field>}
        <div className="flex flex-wrap gap-2">
            <Button type="submit">Apply filters</Button>
            <Button type="button" variant="outline" onClick={() => apply(today)}>Today</Button>
            <Button type="button" variant="ghost" onClick={() => { setSearch(''); setStatus(''); setDate(''); setAssignee(''); router.get('/dispatch'); }}>Clear</Button>
        </div>
    </form>;
}

function DeliverySheet({ staff, today }: { staff: Staff[]; today: string }) {
    const [date, setDate] = useState(today);
    const [assignee, setAssignee] = useState('');
    return <details className="rounded-xl border p-3">
        <summary className="cursor-pointer text-sm font-semibold">Daily delivery sheet</summary>
        <p className="mt-2 text-sm text-muted-foreground">Print the invoices planned for one staff member on the chosen date, grouped by customer stop.</p>
        <form className="mt-3 grid items-end gap-2 sm:flex sm:flex-wrap" method="get" target="_blank" action={route('dispatch.sheet', {}, false)}>
            <Field label="Delivery date"><Input required type="date" name="date" value={date} onChange={(event) => setDate(event.target.value)} /></Field>
            <Field label="Salesman / staff"><select name="assignee_id" className={selectClass} value={assignee} onChange={(event) => setAssignee(event.target.value)} required>
                <option value="">Choose staff</option>{staff.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
            </select></Field>
            <Button type="submit" disabled={!date || !assignee}><Printer />Print daily sheet</Button>
        </form>
    </details>;
}

export default function DispatchIndex({ invoices, filters, staff, scoped, canPlan, today }: Props) {
    const title = scoped ? 'My Deliveries' : 'Dispatch & Delivery';
    return <Layout title={title} description={scoped ? 'Prepare, dispatch, and record deliveries assigned to you.' : 'Track deliveries for posted sales invoices. Stock is deducted when the invoice is posted.'}
        actions={canPlan && <Button variant="outline" asChild><Link href={route('dispatch.schedules', {}, false)}><CalendarDays />Booking & delivery schedules</Link></Button>}>
        {canPlan && <DeliverySheet staff={staff} today={today} />}
        <DispatchFilters key={JSON.stringify(filters)} filters={filters} staff={staff} scoped={scoped} today={today} />
        {!scoped && <p className="text-xs text-muted-foreground">Untracked invoices have no recorded delivery history. Use an invoice’s Assign action to plan it manually.</p>}
        {invoices.data.length === 0 && <p className="rounded-xl border p-8 text-center text-muted-foreground">{scoped ? 'No assigned deliveries match these filters.' : 'No posted invoices match these filters.'}</p>}
        <div className="grid gap-3 md:grid-cols-2">{invoices.data.map((invoice) => <article key={invoice.id} className="flex min-w-0 items-start justify-between gap-3 rounded-xl border p-4">
            <div className="min-w-0 space-y-1">
                <Link className="font-semibold hover:underline" href={route('dispatch.show', invoice.id, false)}>{invoice.invoice_number}</Link>
                <p className="break-words text-sm">{invoice.customer?.name}</p>
                <p className="text-xs text-muted-foreground">{invoice.customer?.city ? `${invoice.customer.city} · ` : ''}Invoice {shortDate(invoice.invoice_date)}</p>
                <p className="text-sm">{invoice.planned_date ? `Planned ${shortDate(invoice.planned_date)}` : 'No planned date'}{!scoped && ` · ${invoice.assignee ?? 'Unassigned'}`}</p>
                <Status value={invoice.dispatch_status} />
            </div>
            <Button variant="outline" size="sm" asChild><Link href={route('dispatch.show', invoice.id, false)}>Open</Link></Button>
        </article>)}</div>
        <div className="overflow-x-auto"><Paginator meta={invoices} /></div>
    </Layout>;
}
