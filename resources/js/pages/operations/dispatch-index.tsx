import { Paginator, type PaginatedData } from '@/components/paginator';
import { Button } from '@/components/ui/button';
import { shortDate } from '@/lib/format';
import { Link } from '@inertiajs/react';
import { Filters, Layout, Status } from './shared';

type Row = { id: number; invoice_number: string; invoice_date: string; dispatch_status: string; customer: { name: string; city: string | null } | null };
export default function DispatchIndex({ invoices, filters }: { invoices: PaginatedData<Row>; filters: { search?: string; status?: string } }) {
    return <Layout title="Dispatch & Delivery" description="Track picking, packing and deliveries for posted sales invoices. Stock is deducted when the invoice is posted.">
        <Filters path="/dispatch" filters={filters} field="status" choices={['untracked', 'pending', 'picking', 'packed', 'dispatched', 'partial', 'delivered', 'failed', 'closed']}/>
        <p className="text-xs text-muted-foreground">Untracked invoices have no recorded delivery history. Historical deliveries are not inferred from invoice posting.</p>
        {invoices.data.length === 0 && <p className="rounded-xl border p-8 text-center text-muted-foreground">No posted invoices match these filters.</p>}
        <div className="grid gap-3 md:grid-cols-2">{invoices.data.map(invoice => <article key={invoice.id} className="flex min-w-0 items-start justify-between gap-3 rounded-xl border p-4">
            <div className="min-w-0 space-y-1"><Link className="font-semibold hover:underline" href={`/dispatch/${invoice.id}`}>{invoice.invoice_number}</Link><p className="break-words text-sm">{invoice.customer?.name}</p><p className="text-xs text-muted-foreground">{invoice.customer?.city} · {shortDate(invoice.invoice_date)}</p><Status value={invoice.dispatch_status}/></div>
            <Button variant="outline" size="sm" asChild><Link href={`/dispatch/${invoice.id}`}>Open</Link></Button>
        </article>)}</div><div className="overflow-x-auto"><Paginator meta={invoices}/></div>
    </Layout>;
}
