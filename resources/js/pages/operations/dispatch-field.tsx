import { fieldAction, fieldCard, fieldHero, fieldHeroAction, fieldPrimary, fieldSurface, FieldTile } from '@/components/field-work-ui';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { qty } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Link } from '@inertiajs/react';
import { ArrowLeft, ArrowRight, Check, CircleAlert, ClipboardList, EllipsisVertical, HandCoins, Navigation, Package, Printer, Store, Truck } from 'lucide-react';
import { useRef, useState } from 'react';
import { DeliveryFields, FailureForm, FollowUpCollection, Notes, useDeliveryAction } from './dispatch-actions';
import { actions, Address, availableActions, BatchBadge, ContactLinks, DateMarker, DeliveryHistory, DeliveryInfo, DeliverySteps, finished, label, ProgressMeter, QuantityStepper, StatusPill, sum, type DeliveryProps } from './dispatch-detail';
import { Errors } from './shared';

type SheetMode = 'deliver' | 'failed' | 'collection';

export function FieldDelivery(p: DeliveryProps) {
    const { form, submit, setBatch, setItem } = useDeliveryAction(p);
    const [sheet, setSheet] = useState<SheetMode | null>(null);
    const trigger = useRef<HTMLElement | null>(null);
    const menuAnchor = useRef<HTMLButtonElement>(null);
    const status = p.dispatch?.status ?? 'untracked';
    const actionable = availableActions(p);
    const can = (action: string) => actionable.includes(action);
    const picked = sum(p.pickupLines, line => line.picked);
    const unpicked = sum(p.pickupLines, line => line.remaining);
    const delivered = sum(p.items, item => item.delivered);
    const returned = sum(p.items, item => item.returned);
    const unitTotal = sum(p.items, item => item.units);
    const deliveryRemaining = sum(p.items, item => item.remaining);
    const canConfirm = can('confirm_pickup') && unpicked === 0 && picked > 0;
    const enteringPickup = can('pickup') && !canConfirm;
    const enteringDelivery = can('delivered');
    const canCollect = p.invoice.status === 'posted' && p.canReportCollection;
    const pickupQty = sum(form.data.pickup_lines, line => line.quantity);
    const handoverQty = sum(form.data.items, item => item.quantity);
    const noteVisible = !finished(status) && (enteringPickup || enteringDelivery || canConfirm || can('dispatched') || can('picking') || can('packed'));
    const all = enteringPickup ? pickupQty === unpicked && unpicked > 0 : handoverQty === deliveryRemaining && deliveryRemaining > 0;
    const setAll = () => {
        if (enteringPickup) form.setData('pickup_lines', p.pickupLines.map(line => ({ id: line.id, quantity: all ? '0' : String(line.remaining) })));
        if (enteringDelivery) form.setData('items', p.items.map(item => ({ sales_invoice_item_id: item.id, quantity: all ? '0' : String(item.remaining) })));
    };
    const openSheet = (mode: SheetMode, source: HTMLElement | null = document.activeElement as HTMLElement) => {
        trigger.current = source;
        form.clearErrors();
        setSheet(mode);
    };
    const stateAction = can('accept_handover') ? 'accept_handover'
        : enteringPickup ? 'pickup'
            : canConfirm ? 'confirm_pickup'
                : enteringDelivery ? 'delivered'
                    : ['dispatched', 'picking', 'packed'].find(can);
    const primary = stateAction === 'pickup' ? pickupQty > 0 ? 'Record pickup · ' + qty(pickupQty) + ' units' : 'Pick items to continue'
        : stateAction === 'delivered' ? 'Record delivery' + (handoverQty > 0 ? ' · ' + qty(handoverQty) + ' units' : '')
            : stateAction === 'dispatched' && status === 'failed' ? 'Try delivery again'
                : stateAction ? label(stateAction, actions) : null;
    const task = can('accept_handover') ? { icon: Package, title: 'Confirm stock handover', body: 'Accept only after receiving the stock from the current custodian.', count: picked }
        : canConfirm ? { icon: Check, title: 'Ready to confirm pickup', body: 'All required units are recorded. Confirm to lock pickup quantities.', count: picked }
            : enteringPickup ? { icon: Package, title: 'Pick up from warehouse', body: qty(picked) + ' picked · ' + qty(unpicked) + ' still to pick. Count the actual quantities by batch.', count: picked + pickupQty }
                : enteringDelivery ? { icon: Navigation, title: 'Hand over at the pharmacy', body: qty(deliveryRemaining) + ' units are still open. Record what the customer receives.', count: delivered + returned + handoverQty }
                    : status === 'failed' ? { icon: CircleAlert, title: 'Delivery attempt failed', body: 'Undelivered stock remains in custody. You can retry the delivery.', count: delivered + returned }
                        : status === 'packed' ? { icon: Truck, title: 'Stock is with you', body: 'Start the trip when you leave for the pharmacy.', count: picked }
                            : finished(status) ? { icon: Check, title: status === 'closed' ? 'Delivery closed' : 'Delivery complete', body: qty(delivered) + ' units delivered' + (returned ? ' · ' + qty(returned) + ' recorded as returned' : '') + '.', count: delivered + returned }
                                : { icon: Package, title: label(status), body: 'Review the current quantities and available actions below.', count: delivered + returned };
    const ActionIcon = stateAction === 'dispatched' ? Truck : Check;

    return <>
        <main className="mx-auto flex w-full max-w-xl min-w-0 flex-col gap-3 px-3 pt-3 pb-36 sm:px-5 sm:pt-4">
            <header className={cn(fieldHero, 'sticky top-0 z-10 flex min-h-11 items-center gap-2 py-2.5 sm:py-3 print:static')}>
                <Button size="icon" variant="outline" asChild className={cn(fieldHeroAction, 'size-11 shrink-0 p-0 max-sm:hidden print:hidden')}><Link href="/dispatch" aria-label="Back to My Deliveries"><ArrowLeft /></Link></Button>
                <div className="min-w-0 flex-1"><h1 className="break-words text-lg leading-tight font-bold tracking-tight sm:text-xl">{p.invoice.invoice_number}</h1><p className="mt-0.5 hidden text-xs text-brand-paper/80 sm:block">Delivery · Invoice {p.invoice.status}</p></div>
                <div className="hidden sm:flex"><StatusPill state={status} inverse /></div>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild><Button ref={menuAnchor} size="icon" className={cn(fieldHeroAction, 'size-11 shrink-0 p-0 max-sm:hidden print:hidden')} variant="outline" aria-label="More delivery actions"><EllipsisVertical /></Button></DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild><Link href="/dispatch"><ClipboardList />My Deliveries</Link></DropdownMenuItem>
                        <DropdownMenuItem asChild><a href={route('dispatch.picking-pdf', p.invoice.id, false)} target="_blank" rel="noopener"><Printer />Print {p.dispatch?.custody_required ? 'picking list' : 'delivery items'}</a></DropdownMenuItem>
                        {can('failed') && <DropdownMenuItem onSelect={() => openSheet('failed', menuAnchor.current)}><CircleAlert />Report failed attempt</DropdownMenuItem>}
                        {canCollect && <DropdownMenuItem onSelect={() => openSheet('collection', menuAnchor.current)}><HandCoins />Report a collection</DropdownMenuItem>}
                    </DropdownMenuContent>
                </DropdownMenu>
            </header>
            <DeliverySteps p={p} field />
            <section className={fieldSurface} aria-label="Customer contact">
                <div className="flex items-start gap-2.5 p-3.5 sm:p-4">
                    <FieldTile tone="bg-chart-1/10 text-chart-1"><Store /></FieldTile>
                    <div className="min-w-0 flex-1">
                        <h2 className="mb-1 break-words text-base font-bold">{p.invoice.customer ?? 'Customer'}</h2>
                        <Address invoice={p.invoice} hideContactOnMobile />
                        <div className="hidden sm:block"><ContactLinks invoice={p.invoice} full /></div>
                    </div>
                </div>
                <dl className="mx-3.5 mb-3.5 grid grid-cols-2 divide-x rounded-xl border bg-muted/45 text-sm sm:mx-4 sm:mb-4"><div className="px-3.5 py-2.5"><dt className="text-xs text-muted-foreground">Planned</dt><dd className="font-semibold"><DateMarker p={p} /></dd></div>
                    <div className="min-w-0 px-3.5 py-2.5"><dt className="text-xs text-muted-foreground">Assigned</dt><dd className="break-words font-semibold">{p.dispatch?.assignee?.name ?? 'Unassigned'}</dd></div></dl>
            </section>
            <section className={fieldCard}>
                <ProgressMeter count={task.count} total={unitTotal}>
                    <div className="mb-3 flex items-start gap-2.5">
                        <FieldTile tone={status === 'failed' ? 'bg-destructive/10 text-destructive' : 'bg-accent text-accent-foreground'}><task.icon /></FieldTile>
                        <div><h2 className="text-base font-bold">{task.title}</h2><p className="text-sm text-muted-foreground">{task.body}</p></div>
                    </div>
                </ProgressMeter>
            </section>
            <section aria-labelledby="field-delivery-items">
                <div className="mb-2 flex flex-wrap items-center gap-x-2">
                    <h2 id="field-delivery-items" className="text-base font-bold">Items</h2>
                    <span className="text-sm text-muted-foreground">{enteringPickup ? p.pickupLines.length + ' batches' : p.items.length + ' lines'} · {qty(unitTotal)} units</span>
                    {(enteringPickup || enteringDelivery) && <Button type="button" variant="ghost" size="sm" className="ml-auto min-h-10 text-accent-foreground print:hidden" onClick={setAll}>{all ? 'Clear quantities' : enteringPickup ? 'Pick all' : 'All handed over'}</Button>}
                </div>
                <div className="grid gap-2.5">
                    {enteringPickup ? p.pickupLines.map((line, index) => {
                        const value = form.data.pickup_lines[index]?.quantity ?? '0';
                        return <article key={line.id} className={cn(fieldCard, Number(value) > 0 && 'border-ring/50')}>
                            <div className="mb-2.5 flex items-start justify-between gap-2"><div className="min-w-0"><h3 className="font-semibold">{line.product}</h3><BatchBadge batch={line.batch} expiry={line.expiry} /></div><div className="shrink-0 text-right"><strong className="text-lg tabular-nums">{qty(line.remaining)}</strong><small className="block text-xs text-muted-foreground">to pick</small></div></div>
                            {line.remaining > 0 ? <div className="print:hidden"><QuantityStepper wide name={'Pick ' + line.product + ' · ' + line.batch} value={value} maximum={line.remaining} update={next => setBatch(line.id, next)} /></div> : <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-semibold text-accent-foreground">{qty(line.picked)} picked</span>}
                        </article>;
                    }) : p.items.map((item, index) => {
                        const allocations = p.pickupLines.filter(line => line.sales_invoice_item_id === item.id);
                        const value = form.data.items[index]?.quantity ?? '0';
                        return <article key={item.id} className={cn(fieldCard, Number(value) > 0 && 'border-ring/50')}>
                            <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0"><h3 className="font-semibold">{item.product}</h3><div className="mt-0.5 flex flex-wrap gap-1.5">{allocations.length ? allocations.map(line => <BatchBadge key={line.id} batch={line.batch} expiry={line.expiry} />) : <BatchBadge batch={item.batch} expiry={item.expiry} />}</div></div>
                                <div className="shrink-0 text-right"><strong className="text-lg tabular-nums">{qty(enteringDelivery ? item.remaining : item.units)}</strong><small className="block text-xs text-muted-foreground">{enteringDelivery ? 'remaining' : 'units'}</small></div>
                            </div>
                            {enteringDelivery && item.remaining > 0
                                ? <div className="mt-2.5 print:hidden"><QuantityStepper wide name={'Deliver ' + item.product} value={value} maximum={item.remaining} update={next => setItem(item.id, next)} /></div>
                                : <div className="mt-2 flex flex-wrap gap-1.5 text-xs font-semibold">
                                    {item.delivered > 0 && <span className="rounded-full bg-accent px-2 py-0.5 text-accent-foreground">{qty(item.delivered)} delivered</span>}
                                    {item.returned > 0 && <span className="rounded-full bg-chart-4/10 px-2 py-0.5 text-chart-4">{qty(item.returned)} returned</span>}
                                    {item.remaining > 0 && <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">{qty(item.remaining)} open</span>}
                                </div>}
                        </article>;
                    })}
                </div>
            </section>
            {noteVisible && <div className={cn(fieldCard, 'print:hidden')}><Notes label="Note" value={form.data.notes} change={value => form.setData('notes', value)} /></div>}
            {!sheet && <Errors errors={form.errors} />}
            <div className="hidden sm:block print:hidden"><DeliveryInfo /></div>
            <DeliveryHistory p={p} collapsible />
            {canCollect && <Button variant="outline" className={cn(fieldAction, 'print:hidden')} onClick={event => openSheet('collection', event.currentTarget)}><HandCoins />Report a follow-up collection</Button>}
        </main>
        <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 px-3 pt-2 pb-[max(.75rem,env(safe-area-inset-bottom))] backdrop-blur print:hidden">
            <div className="mx-auto max-w-xl space-y-2">
                {enteringPickup && pickupQty > 0 && pickupQty < unpicked && <p className="rounded-lg bg-chart-4/10 px-3 py-1.5 text-sm text-chart-4">{qty(unpicked - pickupQty)} units will still be waiting for pickup.</p>}
                {enteringDelivery && handoverQty > 0 && handoverQty < deliveryRemaining && <p className="rounded-lg bg-chart-4/10 px-3 py-1.5 text-sm text-chart-4">{qty(deliveryRemaining - handoverQty)} units will remain open.</p>}
                <div className="flex gap-2">
                    {can('failed') && <Button variant="outline" size="icon" className="size-12 shrink-0 rounded-xl text-destructive" aria-label="Report failed attempt" onClick={event => openSheet('failed', event.currentTarget)}><CircleAlert /></Button>}
                    {stateAction && primary ? <Button className={cn(fieldAction, fieldPrimary, 'min-h-12 flex-1')} disabled={form.processing || (enteringPickup && pickupQty <= 0) || (enteringDelivery && handoverQty <= 0)} onClick={event => {
                        if (stateAction === 'delivered') openSheet('deliver', event.currentTarget);
                        else submit(stateAction);
                    }}><ActionIcon />{form.processing ? 'Saving…' : primary}</Button>
                        : <Button className={cn(fieldAction, 'min-h-12 flex-1')} asChild><Link href="/dispatch">Back to My Deliveries<ArrowRight /></Link></Button>}
                </div>
            </div>
        </div>
        <Sheet open={sheet !== null} onOpenChange={open => { if (!open) setSheet(null); }}>
            <SheetContent appearance="form" side="bottom" className="mx-auto w-full max-w-xl" onCloseAutoFocus={event => { event.preventDefault(); trigger.current?.focus(); }}>
                <div aria-hidden="true" className="mx-auto mt-2 h-1 w-9 rounded-full bg-border" />
                <SheetHeader className="border-b px-4 py-4 pr-12 text-left">
                    <SheetTitle>{sheet === 'deliver' ? 'Complete delivery' : sheet === 'failed' ? 'Delivery attempt failed' : 'Report a collection'}</SheetTitle>
                    <SheetDescription>{sheet === 'deliver' ? 'Confirm what was handed over at ' + (p.invoice.customer ?? 'the customer') + '.' : sheet === 'failed' ? 'The undelivered units stay in custody.' : 'Send a reported collection to Finance for verification.'}</SheetDescription>
                </SheetHeader>
                    {sheet === 'deliver' && <form onSubmit={event => { event.preventDefault(); submit('delivered', { onSuccess: () => setSheet(null) }); }}>
                        <div className="space-y-3" data-popup-section="body">
                        <dl className="rounded-lg border bg-muted/50 px-3 text-sm"><div className="flex justify-between gap-3 py-2"><dt>Handed over</dt><dd className="font-semibold text-accent-foreground">{qty(handoverQty)} units</dd></div>
                            {handoverQty < deliveryRemaining && <div className="flex justify-between gap-3 border-t py-2"><dt>Remaining open</dt><dd className="font-semibold text-chart-4">{qty(deliveryRemaining - handoverQty)} units</dd></div>}</dl>
                        <DeliveryFields p={p} form={form} /><Errors errors={form.errors} />
                        </div>
                        <footer data-popup-section="footer"><Button type="button" variant="outline" onClick={() => setSheet(null)}>Cancel</Button><Button disabled={form.processing || handoverQty <= 0}><Check />{form.processing ? 'Saving…' : 'Confirm delivery'}</Button></footer>
                    </form>}
                    {sheet === 'failed' && <FailureForm form={form} submit={notes => submit('failed', { notes, onSuccess: () => setSheet(null) })} onCancel={() => setSheet(null)} />}
                    {sheet === 'collection' && canCollect && <FollowUpCollection invoiceId={p.invoice.id} collectiblePaisa={p.collectiblePaisa} onCancel={() => setSheet(null)} onSaved={() => setSheet(null)} />}
            </SheetContent>
        </Sheet>
    </>;
}
