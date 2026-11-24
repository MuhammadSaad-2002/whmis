import '../../css/financial-position.css';
import { useOpenInvoices } from '@/hooks/use-open-invoices';
import { useTreasuryPayment } from '@/hooks/use-treasury-payment';
import { amount, money, roundPaisaToRupee, shortDate, totalMoney, totalAmount } from '@/lib/format';
import { ageBucket, allocateOldestFirst, cents, invoiceAge, invoiceKey, type OpenInvoice, type PaymentParties, paymentMethods, paymentToday, type PartyType } from '@/lib/payment-allocation';
import { useForm } from '@inertiajs/react';
import * as Dialog from '@radix-ui/react-dialog';
import { ArrowDown, ArrowUp, X } from 'lucide-react';
import { type FormEvent, useMemo, useRef, useState } from 'react';

export type PaymentSelection = { type: PartyType; id?: number };

interface Props {
    selection: PaymentSelection;
    parties: PaymentParties | null;
    close: () => void;
    onRecorded?: () => void;
    today?: string;
}

const noInvoices: OpenInvoice[] = [];

export function RecordPaymentDialog({ selection, parties, close, onRecorded, today = paymentToday() }: Props) {
    const treasury = useTreasuryPayment();
    const [manual, setManual] = useState<Record<string, string> | null>(null);
    const [revision, setRevision] = useState(0);
    const amountField = useRef<HTMLInputElement>(null);
    const partyField = useRef<HTMLSelectElement>(null);
    const previousFocus = useRef(typeof document !== 'undefined' ? document.activeElement : null);
    const form = useForm({
        party_type: selection.type,
        party_id: selection.id ? String(selection.id) : '',
        method: 'cash',
        amount: '',
        payment_date: today,
        financial_account_id: '',
        reference_no: '',
        bank_name: '',
        cheque_number: '',
        cheque_date: '',
        notes: '',
    });
    const data = form.data;
    const receipt = data.party_type === 'customer';
    const partyLabel = receipt ? 'Customer' : 'Supplier';
    const docLabel = receipt ? 'invoices' : 'bills';
    const lookup = useOpenInvoices(data.party_type, data.party_id, revision);
    const invoices = lookup.status === 'ready' ? lookup.invoices : noInvoices;
    const tendered = cents(data.amount);
    const total = data.method === 'adjustment' ? tendered : roundPaisaToRupee(tendered);
    const due = invoices.reduce((sum, row) => sum + cents(row.outstanding), 0);
    const autoBudget = total < due && tendered >= due ? due : total;
    const auto = useMemo(() => allocateOldestFirst(invoices, autoBudget), [invoices, autoBudget]);
    const allocations = manual ?? auto;
    const allocated = Object.values(allocations).reduce((sum, value) => sum + cents(value), 0);
    const unapplied = Math.min(total, tendered) - allocated;
    const overdue = invoices.reduce((sum, row) => sum + (invoiceAge(row.invoice_date, today) > 90 ? cents(row.outstanding) : 0), 0);
    const oldest = invoices[0];
    const oldestDue = oldest ? cents(oldest.outstanding) : 0;
    const settledBalance = lookup.status === 'ready' ? cents(lookup.balance) - Math.max(allocated, Math.min(tendered, total)) : null;
    const canSubmit = !!parties?.[data.party_type].some((party) => String(party.id) === data.party_id)
        && lookup.status === 'ready' && !form.processing && allocated <= Math.max(tendered, total);
    const errors = [...new Set(Object.values(form.errors))];

    function chooseParty(type: PartyType, id = '') {
        form.setData({ ...data, party_type: type, party_id: id });
        form.clearErrors();
        setManual(null);
        setRevision((v) => v + 1);
    }

    function changeTotal(value: string) {
        form.setData('amount', value);
        form.clearErrors('amount');
        setManual(null);
    }

    function changeAllocation(invoice: OpenInvoice, value: string) {
        const max = cents(invoice.outstanding);
        setManual({
            ...allocations,
            [invoiceKey(invoice)]: cents(value) > max ? invoice.outstanding.toFixed(2) : cents(value) < 0 ? '' : value,
        });
    }

    function refreshInvoices() {
        setManual(null);
        setRevision((v) => v + 1);
    }

    function submit(event: FormEvent) {
        event.preventDefault();
        if (!canSubmit || tendered <= 0) return;

        form.transform((values) => ({
            ...values,
            party_id: Number(values.party_id),
            amount: (tendered / 100).toFixed(2),
            apply_rounded_total: true,
            ...(values.method !== 'cheque' ? { bank_name: '', cheque_number: '', cheque_date: '' } : {}),
            allocations: invoices.flatMap((invoice) => {
                const value = cents(allocations[invoiceKey(invoice)] ?? 0);
                return value > 0 ? [{ invoice_type: invoice.invoice_type, invoice_id: invoice.id, amount: (value / 100).toFixed(2) }] : [];
            }),
        }));
        form.post(route('payments.store', {}, false), {
            preserveScroll: true,
            onSuccess: () => {
                onRecorded?.();
                close();
            },
            onError: (errors) => {
                if ('allocations' in errors) refreshInvoices();
            },
        });
    }

    return (
        <Dialog.Root open onOpenChange={(open) => { if (!open && !form.processing) close(); }}>
            <Dialog.Portal>
                <Dialog.Overlay className="finance-overlay" data-popup-overlay />
                <Dialog.Content
                    className="finance-dialog" data-popup-form="dialog"
                    onOpenAutoFocus={(event) => {
                        event.preventDefault();
                        if (selection.id) amountField.current?.focus();
                        else if (parties) partyField.current?.focus();
                        else document.getElementById('payment-close')?.focus();
                    }}
                    onCloseAutoFocus={(event) => {
                        if (previousFocus.current instanceof HTMLElement && previousFocus.current.isConnected) {
                            event.preventDefault();
                            previousFocus.current.focus({ preventScroll: true });
                        }
                    }}
                    onPointerDownOutside={(event) => { if (form.processing) event.preventDefault(); }}
                >
                    <form className="payment-form" onSubmit={submit} onKeyDown={(event) => {
                        if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                            event.preventDefault();
                            event.currentTarget.requestSubmit();
                        }
                    }}>
                        <div data-popup-section="header">
                            <Dialog.Title data-popup-title>Record Payment / Receipt</Dialog.Title>
                            <Dialog.Description data-popup-description>{receipt ? 'Money received from a customer' : 'Money paid to a supplier'}</Dialog.Description>
                            <Dialog.Close id="payment-close" type="button" data-popup-close aria-label="Close" disabled={form.processing}><X className="i" /></Dialog.Close>
                        </div>
                        <div data-popup-section="body" aria-busy={form.processing}>
                            <div className="ptype" aria-label="Payment type">
                                <button type="button" data-k="ar" className={receipt ? 'on' : ''} aria-pressed={receipt} onClick={() => { if (!receipt) chooseParty('customer'); }} disabled={form.processing}>
                                    <ArrowDown className="i" />Customer receipt<small>Money in</small>
                                </button>
                                <button type="button" data-k="ap" className={!receipt ? 'on' : ''} aria-pressed={!receipt} onClick={() => { if (receipt) chooseParty('company'); }} disabled={form.processing}>
                                    <ArrowUp className="i" />Supplier payment<small>Money out</small>
                                </button>
                            </div>
                            <div className="fg">
                                <div className="f full">
                                    <label htmlFor="payment-party">{partyLabel} *</label>
                                    <select id="payment-party" ref={partyField} required disabled={!parties || form.processing} value={data.party_id} onChange={(event) => chooseParty(data.party_type, event.target.value)}>
                                        <option value="">{parties ? `Select ${partyLabel.toLowerCase()}…` : 'Loading parties…'}</option>
                                        {data.party_id && !parties?.[data.party_type].some((party) => String(party.id) === data.party_id) &&
                                            <option value={data.party_id}>{parties ? 'Party not available' : 'Loading…'}</option>}
                                        {parties?.[data.party_type].map((party) => <option key={party.id} value={party.id}>{party.name}</option>)}
                                    </select>
                                    {lookup.status === 'ready' && <div className="psum">
                                        <span>Balance<b className={lookup.balance < 0 ? 'credit' : ''}>{money(lookup.balance)}</b></span>
                                        <span>Open {docLabel}<b>{invoices.length}</b></span>
                                        {oldest && <span>Oldest<b>{oldest.invoice_number} · {invoiceAge(oldest.invoice_date, today)} days</b></span>}
                                    </div>}
                                </div>
                                <div className="f">
                                    <label htmlFor="payment-method">Method</label>
                                    <select id="payment-method" value={data.method} onChange={(event) => form.setData({ ...data, method: event.target.value, financial_account_id: '' })}>
                                        {Object.entries(paymentMethods).filter(([key]) => !treasury.required || key !== 'adjustment').map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                                    </select>
                                </div>
                                {treasury.required && <div className="f"><label htmlFor="payment-account">Cash or bank account *</label><select id="payment-account" required value={data.financial_account_id} onChange={event => form.setData('financial_account_id', event.target.value)}><option value="">Select an account</option>{treasury.accounts.filter(a => data.method === 'cash' ? a.kind !== 'bank' && a.kind !== 'custody' : a.kind === 'bank').map(a => <option value={a.id} key={a.id}>{a.name}</option>)}</select></div>}
                                <div className="f">
                                    <label htmlFor="payment-amount">Amount (Rs) *</label>
                                    <div className="amt" data-popup-composite><span aria-hidden="true">Rs</span>
                                        <input ref={amountField} id="payment-amount" type="number" min="0.01" max="9999999999999.99" step="0.01" inputMode="decimal" placeholder="0.00" required value={data.amount}
                                            onChange={(event) => changeTotal(event.target.value)} />
                                    </div>
                                    {due > 0 && <div className="quick">
                                        <button type="button" onClick={() => changeTotal((due / 100).toFixed(2))}>Full due {amount(due / 100)}</button>
                                        <button type="button" onClick={() => changeTotal((oldestDue / 100).toFixed(2))}>Oldest {amount(oldestDue / 100)}</button>
                                        {overdue > 0 && overdue !== due && overdue !== oldestDue &&
                                            <button type="button" onClick={() => changeTotal((overdue / 100).toFixed(2))}>90+ only {amount(overdue / 100)}</button>}
                                    </div>}
                                </div>
                                <div className="f"><label htmlFor="payment-date">Date *</label><input id="payment-date" type="date" required value={data.payment_date} onChange={(event) => form.setData('payment_date', event.target.value)} /></div>
                                <div className="f"><label htmlFor="payment-reference">Reference #</label><input id="payment-reference" maxLength={100} placeholder="e.g. cheque or transaction no." value={data.reference_no} onChange={(event) => form.setData('reference_no', event.target.value)} /></div>
                                {data.method === 'cheque' && <>
                                    <div className="f"><label htmlFor="payment-bank">Bank name</label><input id="payment-bank" maxLength={100} value={data.bank_name} onChange={(event) => form.setData('bank_name', event.target.value)} /></div>
                                    <div className="f"><label htmlFor="payment-cheque-no">Cheque #</label><input id="payment-cheque-no" maxLength={100} value={data.cheque_number} onChange={(event) => form.setData('cheque_number', event.target.value)} /></div>
                                    <div className="f"><label htmlFor="payment-cheque-date">Cheque date</label><input id="payment-cheque-date" type="date" value={data.cheque_date} onChange={(event) => form.setData('cheque_date', event.target.value)} /></div>
                                </>}
                                <div className="f full"><label htmlFor="payment-notes">Notes</label><input id="payment-notes" maxLength={500} placeholder="Optional" value={data.notes} onChange={(event) => form.setData('notes', event.target.value)} /></div>
                            </div>

                            <div className="alloc">
                                <div className="ah">
                                    <b>Allocate to open {docLabel}</b>
                                    <span className="allocation-meta">Allocated <b className="num">{totalAmount(allocated / 100)}</b> / {totalAmount(total / 100)}</span>
                                    <div className="sp" />
                                    <span className={manual ? 'mode man' : 'mode'}>{manual ? 'Manual' : 'Auto · oldest first'}</span>
                                    <button className="lnk" type="button" disabled={!oldest} onClick={() => setManual(null)}>Auto-allocate</button>
                                    <button className="lnk" type="button" disabled={!oldest} onClick={() => setManual({})}>Clear</button>
                                </div>
                                <div className="alist" aria-busy={lookup.status === 'loading'}>
                                    {lookup.status === 'idle' && <div className="aempty">Select a {partyLabel.toLowerCase()} to see their unpaid {docLabel}.</div>}
                                    {lookup.status === 'loading' && <div role="status" className="aempty">Loading unpaid {docLabel}…</div>}
                                    {lookup.status === 'error' && <div role="alert" className="aempty">Unable to load unpaid {docLabel}. <button type="button" className="lnk" onClick={refreshInvoices}>Retry</button></div>}
                                    {lookup.status === 'ready' && !oldest && <div className="aempty">No unpaid {docLabel}. The full amount will be recorded as on-account credit.</div>}
                                    {invoices.map((invoice, index) => {
                                        const key = invoiceKey(invoice);
                                        const allocated = cents(allocations[key] ?? 0);
                                        const remaining = cents(invoice.outstanding) - allocated;
                                        const age = invoiceAge(invoice.invoice_date, today);
                                        return <div key={key} className={`ar ${allocated ? remaining <= 0 ? 'full' : 'part' : ''}`}>
                                            <span className="ix">{index + 1}</span><span className="doc">{invoice.invoice_number}</span>
                                            <span className="dt">{shortDate(invoice.invoice_date)}</span><span className={`age b${ageBucket(age)}`}>{age}d</span>
                                            <span className="due num">Due {amount(invoice.outstanding)}<small>{allocated ? remaining <= 0 ? 'Cleared' : `Left ${amount(remaining / 100)}` : '\u00a0'}</small></span>
                                            <input type="number" inputMode="decimal" min="0" step="0.01" max={invoice.outstanding} aria-label={`Allocate to ${invoice.invoice_number}`} value={allocations[key] ?? ''} placeholder="0.00"
                                                onChange={(event) => changeAllocation(invoice, event.target.value)} />
                                            <button className="fb" type="button" aria-label={`Allocate full due to ${invoice.invoice_number}`} onClick={() => changeAllocation(invoice, invoice.outstanding.toFixed(2))}>Full</button>
                                            <div className="prog" aria-hidden="true"><span style={{ width: `${Math.min(100, (allocated / cents(invoice.outstanding)) * 100)}%` }} /></div>
                                        </div>;
                                    })}
                                </div>
                            </div>

                            <div className="msum">
                                <div><small>Amount recorded</small><b className="num">{totalMoney(total / 100)}</b></div>
                                <div><small>Allocated</small><b className="num">{totalMoney(allocated / 100)}</b></div>
                                <div className={allocated > Math.max(tendered, total) ? 'err' : unapplied > 0 ? 'warn' : ''}><small>Unallocated</small><b className="num">{totalMoney(Math.max(0, unapplied) / 100)}</b></div>
                                <div><small>Balance after</small><b className={`num ${settledBalance == null ? '' : settledBalance < 0 ? 'credit' : settledBalance === 0 ? 'good' : receipt ? '' : 'debt'}`}>{settledBalance == null ? '—' : totalMoney(settledBalance / 100)}</b></div>
                            </div>
                            {unapplied < 0 && <p className="merr" role="alert">Allocations exceed the amount. Reduce an allocation or raise the amount.</p>}
                            {tendered !== total && <p className="merr unapplied">Entered {money(tendered / 100)} · rounding {total > tendered ? '+' : '−'}{money(Math.abs(total - tendered) / 100)}. The exact tender is retained for reconciliation.</p>}
                            {lookup.status === 'ready' && unapplied > 0 && <p className="merr unapplied">{money(unapplied / 100)} will be kept as on-account credit, not allocated to a document.</p>}
                            {errors.length > 0 && <div className="merr" role="alert">{errors.map((error) => <p key={error}>{error}</p>)}</div>}
                        </div>
                        <div className="mf" data-popup-section="footer">
                            <span className="muted keyboard-hint">Esc to close · Ctrl+Enter to record</span><div className="sp" />
                            <Dialog.Close type="button" className="btn" data-popup-action="secondary" disabled={form.processing}>Cancel</Dialog.Close>
                            <button className="btn pri" data-popup-action="primary" type="submit" disabled={!canSubmit || tendered <= 0}>{form.processing ? 'Recording…' : receipt ? 'Record receipt' : 'Record payment'}</button>
                        </div>
                    </form>
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    );
}
