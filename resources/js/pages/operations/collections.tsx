import { Paginator, type PaginatedData } from '@/components/paginator';
import { Button } from '@/components/ui/button';
import { money, shortDate } from '@/lib/format';
import { Link } from '@inertiajs/react';
import { Filters, Layout } from './shared';

type Invoice = { id: number; invoice_number: string; invoice_date: string; due_date: string | null; total_amount: string; paid_amount: number; return_credit: number; outstanding: number; customer: { name: string; city: string | null } | null; follow_up: { next_follow_up: string; promised_date: string | null; outcome: string; assignee: { name: string } | null } | null };
export default function Collections({ invoices, filters }: { invoices: PaginatedData<Invoice>; filters: { search?: string; bucket?: string } }) {
    return <Layout title="Collections & Recovery" description="Live invoice balances after completed payment allocations and posted return credits.">
        <Filters path="/collections" filters={filters} field="bucket" choices={['overdue', 'follow_up']}/>
        <p className="text-xs text-muted-foreground">Unallocated customer credit is separate. Reconcile the customer statement before requesting payment. A promise is not a receipt.</p>
        <div className="grid gap-3 md:grid-cols-2">{invoices.data.map(invoice => <article className="min-w-0 space-y-3 rounded-xl border p-4" key={invoice.id}>
            <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-semibold">{invoice.customer?.name}</p><p className="text-xs text-muted-foreground">{invoice.invoice_number} · Due {shortDate(invoice.due_date ?? invoice.invoice_date)}</p></div><p className="text-lg font-bold tabular-nums">{money(invoice.outstanding)}</p></div>
            <dl className="grid grid-cols-3 gap-2 text-xs text-muted-foreground"><div><dt>Invoice</dt><dd>{money(invoice.total_amount)}</dd></div><div><dt>Paid / allocated</dt><dd>{money(invoice.paid_amount)}</dd></div><div><dt>Return credits</dt><dd>{money(invoice.return_credit)}</dd></div></dl>
            {invoice.follow_up && <p className="text-sm">{invoice.follow_up.assignee?.name ?? 'Unassigned'} · {invoice.follow_up.outcome} · Follow up {shortDate(invoice.follow_up.next_follow_up)}</p>}
            <Button variant="outline" size="sm" asChild><Link href={`/collections/${invoice.id}`}>View / follow up</Link></Button>
        </article>)}</div>{!invoices.data.length && <p className="rounded-xl border p-8 text-center text-muted-foreground">No open invoices match these filters.</p>}<div className="overflow-x-auto"><Paginator meta={invoices}/></div>
    </Layout>;
}
