import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { usePermissions } from '@/hooks/use-permissions';
import { qty, shortDate } from '@/lib/format';
import { Link, useForm } from '@inertiajs/react';
import { Errors, Field, Layout, selectClass, StaffSelect, stamp, Status, type Staff } from './shared';

type Item = { id: number; product: string; batch: string | null; expiry: string | null; units: number; returned: number; delivered: number; remaining: number };
type Event = { id: number; action: string; created_at: string; notes: string | null; receiver_name: string | null; creator: Staff | null; assignee: Staff | null; items: { sales_invoice_item_id: number; quantity: string }[] };
type Props = { invoice: { id: number; invoice_number: string; customer: string | null; status: string }; dispatch: { id: number; status: string; assigned_to: number | null; assignee: Staff | null; events: Event[] } | null; items: Item[]; staff: Staff[] };
const actions: Record<string, string[]> = {
    pending: ['picking', 'assign'], picking: ['packed', 'assign'], packed: ['dispatched', 'assign'],
    dispatched: ['delivered', 'failed', 'assign'], partial: ['delivered', 'dispatched', 'failed', 'correct_delivery', 'assign'],
    failed: ['dispatched', 'correct_delivery', 'assign'], delivered: ['correct_delivery'], closed: ['correct_delivery'],
};
export default function DispatchPage(p: Props) {
    const { can } = usePermissions();
    return <Layout title={`Delivery · ${p.invoice.invoice_number}`} description={`${p.invoice.customer ?? ''} · Invoice ${p.invoice.status}`} actions={<div className="flex gap-2 print:hidden"><Button variant="outline" asChild><Link href="/dispatch">Dispatch list</Link></Button><Button variant="outline" onClick={() => window.print()}>Print picking list</Button></div>}>
        <div className="flex flex-wrap items-center gap-3"><Status value={p.dispatch?.status ?? 'untracked'}/><p className="text-sm text-muted-foreground">Assigned to: {p.dispatch?.assignee?.name ?? 'Unassigned'}</p></div>
        <div className="rounded-lg bg-muted/50 p-3 text-sm print:hidden">Delivery tracking does not move stock or record receipts. Record physical returns in Returns and actual payments in Payments. Quantities include bonus units; posted returns reduce remaining delivery quantities.</div>
        <div className="overflow-x-auto rounded-xl border"><table className="w-full text-sm"><thead className="bg-muted/50 text-left"><tr>{['Product / batch', 'Units', 'Returned', 'Delivered', 'Remaining'].map(h => <th key={h} className="whitespace-nowrap p-3">{h}</th>)}</tr></thead><tbody>{p.items.map(item => <tr key={item.id} className="border-t"><td className="min-w-48 p-3"><p className="font-medium">{item.product}</p><p className="text-xs text-muted-foreground">{item.batch ?? 'See invoice batch allocations'}{item.expiry ? ` · ${shortDate(item.expiry)}` : ''}</p></td>{[item.units, item.returned, item.delivered, item.remaining].map((n, i) => <td key={i} className="p-3 tabular-nums">{qty(n)}</td>)}</tr>)}</tbody></table></div>
        {can('dispatch.manage') && p.invoice.status === 'posted' && <ActionForm key={p.dispatch?.events.at(-1)?.id ?? 'new'} {...p}/>}
        <section className="space-y-3 print:hidden"><h2 className="text-lg font-semibold">Delivery history</h2>{!p.dispatch?.events.length && <p className="text-sm text-muted-foreground">No fulfilment activity recorded yet.</p>}{p.dispatch?.events.map(event => <article key={event.id} className="space-y-2 rounded-lg border p-3 text-sm"><div className="flex flex-wrap justify-between gap-2"><Status value={event.action}/><span className="text-xs text-muted-foreground">{stamp(event.created_at)} · {event.creator?.name}</span></div><p className="text-xs text-muted-foreground">Responsible: {event.assignee?.name ?? 'Unassigned'}</p>{event.receiver_name && <p>Received by: {event.receiver_name}</p>}{event.items.map((item, i) => <p key={i}>{p.items.find(line => line.id === item.sales_invoice_item_id)?.product}: {qty(item.quantity)} units</p>)}{event.notes && <p className="whitespace-pre-wrap break-words">{event.notes}</p>}</article>)}</section>
    </Layout>;
}
function ActionForm(p: Props) {
    const state = p.dispatch?.status ?? 'pending';
    const settledByReturns = p.items.reduce((s, i) => s + i.remaining, 0) === 0 && p.items.some(i => i.returned > 0);
    const available = [...(actions[state] ?? []), ...(settledByReturns && !['delivered', 'closed'].includes(state) ? ['close_returned'] : [])];
    const form = useForm({ action: available[0], assigned_to: p.dispatch?.assigned_to ? String(p.dispatch.assigned_to) : '', request_key: crypto.randomUUID(), receiver_name: '', notes: '', items: p.items.map(item => ({ sales_invoice_item_id: item.id, quantity: '0' })) });
    const quantities = ['delivered', 'correct_delivery'].includes(form.data.action);
    return <form className="space-y-3 rounded-xl border p-4 print:hidden" onSubmit={e => { e.preventDefault(); form.post(`/dispatch/${p.invoice.id}/events`, { preserveScroll: true, onSuccess: () => form.setData('request_key', crypto.randomUUID()) }); }}>
        <h2 className="font-semibold">Update delivery</h2><div className="grid gap-3 sm:grid-cols-2"><Field label="Action"><select className={selectClass} value={form.data.action} onChange={e => form.setData('action', e.target.value)}>{available.map(action => <option key={action} value={action}>{action === 'delivered' ? 'Record delivered quantities' : action.replaceAll('_', ' ')}</option>)}</select></Field><Field label="Responsible staff"><StaffSelect staff={p.staff} value={form.data.assigned_to} onChange={v => form.setData('assigned_to', v)}/></Field></div>
        {form.data.action === 'delivered' && <Field label="Received by *"><Input required maxLength={150} value={form.data.receiver_name} onChange={e => form.setData('receiver_name', e.target.value)}/></Field>}
        {form.data.action === 'correct_delivery' && <p className="text-sm text-amber-700">Enter quantities to remove from an incorrectly recorded delivery. This corrects the delivery record only; use Returns for goods physically returned.</p>}
        {quantities && <div className="space-y-2">{p.items.map((item, index) => <div key={item.id} className="grid grid-cols-[minmax(0,1fr)_6rem] items-center gap-3 rounded-lg bg-muted/30 p-2"><label htmlFor={`delivery-${item.id}`} className="text-sm">{item.product}<span className="block text-xs text-muted-foreground">Maximum {qty(form.data.action === 'delivered' ? item.remaining : item.delivered)}</span></label><Input id={`delivery-${item.id}`} type="number" inputMode="decimal" min="0" step="0.01" max={form.data.action === 'delivered' ? item.remaining : item.delivered} value={form.data.items[index].quantity} onChange={e => form.setData('items', form.data.items.map((v, i) => i === index ? { ...v, quantity: e.target.value } : v))}/></div>)}</div>}
        <Field label="Notes / reason"><textarea className="min-h-20 w-full rounded-md border p-2 text-base" maxLength={1000} required={['failed', 'correct_delivery', 'close_returned'].includes(form.data.action)} value={form.data.notes} onChange={e => form.setData('notes', e.target.value)}/></Field><Errors errors={form.errors}/><Button disabled={form.processing}>{form.processing ? 'Saving…' : 'Record activity'}</Button>
    </form>;
}
