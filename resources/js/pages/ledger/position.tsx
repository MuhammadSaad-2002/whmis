import { AgingBars, AgingDonut, bucketColors, bucketLabels, compactNumber, PositionBridge, share, sum } from '@/components/financial-position-charts';
import { type PaymentSelection, RecordPaymentDialog } from '@/components/record-payment-dialog';
import { useOpenInvoices } from '@/hooks/use-open-invoices';
import { usePermissions } from '@/hooks/use-permissions';
import AppLayout from '@/layouts/app-layout';
import { amount, money, shortDate } from '@/lib/format';
import { ageBucket, invoiceAge, type PaymentParties, paymentMethods, type PartyType } from '@/lib/payment-allocation';
import { type BreadcrumbItem } from '@/types';
import { Head, Link, router } from '@inertiajs/react';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronRight, CreditCard, Plus, Printer, Search } from 'lucide-react';
import { type CSSProperties, Fragment, type ReactNode, useEffect, useMemo, useState } from 'react';

interface Aging {
    current: number;
    '31_60': number;
    '61_90': number;
    over_90: number;
}

interface PartyRow {
    id: number;
    name: string;
    city: string | null;
    phone?: string | null;
    balance: number;
    aging: Aging | null;
    paid: number;
}

interface PaymentLog {
    id: number;
    number: string;
    reference_no: string | null;
    date: string;
    direction: 'in' | 'out';
    party_name: string | null;
    method: keyof typeof paymentMethods;
    amount: number;
}

interface Totals {
    employee_payable: number;
    employee_advances: number;
    payroll_expense: number;
    employee_cash_out: number;
    net_cash_flow: number;
    total_receivable: number;
    total_payable: number;
    net: number;
    received: number;
    paid: number;
}

type Range = { from: string; to: string };
type Preset = '30' | '90' | 'ytd' | '12m';

interface Props {
    data: { receivables: PartyRow[]; payables: PartyRow[]; payments: PaymentLog[]; totals: Totals };
    filters: Range;
    asOf: string;
    paymentParties: PaymentParties | null;
}

const breadcrumbs: BreadcrumbItem[] = [{ title: 'Financial Position', href: '/ledger/position' }];
const presets: [Preset, string][] = [['30', '30D'], ['90', '90D'], ['ytd', 'YTD'], ['12m', '12M']];
const buckets = (row: PartyRow) => [row.aging?.current ?? 0, row.aging?.['31_60'] ?? 0, row.aging?.['61_90'] ?? 0, row.aging?.over_90 ?? 0];
const totalBuckets = (rows: PartyRow[]) => rows.reduce((totals, party) => buckets(party).map((value, i) => totals[i] + value), [0, 0, 0, 0]);
const positiveTotal = (rows: PartyRow[]) => sum(rows.map((party) => Math.max(0, party.balance)));
const signedClass = (value: number) => value < 0 ? 'debt' : 'good';

function presetRange(preset: Preset, today: string): Range {
    const start = new Date(`${today}T00:00:00Z`);
    if (preset === 'ytd') start.setUTCMonth(0, 1);
    else if (preset === '12m') {
        const month = start.getUTCMonth();
        start.setUTCFullYear(start.getUTCFullYear() - 1);
        if (start.getUTCMonth() !== month) start.setUTCDate(0);
        start.setUTCDate(start.getUTCDate() + 1);
    } else start.setUTCDate(start.getUTCDate() - Number(preset));
    return { from: start.toISOString().slice(0, 10), to: today };
}

function Mix({ values, small = false, colors = bucketColors }: { values: number[]; small?: boolean; colors?: string[] }) {
    const total = sum(values);
    if (small && !total) return <span className="z">—</span>;
    return <div className={small ? 'mix' : 'abar'}>
        {values.map((value, index) => <span key={index} title={colors === bucketColors ? `${bucketLabels[index]}: ${money(value)}` : undefined}
            style={{ width: `${share(value, total)}%`, background: colors[index] }} />)}
    </div>;
}

function Kpi({ label, value, color, tone, footer, children }: { label: string; value: string; color: string; tone?: string; footer: ReactNode; children: ReactNode }) {
    return <div className="card kpi" style={{ '--k': color } as CSSProperties}>
        <div className="lbl">{label}</div>
        <div className={`val num ${tone ?? ''}`}>{value}</div>
        <div className="foot">{footer}</div>
        {children}
    </div>;
}

function Meter({ value, color, marker }: { value: number; color: string; marker?: number }) {
    return <div className={marker === undefined ? 'abar' : 'bar'} aria-hidden="true">
        <span style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: color }} />
        {marker !== undefined && <i style={{ left: `min(${marker}%, calc(100% - 2px))` }} />}
    </div>;
}

function Overview({ totals, ar, ap, arRows, apRows }: { totals: Totals; ar: number[]; ap: number[]; arRows: PartyRow[]; apRows: PartyRow[] }) {
    const receivable = totals.total_receivable;
    const payable = totals.total_payable;
    const coverage = share(Math.max(receivable, 0), payable);
    const netColor = totals.net < 0 ? '#dc2626' : '#059669';
    const dueCustomers = arRows.filter((row) => row.balance > 0).length;
    const ratios = [
        { label: 'AR covers AP', value: coverage, target: 100, color: '#f59e0b', note: 'Target ≥ 100%: what customers owe should cover what you owe', noValue: payable <= 0 },
        { label: 'Payables over 60 days', value: share(ap[2] + ap[3], sum(ap)), target: 25, color: '#dc2626', note: 'Target ≤ 25%: long-overdue dues risk supply terms' },
        { label: 'Receivables over 60 days', value: share(ar[2] + ar[3], sum(ar)), target: 25, color: '#14b8a6', note: 'Target ≤ 25%: measure how much is still unpaid after 60 days' },
    ];
    const staff: [string, number, string][] = [
        ['Salary Payable', totals.employee_payable, 'now'], ['Employee Advances', totals.employee_advances, 'now'],
        ['Payroll Expense', totals.payroll_expense, 'period'], ['Received − Paid', totals.received - totals.paid, 'period'],
        ['Employee Cash Out', totals.employee_cash_out, 'period'],
    ];
    return <>
        <section className="kpis" aria-label="Financial position summary">
            <Kpi label="Due from Customers" value={money(receivable)} color="#059669" tone="good"
                footer={`${arRows.length} customers · ${dueCustomers} with balance`}><Mix values={ar} /></Kpi>
            <Kpi label="Owed to Suppliers" value={money(payable)} color="#dc2626" tone="debt"
                footer={`${apRows.length} ${apRows.length === 1 ? 'supplier' : 'suppliers'} · ${share(ap[3], sum(ap)).toFixed(0)}% over 90 days`}><Mix values={ap} /></Kpi>
            <Kpi label="Net Position" value={money(totals.net)} color={netColor} tone={signedClass(totals.net)}
                footer="Receivables − payables ± employee balances">
                <Mix values={[Math.max(receivable, 0), Math.max(payable, 0)]} colors={['#14b8a6', '#f3b1b1']} />
            </Kpi>
            <Kpi label="AR / AP Coverage" value={payable > 0 ? `${coverage.toFixed(1)}%` : '—'} color="#f59e0b"
                footer={payable > 0 ? <><span className={`pill ${coverage < 100 ? 'a' : 'g'}`}>{coverage < 100 ? 'Low' : 'OK'}</span> receivables vs supplier dues</> : 'No net supplier dues'}>
                <Meter value={coverage} color="#f59e0b" />
            </Kpi>
            <Kpi label="Overdue 90+ (net)" value={money(ap[3] - ar[3])} color="#dc2626"
                footer={`AP ${compactNumber(ap[3])} vs AR ${compactNumber(ar[3])} past 90 days`}>
                <Mix values={[ar[3], Math.max(0, ap[3] - ar[3])]} colors={['#14b8a6', '#dc2626']} />
            </Kpi>
        </section>
        <section className="grid" aria-label="Employee balances and cash movement">
            <div className="card c12 staff">{staff.map(([label, value, time]) => <div key={label}>
                <small>{label}<em>{time}</em></small>
                <b className={`num ${value < 0 ? 'debt' : label === 'Received − Paid' && value > 0 ? 'good' : ''}`}>{money(value)}</b>
            </div>)}</div>
        </section>
        <section className="grid" aria-label="Financial position analysis">
            <div className="card c5">
                <div className="ch"><h3>Position Bridge</h3><span className="tag">how net position is built</span></div>
                <PositionBridge receivable={receivable} payable={payable} advances={totals.employee_advances} salary={totals.employee_payable} net={totals.net} />
            </div>
            <div className="card c4">
                <div className="ch"><h3>Aging: Receivables vs Payables</h3><div className="sp" />
                    <div className="legend"><span><i style={{ background: '#14b8a6' }} />Receivable</span><span><i style={{ background: '#e76f6f' }} />Payable</span></div>
                </div>
                <AgingBars first={ar} second={ap} />
            </div>
            <div className="card c3">
                <div className="ch"><h3>Liquidity Health</h3></div>
                {ratios.map(({ label, value, target, color, note, noValue }) => <div className="ratio" key={label}>
                    <div className="top"><span>{label}</span><b className="num">{noValue ? '—' : `${value.toFixed(1)}%`}</b></div>
                    <Meter value={value} marker={target} color={color} /><p>{note}</p>
                </div>)}
            </div>
        </section>
    </>;
}

function PartyInvoices({ type, row, asOf, pay }: { type: PartyType; row: PartyRow; asOf: string; pay?: (selection: PaymentSelection) => void }) {
    const [retry, setRetry] = useState(0);
    const lookup = useOpenInvoices(type, row.id, retry);
    const { can } = usePermissions();
    const customer = type === 'customer';
    const docs = customer ? 'invoices' : 'bills';
    const ledgerRoute = customer ? 'ledger.customer' : 'ledger.supplier';
    return <div className="in">
        <div className="detail-table">
            {lookup.status === 'loading' && <p role="status" className="muted">Loading unpaid {docs}…</p>}
            {lookup.status === 'error' && <p role="alert">Unable to load unpaid {docs}. <button className="sort" type="button" onClick={() => setRetry((n) => n + 1)}>Retry</button></p>}
            {lookup.status === 'ready' && (lookup.invoices.length ? <table aria-label={`Unpaid ${docs} for ${row.name}`}>
                <thead><tr><th>{customer ? 'Invoice' : 'Bill'}</th><th>Date</th><th className="r">Age</th><th className="r doc-original">Original</th><th className="r">Open balance</th></tr></thead>
                <tbody>{lookup.invoices.map((invoice) => {
                    const age = invoiceAge(invoice.invoice_date, asOf);
                    return <tr key={invoice.id}>
                        <td>{can(customer ? 'sales.view' : 'purchases.view') ? <Link href={route(customer ? 'sales.edit' : 'purchases.edit', invoice.id, false)}>{invoice.invoice_number}</Link> : invoice.invoice_number}</td>
                        <td>{shortDate(invoice.invoice_date)}</td><td className="r"><span className={`age b${ageBucket(age)}`}>{age} days</span></td>
                        <td className="r num doc-original">{amount(invoice.total_amount)}</td><td className="r num"><b>{amount(invoice.outstanding)}</b></td>
                    </tr>;
                })}</tbody>
            </table> : <p className="muted">No unpaid {docs}.</p>)}
        </div>
        <div className="acts">
            {pay && <button type="button" className="btn pri" onClick={() => pay({ type, id: row.id })}>{customer ? 'Receive payment' : 'Pay supplier'}</button>}
            <Link className="btn" href={route(ledgerRoute, row.id, false)}>View ledger</Link>
            {customer && <a className="btn" href={route(`${ledgerRoute}.pdf`, row.id, false)} target="_blank" rel="noreferrer">Statement PDF</a>}
        </div>
    </div>;
}

function PartySection({ type, parties, balance, aging, asOf, revision, pay }: {
    type: PartyType; parties: PartyRow[]; balance: number; aging: number[]; asOf: string; revision: number;
    pay?: (selection: PaymentSelection) => void;
}) {
    const customer = type === 'customer';
    const kind = customer ? 'customer' : 'supplier';
    const [search, setSearch] = useState('');
    const [hideCredit, setHideCredit] = useState(false);
    const [sort, setSort] = useState<{ key: 'name' | 'balance'; desc: boolean }>({ key: 'balance', desc: true });
    const [expanded, setExpanded] = useState<number | undefined>();
    const rows = useMemo(() => {
        const query = search.trim().toLowerCase();
        return parties.filter((party) => (!hideCredit || party.balance > 0) &&
            (!query || [party.name, party.city, party.phone].some((value) => value?.toLowerCase().includes(query))))
            .sort((a, b) => (sort.key === 'name' ? a.name.localeCompare(b.name) : a.balance - b.balance) * (sort.desc ? -1 : 1) || a.id - b.id);
    }, [parties, search, hideCredit, sort]);
    const tableAging = totalBuckets(rows);
    const positive = positiveTotal(parties);
    const ageTotal = sum(aging);
    const top = parties.reduce<PartyRow | undefined>((largest, party) => (!largest || party.balance > largest.balance) ? party : largest, undefined);
    function toggleSort(key: 'name' | 'balance') {
        setSort((prior) => ({ key, desc: prior.key === key ? !prior.desc : key === 'balance' }));
    }
    function sortIcon(key: 'name' | 'balance') {
        return sort.key !== key ? <ArrowUpDown className="i" /> : sort.desc ? <ArrowDown className="i" /> : <ArrowUp className="i" />;
    }
    const ageCells = (values: number[]) => values.map((value, i) => <td key={i} className={`r num age-column ${value ? i === 3 ? 'o90' : i === 2 ? 'o61' : '' : 'z'}`}>{amount(value)}</td>);
    const toggleRow = (id: number) => setExpanded((open) => open === id ? undefined : id);
    return <section className="grid" aria-label={customer ? 'Receivables' : 'Payables'}><div className="card c12">
        <div className="sech">
            <h2>{customer ? 'Receivables' : 'Payables'}</h2><span className={`pill ${customer ? 'g' : 'r'}`}>{money(balance)}</span><span className="muted">{customer ? 'Due from customers' : 'Owed to suppliers'}</span>
            <div className="sp" />
            <label className="fld"><Search className="i" /><input aria-label={`Search ${kind}`} placeholder={`Search ${kind}…`} value={search} onChange={(event) => setSearch(event.target.value)} /></label>
            {customer && <label className="tg"><input type="checkbox" checked={hideCredit} onChange={(event) => setHideCredit(event.target.checked)} />Hide credit / zero balances</label>}
        </div>
        <div className="split">
            <div className="tblwrap" tabIndex={0} role="region" aria-label={`${kind} balances`}>
                <table className="party-table">
                    <thead><tr>
                        <th className="s" aria-sort={sort.key === 'name' ? sort.desc ? 'descending' : 'ascending' : 'none'}><button className="party-toggle" type="button" onClick={() => toggleSort('name')}>{customer ? 'Customer' : 'Supplier'}{sortIcon('name')}</button></th>
                        <th className="city-column">City</th>
                        <th className="s r" aria-sort={sort.key === 'balance' ? sort.desc ? 'descending' : 'ascending' : 'none'}><button className="party-toggle" type="button" onClick={() => toggleSort('balance')}>Balance{sortIcon('balance')}</button></th>
                        {bucketLabels.map((label) => <th className="r age-column" key={label}>{label}</th>)}
                        <th className="r age-column">Aging mix</th><th className="r">{customer ? 'Received' : 'Paid'} (period)</th>
                    </tr></thead>
                    <tbody>
                        {!rows.length && <tr><td colSpan={9} className="empty">{parties.length ? 'No matching accounts.' : `No ${kind} balances or payment activity in this period.`}</td></tr>}
                        {rows.map((row) => {
                            const open = expanded === row.id;
                            return <Fragment key={row.id}>
                                <tr className={`row ${open ? 'open' : ''}`} onClick={() => toggleRow(row.id)}>
                                    <td className="pty"><button className="party-toggle" type="button" aria-expanded={open}
                                        aria-controls={open ? `${type}-documents-${row.id}` : undefined} onClick={(event) => { event.stopPropagation(); toggleRow(row.id); }}>
                                        <ChevronRight className="i chev" />{row.name}
                                    </button>{row.phone && <small>{row.phone}</small>}</td>
                                    <td className="city-column">{row.city || '—'}</td>
                                    <td className={`r num balance ${row.balance < 0 ? 'credit' : ''}`}><b>{amount(row.balance)}</b>{row.balance < 0 && <> <span className="pill g">credit</span></>}</td>
                                    {ageCells(buckets(row))}
                                    <td className="r age-column"><Mix values={buckets(row)} small /></td>
                                    <td className={`r num ${row.paid ? customer ? 'good' : 'debt' : 'z'}`}>{row.paid ? amount(row.paid) : '—'}</td>
                                </tr>
                                {open && <tr className="det" id={`${type}-documents-${row.id}`}><td colSpan={9}>
                                    <PartyInvoices key={revision} type={type} row={row} asOf={asOf} pay={pay} />
                                </td></tr>}
                            </Fragment>;
                        })}
                    </tbody>
                    <tfoot><tr><td>Total · {rows.length}</td><td className="city-column" /><td className="r num">{amount(sum(rows.map((row) => row.balance)))}</td>
                        {ageCells(tableAging)}<td className="r age-column"><Mix values={tableAging} small /></td><td className="r num">{amount(sum(rows.map((row) => row.paid)))}</td>
                    </tr></tfoot>
                </table>
            </div>
            <div className="side">
                <AgingDonut label={customer ? 'Receivable' : 'Payable'} values={aging} balance={balance} />
                <div className="aging-legend">{aging.map((value, i) => <div className="lrow" key={bucketLabels[i]}><i style={{ background: bucketColors[i] }} />
                    <span className="nm">{bucketLabels[i]}</span><span className="v num">{amount(value)}</span><span className="p">{share(value, ageTotal).toFixed(0)}%</span>
                </div>)}</div>
                <div className={`note ${!positive ? 't' : customer ? 'a' : aging[3] ? 'r' : 't'}`}>
                    {!positive ? <b>{customer ? 'No outstanding customer balances.' : 'No outstanding supplier balances.'}</b> :
                        customer && top ? <><b>{share(top.balance, positive).toFixed(0)}% sits with {top.name}</b> ({money(top.balance)}). {aging[3] > 0 && <>{money(aging[3])} is past 90 days.</>}</> :
                            aging[3] > 0 ? <b>{money(aging[3])} ({share(aging[3], ageTotal).toFixed(0)}%) is over 90 days.</b> : <b>No supplier dues past 90 days.</b>}
                </div>
            </div>
        </div>
    </div></section>;
}

function SettlementPlanner({ ar, ap, aging, net }: { ar: number; ap: number; aging: number[]; net: number }) {
    const [collectionPct, setCollectionPct] = useState(0);
    const [proposedPayment, setProposedPayment] = useState(0);
    const collected = ar * collectionPct / 100;
    const payment = Math.min(proposedPayment, ap);
    const cash = collected - payment;
    let left = payment;
    const after = [...aging];
    for (let i = after.length - 1; i >= 0 && left > 0; i--) {
        const applied = Math.min(left, after[i]);
        after[i] -= applied;
        left -= applied;
    }
    return <div className="card c7">
        <div className="ch"><h3>Settlement Planner</h3><span className="tag">what-if: collect from customers, pay suppliers</span><div className="sp" />
            <button className="btn" type="button" onClick={() => { setCollectionPct(0); setProposedPayment(0); }}>Reset</button>
        </div>
        <div className="planner">
            <div>
                <div className="sl"><label className="top" htmlFor="planner-collection"><span>Collect from customers</span><b className="num">{money(collected)} ({collectionPct}%)</b></label>
                    <input type="range" id="planner-collection" min={0} max={100} value={ar > 0 ? collectionPct : 0} disabled={ar <= 0} onChange={(event) => setCollectionPct(Number(event.target.value))} />
                    <small className="muted">AR left: {money(ar - collected)}</small>
                </div>
                <div className="sl"><label className="top" htmlFor="planner-payment"><span>Pay suppliers (oldest first)</span><b className="num">{money(payment)}</b></label>
                    <input type="range" id="planner-payment" min={0} max={ap} step="0.01" value={payment} disabled={ap <= 0} onChange={(event) => setProposedPayment(Number(event.target.value))} />
                    <small className="muted">AP left: {money(ap - payment)}</small>
                </div>
                <div className="out">
                    <div><small>Net position</small><b className={`num ${signedClass(net)}`}>{money(net)}</b><em className="muted">unchanged after cash impact</em></div>
                    <div><small>Cash impact</small><b className={`num ${signedClass(cash)}`}>{cash > 0 ? '+' : ''}{money(cash)}</b><em className="muted">collections − payments</em></div>
                    <div><small>Payables 90+</small><b className="num">{money(after[3])}</b><em className={after[3] < aging[3] ? 'good' : 'muted'}>{after[3] < aging[3] ? `▼ ${money(aging[3] - after[3])} cleared` : 'no change'}</em></div>
                </div>
            </div>
            <div><p className="planner-label">Supplier aging after payment</p><AgingBars first={aging} second={after} planner /></div>
        </div>
    </div>;
}

function PaymentsLog({ payments, filters, pay }: { payments: PaymentLog[]; filters: Range; pay?: (selection: PaymentSelection) => void }) {
    const [tab, setTab] = useState<'all' | 'in' | 'out'>('all');
    const receipts = payments.filter((payment) => payment.direction === 'in').length;
    const rows = useMemo(() => payments.filter((payment) => tab === 'all' || payment.direction === tab).reverse(), [payments, tab]);
    const tabs = [['all', 'All', payments.length], ['in', 'Receipts', receipts], ['out', 'Payments', payments.length - receipts]] as const;
    return <div className="card c5">
        <div className="ch"><h3>Payments Log</h3><span className="tag">{shortDate(filters.from)} — {shortDate(filters.to)}</span></div>
        <div className="tabs" role="group" aria-label="Filter payment activity">{tabs.map(([id, name, count]) =>
            <button type="button" className={`tab ${tab === id ? 'on' : ''}`} aria-pressed={tab === id} key={id} onClick={() => setTab(id)}>{name} <span className="pill n">{count}</span></button>)}</div>
        <div className="tblwrap log-scroll" tabIndex={0} role="region" aria-label="Payment activity">
            <table><thead><tr><th>Date</th><th>Ref #</th><th>Type</th><th>Party</th><th>Method</th><th className="r">Amount</th></tr></thead>
                <tbody>{rows.length ? rows.map((row) => <tr key={row.id}>
                    <td>{shortDate(row.date)}</td><td className="num" title={row.number}>{row.reference_no || row.number}</td><td><span className={`logtype ${row.direction}`}>{row.direction === 'in' ? 'Receipt' : 'Payment'}</span></td>
                    <td>{row.party_name ?? '—'}</td><td>{paymentMethods[row.method] ?? row.method}</td>
                    <td className={`r num ${row.direction === 'in' ? 'good' : 'debt'}`}><b>{row.direction === 'in' ? '+' : '−'}{amount(row.amount)}</b></td>
                </tr>) : <tr><td colSpan={6} className="empty">
                    <div className="ico"><CreditCard className="size-5" /></div><b>No {tab === 'in' ? 'receipts' : 'payments'} in this period</b>
                    Change the date range or record a new receipt or payment.
                    {pay && <div className="btns"><button className="btn pri" onClick={() => pay({ type: 'customer' })}>Receive payment</button><button className="btn" onClick={() => pay({ type: 'company' })}>Pay supplier</button></div>}
                </td></tr>}</tbody>
            </table>
        </div>
    </div>;
}

export default function FinancialPosition({ data, filters, asOf, paymentParties }: Props) {
    const { can } = usePermissions();
    const [dates, setDates] = useState(filters);
    const [updating, setUpdating] = useState(false);
    const [selection, setSelection] = useState<PaymentSelection>();
    const [invoiceRevision, setInvoiceRevision] = useState(0);
    const pay = can('payments.view') && can('payments.manage') && paymentParties ? setSelection : undefined;
    const dataAging = useMemo(() => ({ ar: totalBuckets(data.receivables), ap: totalBuckets(data.payables) }), [data.receivables, data.payables]);
    const currentPreset = presets.find(([preset]) => presetRange(preset, asOf).from === dates.from && dates.to === asOf)?.[0];
    const inverted = !!dates.from && !!dates.to && dates.from > dates.to;

    useEffect(() => setDates({ from: filters.from, to: filters.to }), [filters.from, filters.to]);

    function updateRange(range: Range) {
        setDates(range);
        if (range.from && range.to && range.from <= range.to) {
            router.get(route('ledger.position', {}, false), range, {
                only: ['data', 'filters', 'asOf'],
                preserveState: true,
                preserveScroll: true,
                replace: true,
                onStart: () => setUpdating(true),
                onFinish: () => setUpdating(false),
            });
        }
    }

    return <AppLayout breadcrumbs={breadcrumbs}>
        <Head title="Financial Position">
            <link head-key="financial-inter" rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" referrerPolicy="no-referrer" />
        </Head>
        <div className="financial-position" aria-busy={updating}>
            <section className="hero">
                <div className="intro"><h1>Financial Position</h1>
                    <p className="sub">Customer, supplier and employee balances. Balances are current as of <b>{shortDate(asOf)}</b>; payments and paid amounts cover the selected period.</p>
                </div>
                <div className="sp" />
                <div className="seg" role="group" aria-label="Preset periods">{presets.map(([preset, label]) =>
                    <button className={currentPreset === preset ? 'on' : ''} type="button" aria-pressed={currentPreset === preset} key={preset} onClick={() => updateRange(presetRange(preset, asOf))}>{label}</button>)}</div>
                <label className="hfld"><small>From</small><input type="date" value={dates.from} onChange={(event) => updateRange({ ...dates, from: event.target.value })} /></label>
                <label className="hfld"><small>To</small><input type="date" value={dates.to} aria-invalid={inverted} onChange={(event) => updateRange({ ...dates, to: event.target.value })} /></label>
                <a className="hbtn" href={route('ledger.position.pdf', filters, false)} target="_blank" rel="noreferrer"><Printer className="i" />Print PDF</a>
                {pay && <button className="hbtn pri" type="button" onClick={() => pay({ type: 'customer' })}><Plus className="i" />Record Payment</button>}
                {inverted && <p className="date-error" role="alert">The end date must be on or after the start date.</p>}
            </section>
            <Overview totals={data.totals} ar={dataAging.ar} ap={dataAging.ap} arRows={data.receivables} apRows={data.payables} />
            <PartySection type="customer" parties={data.receivables} balance={data.totals.total_receivable} aging={dataAging.ar} asOf={asOf} revision={invoiceRevision} pay={pay} />
            <PartySection type="company" parties={data.payables} balance={data.totals.total_payable} aging={dataAging.ap} asOf={asOf} revision={invoiceRevision} pay={pay} />
            <section className="grid" aria-label="Settlement and payments">
                <SettlementPlanner ar={positiveTotal(data.receivables)} ap={positiveTotal(data.payables)} aging={dataAging.ap} net={data.totals.net} />
                <PaymentsLog payments={data.payments} filters={filters} pay={pay} />
            </section>
        </div>
        {selection && pay && <RecordPaymentDialog selection={selection} parties={paymentParties} today={asOf} close={() => setSelection(undefined)} onRecorded={() => setInvoiceRevision((index) => index + 1)} />}
    </AppLayout>;
}
