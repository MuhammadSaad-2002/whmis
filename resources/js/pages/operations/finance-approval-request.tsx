import { SearchableSelect, type SelectOption } from '@/components/searchable-select';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { SearchField } from '@/components/ui/search-field';
import { Textarea } from '@/components/ui/textarea';
import { shortDate } from '@/lib/format';
import { useForm } from '@inertiajs/react';
import { CircleHelp, FileSpreadsheet, ShieldCheck, Upload, UsersRound, X } from 'lucide-react';
import { createContext, useContext, useEffect, useId, useState } from 'react';
import { amountText, expenseCategories, kindIcon, kindName, requestGroups, requestGuidance, requiredEvidence, type ApprovalOptions, type ApprovalPayload, type AwardProjection, type FinanceAccount, type PickOption } from './finance-approval-types';
import { Errors, Field, selectClass } from './shared';

export type DraftSeed = ApprovalPayload & { kind?: string; amount?: string };
const sourceTypes = ['refund', 'credit_apply', 'credit_writeoff'];
const referenceTypes = ['refund_correction', 'refund_recovery', 'credit_release', 'shortage_repayment_reverse'];
const collectionTypes = ['shortage', 'shortage_repayment', 'shortage_commission_offset', 'shortage_receipt_reverse'];
const employeeTypes = ['commission_cap', 'commission_payout', 'recovery_waiver', 'recovery_repayment', 'recovery_hold', 'recovery_resume'];
const monetaryTypes = ['transfer', 'expense', 'adjustment', 'statement', ...sourceTypes, 'refund_recovery', 'shortage', 'shortage_repayment', 'shortage_commission_offset', 'commission_cap', 'commission_payout', 'recovery_repayment', 'recovery_waiver'];
const accountTypes = ['transfer', 'expense', 'adjustment', 'statement', 'refund', 'shortage_repayment', 'commission_payout', 'refund_recovery'];
const is = (row: { id: number | string }, id: string) => String(row.id) === id;
const inPaisa = (value: string) => Math.round(Number(value || 0) * 100);
const PickerContainer = createContext<HTMLElement | null>(null);

export function RequestDialog({ open, close, created, restoreFocus, seed, kinds, accounts, today }: {
    open: boolean; close: () => void; created: () => void; restoreFocus: () => void; seed?: DraftSeed; kinds: string[]; accounts: FinanceAccount[]; today: string;
}) {
    const [container, setContainer] = useState<HTMLDivElement | null>(null);
    return <Dialog open={open} onOpenChange={next => { if (!next) close(); }}>
        <DialogContent ref={setContainer} appearance="form" className="finance-modal sm:max-w-[1050px]" onCloseAutoFocus={event => { event.preventDefault(); restoreFocus(); }}>
            <DialogHeader>
                <DialogTitle>Create finance request</DialogTitle>
                <DialogDescription>It goes to an independent reviewer. Nothing moves until the approved request is posted.</DialogDescription>
            </DialogHeader>
            {open && <PickerContainer.Provider value={container}><RequestForm seed={seed} accounts={accounts} kinds={kinds} today={today} close={close} created={created} /></PickerContainer.Provider>}
        </DialogContent>
    </Dialog>;
}

function RequestForm({ seed, accounts, kinds, today, close, created }: {
    seed?: DraftSeed; accounts: FinanceAccount[]; kinds: string[]; today: string; close: () => void; created: () => void;
}) {
    const value = (key: string, fallback = '') => String(seed?.[key] ?? fallback);
    const initial = kinds.find(kind => kind === seed?.kind) ?? kinds[0] ?? '';
    const form = useForm({
        kind: initial, date: today, notes: value('notes'), request_key: crypto.randomUUID(), amount: value('amount'),
        account_id: value('account_id'), target_id: value('target_id'), invoice_id: value('invoice_id'), source_payment_id: value('source_payment_id'), day_id: value('day_id'),
        credit_id: value('credit_id'), collection_id: value('collection_id'), employee_id: value('employee_id'), booking_id: value('booking_id'), award_id: value('award_id'),
        commission_role: value('commission_role', 'salesman'), share: value('share'), method: value('method', 'cash'), direction: value('direction', 'out'),
        cap_period: value('cap_period', 'invoice'), category: value('category'), payee: value('payee'), transaction_reference: value('transaction_reference'),
        repayment_via: value('repayment_via', 'cash'), hold_until: value('hold_until'), corrected_amount: value('corrected_amount'),
        evidence: null as File | null, opening_csv: null as File | null,
    });
    const data = form.data;
    const kind = data.kind;
    const [search, setSearch] = useState('');
    const [customerId, setCustomerId] = useState('');
    const [readyData, setReadyData] = useState<{ key: string; data: ApprovalOptions }>({ key: '', data: {} });
    const [fetchError, setFetchError] = useState('');
    const [retry, setRetry] = useState(0);
    const sourceId = data.source_payment_id ? 'receipt:' + data.source_payment_id : data.invoice_id;
    const seededCustomer = readyData.data.invoices?.find(invoice => is(invoice, sourceId))?.customer_id;
    const activeCustomer = customerId || (seededCustomer ? String(seededCustomer) : '');
    const fetchKey = new URLSearchParams({ kind, ...(sourceTypes.includes(kind) && activeCustomer ? { customer_id: activeCustomer } : {}),
        ...(kind === 'commission_payout' && data.award_id ? { award_id: data.award_id } : {}), ...(kind === 'statement' && data.date ? { date: data.date } : {}) }).toString();
    const options = readyData.key === fetchKey ? readyData.data : null;
    useEffect(() => {
        const controller = new AbortController();
        setFetchError('');
        fetch('/finance-approvals/options?' + fetchKey, { signal: controller.signal, headers: { Accept: 'application/json' } })
            .then(response => { if (!response.ok) throw new Error('Options unavailable'); return response.json() as Promise<ApprovalOptions>; })
            .then(result => setReadyData({ key: fetchKey, data: result }))
            .catch(() => { if (!controller.signal.aborted) setFetchError('Could not load live options. Check your connection and try again.'); });
        return () => controller.abort();
    }, [fetchKey, retry]);

    const account = accounts.find(row => is(row, data.account_id));
    const targetAccount = accounts.find(row => is(row, data.target_id));
    const source = options ?? (readyData.key.startsWith('kind=' + kind + '&') || readyData.key === 'kind=' + kind ? readyData.data : {});
    const selectedSource = source.invoices?.find(row => is(row, sourceId));
    const selectedTarget = source.targets?.find(row => is(row, data.target_id));
    const selectedCustomer = source.customers?.find(row => is(row, activeCustomer));
    const selectedDay = source.days?.find(row => is(row, data.day_id));
    const selectedCollection = source.collections?.find(row => is(row, data.collection_id));
    const selectedEmployee = source.employees?.find(row => is(row, data.employee_id));
    const selectedReference = source.references?.find(row => is(row, data.credit_id));
    const sourceInvoiceOptions = (source.invoices ?? []).filter(row => !activeCustomer || String(row.customer_id) === activeCustomer);
    const surplus = selectedDay ? Math.max(0, Number(selectedDay.counted) - Number(selectedDay.verified)) : 0;
    const isDeduction = kind === 'recovery_repayment' && data.repayment_via === 'commission';
    const usesAccount = accountTypes.includes(kind) || kind === 'close_variance' && surplus > 0 || kind === 'recovery_repayment' && !isDeduction;
    const cashOut = ['transfer', 'expense', 'refund', 'commission_payout'].includes(kind) || kind === 'adjustment' && data.direction === 'out';
    const accountOptions = accounts.filter(row => kind === 'refund' ? data.method === 'bank' ? row.kind === 'bank' : row.kind !== 'bank' : kind !== 'close_variance' || row.kind !== 'bank');
    const maxByKind: Record<string, number | undefined> = {
        refund: selectedSource?.max, credit_writeoff: selectedSource?.max, credit_apply: selectedSource && selectedTarget ? Math.min(Number(selectedSource.max), Number(selectedTarget.max)) : undefined,
        refund_recovery: selectedReference?.max, refund_correction: selectedReference?.correction_max, shortage: selectedCollection?.max, shortage_repayment: selectedCollection?.max,
        shortage_commission_offset: selectedCollection?.max,
        commission_payout: selectedEmployee?.award_due, recovery_waiver: selectedEmployee?.recovery,
        recovery_repayment: selectedEmployee ? isDeduction ? Math.min(Number(selectedEmployee.due), Number(selectedEmployee.recovery)) : selectedEmployee.recovery : undefined,
    };
    const available = maxByKind[kind];
    const max = account && cashOut ? Math.min(available ?? Infinity, Math.max(0, account.balance)) : available;
    const amountField = kind === 'refund_correction' ? 'corrected_amount' : 'amount';
    const amount = inPaisa(data[amountField]);
    const sharePercent = Number(data.share || 0);
    const [projection, setProjection] = useState<{ key: string; awards: AwardProjection[]; failed?: boolean }>({ key: '', awards: [] });
    const previewKey = kind === 'commission_share' && selectedSource?.share && data.share !== '' && sharePercent >= 0 && sharePercent <= 100
        ? new URLSearchParams({ invoice_id: String(selectedSource.id), share: data.share }).toString() : '';
    useEffect(() => {
        if (!previewKey) return;
        const controller = new AbortController();
        const timer = window.setTimeout(() => {
            fetch('/finance-approvals/share-preview?' + previewKey, { signal: controller.signal, headers: { Accept: 'application/json' } })
                .then(response => { if (!response.ok) throw new Error('Preview unavailable'); return response.json() as Promise<AwardProjection[]>; })
                .then(awards => setProjection({ key: previewKey, awards }))
                .catch(() => { if (!controller.signal.aborted) setProjection({ key: previewKey, awards: [], failed: true }); });
        }, 220);
        return () => { window.clearTimeout(timer); controller.abort(); };
    }, [previewKey]);
    const book = account ? Number(source.statement?.[String(account.id)] ?? 0) : 0;
    const requiredPickers: [string, unknown][] = [
        ...(usesAccount ? [['account_id', accountOptions.some(row => is(row, data.account_id))] as [string, unknown]] : []),
        ...(kind === 'transfer' ? [['target_id', targetAccount && account?.id !== targetAccount.id] as [string, unknown]] : []),
        ...(sourceTypes.includes(kind) || kind === 'commission_share' ? [[data.source_payment_id ? 'source_payment_id' : 'invoice_id', selectedSource] as [string, unknown]] : []),
        ...(kind === 'credit_apply' ? [['target_id', selectedTarget && !is(selectedTarget, data.invoice_id)] as [string, unknown]] : []),
        ...(referenceTypes.includes(kind) ? [['credit_id', selectedReference] as [string, unknown]] : []),
        ...(collectionTypes.includes(kind) ? [['collection_id', selectedCollection] as [string, unknown]] : []),
        ...(kind === 'close_variance' ? [['day_id', selectedDay] as [string, unknown]] : []),
        ...(employeeTypes.includes(kind) ? [['employee_id', selectedEmployee] as [string, unknown]] : []),
    ];
    const ready = !!options && !fetchError && requiredPickers.every(([, picked]) => !!picked)
        && (kind !== 'opening' || !!options.opening?.length);
    const hasMoney = monetaryTypes.includes(kind) || kind === 'refund_correction';
    const requireFile = requiredEvidence.includes(kind);
    const setKind = (next: string) => {
        if (next === kind || form.processing) return;
        form.clearErrors();
        setCustomerId('');
        setReadyData({ key: '', data: {} });
        form.setData(current => ({ ...current, kind: next, date: today, amount: '', notes: '', account_id: '', target_id: '', invoice_id: '', credit_id: '',
            day_id: '', collection_id: '', employee_id: '', booking_id: '', award_id: '', share: '', category: '', payee: '', transaction_reference: '', source_payment_id: '',
            corrected_amount: '', hold_until: '', direction: 'out', method: 'cash', repayment_via: 'cash', evidence: null, opening_csv: null }));
    };
    const eachGroup = requestGroups.map(([name, types]) => [name, types.filter(type => kinds.includes(type) &&
        (name + ' ' + kindName(type)).toLowerCase().includes(search.trim().toLowerCase()))] as const).filter(([, types]) => types.length);
    const [Icon, tone] = kindIcon(kind);
    const accountName = account?.name ?? 'the selected account';
    const employeeName = selectedEmployee?.label ?? 'the employee';
    const amountNames: Record<string, string> = { statement: 'Counted or statement balance', shortage: 'Confirmed shortage', refund: 'Refund amount', refund_recovery: 'Amount recovered',
        refund_correction: 'Correct net refund amount', credit_apply: 'Amount to apply', credit_writeoff: 'Credit to release', commission_cap: 'Maximum commission',
        commission_payout: 'Amount to pay', shortage_repayment: 'Amount repaid', recovery_repayment: 'Amount repaid', recovery_waiver: 'Amount to waive' };
    const money = amountText(amount);
    const outcome = ({
        opening: options?.locked ? 'The opening balances are already locked. Use an Adjustment to correct an account.' : `${amountText(source.opening?.reduce((sum, row) => sum + row.opening_paisa, 0) ?? 0)} in prepared openings will be posted once. ${data.opening_csv ? 'The opening obligations CSV will also be reconciled.' : ''}`,
        transfer: `${money} moves from ${accountName} to ${targetAccount?.name ?? 'the destination account'}. Total cash and profit stay the same.`,
        expense: `${money} leaves ${accountName} and reduces operating profit under ${data.category || 'the selected category'}.`,
        adjustment: `${accountName} ${data.direction === 'in' ? 'increases' : 'decreases'} by ${money}. No invoice or party balance changes.`,
        statement: `The checkpoint records ${money} against ${amountText(book)} in the books. Difference: ${amountText(amount - book)}. No cash moves.`,
        close_variance: surplus ? `${amountText(surplus)} of unallocated counted cash is posted to ${accountName} as other income when the day is closed.` : 'The accepted reporting difference is recorded when the day closes. No cash or invoice balance changes.',
        refund: `${money} leaves ${accountName} and reduces the available credit on ${selectedSource?.label ?? 'the source invoice'}.`,
        credit_apply: `${money} of credit settles ${selectedTarget?.label ?? 'the receiving invoice'}. No cash moves.`,
        credit_writeoff: `${money} of ${selectedCustomer?.label ?? 'customer'} credit is released as other income. No cash moves.`,
        credit_release: selectedReference ? `${amountText(Number(selectedReference.max))} becomes available again. The invoice may reopen; there is no cash movement.` : requestGuidance.credit_release,
        refund_recovery: `${money} is received into ${accountName}. The unresolved refund decreases by the same amount.`,
        refund_correction: `The recorded net refund changes from ${amountText(Number(selectedReference?.max ?? 0))} to ${money}. The original account and customer ledger are corrected without recording a new payment.`,
        shortage: `${money} becomes an employee receivable when Finance applies the shortage to the collection. Only separately verified cash reaches the till.`,
        shortage_repayment: `${money} is received into ${accountName} and reduces the shortage balance.`,
        shortage_commission_offset: `${money} reduces both the shortage and commission payable. No cash moves.`,
        shortage_repayment_reverse: `${amountText(Number(selectedReference?.max ?? 0))} is removed from the original cash account and becomes owed again.`,
        shortage_receipt_reverse: requestGuidance.shortage_receipt_reverse,
        commission_cap: `${employeeName} is capped at ${money} per ${data.cap_period === 'month' ? 'calendar month' : 'invoice'} as ${data.commission_role === 'salesman' ? 'a Salesman' : 'a Booker'}. Posted payouts are not reclaimed.`,
        commission_share: selectedSource?.share ? `${selectedSource.share.original} receives ${sharePercent}% for assignment; ${100 - sharePercent}% is allocated by delivery to ${selectedSource.share.delivered}. Booker commission is unchanged. Existing calculated Salesman commission: ${amountText(selectedSource.share.calculated)}. Eligibility, rates and caps still apply.` : 'Pick a delivered sales invoice to preview the split.',
        commission_payout: `${money} leaves ${accountName} and reduces ${employeeName}’s commission due.`,
        recovery_repayment: `${employeeName} owes ${money} less. ${isDeduction ? 'The amount is deducted from commission due; no cash moves.' : `The money goes into ${accountName}.`}`,
        recovery_waiver: `${money} of ${employeeName}’s recovery is forgiven and recorded as a loss. No cash moves.`,
        recovery_hold: `Automatic deductions pause ${data.hold_until ? 'until ' + shortDate(data.hold_until) : 'until resumed'}. The balance owed is unchanged.`,
        recovery_resume: `Automatic deductions resume for ${employeeName}. The system offsets recovery against available commission without moving cash.`,
    } as Record<string, string>)[kind];

    return <form className="finance-request-form" onSubmit={event => {
        event.preventDefault();
        if (!ready) { form.setError('kind', 'Complete the required selections before submitting.'); return; }
        if (hasMoney && (data[amountField] === '' || amount < (['statement', 'refund_correction', 'commission_cap'].includes(kind) ? 0 : 1) || (max !== undefined && amount > max))) {
            form.setError(amountField, max === undefined ? 'Enter a valid amount.' : 'Enter an amount within ' + amountText(max) + '.');
            return;
        }
        if (requireFile && !data.evidence) { form.setError('evidence', 'Attach supporting evidence before submitting.'); return; }
        form.transform(input => {
            const { kind, date, notes, request_key, evidence } = input;
            const payload: Record<string, string | File | null> = { kind, date: selectedDay?.date ?? (kind === 'shortage' ? selectedCollection?.date : null) ?? date, notes: notes.trim(), request_key, evidence };
            for (const [key] of requiredPickers) payload[key] = input[key as keyof typeof input];
            if (hasMoney) payload[amountField] = input[amountField];
            if (kind === 'opening') payload.opening_csv = input.opening_csv;
            if (kind === 'commission_share') payload.share = input.share;
            if (kind === 'commission_cap') { payload.commission_role = input.commission_role; payload.cap_period = input.cap_period; }
            if (kind === 'commission_payout' && input.award_id) payload.award_id = input.award_id;
            if (kind === 'expense') { payload.category = input.category; payload.payee = input.payee; }
            if (['transfer', 'expense', 'refund', 'refund_recovery', 'shortage_repayment', 'commission_payout', 'recovery_repayment'].includes(kind) && !isDeduction && input.transaction_reference) payload.transaction_reference = input.transaction_reference;
            if (kind === 'refund') payload.method = input.method;
            if (kind === 'adjustment') payload.direction = input.direction;
            if (kind === 'recovery_repayment') payload.repayment_via = input.repayment_via;
            if (kind === 'recovery_hold' && input.hold_until) payload.hold_until = input.hold_until;
            return payload;
        });
        form.post('/finance-approvals', { preserveScroll: true, onSuccess: created });
    }}>
        <div className="finance-request-layout">
            <aside className="request-type-side" aria-label="Request types">
                <SearchField className="request-type-search" aria-label="Find a request type" placeholder="Find a request type…" value={search} onChange={event => setSearch(event.target.value)} />
                <nav className="request-type-nav" aria-label="Request type groups">
                    {eachGroup.map(([group, choices]) => <section key={group}><h3>{group}</h3>
                        {choices.map(type => {
                            const [TypeIcon, typeTone] = kindIcon(type);
                            return <button key={type} type="button" aria-pressed={kind === type} onClick={() => setKind(type)}><span className="finance-icon" data-tone={typeTone}><TypeIcon /></span>{kindName(type)}</button>;
                        })}
                    </section>)}
                    {!eachGroup.length && <p className="form-hint">No matching types. Try another search.</p>}
                </nav>
            </aside>
            <div className="request-pane" data-popup-section="body" aria-busy={!options && !fetchError}>
                <div className="request-pane-title"><span className="finance-icon" data-tone={tone}><Icon /></span><h3>{kindName(kind)}</h3></div>
                <section className="request-guidance"><CircleHelp aria-hidden="true"/><div><strong>How this works</strong><p>{requestGuidance[kind]}</p></div></section>
                {fetchError ? <p role="alert" className="request-error">{fetchError} <button type="button" onClick={() => setRetry(value => value + 1)}>Retry</button></p>
                    : !options && <p className="form-hint" role="status">Loading live options…</p>}
                <div className="request-grid">
                    {kind === 'opening' && <div className="full">
                        {options?.locked ? <p className="form-hint">Opening balances are already locked.</p> : source.opening?.length ? <ul className="opening-preview">
                            {source.opening.map(row => <li key={row.id}><span>{row.name}{row.opening_reference && <small>{row.opening_reference}</small>}</span><strong>{amountText(row.opening_paisa)}</strong></li>)}
                        </ul> : options && <p className="form-hint">No accounts are prepared. Set them up in Cash &amp; Bank first.</p>}
                    </div>}
                    {!['close_variance', 'shortage'].includes(kind) && <Field label={kind === 'opening' ? 'Go-live date *' : kind === 'statement' ? 'Statement or count date *' : 'Effective date *'}>
                        <Input required type="date" min={kind === 'opening' ? today : undefined} max={kind === 'opening' ? undefined : today} value={data.date} onChange={event => form.setData('date', event.target.value)} />
                    </Field>}
                    {kind === 'refund' && <Field label="Payment method"><select className={selectClass} value={data.method} onChange={event => form.setData(current => ({ ...current, method: event.target.value, account_id: '' }))}>
                        <option value="cash">Cash</option><option value="bank">Bank transfer</option>
                    </select></Field>}
                    {kind === 'adjustment' && <Segments label="Direction" value={data.direction} options={[['in','Increase'],['out','Decrease']]} set={direction => form.setData('direction', direction)} />}
                    {kind === 'recovery_repayment' && <Segments label="Paid by" value={data.repayment_via} options={[['cash','Cash / bank'],['commission','Commission deduction']]} set={repayment_via => form.setData(current => ({ ...current, repayment_via, account_id: '' }))} />}
                    {sourceTypes.includes(kind) && <>
                        <Picker label="Customer" value={activeCustomer} rows={source.customers} empty={kind === 'credit_apply' ? 'No customer has receipt-backed credit to apply.' : 'No customer has eligible credit.'}
                            set={id => { setCustomerId(id); form.setData(current => ({ ...current, invoice_id: '', source_payment_id: '', target_id: '', amount: '' })); }} />
                        {activeCustomer && <Picker label="Source credit" rows={sourceInvoiceOptions} empty="No eligible invoice or unapplied receipt for this customer." value={sourceId}
                            set={id => form.setData(current => ({ ...current, invoice_id: id.startsWith('receipt:') ? '' : id,
                                source_payment_id: id.startsWith('receipt:') ? id.slice(8) : '', target_id: '', amount: '' }))} />}
                        {kind === 'credit_apply' && selectedSource && <Picker label="Invoice to settle" rows={source.targets?.filter(row => !is(row, data.invoice_id))}
                            empty="This customer has no other open sales invoice." value={data.target_id} set={id => form.setData('target_id', id)} />}
                    </>}
                    {usesAccount && <Picker label={kind === 'transfer' ? 'From account' : kind === 'expense' || cashOut ? 'Pay from' : 'Cash or bank account'}
                        rows={accountOptions.map(row => ({ id: row.id, label: row.name, max: row.balance }))} value={data.account_id} empty="No eligible account you can operate."
                        set={account_id => form.setData(current => ({ ...current, account_id, target_id: kind === 'transfer' ? '' : current.target_id }))} />}
                    {kind === 'transfer' && <Picker label="To account" rows={accounts.filter(row => !is(row, data.account_id)).map(row => ({ id: row.id, label: row.name, max: row.balance }))}
                        empty="No other account you can operate." value={data.target_id} set={id => form.setData('target_id', id)} />}
                    {kind === 'expense' && <>
                        <Field label="Category *"><select className={selectClass} required value={data.category} onChange={event => form.setData('category', event.target.value)}>
                            <option value="">Choose a category</option>{expenseCategories.map(category => <option key={category}>{category}</option>)}</select></Field>
                        <Field label="Paid to *"><Input required maxLength={200} value={data.payee} onChange={event => form.setData('payee', event.target.value)} /></Field>
                    </>}
                    {kind === 'close_variance' && <Picker label="Salesman and reconciliation day" rows={source.days} empty="No verified day with a counted cash difference." value={data.day_id} set={id => form.setData('day_id', id)} />}
                    {selectedDay && <p className="full request-data-note">Reported {amountText(Number(selectedDay.reported))} · Counted {amountText(Number(selectedDay.counted))} · Posted cash {amountText(Number(selectedDay.verified))}</p>}
                    {collectionTypes.includes(kind) && <Picker label={kind === 'shortage' ? 'Cash collection and Salesman' : 'Posted shortage and Salesman'} rows={source.collections}
                        empty={kind === 'shortage' ? 'No counted, unverified cash collection with an available shortage.' : 'No eligible posted shortage.'} value={data.collection_id} set={id => form.setData('collection_id', id)} />}
                    {referenceTypes.includes(kind) && <Picker label={kind === 'credit_release' ? 'Posted credit application' : kind === 'shortage_repayment_reverse' ? 'Original shortage repayment' : 'Original refund'}
                        rows={source.references} empty="No eligible posted request." value={data.credit_id} set={id => form.setData('credit_id', id)} />}
                    {employeeTypes.includes(kind) && <Picker label="Employee" rows={source.employees} empty={kind === 'commission_payout' ? 'No employee has commission due.' : kind === 'recovery_resume'
                        ? 'No employee’s deductions are on hold.' : kind === 'commission_cap' ? 'No active employees.' : 'No employee has eligible outstanding recovery.'}
                        value={data.employee_id} set={id => form.setData('employee_id', id)} />}
                    {kind === 'commission_cap' && <>
                        <Segments label="Role" value={data.commission_role} options={[['booker','Booker'],['salesman','Salesman']]} set={role => form.setData('commission_role', role)} />
                        <Segments label="Cap applies per" value={data.cap_period} options={[['invoice','Invoice'],['month','Month']]} set={period => form.setData('cap_period', period)} />
                    </>}
                    {kind === 'commission_share' && <>
                        <Picker label="Delivered sales invoice" rows={source.invoices} empty="No eligible invoice with a different assigned and delivering Salesman." value={data.invoice_id} set={id => form.setData('invoice_id', id)} />
                        {selectedSource?.share && <>
                            <div className="full request-data-note">Assigned: <b>{selectedSource.share.original}</b> · Delivered by: <b>{selectedSource.share.delivered}</b>
                                <br />Currently calculated: {amountText(selectedSource.share.calculated)} · Earned: {amountText(selectedSource.share.due)}</div>
                            <Field label="Original assignee’s share (%) *"><Input required type="number" min="0" max="100" step=".01" value={data.share} onChange={event => form.setData('share', event.target.value)} /></Field>
                        </>}
                    </>}
                    {kind === 'commission_payout' && data.award_id && <p className="full request-data-note">Pays only the selected invoice commission award.</p>}
                    {kind === 'recovery_hold' && <Field label="Restart deductions on (optional)"><Input type="date" value={data.hold_until} onChange={event => form.setData('hold_until', event.target.value)} /></Field>}
                    {hasMoney && <div className="min-w-0">
                        <Field label={(amountNames[kind] ?? 'Amount')+' (PKR) *'}><Input required type="number" min={['statement','refund_correction','commission_cap'].includes(kind) ? '0' : '.01'}
                            max={max === undefined ? undefined : max / 100} step=".01" placeholder="0.00" value={data[amountField]}
                            onChange={event => { form.clearErrors(amountField); form.setData(amountField, event.target.value); }} /></Field>
                        {max !== undefined && <p className="amount-limit"><span>Available: {amountText(max)}</span><button type="button" onClick={() => form.setData(amountField, (max / 100).toFixed(2))}>Use max</button></p>}
                    </div>}
                    {kind === 'statement' && account && <p className="request-data-note">Book balance on this date: {amountText(book)}</p>}
                    {['transfer','expense','refund','refund_recovery','shortage_repayment','commission_payout','recovery_repayment'].includes(kind) && !isDeduction && <Field label="Transaction / receipt reference (optional)">
                        <Input maxLength={200} value={data.transaction_reference} onChange={event => form.setData('transaction_reference', event.target.value)} /></Field>}
                    <div className="full"><Field label="Explanation *"><Textarea rows={3} required maxLength={1500} placeholder="Explain what happened and what the reviewer should check."
                        value={data.notes} onChange={event => form.setData('notes', event.target.value)} /></Field></div>
                    <FileDrop label={'Supporting evidence' + (requireFile ? ' *' : ' (optional)')} hint="Private · PDF, PNG, JPEG or CSV · up to 8 MB" accept=".pdf,.png,.jpg,.jpeg,.csv"
                        file={data.evidence} update={file => { form.clearErrors('evidence'); form.setData('evidence', file); }} />
                    {kind === 'opening' && <FileDrop label="Opening obligations CSV (optional)" hint="Use the existing opening import columns · up to 1 MB"
                        accept=".csv,.txt" file={data.opening_csv} update={file => form.setData('opening_csv', file)} csv />}
                    <div className="full request-impact" aria-live="polite"><ShieldCheck aria-hidden="true"/><div><strong>When approved and posted</strong><p>{outcome}</p>
                        {previewKey && (projection.key !== previewKey ? <p>Calculating the proposed award amounts…</p> : projection.failed
                            ? <p>Live preview is unavailable. Finance recalculates the awards before posting.</p>
                            : projection.awards.length ? <ul>{projection.awards.map(award => <li key={award.name}>
                                {award.name}: {amountText(award.calculated)} calculated · {amountText(award.earned)} earned
                            </li>)}</ul> : <p>No eligible earnings yet; the award depends on the verified collections and settlement.</p>)}
                    </div></div>
                </div>
                <div className="mt-3"><Errors errors={form.errors} /></div>
            </div>
        </div>
        <footer data-popup-section="footer">
            <p className="form-hint"><UsersRound aria-hidden="true" />Someone else must review your request.</p>
            <Button type="button" variant="outline" disabled={form.processing} onClick={close}>Cancel</Button>
            <Button disabled={form.processing || !ready}>{form.processing ? 'Submitting…' : 'Submit for review'}</Button>
        </footer>
    </form>;
}

function Picker({ label, empty, rows, value, set }: { label: string; empty: string; rows?: PickOption[]; value: string; set: (value: string) => void }) {
    const id = useId();
    const container = useContext(PickerContainer);
    const options: SelectOption[] = (rows ?? []).map(row => ({ value: String(row.id), label: [row.label, row.customer,
        row.max !== undefined ? amountText(row.max) : null, row.due !== undefined ? 'Due ' + amountText(row.award_due ?? row.due) : null,
        row.recovery !== undefined ? 'Owed ' + amountText(row.recovery) : null].filter(Boolean).join(' · ') }));
    return <div className="request-picker">
        <label htmlFor={id}>{label} <span aria-hidden="true">*</span></label>
        <SearchableSelect id={id} value={value} options={options} onValueChange={set} placeholder={'Select ' + label.toLowerCase()} emptyText={empty} touch disabled={!options.length} portalContainer={container} />
        {rows && !options.length && <p className="form-hint">{empty}</p>}
    </div>;
}

function Segments({ label, options, value, set }: { label: string; options: [string, string][]; value: string; set: (id: string) => void }) {
    return <fieldset className="request-segments"><legend>{label}</legend><div>{options.map(([id, text]) => <button key={id} type="button" aria-pressed={value === id} onClick={() => set(id)}>{text}</button>)}</div></fieldset>;
}

function FileDrop({ label, hint, accept, file, update, csv }: { label: string; hint: string; accept: string; file: File | null; update: (file: File | null) => void; csv?: boolean }) {
    const [over, setOver] = useState(false);
    const Icon = csv ? FileSpreadsheet : Upload;
    return <div className="full min-w-0 space-y-1.5">
        <p className="text-sm font-semibold">{label}</p>
        <div className="file-drop" data-over={over} data-attached={!!file} onDragOver={event => {
            if (event.dataTransfer.types.includes('Files')) { event.preventDefault(); setOver(true); }
        }} onDragLeave={event => { if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) setOver(false); }}
        onDrop={event => { event.preventDefault(); setOver(false); if (event.dataTransfer.files[0]) update(event.dataTransfer.files[0]); }}>
            <label>
                <input type="file" className="sr-only" aria-label={label} accept={accept}
                    onChange={event => { if (event.target.files?.[0]) update(event.target.files[0]); event.target.value = ''; }} />
                <span className="finance-icon" data-tone={file ? 'green' : 'neutral'}><Icon /></span>
                <span className="min-w-0"><b>{file?.name ?? 'Drop a file or click to upload'}</b><small>{file ? Math.max(1, Math.round(file.size / 1024)) + ' KB · click to replace' : hint}</small></span>
            </label>
            {file && <Button type="button" size="icon" variant="ghost" aria-label={'Remove ' + (csv ? 'CSV' : 'evidence')} onClick={() => update(null)}><X /></Button>}
        </div>
    </div>;
}
