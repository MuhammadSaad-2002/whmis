import { RecordPaymentDialog } from '@/components/record-payment-dialog';
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { usePermissions } from '@/hooks/use-permissions';
import { amount, money, shortDate } from '@/lib/format';
import { Link, useForm } from '@inertiajs/react';
import { Banknote, FileText, Phone } from 'lucide-react';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { contactNumber, DueBadge, followUpLabel, outcomes, shortDay, type CollectionRow, type Outcome } from './collections-ui';
import { Errors, StaffSelect, stamp, type Staff } from './shared';

export type CollectionDetail = {
    invoice: {
        id: number; invoice_number: string; status: string; total_amount: string;
        outstanding: number; paid_amount: number; return_credit: number; applied_credit: number;
        customer: string | null; customer_id: number; customer_archived: boolean; phone: string | null; due_on: string;
    };
    history: { id: number; created_at: string; outcome: string; next_follow_up: string; notes: string; assigned_to: number | null;
        promised_amount: string | null; promised_date: string | null; assignee: Staff | null; creator: Staff | null }[];
    staff: Staff[];
    today: string;
};

export function CollectionTitle({ number, customer, due, today, sheet = false }: {
    number: string; customer: string | null; due: string; today: string; sheet?: boolean;
}) {
    const details = <>{customer?.toUpperCase()} · Due {shortDate(due)} · <DueBadge date={due} today={today} /></>;
    return <header className="dh">
        <div>
            {sheet ? <SheetTitle>{number}</SheetTitle> : <h1>{number}</h1>}
            {sheet ? <SheetDescription className="sub">{details}</SheetDescription> : <p className="sub">{details}</p>}
        </div>
    </header>;
}

export function FollowUpDrawer({ row, today, close }: { row: CollectionRow; today: string; close: () => void }) {
    const [detail, setDetail] = useState<CollectionDetail | null>(null);
    const [failed, setFailed] = useState(false);
    const [attempt, setAttempt] = useState(0);
    const focus = useRef(typeof document === 'undefined' ? null : document.activeElement);

    useEffect(() => {
        const cancel = new AbortController();
        fetch(route('collections.show', row.id, false), { headers: { Accept: 'application/json' }, signal: cancel.signal })
            .then(response => {
                if (!response.ok) throw new Error('Collection details unavailable');
                return response.json() as Promise<CollectionDetail>;
            })
            .then(setDetail).catch(() => { if (!cancel.signal.aborted) setFailed(true); });
        return () => cancel.abort();
    }, [row.id, attempt]);

    return <Sheet open onOpenChange={value => { if (!value) close(); }}>
        <SheetContent className="collections-theme collections-sheet" overlayClassName="collections-sheet-overlay"
            onCloseAutoFocus={event => {
                if (focus.current instanceof HTMLElement && focus.current.isConnected) {
                    event.preventDefault();
                    focus.current.focus({ preventScroll: true });
                }
            }}>
            <CollectionTitle sheet number={row.invoice_number} customer={row.customer.name} due={row.due_on} today={today} />
            {detail
                ? <FollowUpPanel {...detail} dismiss={close} onSaved={close} />
                : <div className="db muted">{failed ? <p role="alert">Couldn’t load this invoice. <button type="button" className="btn sm" onClick={() => { setFailed(false); setAttempt(attempt + 1); }}>Retry</button></p>
                    : <p role="status">Loading invoice and follow-up history…</p>}</div>}
        </SheetContent>
    </Sheet>;
}

export function FollowUpPanel({ invoice, history, staff, today, dismiss, onSaved }: CollectionDetail & {
    dismiss?: () => void; onSaved?: () => void;
}) {
    const { can } = usePermissions();
    const [recording, setRecording] = useState(false);
    const phone = contactNumber(invoice.phone);
    const number = phone?.startsWith('+92') ? phone.replace(/^\+92(\d{3})/, '0$1 ') : phone;
    const open = invoice.status === 'posted' && invoice.outstanding > 0;
    const manages = open && can('collections.manage');
    const takesPayment = open && can('payments.manage') && !invoice.customer_archived && !!invoice.customer;
    const form = useForm({
        outcome: '' as Outcome | '', promised_amount: Number(invoice.outstanding).toFixed(2), promised_date: '',
        next_follow_up: '', notes: '', assigned_to: history[0]?.assigned_to ? String(history[0].assigned_to) : '',
    });
    const promised = form.data.outcome === 'promised';

    return <form className="follow-up-form" onSubmit={event => {
        event.preventDefault();
        if (!manages || form.processing) return;
        if (!form.data.outcome) { form.setError('outcome', 'Choose an outcome.'); return; }
        form.transform(data => ({
            ...data,
            next_follow_up: data.next_follow_up || (data.outcome === 'promised' ? data.promised_date : today),
            promised_amount: data.outcome === 'promised' ? data.promised_amount : null,
            promised_date: data.outcome === 'promised' ? data.promised_date : null,
        }));
        form.post(route('collections.follow-up', invoice.id, false), {
            preserveScroll: true,
            onSuccess: () => { form.reset('outcome', 'notes', 'promised_date', 'next_follow_up'); onSaved?.(); },
        });
    }}>
        <div className="db">
            <dl className="math">
                {[['Invoice', invoice.total_amount], ['Paid', invoice.paid_amount], ['Returns', invoice.return_credit], ['Outstanding', invoice.outstanding]].map(([label, value]) => <div key={label}>
                    <dt>{label}</dt><dd className="num">{amount(value)}</dd>
                </div>)}
            </dl>
            {invoice.applied_credit > 0 && <p className="credit-note">Includes {money(invoice.applied_credit)} in applied customer credit.</p>}
            {(phone || takesPayment || (!dismiss && can('ledger.view') && !invoice.customer_archived)) && <div className="drawer-actions">
                {phone && <a className="btn call" href={`tel:${phone}`}><Phone className="i" aria-hidden="true" />Call {number}</a>}
                {takesPayment && <button className="btn" type="button" onClick={() => setRecording(true)}><Banknote className="i" aria-hidden="true" />Record payment</button>}
                {!dismiss && can('ledger.view') && !invoice.customer_archived && <Link className="btn" href={route('ledger.customer', invoice.customer_id, false)}><FileText className="i" aria-hidden="true" />Statement</Link>}
            </div>}
            {manages && <>
                <h2 className="sec">Log follow-up</h2>
                <fieldset className="f">
                    <legend className="mb-1.5">Outcome <em>*</em></legend>
                    <div className="outs">
                        {(Object.keys(outcomes) as Outcome[]).filter(key => key !== 'contacted').map(key => <button type="button" key={key} aria-pressed={key === form.data.outcome}
                            onClick={() => { form.setData('outcome', key); form.clearErrors('outcome', 'promised_date', 'promised_amount'); }}>{outcomes[key][0]}</button>)}
                    </div>
                </fieldset>
                {promised && <>
                    <p className="note">A promise is not a receipt. The balance only drops when a payment is recorded and verified.</p>
                    <div className="row2">
                        <label className="f"><span>Promised amount <em>*</em></span><span className="amount-field"><span aria-hidden="true">Rs</span>
                            <input type="number" inputMode="decimal" required min="0.01" step="0.01" max={invoice.outstanding} value={form.data.promised_amount} onChange={e => form.setData('promised_amount', e.target.value)} />
                        </span></label>
                        <label className="f"><span>Pay by <em>*</em></span><input type="date" required min={today} value={form.data.promised_date} onChange={e => form.setData('promised_date', e.target.value)} /></label>
                    </div>
                </>}
                {form.data.outcome === 'reported_paid' && <p className="note">Ask for the receipt or transfer reference, then check it against the customer statement before recording anything.</p>}
                {form.data.outcome === 'disputed' && <p className="note">Note what’s disputed so it can be checked against the invoice and returns.</p>}
                <div className="row2">
                    <label className="f">Next follow-up<input type="date" min={today} value={form.data.next_follow_up} onChange={e => form.setData('next_follow_up', e.target.value)} /></label>
                    <label className="f">Responsible staff<StaffSelect staff={staff} value={form.data.assigned_to} onChange={value => form.setData('assigned_to', value)} /></label>
                </div>
                <label className="f"><span>Note <em>*</em></span><textarea placeholder="What was said" required maxLength={1000} value={form.data.notes} onChange={e => form.setData('notes', e.target.value)} /></label>
                <Errors errors={form.errors} />
            </>}
            <h2 className="sec">History</h2>
            {history.length === 0 ? <p className="muted">No follow-ups logged for this invoice yet.</p> : <ol className="tl">
                {history.map(item => <li key={item.id} style={{ '--tone': outcomes[item.outcome as Outcome]?.[1] } as CSSProperties}>
                    <strong>{followUpLabel(item.outcome)}</strong>
                    {item.promised_date && <> · {money(item.promised_amount)} by {shortDay(item.promised_date)}
                        {open && item.promised_date < today && <span className="prom bad">Broken</span>}</>}
                    <small>{stamp(item.created_at)}{item.creator && ` · ${item.creator.name}`}{item.next_follow_up && ` · next ${shortDay(item.next_follow_up)}`}</small>
                    {item.assignee && <small>Assigned to {item.assignee.name}</small>}
                    {item.notes && <p>{item.notes}</p>}
                </li>)}
            </ol>}
        </div>
        {(dismiss || manages) && <div className="df">
            {dismiss && <SheetClose className="btn" disabled={form.processing}>{manages ? 'Cancel' : 'Close'}</SheetClose>}
            {manages && <button type="submit" className="btn pri" disabled={form.processing}>{form.processing ? 'Saving…' : 'Save follow-up'}</button>}
        </div>}
        {recording && <RecordPaymentDialog selection={{ type: 'customer', id: invoice.customer_id, invoiceId: invoice.id }}
            parties={{ customer: [{ id: invoice.customer_id, name: invoice.customer ?? '' }], company: [] }} today={today}
            close={() => setRecording(false)} onRecorded={onSaved} />}
    </form>;
}
