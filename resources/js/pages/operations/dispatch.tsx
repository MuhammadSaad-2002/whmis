import AppLayout from '@/layouts/app-layout';
import { qty, shortDate } from '@/lib/format';
import { Head } from '@inertiajs/react';
import { AdminDelivery } from './dispatch-admin';
import type { DeliveryProps } from './dispatch-detail';
import { FieldDelivery } from './dispatch-field';

export default function DispatchPage(props: DeliveryProps) {
    const Detail = props.scoped ? FieldDelivery : AdminDelivery;
    const revision = [props.invoice.id, props.dispatch?.status, props.dispatch?.events.at(-1)?.id].join(':');

    return <AppLayout>
        <Head title={'Delivery · ' + props.invoice.invoice_number} />
        <div className="print:hidden"><Detail key={revision} {...props} /></div>
        <PickingList {...props} />
    </AppLayout>;
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
