import AppLayout from '@/layouts/app-layout';
import { Button } from '@/components/ui/button';
import { qty, shortDate } from '@/lib/format';
import { Head, Link } from '@inertiajs/react';
import { ArrowLeft, CheckCircle2, FileText } from 'lucide-react';
import { AdminDelivery } from './dispatch-admin';
import { StatusPill, type DeliveryProps } from './dispatch-detail';
import { FieldDelivery } from './dispatch-field';

export default function DispatchPage(props: DeliveryProps) {
    const Detail = props.scoped ? FieldDelivery : AdminDelivery;
    const revision = [props.invoice.id, props.dispatch?.status, props.dispatch?.events.at(-1)?.id].join(':');

    return <AppLayout>
        <Head title={'Delivery · ' + props.invoice.invoice_number} />
        {props.historicalDelivery ? <HistoricalDelivery {...props} /> : <>
            <div className="print:hidden"><Detail key={revision} {...props} /></div>
            <PickingList {...props} />
        </>}
    </AppLayout>;
}

function HistoricalDelivery({ invoice, canViewInvoice }: DeliveryProps) {
    return <main className="space-y-4 p-3 sm:p-5">
        <header className="brand-panel rounded-xl px-4 py-4 sm:px-6">
            <Link href="/dispatch" className="mb-2 inline-flex items-center gap-1.5 text-sm text-brand-paper/80"><ArrowLeft className="size-4" />Dispatch &amp; Delivery</Link>
            <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-bold">{invoice.invoice_number}</h1><StatusPill state="delivered" inverse />
            </div>
            {invoice.customer && <p className="mt-1 text-sm text-brand-paper/80">{invoice.customer}</p>}
        </header>
        <section className="flex flex-wrap items-center justify-between gap-4 rounded-xl border bg-card p-4">
            <div className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-chart-2" aria-hidden="true" />
                <div>
                    <h2 className="font-semibold">Historical delivery</h2>
                    <p className="text-sm text-muted-foreground">Marked delivered without pickup or handover details. No delivery action is needed.</p>
                </div>
            </div>
            {canViewInvoice && <Button variant="outline" asChild><Link href={route('sales.summary', invoice.id, false)}><FileText />Invoice summary</Link></Button>}
        </section>
    </main>;
}

function PickingList({ invoice, dispatch, items, pickupLines }: DeliveryProps) {
    const rows = pickupLines.length
        ? pickupLines.map(line => ({ ...line, units: line.quantity }))
        : items;
    return <section className="hidden space-y-3 p-4 text-black print:block">
        <h1 className="text-2xl font-bold">Picking List · {invoice.invoice_number}</h1>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            <p><strong>Customer:</strong> {invoice.customer ?? '—'}</p>
            <p><strong>Planned delivery:</strong> {shortDate(dispatch?.planned_date)}</p>
            <p><strong>Address:</strong> {[invoice.address, invoice.city].filter(Boolean).join(', ') || '—'}</p>
            <p><strong>Assigned to:</strong> {dispatch?.assignee?.name ?? 'Unassigned'}</p>
        </div>
        <table className="w-full border-collapse border text-left text-sm">
            <thead className="table-header-group"><tr>{['Product', 'Batch', 'Expiry', 'Invoice units', ...(pickupLines.length ? ['Recorded pickup', 'Still to pick'] : [])].map(column => <th scope="col" key={column} className="border px-2 py-1.5">{column}</th>)}</tr></thead>
            <tbody>{rows.map(row => <tr key={row.id} className="break-inside-avoid">
                <td className="border px-2 py-1.5">{row.product}</td><td className="border px-2 py-1.5">{row.batch || '—'}</td>
                <td className="border px-2 py-1.5">{shortDate(row.expiry)}</td><td className="border px-2 py-1.5 text-right">{qty(row.units)}</td>
                {'picked' in row && <><td className="border px-2 py-1.5 text-right">{qty(row.picked)}</td><td className="border px-2 py-1.5 text-right">{qty(row.remaining)}</td></>}
            </tr>)}</tbody>
        </table>
        <p className="text-xs">All quantities include bonus units.</p>
    </section>;
}
