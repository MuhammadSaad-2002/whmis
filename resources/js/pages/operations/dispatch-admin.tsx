import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { qty, shortDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Link } from '@inertiajs/react';
import { ArrowDownToLine, ArrowLeft, Check, CircleAlert, ClipboardList, FileText, MapPin, Package, Printer, Truck, UserRound, type LucideIcon } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { DeliveryFields, FollowUpCollection, Notes, useDeliveryAction } from './dispatch-actions';
import { actions, Address, availableActions, BatchBadge, card, ContactLinks, DateMarker, deliveredTone, DeliveryHistory, DeliveryInfo, DeliverySteps, finished, label, pickedTone, QuantityStepper, requiredNotes, returnedTone, StatusPill, sum, type DeliveryProps } from './dispatch-detail';
import { Errors, Field, StaffSelect } from './shared';

const headerButton = 'border-brand-paper/25 bg-brand-paper/10 text-brand-paper hover:bg-brand-paper/20 hover:text-brand-paper';
const actionIcons: Record<string, LucideIcon> = {
    pickup: Package, confirm_pickup: Check, assign: UserRound, dispatched: Truck, delivered: Check, failed: CircleAlert, put_back: ArrowDownToLine,
};

export function AdminDelivery(p: DeliveryProps) {
    const status = p.dispatch?.status ?? 'untracked';
    const available = availableActions(p);
    const [selected, setSelected] = useState(available[0] ?? '');
    const action = available.includes(selected) ? selected : (available[0] ?? '');
    const { form, submit, setBatch, setItem } = useDeliveryAction(p);
    const batchMode = action === 'pickup' || action === 'put_back';
    const itemMode = action === 'delivered' || action === 'correct_delivery';
    const batches = p.pickupLines.length;
    const units = sum(p.items, item => item.units);
    const picked = sum(p.pickupLines, line => line.picked);
    const delivered = sum(p.items, item => item.delivered);
    const returned = sum(p.items, item => item.returned);
    const remaining = sum(p.items, item => item.remaining);
    const unpicked = sum(p.pickupLines, line => line.remaining);
    const entered = batchMode ? sum(form.data.pickup_lines, line => line.quantity) : sum(form.data.items, item => item.quantity);
    const confirmBlocked = action === 'confirm_pickup' && (unpicked > 0 || picked <= 0);
    const attempts = p.dispatch?.events.filter(event => event.action === 'dispatched').length ?? 0;
    const batchLimit = (line: DeliveryProps['pickupLines'][number]) => action === 'put_back' ? line.picked : line.remaining;
    const itemLimit = (item: DeliveryProps['items'][number]) => action === 'correct_delivery' ? item.delivered : item.remaining;
    const fill = () => {
        if (batchMode) form.setData('pickup_lines', p.pickupLines.map(line => ({ id: line.id, quantity: String(batchLimit(line)) })));
        else if (itemMode) form.setData('items', p.items.map(item => ({ sales_invoice_item_id: item.id, quantity: String(itemLimit(item)) })));
    };
    const expiry = (p.pickupLines.length ? p.pickupLines : p.items).flatMap(item => item.expiry ? [{ date: item.expiry, batch: item.batch }] : []).sort((a, b) => a.date.localeCompare(b.date))[0];
    const activityText: Record<string, string> = {
        pickup: entered ? qty(entered) + ' units will be recorded in the assigned Salesman’s custody.' : 'Enter actual quantities by batch in Items, or choose Pick all.',
        put_back: 'Enter the batch quantities the manager physically receives back. This changes custody only.',
        confirm_pickup: confirmBlocked ? 'All required units must be picked and recorded before confirming.' : 'Confirmation locks the pickup quantities.',
        dispatched: 'Start a delivery attempt for the recorded stock.',
        delivered: qty(entered) + ' units to record. Any units not handed over remain open; this does not create a return.',
        failed: 'This records a failed attempt. Nothing is returned automatically.',
        correct_delivery: 'Enter quantities to remove from the delivery record. Use Sales Returns for goods physically returned by the customer.',
        close_returned: 'Close the delivery because the remaining units are covered by posted returns.',
    };

    return <main className="flex min-w-0 flex-col gap-3.5 p-3 pb-8 sm:p-5">
        <header className="brand-panel rounded-xl px-4 py-4 sm:px-6">
            <Link href="/dispatch" className="mb-2 inline-flex items-center gap-1.5 text-sm text-brand-paper/85 hover:text-white print:hidden"><ArrowLeft className="size-4" />Dispatch &amp; Delivery <span aria-hidden>/</span> {p.invoice.invoice_number}</Link>
            <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Delivery · {p.invoice.invoice_number}</h1><StatusPill state={status} inverse />
                <div className="flex flex-wrap gap-2 lg:ml-auto print:hidden">
                    <Button variant="outline" className={headerButton} asChild><Link href="/dispatch"><ClipboardList />Dispatch list</Link></Button>
                    {p.canViewInvoice && <Button variant="outline" className={headerButton} asChild><Link href={'/sales/' + p.invoice.id + '/summary'}><FileText />View invoice</Link></Button>}
                    <Button variant="outline" className={headerButton} asChild><a href={route('dispatch.picking-pdf', p.invoice.id, false)} target="_blank" rel="noopener"><Printer />Print {p.dispatch?.custody_required ? 'picking list' : 'delivery items'}</a></Button>
                </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-brand-paper/80">
                <span>Customer <strong className="text-brand-paper">{p.invoice.customer ?? '—'}</strong></span>
                <span>Invoice <strong className="text-brand-paper capitalize">{p.invoice.status}</strong></span>
                <span>Planned <strong className="text-brand-paper">{p.dispatch?.planned_date ? shortDate(p.dispatch.planned_date) : 'Not planned'}</strong></span>
                <span>Items <strong className="text-brand-paper">{batches ? batches + ' batches · ' : ''}{qty(units)} units</strong></span>
            </div>
        </header>
        <DeliverySteps p={p} />
        <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-3">
            <InfoCard title="Assignment" icon={UserRound} tone="bg-chart-5/10 text-chart-5">
                <InfoRow name="Assigned to">{p.dispatch?.assignee?.name ?? 'Unassigned'}</InfoRow>
                <InfoRow name="Planned delivery"><DateMarker p={p} /></InfoRow>
                <InfoRow name="Original assignment">{p.dispatch?.original_assignee?.name ?? '—'}</InfoRow>
                <InfoRow name="Stock held by">{p.dispatch?.custodian?.name ?? (p.dispatch?.custody_required ? 'Not picked' : 'Not tracked')}</InfoRow>
                <InfoRow name="Delivery attempts">{attempts}</InfoRow>
            </InfoCard>
            <InfoCard title="Delivery Contact" icon={MapPin} tone="bg-chart-1/10 text-chart-1">
                <Address invoice={p.invoice} />
                <div className="mt-3"><ContactLinks invoice={p.invoice} /></div>
            </InfoCard>
            <InfoCard title="Shipment" icon={Package} tone="bg-accent text-accent-foreground">
                <div className="flex items-center gap-3">
                    <ShipmentRing units={units} picked={picked} delivered={delivered} returned={returned} isDelivered={status === 'delivered'} tracked={!!p.dispatch?.custody_required} />
                    <div className="min-w-0 flex-1">
                        <InfoRow name="Batches">{batches || '—'}</InfoRow>
                        <InfoRow name="Units (incl. bonus)">{qty(units)}</InfoRow>
                        <InfoRow name="Nearest expiry">{expiry ? shortDate(expiry.date) : '—'}</InfoRow>
                    </div>
                </div>
            </InfoCard>
        </div>
        <DeliveryInfo />
        <div className="grid items-start gap-3.5 xl:grid-cols-[minmax(0,2fr)_minmax(19rem,1fr)]">
            <div className="grid min-w-0 gap-3.5">
                <section className={card}>
                    <header className="flex flex-wrap items-center justify-between gap-2 p-3.5 sm:px-4">
                        <div className="flex flex-wrap items-baseline gap-x-2"><h2 className="text-base font-bold">Items</h2><span className="text-sm text-muted-foreground">{batchMode ? 'Enter quantities by batch' : qty(units) + ' units · ' + p.items.length + ' invoice lines'}</span></div>
                        {(batchMode || itemMode) ? <Button variant="outline" size="sm" onClick={fill} className="print:hidden">{action === 'pickup' ? 'Pick all' : action === 'delivered' ? 'Deliver all' : 'Fill all quantities'}</Button>
                            : <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">{[['Picked', 'bg-chart-5'], ['Delivered', 'bg-chart-2'], ['Returned', 'bg-chart-4']].map(([name, tone]) => <span key={name} className="inline-flex items-center gap-1"><span className={cn('size-2 rounded-full', tone)} />{name}</span>)}</div>}
                    </header>
                    <div tabIndex={0} aria-label="Delivery items table" className="relative max-w-full overflow-x-auto focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none print:overflow-visible">
                        {batchMode ? <table className="w-full min-w-[540px] text-left text-sm print:min-w-0">
                            <TableHead columns={['Product', 'Batch · expiry', 'Units', 'Picked', action === 'put_back' ? 'Put back now' : 'Pick now', 'Still to pick']} />
                            <tbody>{p.pickupLines.map((line, index) => <tr key={line.id} className="border-t">
                                <td className="px-3 py-2.5 font-semibold">{line.product}</td><td className="px-3 py-2.5"><BatchBadge batch={line.batch} expiry={line.expiry} /></td>
                                <td className="px-3 py-2.5 tabular-nums">{qty(line.quantity)}</td><td className={cn('px-3 py-2.5 tabular-nums', pickedTone)}>{qty(line.picked)}</td>
                                <td className="px-3 py-2.5"><div className="print:hidden"><QuantityStepper name={(action === 'put_back' ? 'Put back ' : 'Pick ') + line.product + ' · ' + line.batch} value={form.data.pickup_lines[index].quantity} maximum={batchLimit(line)} update={value => setBatch(line.id, value)} /></div></td>
                                <td className="px-3 py-2.5 tabular-nums">{qty(line.remaining)}</td>
                            </tr>)}</tbody>
                            <tfoot className="border-t bg-muted/50 font-bold"><tr>{['Total', '', qty(sum(p.pickupLines, line => line.quantity)), qty(picked), qty(entered), qty(unpicked)].map((value, index) => <td className="px-3 py-2.5 tabular-nums" key={index}>{value}</td>)}</tr></tfoot>
                        </table> : <table className="w-full min-w-[650px] text-left text-sm print:min-w-0">
                            <TableHead columns={['Product', 'Batch · expiry', 'Units', 'Picked', 'Delivered', 'Returned', 'Remaining', ...(itemMode ? [action === 'correct_delivery' ? 'Undo now' : 'Deliver now'] : ['Progress'])]} />
                            <tbody>{p.items.map((item, index) => {
                                const allocations = p.pickupLines.filter(line => line.sales_invoice_item_id === item.id);
                                return <tr key={item.id} className="border-t">
                                    <td className="min-w-32 px-3 py-2.5 font-semibold">{item.product}</td>
                                    <td className="px-3 py-2.5">{allocations.length ? <div className="grid gap-0.5">{allocations.map(line => <BatchBadge key={line.id} batch={line.batch} expiry={line.expiry} />)}</div> : <BatchBadge batch={item.batch} expiry={item.expiry} />}</td>
                                    {[item.units, allocations.length ? sum(allocations, line => line.picked) : '—', item.delivered, item.returned, item.remaining].map((value, idx) => <td className={cn('px-3 py-2.5 tabular-nums', ['', pickedTone, deliveredTone, returnedTone, 'font-semibold'][idx])} key={idx}>{typeof value === 'number' ? qty(value) : value}</td>)}
                                    <td className="px-3 py-2.5">{itemMode ? <QuantityStepper name={(action === 'correct_delivery' ? 'Undo ' : 'Deliver ') + item.product} value={form.data.items[index].quantity} maximum={itemLimit(item)} update={value => setItem(item.id, value)} /> : <LineProgress units={item.units} picked={sum(allocations, line => line.picked)} delivered={item.delivered} returned={item.returned} />}</td>
                                </tr>;
                            })}</tbody>
                            <tfoot className="border-t bg-muted/50 font-bold"><tr>{['Total', '', qty(units), batches ? qty(picked) : '—', qty(delivered), qty(returned), qty(remaining), itemMode ? qty(entered) : ''].map((value, index) => <td className="px-3 py-2.5 tabular-nums" key={index}>{value}</td>)}</tr></tfoot>
                        </table>}
                    </div>
                </section>
                <DeliveryHistory p={p} />
            </div>
            <div className="grid min-w-0 gap-3.5 xl:sticky xl:top-3.5 print:hidden">
                <section className={cn(card, 'space-y-3 p-3.5 sm:p-4')}>
                    <h2 className="text-base font-bold">Update Delivery</h2>
                    {finished(status) && <p className="flex items-center gap-2 rounded-lg bg-accent p-3 text-sm text-accent-foreground"><Check className="size-4 shrink-0" />{status === 'closed' ? 'Delivery closed' : qty(delivered) + ' units delivered'}{returned ? ' · ' + qty(returned) + ' recorded as returned' : ''}.</p>}
                    {available.length > 0 ? <>
                        <div className="flex flex-wrap gap-2" aria-label="Delivery actions">{available.map(key => {
                            const Icon = actionIcons[key] ?? ClipboardList;
                            return <Button key={key} type="button" variant={key === action ? 'secondary' : 'outline'} size="sm" className={cn('min-h-9 whitespace-normal', key === action && 'border border-ring/50 bg-accent text-accent-foreground')} aria-pressed={key === action} disabled={form.processing} onClick={() => {
                                if (key === action) return;
                                setSelected(key);
                                form.clearErrors();
                                form.setData({ ...form.data, notes: '', assigned_to: key === 'request_handover' ? '' : String(p.dispatch?.assigned_to ?? ''),
                                    items: p.items.map(item => ({ sales_invoice_item_id: item.id, quantity: '0' })),
                                    pickup_lines: p.pickupLines.map(line => ({ id: line.id, quantity: '0' })) });
                            }}><Icon />{label(key, actions)}</Button>;
                        })}</div>
                        <form className="space-y-3" onSubmit={event => { event.preventDefault(); submit(action); }}>
                            {activityText[action] && <p className="rounded-lg border bg-muted/60 px-3 py-2.5 text-sm text-muted-foreground">{activityText[action]}</p>}
                            {['assign', 'request_handover'].includes(action) && <Field label={action === 'assign' ? 'Responsible staff' : 'Incoming Salesman'}><StaffSelect staff={p.staff.filter(person => action !== 'request_handover' || person.id !== p.dispatch?.custodian?.id)} value={form.data.assigned_to} onChange={value => form.setData('assigned_to', value)} /></Field>}
                            {action === 'assign' && <Field label="Planned delivery date"><Input type="date" value={form.data.planned_date} onChange={event => form.setData('planned_date', event.target.value)} /></Field>}
                            {action === 'delivered' && <DeliveryFields p={p} form={form} />}
                            <Notes value={form.data.notes} required={requiredNotes.includes(action)} change={value => form.setData('notes', value)} />
                            <Errors errors={form.errors} />
                            <Button className="min-h-11 w-full" disabled={form.processing || confirmBlocked || ((batchMode || itemMode) && entered <= 0) || (action === 'request_handover' && !form.data.assigned_to)}>
                                {form.processing ? 'Saving…' : action === 'assign' ? 'Save assignment' : action === 'correct_delivery' && p.dispatch?.custody_required ? 'Request delivery correction' : label(action, actions)}
                            </Button>
                        </form>
                    </> : !finished(status) && <p className="text-sm text-muted-foreground">No actions are available to you at this stage.</p>}
                </section>
                {p.invoice.status === 'posted' && p.canReportCollection && <FollowUpCollection invoiceId={p.invoice.id} collectiblePaisa={p.collectiblePaisa} />}
            </div>
        </div>
    </main>;
}

function InfoCard({ title, icon: Icon, tone, children }: { title: string; icon: LucideIcon; tone: string; children: ReactNode }) {
    return <section className={cn(card, 'p-3.5 sm:p-4')}>
        <h2 className="mb-2.5 flex items-center gap-2 text-base font-bold"><span className={cn('grid size-8 shrink-0 place-items-center rounded-lg', tone)}><Icon className="size-4" /></span>{title}</h2>
        {children}
    </section>;
}

function InfoRow({ name, children }: { name: string; children: ReactNode }) {
    return <div className="flex items-baseline justify-between gap-2 border-b py-1.5 text-sm last:border-0"><span className="text-muted-foreground">{name}</span><strong className="text-right font-semibold">{children}</strong></div>;
}

function TableHead({ columns }: { columns: string[] }) {
    return <thead className="border-y bg-muted/70 text-xs font-semibold tracking-wide text-muted-foreground uppercase"><tr>{columns.map(text => <th key={text} scope="col" className="px-3 py-2.5 whitespace-nowrap">{text}</th>)}</tr></thead>;
}

function progressAmounts(units: number, picked: number, delivered: number, returned: number) {
    const total = units > 0 ? units : 1;
    const completed = Math.min(Math.max(delivered, 0), total);
    const back = Math.min(Math.max(returned, 0), total - completed);
    const held = Math.min(Math.max(picked - delivered, 0), total - completed - back);
    return { total, completed, back, held };
}

function LineProgress({ units, picked, delivered, returned }: { units: number; picked: number; delivered: number; returned: number }) {
    const { total, completed, back, held } = progressAmounts(units, picked, delivered, returned);
    return <div className="flex h-1.5 min-w-14 overflow-hidden rounded-full bg-muted" aria-hidden="true">
        <span className="bg-chart-2" style={{ width: completed / total * 100 + '%' }} /><span className="bg-chart-4" style={{ width: back / total * 100 + '%' }} /><span className="bg-chart-5" style={{ width: held / total * 100 + '%' }} />
    </div>;
}

function ShipmentRing({ units, picked, delivered, returned, isDelivered, tracked }: { units: number; picked: number; delivered: number; returned: number; isDelivered: boolean; tracked: boolean }) {
    const { total, completed, back, held } = progressAmounts(units, picked, delivered, returned);
    const segments = [{ quantity: completed, before: 0, colour: 'stroke-chart-2' }, { quantity: back, before: completed, colour: 'stroke-chart-4' }, { quantity: held, before: completed + back, colour: 'stroke-chart-5' }];
    return <div className="relative grid size-[82px] shrink-0 place-items-center">
        <svg aria-hidden viewBox="0 0 96 96" className="absolute inset-0 size-full -rotate-90"><circle cx="48" cy="48" r="40" pathLength="100" fill="none" strokeWidth="8" className="stroke-muted" />
            {segments.filter(segment => segment.quantity > 0).map(segment => <circle key={segment.colour} cx="48" cy="48" r="40" pathLength="100" fill="none" strokeWidth="8" strokeDasharray={segment.quantity / total * 100 + ' 100'} strokeDashoffset={-segment.before / total * 100} className={segment.colour} />)}
        </svg>
        <div className="text-center"><strong className="text-base tabular-nums">{qty(isDelivered || !tracked ? delivered : picked)}/{qty(units)}</strong><small className="block text-xs text-muted-foreground">{isDelivered || !tracked ? 'delivered' : 'picked'}</small></div>
    </div>;
}
