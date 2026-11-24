import { Button } from '@/components/ui/button';
import { qty, shortDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Check, Clock3, Copy, Info, MapPin, MessageCircle, Minus, Navigation, Phone, Plus } from 'lucide-react';
import { useId, type ReactNode } from 'react';
import { toast } from 'sonner';
import { stamp, type Staff } from './shared';

export type Item = { id: number; product: string; batch: string | null; expiry: string | null; units: number; returned: number; delivered: number; remaining: number };
export type PickupLine = { id: number; sales_invoice_item_id: number; product: string; batch: string; expiry: string | null; quantity: number | string; picked: number; remaining: number };
export type Event = { id: number; action: string; created_at: string; notes: string | null; receiver_name: string | null; creator: Staff | null; assignee: Staff | null; items: { sales_invoice_item_id: number; quantity: string }[]; pickup_lines?: { id: number; sale_batch_allocation_id: number; quantity: string }[] };
export type DeliveryProps = {
    invoice: { id: number; invoice_number: string; customer: string | null; status: string; address: string | null; city: string | null; phone: string | null; contact: string | null };
    dispatch: { id: number; status: string; assigned_to: number | null; planned_date: string | null; assignee: Staff | null; events: Event[]; custody_required: boolean; pickup_confirmed_at: string | null; original_assignee?: Staff | null; custodian?: Staff | null } | null;
    items: Item[]; pickupLines: PickupLine[]; staff: Staff[]; scoped: boolean; canManage: boolean; canViewInvoice: boolean;
    fieldActions: string[]; managerActions: string[]; today: string; canReportCollection: boolean; collectiblePaisa: number; canRequestCorrection: boolean;
};

export const actions: Record<string, string> = {
    assign: 'Assign / reschedule', pickup: 'Record pickup', confirm_pickup: 'Confirm full pickup', picking: 'Start picking', packed: 'Mark packed',
    dispatched: 'Start delivery', delivered: 'Record delivery', failed: 'Report failed attempt', put_back: 'Return to warehouse',
    request_handover: 'Request handover', accept_handover: 'Accept handover', cancel_handover: 'Cancel handover',
    correct_delivery: 'Correct delivery', close_returned: 'Close as returned',
};
const states: Record<string, string> = {
    untracked: 'Untracked', pending: 'Pending pickup', picking: 'Picking', packed: 'Picked up', dispatched: 'Out for delivery',
    partial: 'Partially delivered', failed: 'Attempt failed', delivered: 'Delivered', closed: 'Closed',
};
const legacy: Record<string, string[]> = {
    pending: ['picking', 'assign'], picking: ['packed', 'assign'], packed: ['dispatched', 'assign'],
    dispatched: ['delivered', 'failed', 'assign'], partial: ['delivered', 'dispatched', 'failed', 'correct_delivery', 'assign'],
    failed: ['dispatched', 'correct_delivery', 'assign'], delivered: ['correct_delivery'], closed: ['correct_delivery'],
};
export const label = (key: string, names = states) => names[key] ?? key.replaceAll('_', ' ');
export const finished = (status: string) => status === 'delivered' || status === 'closed';
export const requiredNotes = ['failed', 'correct_delivery', 'close_returned', 'put_back', 'request_handover', 'cancel_handover'];
export const sum = <T,>(rows: T[], get: (row: T) => number | string) => Math.round(rows.reduce((total, row) => total + Number(get(row)), 0) * 100) / 100;

export function availableActions(p: DeliveryProps): string[] {
    if (p.invoice.status !== 'posted') return [];
    const state = p.dispatch?.status ?? 'pending';
    const returns = p.items.some(item => item.returned > 0) && sum(p.items, item => item.remaining) === 0;
    if (!p.dispatch?.custody_required) {
        return [...(legacy[state] ?? []), ...(returns && !finished(state) ? ['close_returned'] : [])]
            .filter(action => p.canManage || p.fieldActions.includes(action));
    }
    return [...new Set([...p.fieldActions, ...p.managerActions.filter(action =>
        ['assign', 'request_handover', 'cancel_handover'].includes(action)
        || (action === 'put_back' && !p.items.some(item => item.delivered > 0))
        || (action === 'correct_delivery' && p.canRequestCorrection)
        || (action === 'close_returned' && returns))])];
}

export const card = 'min-w-0 rounded-xl border bg-card text-card-foreground shadow-sm';
export const mutedTrack = 'bg-muted';
export const pickedTone = 'text-chart-5';
export const returnedTone = 'text-chart-4';
export const deliveredTone = 'text-chart-2';

export function StatusPill({ state, inverse = false }: { state: string; inverse?: boolean }) {
    const tone = inverse ? 'bg-brand-paper/15 text-brand-paper'
        : state === 'failed' ? 'bg-destructive/10 text-destructive'
            : ['delivered', 'closed'].includes(state) ? 'bg-accent text-accent-foreground'
                : ['pending', 'picking', 'partial'].includes(state) ? 'bg-chart-4/10 text-chart-4' : 'bg-muted text-muted-foreground';
    return <span className={cn('inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs leading-tight font-bold', tone)}>
        <span className="size-1.5 rounded-full bg-current" />{label(state)}
    </span>;
}

export function DeliverySteps({ p, field = false }: { p: DeliveryProps; field?: boolean }) {
    const state = p.dispatch?.status ?? 'untracked';
    const events = p.dispatch?.events ?? [];
    const confirm = events.findLast(event => ['confirm_pickup', 'packed'].includes(event.action));
    const trip = events.findLast(event => event.action === (state === 'failed' ? 'failed' : 'dispatched'));
    const delivered = events.findLast(event => event.action === (state === 'closed' ? 'close_returned' : 'delivered'));
    const current = finished(state) ? 4 : ['partial', 'dispatched', 'failed'].includes(state) ? 3 : state === 'packed' ? 2 : p.dispatch?.assignee ? 1 : 0;
    const complete = (index: number) => index < current;
    const steps = field
        ? [['Pick up', ''], ['Picked', ''], [state === 'failed' ? 'Failed' : 'On the way', ''], ['Delivered', '']]
        : [
            ['Assigned', [p.dispatch?.assignee?.name, p.dispatch?.planned_date && shortDate(p.dispatch.planned_date)].filter(Boolean).join(' · ') || 'Unassigned'],
            ['Picked up', confirm ? stamp(confirm.created_at) : 'Not confirmed'],
            [state === 'failed' ? 'Attempt failed' : 'Out for delivery', trip ? stamp(trip.created_at) : '—'],
            [state === 'closed' ? 'Closed' : 'Delivered', delivered ? stamp(delivered.created_at) : '—'],
        ];
    return <ol aria-label="Delivery progress" className={cn(card, 'grid grid-cols-4 gap-1 p-2.5 sm:gap-2 sm:p-3')}>
        {steps.map(([title, description], index) => {
            const step = field ? (state === 'packed' ? 1 : state === 'failed' || state === 'partial' || state === 'dispatched' ? 2 : finished(state) ? 4 : 0) : current;
            const done = field ? index < step : complete(index);
            const failed = state === 'failed' && index === 2;
            return <li key={title} aria-current={index === step ? 'step' : undefined}
                className={cn('flex min-w-0 rounded-lg text-sm', field ? 'relative flex-col items-center gap-1 px-0.5 text-center' : 'border-t-3 border-muted px-1.5 py-2 sm:px-3', !field && (failed ? 'border-destructive' : done ? 'border-chart-2' : index === step ? 'border-chart-1' : ''))}>
                {field && index < steps.length - 1 && <span aria-hidden="true" className={cn('absolute top-[13px] left-[calc(50%_+_1rem)] h-0.5 w-[calc(100%_-_1.75rem)] sm:w-[calc(100%_-_1.5rem)]', done ? 'bg-chart-2/35' : 'bg-border')} />}
                {field && <span className={cn('grid size-7 place-items-center rounded-full text-xs font-bold', failed ? 'bg-destructive/10 text-destructive' : done ? 'bg-accent text-accent-foreground' : index === step ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')}>{done && !failed ? <Check className="size-4" /> : failed ? '!' : index + 1}</span>}
                <span className="min-w-0"><strong className={cn('block font-semibold', field && 'text-xs sm:text-sm', failed && 'text-destructive')}>{title}</strong>{description && <span className="mt-0.5 block text-xs text-muted-foreground">{description}</span>}</span>
            </li>;
        })}
    </ol>;
}

export function ContactLinks({ invoice, full = false }: { invoice: DeliveryProps['invoice']; full?: boolean }) {
    const raw = invoice.phone?.split(/[/,;|]/)[0].trim() ?? '';
    const phone = raw.replace(/[^0-9+]/g, '');
    const dialable = /^\+?\d{7,15}$/.test(phone);
    const international = phone.startsWith('+') ? phone.slice(1) : phone.startsWith('00') ? phone.slice(2) : phone.startsWith('03') && phone.length === 11 ? '92' + phone.slice(1) : phone.startsWith('92') ? phone : null;
    const place = [invoice.address, invoice.city].filter(Boolean).join(', ');
    const maps = place ? 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(place) : null;
    const three = dialable && international && maps;
    const contactButton = full ? 'min-w-0 basis-[calc(50%_-_0.5rem)] flex-1 gap-1.5 px-2' : undefined;
    return <div className={cn('flex flex-wrap items-center gap-2', full && 'mt-3', full && three && 'min-[365px]:[&>*]:basis-0')}>
        {!full && invoice.phone && <span className="mr-1 text-sm tabular-nums">{invoice.phone}</span>}
        {!full && raw && <Button size="icon" variant="outline" aria-label="Copy phone number" onClick={async () => {
            try { await navigator.clipboard.writeText(raw); toast.success('Phone number copied.'); }
            catch { toast.error('Could not copy the phone number.'); }
        }}><Copy /></Button>}
        {dialable && <Button asChild size={full ? 'default' : 'icon'} variant={full ? 'default' : 'outline'} className={contactButton}><a href={'tel:' + phone} aria-label="Call customer"><Phone />{full && 'Call'}</a></Button>}
        {maps && <Button asChild size={full ? 'default' : 'icon'} variant="outline" className={contactButton}><a href={maps} target="_blank" rel="noreferrer" aria-label="Navigate to customer"><Navigation />{full && 'Navigate'}</a></Button>}
        {full && dialable && international && <Button asChild variant="outline" className={contactButton}><a href={'https://wa.me/' + international} target="_blank" rel="noreferrer"><MessageCircle />WhatsApp</a></Button>}
    </div>;
}

export function Address({ invoice, hideContactOnMobile = false }: { invoice: DeliveryProps['invoice']; hideContactOnMobile?: boolean }) {
    return <div className="flex items-start gap-2 text-sm text-muted-foreground"><MapPin className="mt-0.5 size-4 shrink-0" /><div className="min-w-0 break-words">{[invoice.address, invoice.city].filter(Boolean).join(', ') || 'No delivery address on file.'}{invoice.contact && <p className={cn('mt-0.5 font-semibold text-foreground', hideContactOnMobile && 'max-sm:hidden')}>{invoice.contact}</p>}</div></div>;
}

export function DateMarker({ p }: { p: DeliveryProps }) {
    const planned = p.dispatch?.planned_date;
    return <span className="inline-flex flex-wrap items-center gap-1.5">{planned ? shortDate(planned) : 'Not planned'}
        {planned === p.today && <span className="rounded-full bg-accent px-1.5 py-0.5 text-xs font-semibold text-accent-foreground">Today</span>}
        {planned && planned < p.today && !finished(p.dispatch?.status ?? '') && <span className="rounded-full bg-destructive/10 px-1.5 py-0.5 text-xs font-semibold text-destructive">Overdue</span>}</span>;
}

export function DeliveryInfo() {
    return <p className="flex items-start gap-2 rounded-lg border bg-muted/55 px-3 py-2.5 text-sm text-muted-foreground print:hidden"><Info className="mt-0.5 size-4 shrink-0" />Pickup and delivery track custody only. Finance verifies collections before they affect the invoice balance. Quantities include bonus units.</p>;
}

export function DeliveryHistory({ p, collapsible = false }: { p: DeliveryProps; collapsible?: boolean }) {
    const events = [...(p.dispatch?.events ?? [])].reverse();
    const title = <><Clock3 className="size-4 text-muted-foreground" /><span>{collapsible ? 'History' : 'Delivery History'}</span><span className="text-sm font-normal text-muted-foreground">{events.length} {events.length === 1 ? 'event' : 'events'}</span></>;
    const details = events.length ? <ol className="ml-1.5 border-l pl-4">
        {events.map(event => <li key={event.id} className="relative pb-4 text-sm last:pb-0">
            <span className={cn('absolute top-1 -left-[21px] size-2.5 rounded-full border-2 border-card bg-chart-1', event.action === 'delivered' && 'bg-chart-2', event.action === 'failed' && 'bg-destructive', event.action === 'pickup' && 'bg-chart-5')} />
            <div className="flex flex-wrap items-baseline justify-between gap-x-3"><strong>{label(event.action, { ...actions, pickup: 'Pickup recorded', confirm_pickup: 'Pickup confirmed', dispatched: 'Out for delivery', delivered: 'Delivery recorded' })}</strong><time dateTime={event.created_at} className="text-xs text-muted-foreground">{stamp(event.created_at)}</time></div>
            <p className="text-xs text-muted-foreground">{event.creator?.name ?? 'System'}{event.assignee && event.assignee.id !== event.creator?.id ? ' · Assigned to ' + event.assignee.name : ''}</p>
            {event.receiver_name && <p>Received by: {event.receiver_name}</p>}
            {event.items.map((line, index) => <p key={index}>{p.items.find(item => item.id === line.sales_invoice_item_id)?.product ?? 'Invoice item'}: {qty(line.quantity)} units</p>)}
            {event.pickup_lines?.map(line => {
                const batch = p.pickupLines.find(item => item.id === line.sale_batch_allocation_id);
                return <p key={line.id}>{batch ? batch.product + ' · ' + batch.batch : 'Batch'}: {qty(Math.abs(Number(line.quantity)))} units</p>;
            })}
            {event.notes && <p className="mt-1 whitespace-pre-wrap break-words text-muted-foreground">{event.notes}</p>}
        </li>)}
    </ol> : <p className="text-sm text-muted-foreground">No fulfilment activity recorded yet.</p>;
    return collapsible
        ? <details className={cn(card, 'print:hidden')}><summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 px-3 font-semibold">{title}<span aria-hidden className="ml-auto text-muted-foreground">▾</span></summary><div className="border-t p-3">{details}</div></details>
        : <section className={cn(card, 'p-4 print:hidden')}><h2 className="mb-3 flex items-center gap-2 text-base font-bold">{title}</h2>{details}</section>;
}

export function BatchBadge({ batch, expiry }: { batch: string | null; expiry: string | null }) {
    return <span className="inline-flex flex-wrap items-center gap-1.5 text-xs"><span className="rounded-md bg-muted px-1.5 py-0.5 font-semibold">{batch || 'No batch recorded'}</span>{expiry && <span className="text-muted-foreground">Exp {shortDate(expiry)}</span>}</span>;
}

export function QuantityStepper({ name, value, maximum, update, wide = false }: { name: string; value: string; maximum: number; update: (value: string) => void; wide?: boolean }) {
    const id = useId();
    const current = Number(value) || 0;
    const cut = (number: number) => String(Math.round(Math.max(0, Math.min(maximum, number)) * 100) / 100);
    return <div className={cn('flex items-center gap-1.5', wide && 'w-full gap-2')}>
        <Button type="button" variant="outline" size="icon" className={wide ? 'size-11' : 'size-8'} aria-label={'Decrease ' + name} disabled={current <= 0} onClick={() => update(cut(current - 1))}><Minus /></Button>
        <label htmlFor={id} className={cn('flex min-w-0 items-center justify-center rounded-md border bg-background px-1 tabular-nums', wide ? 'h-11 flex-1' : 'h-8 w-14')}>
            <span className="sr-only">{name}</span><input id={id} inputMode="decimal" className="w-full min-w-0 bg-transparent text-center text-base font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-sm" value={value}
                onChange={event => { const raw = event.target.value; if (/^\d{0,12}(\.\d{0,2})?$/.test(raw)) update(Number(raw) > maximum ? String(maximum) : raw); }} onBlur={() => update(cut(current))} />
            {wide && <span className="shrink-0 pr-1 text-xs text-muted-foreground">/ {qty(maximum)}</span>}
        </label>
        <Button type="button" variant="outline" size="icon" className={wide ? 'size-11' : 'size-8'} aria-label={'Increase ' + name} disabled={current >= maximum} onClick={() => update(cut(current + 1))}><Plus /></Button>
        {wide && <Button type="button" variant="outline" className="h-11" aria-label={'Set all for ' + name} onClick={() => update(current === maximum ? '0' : String(maximum))}>{current === maximum ? <Check /> : 'All'}</Button>}
    </div>;
}

export function ProgressMeter({ count, total, children }: { count: number; total: number; children?: ReactNode }) {
    const percentage = total > 0 ? Math.min(100, Math.max(0, count / total * 100)) : 0;
    return <div>{children}<div className="h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label="Unit progress" aria-valuenow={Math.round(percentage)}><div className="h-full rounded-full bg-chart-2 transition-[width] motion-reduce:transition-none" style={{ width: percentage + '%' }} /></div></div>;
}
