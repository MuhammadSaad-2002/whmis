import { usePermissions } from '@/hooks/use-permissions';
import AppLayout from '@/layouts/app-layout';
import { money, shiftDate, shortDate } from '@/lib/format';
import { Head, Link, router, useForm } from '@inertiajs/react';
import { Banknote, Check, ChevronDown, ChevronLeft, ChevronRight, Clock, Download, Info, Lock, Printer } from 'lucide-react';
import { useState, type CSSProperties, type ReactNode } from 'react';
import type { Account, Day, ReconciliationProps, Row } from './daily-collections';
import { CashCount, ReconciliationVerification } from './payment-reconciliation-forms';
import { due, Notice, reported, rs } from './payment-reconciliation-ui';
import { Errors, Field, stamp } from './shared';
import './payment-reconciliation.css';

const path = '/daily-reconciliation';
const reportTime = new Intl.DateTimeFormat('en-PK', { timeZone: 'Asia/Karachi', hour: 'numeric', minute: '2-digit', hour12: true });
const steps = [['Count cash', 'Count the notes handed in'], ['Verify collections', 'Match each report to its invoice'], ['Close the day', 'Lock the reconciliation after posting']] as const;
const sum = (rows: Row[], value: (row: Row) => number | null | undefined) => rows.reduce((total, row) => total + Number(value(row) ?? 0), 0);
const verified = (row: Row) => Number(row.verified_paisa ?? 0);
const activeReceipt = (row: Row) => row.payment_status === 'completed';
const isPending = (row: Row) => !row.recorded_at;
const hasCash = (row: Row) => row.method === 'cash';

export default function PaymentReconciliation({ days, rows, date, staff, accounts, salesmanId, cashNotes, canPost, actorId }: ReconciliationProps) {
    const exportParams = new URLSearchParams({ date });
    if (salesmanId) exportParams.set('salesman_id', String(salesmanId));
    const visit = (newDate: string, staffId: string | number | null = salesmanId) => {
        if (newDate) router.get(path, { date: newDate, ...(staffId ? { salesman_id: staffId } : {}) });
    };
    const submitted = days.filter(day => day.submitted_at);
    const counted = days.length > 0 && days.every(day => day.closed_at || day.counted_cash_paisa !== null);
    const pending = rows.filter(isPending).length;
    const closed = days.length > 0 && days.every(day => day.closed_at);
    const current = !days.length ? -1 : closed ? 3 : !counted ? 0 : pending ? 1 : 2;
    const countedTotal = days.reduce((total, day) => total + Number(day.counted_cash_paisa ?? 0), 0);
    const variance = counted ? countedTotal - sum(rows.filter(hasCash), reported) : null;
    const stats = [
        ['#1f4e79', 'Reported by salesmen', rs(sum(rows, reported)), `${rows.length} reports · ${submitted.length} submitted day(s)`],
        ['#7c3aed', 'Cash counted', counted ? rs(countedTotal) : 'Not fully counted', counted ? 'Physically counted' : countedTotal ? `${rs(countedTotal)} counted so far` : 'Count cash first'],
        ['#059669', 'Posted to invoices', rs(sum(rows.filter(activeReceipt), row => verified(row) + Number(row.shortage_paisa))), 'Verified and in the customer ledger'],
        [variance === null ? '#94a3b8' : variance < 0 ? '#dc2626' : variance > 0 ? '#d97706' : '#059669', 'Cash variance', variance === null ? '—' : `${variance > 0 ? '+' : ''}${rs(variance)}`, variance === null ? 'Counted − reported cash' : variance < 0 ? 'Short against reports' : variance > 0 ? 'More than reported' : 'Counts match'],
        ['#d97706', 'Awaiting verification', pending, pending ? 'Reports to review' : 'No reports waiting'],
    ] as const;
    const byDay = new Map<number, Row[]>();
    const pendingByInvoice = new Map<number, number>();
    for (const row of rows) {
        const list = byDay.get(row.collection_day_id) ?? [];
        list.push(row);
        byDay.set(row.collection_day_id, list);
        if (isPending(row) && !row.payment_id) pendingByInvoice.set(row.sales_invoice_id, (pendingByInvoice.get(row.sales_invoice_id) ?? 0) + reported(row));
    }

    return <AppLayout><Head title="Daily Payment Reconciliation"/><main className="reconciliation">
        <header className="recon-hero">
            <div className="recon-hero-top"><div><h1>Daily Payment Reconciliation</h1><p><Clock size={15}/> <span>Pakistan business date (PKT) · <b>Reported collections don’t count as payments until verified and posted.</b></span></p></div>
                <div className="recon-actions recon-no-print">
                    <a className="recon-button" href={`${path}?${exportParams}&format=csv`}><Download/> Export CSV</a>
                    <a className="recon-button" href={`${path}?${exportParams}&format=pdf`} target="_blank" rel="noopener"><Printer/> Print PDF</a>
                </div>
            </div>
            <div className="recon-filters recon-no-print">
                <button className="recon-date-nav" type="button" aria-label="Previous day" onClick={() => visit(shiftDate(date, -1))}><ChevronLeft/></button>
                <label>Date<input aria-label="Business date" type="date" value={date} onChange={e => visit(e.target.value)}/></label>
                <button className="recon-date-nav" type="button" aria-label="Next day" onClick={() => visit(shiftDate(date, 1))}><ChevronRight/></button>
                <label>Salesman<select value={salesmanId ?? ''} onChange={e => visit(date, e.target.value)}><option value="">All salesmen</option>
                    {salesmanId && !staff.some(user => user.id === salesmanId) && <option value={salesmanId}>{days[0]?.salesman ?? 'Selected salesman'}</option>}
                    {staff.map(user => <option value={user.id} key={user.id}>{user.name}</option>)}</select></label>
            </div>
            <p className="recon-print-date">Business date: {shortDate(date)}</p>
        </header>
        <ol className="recon-steps recon-no-print" aria-label="Reconciliation progress">
            {steps.map(([title, hint], index) => <li key={title} data-step={index < current ? 'done' : index === current ? 'current' : undefined} aria-current={index === current ? 'step' : undefined}><span className="recon-step-number">{index < current ? <Check size={15}/> : index + 1}</span><div><strong>{title}</strong><small>{hint}</small></div></li>)}
        </ol>
        <div className="recon-stats">{stats.map(([color, label, value, description]) => <div className="recon-stat" key={label} style={{ '--recon-accent': color } as CSSProperties}><span>{label}</span><strong className={label === 'Cash variance' && variance !== null && variance < 0 ? 'recon-negative' : undefined}>{value}</strong><small>{description}</small></div>)}</div>
        {days.length === 0 ? <div className="recon-empty"><strong>No collections reported</strong><p>{salesmanId ? 'This salesman has not' : 'No salesman has'} reported collections for {shortDate(date)}.</p></div> :
            days.map(day => <ReconciliationDay key={day.id} day={day} date={date} rows={byDay.get(day.id) ?? []} cashNotes={cashNotes} accounts={accounts} canPost={canPost} actorId={actorId} pendingByInvoice={pendingByInvoice}/>) }
    </main></AppLayout>;
}

function ReconciliationDay({ day, date, rows, cashNotes, accounts, canPost, actorId, pendingByInvoice }: Pick<ReconciliationProps, 'date' | 'rows' | 'cashNotes' | 'accounts' | 'canPost' | 'actorId'> & { day: Day; pendingByInvoice: Map<number, number> }) {
    const { can } = usePermissions();
    const open = !!day.submitted_at && !day.closed_at && Number(day.salesman_id) !== actorId;
    const cash = rows.filter(hasCash);
    const pendingCash = cash.filter(isPending);
    const firstPending = (rows.find(row => isPending(row) && row.method !== 'none') ?? rows.find(isPending))?.id;
    const cashReported = sum(cash, reported);
    const cashPosted = sum(cash.filter(activeReceipt), verified);
    // Reversed cash remains part of the physical cash audit and caps new postings.
    const cashApplied = sum(cash, verified);
    const counted = day.counted_cash_paisa === null ? null : Number(day.counted_cash_paisa);
    const room = counted === null ? 0 : Math.max(0, counted - cashApplied);
    const warnings = [...new Map(rows.filter(row => !row.payment_id && isPending(row) && (pendingByInvoice.get(row.sales_invoice_id) ?? 0) > due(row)).map(row => [row.sales_invoice_id, row])).values()];
    const cashByInvoice = new Map<number, number>();
    for (const row of pendingCash) cashByInvoice.set(row.sales_invoice_id, (cashByInvoice.get(row.sales_invoice_id) ?? 0) + reported(row));
    const eligible = open && canPost && counted === cashReported && pendingCash.length > 0 && pendingCash.length <= 100
        && pendingCash.every(row => !row.payment_id && !Number(row.included_in_opening) && reported(row) > 0 && (cashByInvoice.get(row.sales_invoice_id) ?? 0) <= due(row))
        && cash.filter(row => !isPending(row)).every(row => activeReceipt(row) && verified(row) === reported(row) && !Number(row.shortage_paisa));
    const tone = day.closed_at ? 'green' : day.submitted_at ? 'blue' : 'neutral';
    const pending = rows.filter(isPending).length;
    return <section className="recon-day">
        <header className="recon-day-head"><span className="recon-avatar" aria-hidden="true">{day.salesman.slice(0, 1).toUpperCase()}</span><div><h2>{day.salesman}{day.revision > 1 && ` · Supplement ${day.revision - 1}`}</h2><small>{rows.length} reports · {shortDate(date)}</small></div><Pill tone={tone}>{day.closed_at ? 'Day closed' : day.submitted_at ? 'Submitted' : 'Not submitted'}</Pill>{pending > 0 && <Pill tone="amber">{pending} pending</Pill>}</header>
        <div className="recon-day-body">
            <CashCount day={day} cashNotes={cashNotes} editable={open} reported={cashReported} posted={cashPosted} applied={cashApplied} accounts={accounts} matchingIds={eligible ? pendingCash.map(row => row.id) : []} matchingTotal={sum(pendingCash, reported)}/>
            <div className="recon-collections">
                {warnings.map(row => <Notice key={row.sales_invoice_id} tone="red"><strong>Review {row.invoice_number} before posting.</strong> Pending reports total {rs(pendingByInvoice.get(row.sales_invoice_id) ?? 0)}, but only {rs(due(row))} is outstanding. Check for duplicate reports or payments already posted separately.</Notice>)}
                {rows.length === 0 ? <div className="recon-empty">No collection reports in this submission.</div> : rows.map(row => <CollectionCard key={row.id} row={row} date={date} first={row.id === firstPending} editable={open && canPost} room={room} counted={counted} accounts={accounts} canRequest={can('finance.review') && can('finance.request')} canViewSale={can('sales.view') && can('view-supplier-details')}/>)}
            </div>
        </div>
        <CloseDay day={day} editable={open} pending={pending} reported={cashReported} applied={cashApplied} canRequest={can('finance.review') && can('finance.request')}/>
    </section>;
}

function CollectionCard({ row, date, first, editable, room, counted, accounts, canRequest, canViewSale }: { row: Row; date: string; first: boolean; editable: boolean; room: number; counted: number | null; accounts: Account[]; canRequest: boolean; canViewSale: boolean }) {
    const [expanded, setExpanded] = useState(first);
    const [touched, setTouched] = useState(first);
    const pending = isPending(row);
    const posted = activeReceipt(row);
    const reversed = row.payment_status === 'cancelled';
    const reference = posted || reversed ? row.posted_reference : row.reference;
    const method = row.method === 'online' ? 'Bank transfer' : row.method === 'cash' ? 'Cash' : 'No payment';
    const time = row.created_at ? reportTime.format(new Date(row.created_at)) : null;
    return <article className="recon-collection" data-expanded={expanded}>
        <button type="button" onClick={() => { setTouched(true); setExpanded(!expanded); }} aria-expanded={expanded} aria-controls={`recon-report-${row.id}`} className="recon-report-toggle">
            <span className="recon-report-icon"><Banknote/></span><span className="recon-report-name"><strong>{row.customer}</strong><small>{row.invoice_number} · {method}{time && ` · reported ${time} PKT`}</small></span>
            <Pill tone={pending ? 'amber' : reversed ? 'red' : posted ? 'green' : 'neutral'}>{pending ? 'Pending' : reversed ? 'Reversed' : posted ? 'Posted' : row.method === 'none' ? 'No payment' : 'Not posted'}</Pill>
            <span className="recon-reported"><small>Reported</small><strong>{rs(reported(row))}</strong></span><ChevronDown className="recon-chevron"/>
        </button>
        <div className="recon-report-body" data-collapsed={!expanded} id={`recon-report-${row.id}`}>
            <dl className="recon-metrics">
                <div><dt>Invoice</dt><dd>{money(row.total_amount)}</dd></div><div><dt>Previously paid</dt><dd>{rs(Number(row.previous_paid_paisa))}</dd></div><div><dt>Posted {shortDate(date).split(' ').slice(0, 2).join(' ')}</dt><dd>{rs(Number(row.posted_on_date_paisa ?? 0))}</dd></div>
                <div><dt>Outstanding now</dt><dd className={due(row) ? 'recon-negative' : 'recon-positive'}>{rs(due(row))}</dd></div><div><dt>Verified</dt><dd>{row.verified_paisa === null ? '—' : rs(verified(row))}</dd></div>
            </dl>
            {canViewSale && <Link className="recon-text-link recon-invoice-link recon-no-print" href={`/sales/${row.sales_invoice_id}/summary`}>View invoice {row.invoice_number} →</Link>}
            {pending && editable && touched && <ReconciliationVerification row={row} room={room} counted={counted} accounts={accounts} canRequest={canRequest}/>}
            {!pending && <div className="recon-result">
                <span>{posted ? <>Posted <b>{rs(verified(row) + Number(row.shortage_paisa))}</b> · Receipt {row.payment_number}</> : reversed ? <>Receipt {row.payment_number} was reversed</> : row.method === 'none' ? 'Confirmed: no payment collected' : 'Reviewed without posting a payment'}{reference && ` · Ref ${reference}`}</span>
                {row.recorded_at && <span>Reviewed {row.reviewer ? `by ${row.reviewer} · ` : ''}{stamp(row.recorded_at)}</span>}
                {row.review_note && <span>Review note: {row.review_note}</span>}
                {Number(row.shortage_paisa) > 0 && <span>Employee shortage: {rs(Number(row.shortage_paisa))}{!reversed && canRequest && <> · <Link className="recon-text-link recon-no-print" href={`/finance-approvals?kind=shortage_repayment&collection_id=${row.id}`}>Request repayment</Link> · <Link className="recon-text-link recon-no-print" href={`/finance-approvals?kind=shortage_receipt_reverse&collection_id=${row.id}`}>Request receipt correction</Link></>}</span>}
            </div>}
        </div>
    </article>;
}

function CloseDay({ day, editable, pending, reported, applied, canRequest }: { day: Day; editable: boolean; pending: number; reported: number; applied: number; canRequest: boolean }) {
    const form = useForm({ notes: '' });
    const counted = Number(day.counted_cash_paisa ?? 0);
    const needsVariance = reported !== counted || applied !== counted;
    const waitingCount = day.counted_cash_paisa === null && reported > 0;
    if (day.closed_at) return <div className="recon-close"><Pill tone="green">Closed</Pill><span>Counted {rs(counted)} · Cash posted at reconciliation {rs(applied)}{day.variance_note && ` · ${day.variance_note}`}</span></div>;
    if (!editable) return <div className="recon-close"><Info size={16}/>{day.submitted_at ? 'Another Finance user must review your own collection day.' : 'This salesman has not submitted these reports to Finance yet.'}</div>;
    return <form className="recon-close recon-no-print" onSubmit={e => { e.preventDefault(); form.post(`${path}/${day.id}/close`, { preserveScroll: true, errorBag: `close-${day.id}` }); }}>
        <div className="recon-close-state">{waitingCount ? 'Count the cash first.' : pending ? `${pending} report${pending === 1 ? '' : 's'} still to verify.` : needsVariance ? 'An independently approved variance and an explanation are required.' : 'Ready to close.'}</div>
        {!pending && !waitingCount && needsVariance && <>
            <Field label="Variance explanation"><input required maxLength={1500} value={form.data.notes} onChange={e => form.setData('notes', e.target.value)}/></Field>
            {canRequest && <Link className="recon-button" href={`/finance-approvals?kind=close_variance&day_id=${day.id}`}>Request variance approval</Link>}
        </>}
        <button type="submit" className="recon-button recon-primary" disabled={form.processing || pending > 0 || waitingCount}><Lock/> Close the day</button>
        <div className="recon-errors"><Errors errors={form.errors}/></div>
    </form>;
}

function Pill({ tone, children }: { tone: string; children: ReactNode }) {
    return <span className="recon-pill" data-tone={tone}><i aria-hidden="true"/>{children}</span>;
}
