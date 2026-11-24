import { amount, totalPaisaMoney as cashTotal } from '@/lib/format';
import { Link, useForm } from '@inertiajs/react';
import { Check, X } from 'lucide-react';
import { useState } from 'react';
import type { Account, Day, Row } from './daily-collections';
import { due, Notice, reported, rs } from './payment-reconciliation-ui';
import { Errors, Field } from './shared';

const endpoint = '/daily-reconciliation';
const noteColors = ['#e6f3e8', '#e0edf8', '#f9e4df', '#ede4f5', '#f8eac9', '#e2f1ef', '#faebde'];
const decimal = (paisa: number) => (paisa / 100).toFixed(2);
const paisa = (value: string) => Math.round(Number(value) * 100);
const cashAccounts = (accounts: Account[]) => accounts.filter(account => account.kind === 'cash' || account.kind === 'petty_cash');
const maxAmount = 999999999999;

export function CashCount({ day, cashNotes, editable, reported, posted, applied, accounts, matchingIds, matchingTotal }: { day: Day; cashNotes: number[]; editable: boolean; reported: number; posted: number; applied: number; accounts: Account[]; matchingIds: number[]; matchingTotal: number }) {
    const [mode, setMode] = useState<'notes' | 'total'>('notes');
    const [editing, setEditing] = useState(false);
    const saved = day.counted_cash_paisa === null ? null : Number(day.counted_cash_paisa);
    const counting = editable && (saved === null || editing);
    const form = useForm({ amount: '', notes: {} as Record<number, string>, coins: '' });
    const notesPaisa = cashNotes.reduce((total, note) => total + 100 * note * Number(form.data.notes[note] || 0), 0) + paisa(form.data.coins);
    const current = mode === 'notes' ? notesPaisa : paisa(form.data.amount);
    const counted = counting ? current : saved ?? 0;
    const difference = counted - reported;
    const largest = Math.max(1, counted, reported, posted);
    const compare = [['Reported cash', reported, '#1f4e79'], [counting ? 'Counting' : 'Counted', counted, '#7c3aed'], ['Posted (cash)', posted, '#059669']] as const;
    const validTotal = mode === 'notes' || form.data.amount !== '';

    return <aside className="recon-cash">
        <div className="recon-section-head"><h3>Step 1 · Cash count</h3>{counting && <div className="recon-segment recon-no-print" role="group" aria-label="Cash count method"><button type="button" aria-pressed={mode === 'notes'} onClick={() => setMode('notes')}>By notes</button><button type="button" aria-pressed={mode === 'total'} onClick={() => setMode('total')}>Total only</button></div>}</div>
        {counting ? <form className="recon-count-form recon-no-print" onSubmit={e => {
            e.preventDefault();
            form.transform(data => ({ amount: decimal(current), ...(mode === 'notes' ? { breakdown: Object.fromEntries([...cashNotes.map(note => [String(note), data.notes[note] || '0']), ['coins', data.coins || '0']]) } : {}) }));
            form.post(`${endpoint}/${day.id}/count`, { preserveScroll: true, errorBag: `count-${day.id}`, onSuccess: () => setEditing(false) });
        }}>
            {mode === 'notes' ? <div className="recon-denoms">
                {cashNotes.map((note, index) => <label className="recon-denom" key={note}><span style={{ backgroundColor: noteColors[index % noteColors.length] }}>{note.toLocaleString('en-PK')}</span>
                    <input type="number" min="0" max="100000000" step="1" inputMode="numeric" placeholder="0" aria-label={`${note} rupee notes`} value={form.data.notes[note] ?? ''} onChange={e => form.setData('notes', { ...form.data.notes, [note]: e.target.value })}/><output>{form.data.notes[note] ? amount(note * Number(form.data.notes[note])) : '—'}</output></label>)}
                <label className="recon-denom"><span>Coins</span><input type="number" min="0" max={maxAmount} step=".01" inputMode="decimal" placeholder="0" aria-label="Coins total" value={form.data.coins} onChange={e => form.setData('coins', e.target.value)}/><output>{form.data.coins ? amount(form.data.coins) : '—'}</output></label>
            </div> : <Field label="Total physical cash (PKR)"><input required type="number" min="0" max={maxAmount} step=".01" inputMode="decimal" value={form.data.amount} onChange={e => form.setData('amount', e.target.value)} placeholder="0.00"/></Field>}
            <div className="recon-total"><span>Total counted</span><output>{cashTotal(current)}</output></div>
            {current < applied && <Notice tone="red">The count cannot be lower than the cash already verified ({rs(applied)}).</Notice>}
            <Errors errors={form.errors}/>
            <div className="recon-actions"><button type="submit" className="recon-button recon-primary" disabled={form.processing || !validTotal || current < applied || current > maxAmount * 100}><Check/> Save cash count</button>{saved !== null && <button type="button" className="recon-button" onClick={() => { setEditing(false); form.clearErrors(); }}>Cancel recount</button>}</div>
        </form> : <><div className="recon-total recon-saved"><span>Counted</span><strong>{saved === null ? 'Not counted' : cashTotal(saved)}</strong></div>{editable && <p className="recon-muted recon-no-print">Physical count saved · <button className="recon-text-link" type="button" onClick={() => { setMode('total'); form.setData('amount', decimal(saved ?? 0)); setEditing(true); }}>Recount</button></p>}</>}
        <div className={counting ? 'recon-no-print' : undefined}>
            <dl className="recon-comparison">{compare.map(([label, value, color]) => <div key={label}><dt>{label}</dt><span aria-hidden="true" className="recon-meter"><i style={{ width: `${Math.max(0, value) / largest * 100}%`, backgroundColor: color }}/></span><dd>{label === 'Counted' && saved === null ? '—' : cashTotal(value)}</dd></div>)}</dl>
            {saved === null && (!counting || !current) ? <Notice tone="neutral">Count the cash first. Posted cash cannot exceed the counted amount.</Notice> : difference === 0 ? <Notice tone="green">{counting ? 'Count matches reported cash. Save it before posting.' : 'Counted cash matches reported cash.'}</Notice> : difference < 0 ? <Notice tone="red"><strong>{rs(-difference)} short</strong> against reported cash. Review individual reports before posting.</Notice> : <Notice tone="amber"><strong>{rs(difference)} more</strong> than reported. Check for an unreported collection before closing.</Notice>}
        </div>
        {counting && <p className="recon-print-only">Reported cash {rs(reported)} · Saved count {saved === null ? 'not counted' : cashTotal(saved)} · Posted cash {rs(posted)}</p>}
        {!counting && matchingIds.length > 0 && <MatchingCash key={matchingIds.join(',')} id={day.id} ids={matchingIds} value={matchingTotal} accounts={cashAccounts(accounts)}/>}
    </aside>;
}

function MatchingCash({ id, ids, value, accounts }: { id: number; ids: number[]; value: number; accounts: Account[] }) {
    const form = useForm({ account_id: accounts.length === 1 ? String(accounts[0].id) : '', collection_ids: ids });
    return <form className="recon-matching recon-no-print" onSubmit={e => { e.preventDefault(); form.post(`${endpoint}/${id}/post-matching-cash`, { preserveScroll: true, errorBag: `batch-${id}` }); }}>
        <h3>Post matching cash</h3><p>{ids.length} cash report{ids.length === 1 ? '' : 's'} ready. This records an allocated receipt for each report. Bank transfers are reviewed separately.</p>
        <Field label="Receiving cash account"><AccountSelect accounts={accounts} value={form.data.account_id} required onChange={value => form.setData('account_id', value)}/></Field>
        <Errors errors={form.errors}/>
        <button type="submit" className="recon-button recon-success" disabled={form.processing || !form.data.account_id}><Check/> Post cash receipts · {cashTotal(value)}</button>
    </form>;
}

function AccountSelect({ accounts, value, onChange, required, 'aria-labelledby': label }: { accounts: Account[]; value: string; onChange: (value: string) => void; required: boolean; 'aria-labelledby'?: string }) {
    return <select aria-labelledby={label} required={required} value={value} onChange={e => onChange(e.target.value)}><option value="">{accounts.length ? 'Select account' : 'No eligible receiving accounts'}</option>{accounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}</select>;
}

export function ReconciliationVerification({ row, room, counted, accounts, canRequest }: { row: Row; room: number; counted: number | null; accounts: Account[]; canRequest: boolean }) {
    const isCash = row.method === 'cash';
    const isOnline = row.method === 'online';
    const accountOptions = isCash ? cashAccounts(accounts) : accounts.filter(account => account.kind === 'bank');
    const outstanding = due(row);
    const opening = Boolean(row.payment_id || Number(row.included_in_opening));
    const form = useForm({ amount: decimal(opening ? reported(row) : Math.min(reported(row), outstanding)), account_id: accountOptions.length === 1 ? String(accountOptions[0].id) : '', reference: row.reference ?? '', notes: '', shortage_approval_id: '' });
    const value = paisa(form.data.amount);
    const diff = value - reported(row);
    const shortage = Boolean(form.data.shortage_approval_id);
    const receipt = value > 0 || shortage;
    const rules = [
        ...(isCash && receipt ? [[counted !== null, counted === null ? 'Count cash first' : `Cash counted (${rs(counted)})`], [value <= room, `Within counted cash left to post (${rs(room)})`]] as const : []),
        ...(opening ? [[diff === 0 && !shortage, 'Must match the historical receipt or locked opening']] as const : [[value >= 0 && value <= outstanding, `Not more than outstanding (${rs(outstanding)})`]] as const),
        [diff === 0 || form.data.notes.trim() !== '', diff === 0 ? 'Matches reported amount' : `Reason for ${diff > 0 ? '+' : ''}${rs(diff)} adjustment${form.data.notes.trim() ? ' entered' : ' required'}`],
        ...(isOnline && receipt ? [[form.data.reference.trim() !== '', 'Verified bank reference required']] as const : []),
    ] as const;
    const valid = form.data.amount !== '' && value <= maxAmount * 100 && (!receipt || Boolean(form.data.account_id)) && rules.every(([ok]) => ok);

    return <form className="recon-verify recon-no-print" onSubmit={e => { e.preventDefault(); form.post(`${endpoint}/collection/${row.id}`, { preserveScroll: true, errorBag: `report-${row.id}` }); }}>
        <h3>Step 2 · Verify &amp; post</h3>
        {row.method !== 'none' ? <>
            <div className="recon-verify-fields">
                <div><Field label="Verified amount (PKR)"><input required type="number" min="0" max={maxAmount} step=".01" inputMode="decimal" value={form.data.amount} onChange={e => form.setData('amount', e.target.value)}/></Field>
                    <div className="recon-shortcuts"><button type="button" onClick={() => form.setData('amount', decimal(reported(row)))}>Reported {amount(reported(row) / 100)}</button>{outstanding > 0 && outstanding !== reported(row) && !opening && <button type="button" onClick={() => form.setData('amount', decimal(outstanding))}>Outstanding {amount(outstanding / 100)}</button>}</div></div>
                <Field label="Receiving account"><AccountSelect accounts={accountOptions} value={form.data.account_id} required={receipt} onChange={value => form.setData('account_id', value)}/></Field>
                <Field label={isOnline ? 'Verified bank reference' : 'Reference (optional)'}><input required={isOnline && receipt} maxLength={200} placeholder={isOnline ? 'Transaction number' : 'Receipt book number'} value={form.data.reference} onChange={e => form.setData('reference', e.target.value)}/></Field>
                <div className="recon-reason"><Field label={diff !== 0 ? 'Reason for adjustment (required)' : 'Reason for adjustment (optional)'}><input required={diff !== 0} maxLength={1500} value={form.data.notes} onChange={e => form.setData('notes', e.target.value)} placeholder="Why does the verified amount differ?"/></Field></div>
                {isCash && !opening && <div><Field label="Approved cash shortage # (optional)"><input type="number" min="1" step="1" inputMode="numeric" value={form.data.shortage_approval_id} onChange={e => form.setData('shortage_approval_id', e.target.value)}/></Field>{canRequest && <Link className="recon-text-link" href={`/finance-approvals?kind=shortage&collection_id=${row.id}`}>Request shortage approval</Link>}</div>}
            </div>
            <ul className="recon-checks">{rules.map(([ok, label]) => <li key={label} data-ok={ok}>{ok ? <Check size={15}/> : <X size={15}/>} {label}</li>)}</ul>
        </> : <p className="recon-muted">The salesman reported this delivery without payment. Confirming it does not create a receipt.</p>}
        <Errors errors={form.errors}/>
        <div className="recon-verify-actions">
            {row.method !== 'none' && !opening && value > 0 && <button type="button" className="recon-button recon-decline" onClick={() => form.setData({ ...form.data, amount: '0.00', shortage_approval_id: '' })}><X/> Review without payment</button>}
            <button type="submit" className="recon-button recon-success" disabled={form.processing || !valid}><Check/> {receipt ? `Record payment${shortage ? '' : ` · ${cashTotal(value)}`}` : 'Confirm no payment'}</button>
        </div>
    </form>;
}
