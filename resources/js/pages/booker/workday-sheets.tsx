import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { money, shiftDate, shortDate, weekdayDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Link, useForm } from '@inertiajs/react';
import { Banknote, CalendarDays, Check, CreditCard, Info, ReceiptText } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Errors, Field } from '../operations/shared';
import { OUTCOMES, type Collections, type Customer, type Delivery, type Visit } from './workday-types';

const sheetClass = 'mx-auto flex max-h-[90dvh] max-w-xl flex-col gap-0 overflow-hidden rounded-t-2xl bg-card p-0';
const bodyClass = 'min-h-0 overflow-y-auto overscroll-contain px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-5';

function Heading({ title, description }: { title: string; description: string }) {
    return <>
        <div aria-hidden="true" className="mx-auto mt-2 h-1 w-9 shrink-0 rounded-full bg-border" />
        <SheetHeader className="border-b px-4 py-3 pr-12 text-left sm:px-5 sm:pr-12">
            <SheetTitle>{title}</SheetTitle><SheetDescription className="break-words">{description}</SheetDescription>
        </SheetHeader>
    </>;
}

export function VisitEditor({ customer, visit, date, today, compact = false }: { customer: Customer; visit: Visit | null; date: string; today: string; compact?: boolean }) {
    const [open, setOpen] = useState(false);
    const title = visit ? 'Edit visit' : 'Plan visit';
    return <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
            <Button type="button" variant="outline" className={cn('min-h-11', compact ? 'size-11 shrink-0 px-0' : 'min-w-0 flex-1 px-2.5')} aria-label={title + ' for ' + customer.name}>
                <CalendarDays />{!compact && title}
            </Button>
        </SheetTrigger>
        <SheetContent appearance="form" side="bottom" className={sheetClass}>
            <Heading title={title} description={customer.name} />
            {open && <VisitForm customer={customer} visit={visit} date={date} today={today} close={() => setOpen(false)} />}
        </SheetContent>
    </Sheet>;
}

function VisitForm({ customer, visit, date, today, close }: { customer: Customer; visit: Visit | null; date: string; today: string; close: () => void }) {
    const form = useForm({ visit_date: date, outcome: visit?.outcome ?? 'planned', notes: visit?.notes ?? '' });
    const future = form.data.visit_date > today;
    const changeDate = (next: string) => form.setData({ ...form.data, visit_date: next, outcome: next > today ? 'planned' : form.data.outcome });
    const quick = [[today, 'Today'], [shiftDate(today, 1), 'Tomorrow'], [shiftDate(today, 2), weekdayDate(shiftDate(today, 2))]];
    return <form onSubmit={event => {
        event.preventDefault();
        form.put('/booker/customers/' + customer.id + '/visit', { preserveScroll: true, onSuccess: close });
    }}>
        <div className="space-y-4" data-popup-section="body">
        {!visit ? <div className="space-y-2">
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Quick visit dates">{quick.map(([day, label]) => <Choice key={day} picked={day === form.data.visit_date} onClick={() => changeDate(day)}>{label}</Choice>)}</div>
            <Field label="Visit date"><Input type="date" required value={form.data.visit_date} onChange={event => changeDate(event.target.value)} /></Field>
        </div> : <p className="text-sm text-muted-foreground">Visit date: <strong className="text-foreground">{shortDate(date)}</strong></p>}
        <fieldset className="min-w-0">
            <legend className="mb-2 text-sm font-semibold">Visit outcome</legend>
            <div className="grid grid-cols-2 gap-2">{Object.entries(OUTCOMES).map(([value, item]) => <label key={value}>
                <input type="radio" name="outcome" value={value} className="peer sr-only" checked={form.data.outcome === value} disabled={future && value !== 'planned'}
                    onChange={() => form.setData('outcome', value as Visit['outcome'])} />
                <span className="flex min-h-11 items-center justify-center rounded-xl border px-2 text-center text-sm font-semibold peer-checked:border-ring peer-checked:bg-accent peer-checked:text-accent-foreground peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-disabled:opacity-45">{item.label}</span>
            </label>)}</div>
            {future && <p className="mt-2 text-xs text-muted-foreground">Future visits can only be planned.</p>}
        </fieldset>
        <Field label="Note (optional)"><Textarea rows={2} maxLength={1000} placeholder="e.g. Meet the owner after 4 pm" value={form.data.notes} onChange={event => form.setData('notes', event.target.value)} /></Field>
        <Errors errors={form.errors} />
        </div>
        <div data-popup-section="footer">
            <Button type="button" variant="outline" onClick={close}>Cancel</Button>
            <Button disabled={form.processing}><CalendarDays />{form.processing ? 'Saving…' : visit ? 'Save visit' : 'Add to route'}</Button>
        </div>
    </form>;
}

export function CollectionEditor({ task }: { task: Delivery }) {
    const [open, setOpen] = useState(false);
    return <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild><Button variant="outline" type="button" className="min-h-11 px-2.5" aria-label={'Collect for ' + task.invoice_number}><Banknote />Collect</Button></SheetTrigger>
        <SheetContent appearance="form" side="bottom" className={sheetClass}>
            <Heading title="Collect payment" description={(task.customer?.name ?? 'Customer') + ' · ' + task.invoice_number} />
            {open && <CollectionForm task={task} close={() => setOpen(false)} />}
        </SheetContent>
    </Sheet>;
}

function CollectionForm({ task, close }: { task: Delivery; close: () => void }) {
    const form = useForm({ amount: '', method: 'cash', reference: '', request_key: crypto.randomUUID() });
    const remaining = task.collectible_paisa / 100;
    return <form onSubmit={event => {
        event.preventDefault();
        form.post('/dispatch/' + task.id + '/collection', { preserveScroll: true, onSuccess: close });
    }}>
        <div className="space-y-4" data-popup-section="body">
        <Field label="Amount (PKR) *"><Input type="number" inputMode="decimal" required min=".01" max={remaining} step=".01" placeholder="0.00"
            value={form.data.amount} onChange={event => form.setData('amount', event.target.value)} /></Field>
        <div className="flex flex-wrap gap-2"><Choice picked={false} onClick={() => form.setData('amount', remaining.toFixed(2))}>Full {money(remaining)}</Choice>
            <Choice picked={false} onClick={() => form.setData('amount', (Math.ceil(task.collectible_paisa / 2) / 100).toFixed(2))}>Half</Choice></div>
        <fieldset><legend className="mb-2 text-sm font-semibold">Payment method</legend><div className="flex flex-wrap gap-2">
            <Choice picked={form.data.method === 'cash'} onClick={() => form.setData({ ...form.data, method: 'cash', reference: '' })}><Banknote />Cash</Choice>
            <Choice picked={form.data.method === 'online'} onClick={() => form.setData('method', 'online')}><CreditCard />Bank transfer</Choice>
        </div></fieldset>
        {form.data.method === 'online' && <Field label="Bank transaction reference *"><Input required maxLength={200} value={form.data.reference} onChange={event => form.setData('reference', event.target.value)} /></Field>}
        <p className="flex items-start gap-2" data-popup-note><Info className="mt-0.5 size-4 shrink-0" />Record only what you collected. Finance must verify it before it reduces the invoice balance.</p>
        <Errors errors={form.errors} />
        </div>
        <div data-popup-section="footer"><Button type="button" variant="outline" onClick={close}>Cancel</Button><Button disabled={form.processing}><Check />{form.processing ? 'Saving…' : 'Record collection'}</Button></div>
    </form>;
}

export function CollectionSummary({ data, date, className }: { data: Collections; date: string; className?: string }) {
    const submit = useForm({});
    return <Sheet>
        <SheetTrigger asChild><Button type="button" variant="outline" className={className}><Banknote />Collections</Button></SheetTrigger>
        <SheetContent side="bottom" className={sheetClass}>
            <Heading title="Daily collection summary" description={shortDate(date)} />
            <div className={bodyClass}>
                <dl className="divide-y rounded-xl border bg-muted/35 px-3 text-sm">{[
                    ['Cash reported', data.cash], ['Bank transfers reported', data.online], ['Total reported', data.cash + data.online],
                ].map(([label, amount]) => <div key={label} className="flex justify-between gap-2 py-2.5"><dt>{label}</dt><dd className="font-bold tabular-nums">{money(Number(amount) / 100)}</dd></div>)}</dl>
                <h3 className="mt-4 mb-2 font-semibold">Entries</h3>
                {data.entries.length ? <ul className="divide-y">{data.entries.map(entry => <li key={entry.id} className="flex flex-wrap justify-between gap-x-3 gap-y-1 py-2.5 text-sm">
                    <div className="min-w-0"><strong className="break-words">{entry.customer}</strong><p className="text-xs text-muted-foreground">{entry.invoice_number} · {entry.method === 'online' ? 'Bank transfer' : 'Cash'}</p></div>
                    <div className="text-right"><strong className="tabular-nums">{money(entry.reported_paisa / 100)}</strong><p className="text-xs text-muted-foreground">{entry.payment_status === 'cancelled' ? 'Reversed' : entry.recorded_at ? 'Reviewed' : 'Awaiting Finance'}</p></div>
                </li>)}</ul> : <p className="py-3 text-sm text-muted-foreground">No payments reported for this date.</p>}
                {data.entryCount > data.entries.length && <p className="py-1.5 text-xs text-muted-foreground">Showing the latest {data.entries.length} of {data.entryCount} reports.</p>}
                <Errors errors={submit.errors} />
                <div className="mt-4 flex flex-wrap gap-2 border-t pt-3">
                    <Button variant="outline" className="min-h-11 flex-1" asChild><Link href={'/my-collections?date=' + date}><ReceiptText />Full summary</Link></Button>
                    {data.openDay && <Button className="min-h-11 flex-1" disabled={submit.processing} onClick={() => submit.post('/my-collections/' + data.openDay + '/submit', { preserveScroll: true })}>Submit to Finance</Button>}
                </div>
            </div>
        </SheetContent>
    </Sheet>;
}

function Choice({ children, picked, onClick }: { children: ReactNode; picked: boolean; onClick: () => void }) {
    return <Button type="button" variant={picked ? 'secondary' : 'outline'} aria-pressed={picked} className={cn('min-h-11 rounded-xl px-3', picked && 'border border-ring/50 bg-accent text-accent-foreground')} onClick={onClick}>{children}</Button>;
}
