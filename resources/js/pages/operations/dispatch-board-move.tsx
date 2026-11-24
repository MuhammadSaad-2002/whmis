import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { qty, shortDate } from '@/lib/format';
import { Link, useForm } from '@inertiajs/react';
import { useEffect, useState } from 'react';
import { Notes } from './dispatch-actions';
import { actions, BatchBadge, label, QuantityStepper, type Item, type PickupLine } from './dispatch-detail';
import type { DispatchRow } from './dispatch-index';
import { Errors, Field, selectClass, type Staff } from './shared';

type MoveAction = 'assign' | 'picking' | 'packed' | 'pickup' | 'confirm_pickup' | 'dispatched' | 'delivered' | 'failed' | 'close_returned';
type Option = { stage: string; action: MoveAction; verify: boolean };
type MoveOptions = {
    status: string; moves: Option[]; items: Item[]; pickup: PickupLine[]; staff: Staff[];
    assigned_to: number | null; planned_date: string; salesman: Staff | null; hint: string;
};
export type BoardMoveRequest = { row: DispatchRow; target?: string; targetLabel?: string };

export function BoardMove({ request, close, restoreFocus }: { request: BoardMoveRequest | null; close: () => void; restoreFocus: () => void }) {
    return <Sheet open={request !== null} onOpenChange={open => { if (!open) close(); }}>
        <SheetContent appearance="form" side="right" className="dispatch-preview w-full sm:max-w-[500px]"
            onCloseAutoFocus={event => { event.preventDefault(); restoreFocus(); }}>
            {request && <BoardMoveContents key={request.row.id + ':' + request.target} request={request} close={close} />}
        </SheetContent>
    </Sheet>;
}

function BoardMoveContents({ request, close }: { request: BoardMoveRequest; close: () => void }) {
    const [data, setData] = useState<MoveOptions | null>(null);
    const [failed, setFailed] = useState(false);
    const id = request.row.id;
    useEffect(() => {
        const controller = new AbortController();
        fetch(route('dispatch.move-options', id, false), { headers: { Accept: 'application/json' }, signal: controller.signal })
            .then(response => { if (!response.ok) throw new Error('Move options unavailable'); return response.json() as Promise<MoveOptions>; })
            .then(setData)
            .catch(() => { if (!controller.signal.aborted) setFailed(true); });
        return () => controller.abort();
    }, [id]);

    return <>
        <SheetHeader>
            <SheetTitle>Move {request.row.invoice_number}</SheetTitle>
            <SheetDescription>{request.row.customer?.name ?? 'Customer'}{request.targetLabel ? ' · To ' + request.targetLabel : ''}</SheetDescription>
        </SheetHeader>
        {failed ? <div data-popup-section="body" role="alert">Could not load the available moves. Close this panel and try again.</div>
            : !data ? <div data-popup-section="body" role="status">Checking available moves…</div>
                : <MoveForm request={request} data={data} close={close} />}
    </>;
}

function MoveForm({ request, data, close }: { request: BoardMoveRequest; data: MoveOptions; close: () => void }) {
    const targetMoves = data.moves.filter(option => option.stage === request.target);
    const droppedOnBlockedStage = !!request.target && !targetMoves.length;
    const suggestedAction = !request.target && data.moves.length === 1 ? data.moves[0].action
        : request.target === 'packed' && droppedOnBlockedStage ? data.moves.find(option => option.action === 'pickup')?.action : undefined;
    const [action, setAction] = useState<MoveAction | ''>(targetMoves.length === 1 ? targetMoves[0].action : suggestedAction ?? '');
    const move = data.moves.find(option => option.action === action);
    const form = useForm({
        request_key: crypto.randomUUID(), notes: '', receiver_name: '', verified: false as boolean,
        assigned_to: String(data.assigned_to ?? ''), planned_date: data.planned_date,
        items: data.items.filter(item => item.remaining > 0).map(item => ({ sales_invoice_item_id: item.id, quantity: '0' })),
        pickup_lines: data.pickup.filter(line => line.remaining > 0).map(line => ({ id: line.id, quantity: '0' })),
    });
    const hasQuantity = (action === 'pickup' ? form.data.pickup_lines : form.data.items).some(line => Number(line.quantity) > 0);
    const needsQuantity = action === 'pickup' || action === 'delivered';
    const needsReason = action === 'failed' || action === 'close_returned';
    const blocked = form.processing || !move || (move.verify && !form.data.verified) || (needsQuantity && !hasQuantity);
    const stale = request.row.dispatch_status !== data.status;

    return <form className="flex min-h-0 flex-1 flex-col" onSubmit={event => {
        event.preventDefault();
        if (!move || blocked || stale) return;
        form.transform(current => ({
            action, expected_status: data.status, request_key: current.request_key, notes: current.notes.trim(),
            ...(action === 'assign' ? { assigned_to: current.assigned_to, planned_date: current.planned_date } : {}),
            ...(action === 'pickup' ? { pickup_lines: current.pickup_lines.filter(line => Number(line.quantity) > 0) } : {}),
            ...(action === 'delivered' ? { receiver_name: current.receiver_name.trim(), items: current.items.filter(line => Number(line.quantity) > 0) } : {}),
            ...(move.verify ? { admin_verified: current.verified, verified_salesman_id: data.salesman?.id } : {}),
        }));
        form.post(route('dispatch.record', request.row.id, false), { preserveScroll: true, onSuccess: close });
    }}>
        <div className="flex-1 space-y-4" data-popup-section="body">
            {stale ? <p className="drawer-note" role="alert">This delivery has already changed. Close this form and refresh the board.</p> : <>
                {droppedOnBlockedStage && <p className="drawer-note" role="alert">{data.hint}</p>}
                {!data.moves.length && !droppedOnBlockedStage && <p className="drawer-note">{data.hint}</p>}
                {data.moves.length > 0 && <Field label="Delivery action"><select value={action} className={selectClass} required onChange={event => {
                    setAction(event.target.value as MoveAction);
                    form.clearErrors();
                    form.setData('verified', false);
                }}>
                    <option value="">Choose an action</option>
                    {data.moves.map(option => <option key={option.action} value={option.action}>{option.action === 'assign' ? 'Assign to salesman (Pending)' : label(option.action, actions)}</option>)}
                </select></Field>}

                {action === 'assign' && <>
                    <Field label="Salesman *"><select className={selectClass} required value={form.data.assigned_to} onChange={event => form.setData('assigned_to', event.target.value)}>
                        <option value="">Choose a salesman</option>{data.staff.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}
                    </select></Field>
                    <Field label="Planned delivery date *"><Input type="date" required value={form.data.planned_date} onChange={event => form.setData('planned_date', event.target.value)} /></Field>
                    {data.assigned_to && <p className="muted">Prefilled from the invoice or the customer’s delivery schedule.</p>}
                </>}
                {action === 'pickup' && <>
                    <p>Enter the quantities actually picked, by batch.</p>
                    {form.data.pickup_lines.map(line => {
                        const batch = data.pickup.find(candidate => candidate.id === line.id)!;
                        return <div className="drawer-note space-y-2" key={line.id}>
                            <div><strong>{batch.product}</strong><p className="muted">{qty(batch.remaining)} still to pick</p><BatchBadge batch={batch.batch} expiry={batch.expiry} /></div>
                            <QuantityStepper wide name={'Pick ' + batch.product + ' · ' + batch.batch} maximum={batch.remaining} value={line.quantity}
                                update={quantity => form.setData('pickup_lines', form.data.pickup_lines.map(entry => entry.id === line.id ? { ...entry, quantity } : entry))} />
                        </div>;
                    })}
                </>}
                {action === 'confirm_pickup' && <p className="drawer-note">All required quantities are recorded. Confirming locks the pickup.</p>}
                {action === 'dispatched' && <p className="drawer-note">Confirm the salesman has left with the picked stock.</p>}
                {action === 'delivered' && <>
                    <Field label="Received by *"><Input required maxLength={150} value={form.data.receiver_name} onChange={event => form.setData('receiver_name', event.target.value)} /></Field>
                    <p>Enter the quantities the customer received. Undelivered quantities stay out for delivery.</p>
                    {form.data.items.map(line => {
                        const item = data.items.find(candidate => candidate.id === line.sales_invoice_item_id)!;
                        return <div className="drawer-note space-y-2" key={item.id}>
                            <div><strong>{item.product}</strong><p className="muted">{qty(item.remaining)} remaining</p><BatchBadge batch={item.batch} expiry={item.expiry} /></div>
                            <QuantityStepper wide name={'Deliver ' + item.product} maximum={item.remaining} value={line.quantity}
                                update={quantity => form.setData('items', form.data.items.map(entry => entry.sales_invoice_item_id === item.id ? { ...entry, quantity } : entry))} />
                        </div>;
                    })}
                </>}
                {action === 'close_returned' && <p className="drawer-note">Close this delivery using the posted returns. This does not create a new return.</p>}
                {action && <Notes required={needsReason} label={needsReason ? 'Reason' : 'Notes'} value={form.data.notes} change={value => form.setData('notes', value)} />}
                {move?.verify && <label className="drawer-note flex cursor-pointer items-start gap-2">
                    <input className="mt-0.5" type="checkbox" required checked={form.data.verified} onChange={event => form.setData('verified', event.target.checked)} />
                    <span>I verified this activity for <strong>{data.salesman?.name}</strong>{data.planned_date ? ', planned for ' + shortDate(data.planned_date) : ''}. It will be recorded under my login.</span>
                </label>}
                <Errors errors={form.errors} />
            </>}
        </div>
        <footer data-popup-section="footer">
            <Button type="button" variant="outline" disabled={form.processing} onClick={close}>Cancel</Button>
            {!stale && data.moves.length > 0 && <Button disabled={blocked}>{form.processing ? 'Saving…' : 'Save delivery action'}</Button>}
            <Button variant="outline" asChild><Link href={route('dispatch.show', request.row.id, false)}>Open delivery</Link></Button>
        </footer>
    </form>;
}
