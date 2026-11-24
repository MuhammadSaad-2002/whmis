import { Paginator, type PaginatedData } from '@/components/paginator';
import { SearchField } from '@/components/ui/search-field';
import { usePermissions } from '@/hooks/use-permissions';
import AppLayout from '@/layouts/app-layout';
import { amount, money, roundedTotalMoney, shortDate } from '@/lib/format';
import { Head, Link, router } from '@inertiajs/react';
import { ChevronDown, CircleAlert, CreditCard, Download, FileText, MessageCircle, MessageSquare, Phone, Printer } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { FollowUpDrawer } from './collection-follow-up';
import { aging, contactNumber, DueBadge, dueDescription, flags, followUpLabel, lastContact, overdueDays, shortDay, type AgingKey, type CollectionRow, type Flag, type Summary } from './collections-ui';
import './collections.css';

type Filters = {
    search?: string; bucket?: AgingKey | 'all' | 'overdue' | 'follow_up'; flag?: Flag;
    sort?: 'overdue' | 'balance' | 'due'; view?: 'customer' | 'invoice';
};
type CustomerSummary = Summary & { id: number };

export default function Collections({ invoices, filters, summary, customers, today }: {
    invoices: PaginatedData<CollectionRow>; filters: Filters; summary: Summary; customers: CustomerSummary[]; today: string;
}) {
    const { can } = usePermissions();
    const [search, setSearch] = useState(filters.search ?? '');
    const [collapsed, setCollapsed] = useState(new Set<number>());
    const [selected, setSelected] = useState<CollectionRow | null>(null);
    const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const searchRef = useRef(search);
    const filteredRows = useMemo(() => {
        const groups = new Map<number, CollectionRow[]>();
        for (const row of invoices.data) {
            const rows = groups.get(row.customer_id) ?? [];
            rows.push(row);
            groups.set(row.customer_id, rows);
        }
        return groups;
    }, [invoices.data]);
    const view = filters.view ?? 'customer';
    const bucket = filters.bucket === 'all' ? undefined : filters.bucket;
    const hasFilters = !!(bucket || filters.flag || filters.search);
    const canManage = can('collections.manage');

    useEffect(() => () => clearTimeout(timer.current), []);
    useEffect(() => {
        if (timer.current === undefined) {
            searchRef.current = filters.search ?? '';
            setSearch(searchRef.current);
        }
    }, [filters.search]);

    function apply(delta: Filters = {}) {
        clearTimeout(timer.current);
        timer.current = undefined;
        const query = { ...filters, search: searchRef.current.trim() || undefined, ...delta };
        router.get(route('collections.index', {}, false), query, { preserveState: true, preserveScroll: true, replace: true });
    }

    function changeSearch(value: string) {
        searchRef.current = value;
        setSearch(value);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => apply(), 220);
    }

    function changeBucket(option: AgingKey) {
        apply({ bucket: bucket === option ? undefined : option });
    }

    function toggleGroup(id: number) {
        setCollapsed(current => {
            const updated = new Set(current);
            if (updated.has(id)) updated.delete(id);
            else updated.add(id);
            return updated;
        });
    }

    return <AppLayout>
        <Head title="Collections & Recovery" />
        <main className="collections-theme collections-page">
            <section className="hero" aria-label="Outstanding collections summary">
                <div className="htop">
                    <div><h1>Collections &amp; Recovery</h1><p className="sub">Live invoice balances after completed payment allocations and posted return credits.</p></div>
                    <span className="sp" />
                    <a className="hbtn" href={route('collections.csv', filters, false)} download><Download className="i" aria-hidden="true" />Export CSV</a>
                    <a className="hbtn" href={route('collections.pdf', filters, false)} target="_blank" rel="noreferrer"><Printer className="i" aria-hidden="true" />Print</a>
                </div>
                <div className="total">
                    <div className="big">
                        <small>Outstanding</small><strong className="num">{roundedTotalMoney(summary.outstanding)}</strong>
                        <p>{summary.invoices} {summary.invoices === 1 ? 'invoice' : 'invoices'} · {summary.customers} {summary.customers === 1 ? 'customer' : 'customers'} · {roundedTotalMoney(summary.overdue)} overdue</p>
                    </div>
                    <div className="aging">
                        <div className="abar" aria-hidden="true">
                            {aging.filter(([key]) => summary.aging[key].amount > 0).map(([key, title, color]) =>
                                <span key={key} title={`${title}: ${roundedTotalMoney(summary.aging[key].amount)}`}
                                    style={{ background: color, flexGrow: summary.aging[key].amount }} onClick={() => changeBucket(key)} />)}
                        </div>
                        <div className="aleg" role="group" aria-label="Filter by invoice age">
                            {aging.map(([key, title, color]) => <button key={key} type="button" aria-pressed={bucket === key} onClick={() => changeBucket(key)}>
                                <i aria-hidden="true" style={{ background: color }} />{title} <b className="num">{roundedTotalMoney(summary.aging[key].amount)}</b>
                            </button>)}
                        </div>
                    </div>
                </div>
            </section>

            <div className="rules">
                <span className="rule"><CreditCard className="i" aria-hidden="true" />Unallocated customer credit isn’t included here</span>
                <span className="rule"><FileText className="i" aria-hidden="true" />Reconcile the customer statement before asking for payment</span>
                <span className="rule"><CircleAlert className="i" aria-hidden="true" />A promise to pay is not a receipt</span>
            </div>

            <div className="tbar" aria-label="Collection filters">
                <SearchField className="collections-search" aria-label="Search invoice or customer" placeholder="Invoice or customer…" value={search}
                    maxLength={100} onChange={event => changeSearch(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.nativeEvent.isComposing) apply(); }} />
                <div className="chips" role="group" aria-label="Collections status">
                    <button className="chip" type="button" aria-pressed={!bucket && !filters.flag} onClick={() => apply({ bucket: undefined, flag: undefined })}>All<b>{summary.invoices}</b></button>
                    {aging.filter(([key]) => summary.aging[key].count > 0 || bucket === key).map(([key, label, color]) =>
                        <button className="chip" type="button" key={key} aria-pressed={bucket === key} onClick={() => changeBucket(key)}>
                            <i aria-hidden="true" style={{ background: color }} />{label}<b>{summary.aging[key].count}</b>
                        </button>)}
                    {flags.map(([key, label]) => <button className="chip" type="button" key={key} aria-pressed={filters.flag === key}
                        onClick={() => apply({ flag: filters.flag === key ? undefined : key })}>{label}<b>{summary.flags[key]}</b></button>)}
                    {(bucket === 'overdue' || bucket === 'follow_up') && <button className="chip" type="button" aria-pressed onClick={() => apply({ bucket: undefined })}>
                        {bucket === 'overdue' ? 'Overdue' : 'Follow-up due'}
                    </button>}
                </div>
                <span className="sp" />
                <select className="sort" aria-label="Sort collections" value={filters.sort ?? 'overdue'} onChange={e => apply({ sort: e.target.value as Filters['sort'] })}>
                    <option value="overdue">Most overdue first</option><option value="balance">Largest balance first</option><option value="due">Due date</option>
                </select>
                <div className="seg" role="group" aria-label="Group collections by">
                    <button type="button" aria-pressed={view === 'customer'} onClick={() => apply({ view: undefined })}>By customer</button>
                    <button type="button" aria-pressed={view === 'invoice'} onClick={() => apply({ view: 'invoice' })}>By invoice</button>
                </div>
                {hasFilters && <button type="button" className="clear" onClick={() => {
                    searchRef.current = ''; setSearch(''); apply({ search: undefined, bucket: undefined, flag: undefined });
                }}>Clear filters</button>}
            </div>

            {invoices.data.length === 0 ? <div className="empty"><strong>Nothing matches</strong>No outstanding invoices for these filters.</div>
                : view === 'invoice' ? <div className="flat"><InvoiceTable rows={invoices.data} today={today} showCustomer onFollowUp={setSelected} canManage={canManage} /></div>
                    : customers.map(customer => {
                        const rows = filteredRows.get(customer.id);
                        if (!rows?.length) return null;
                        return <CustomerGroup key={customer.id} summary={customer} rows={rows} today={today} expanded={!collapsed.has(customer.id)}
                            toggle={() => toggleGroup(customer.id)} onFollowUp={setSelected} canManage={canManage} canViewStatement={can('ledger.view')} />;
                    })}
            <Paginator meta={invoices} />
        </main>
        {selected && <FollowUpDrawer key={selected.id} row={selected} today={today} close={() => setSelected(null)} />}
    </AppLayout>;
}

function CustomerGroup({ summary, rows, today, expanded, toggle, onFollowUp, canManage, canViewStatement }: {
    summary: CustomerSummary; rows: CollectionRow[]; today: string; expanded: boolean; toggle: () => void;
    onFollowUp: (row: CollectionRow) => void; canManage: boolean; canViewStatement: boolean;
}) {
    const oldest = rows.reduce((earlier, row) => row.due_on < earlier.due_on ? row : earlier);
    const shown = rows.reduce((sum, row) => sum + Math.round(row.outstanding * 100), 0) / 100;
    const customer = oldest.customer;
    const name = customer.name ?? 'Customer';
    const initials = (name.replace(/pharmacy/i, '').trim() || name).split(/\s+/).map(word => word[0]).join('').slice(0, 2).toUpperCase();
    const days = summary.oldest_due ? overdueDays(summary.oldest_due, today) : 0;
    const risk = days > 90 ? 'High risk' : days > 60 ? 'Watch' : 'Current';
    const phone = contactNumber(customer.phone);
    const message = `Assalam o Alaikum, this is a reminder from Tradentra that ${money(summary.outstanding)} is outstanding on ${summary.invoices} invoice(s), oldest due ${shortDate(summary.oldest_due)}. Please let us know when we can collect. Thank you.`;
    const tableId = `collection-customer-${summary.id}`;

    return <article className="cust">
        <button className="chd" type="button" aria-expanded={expanded} aria-controls={tableId} onClick={toggle}>
            <span className="who">
                <span className="av" aria-hidden="true" style={{ background: summary.id % 2 ? '#1f4e79' : '#0f8f80' }}>{initials}</span>
                <span><span className="name">{name.toUpperCase()}<span className="risk" data-risk={risk}>{risk}</span></span>
                    <small>{[customer.city, `${summary.invoices} open ${summary.invoices === 1 ? 'invoice' : 'invoices'}`, summary.oldest_due ? dueDescription(summary.oldest_due, today) : ''].filter(Boolean).join(' · ')}</small>
                </span>
            </span>
            <span className="mid">
                <span className="row1"><span>Overdue <b className="num">{roundedTotalMoney(summary.overdue)}</b> of {roundedTotalMoney(summary.outstanding)}</span>
                    <span>{lastContact(summary.last_contact_at)}</span></span>
                <span className="cbar" aria-hidden="true">{aging.filter(([key]) => summary.aging[key].amount > 0).map(([key, label, color]) =>
                    <span key={key} title={`${label}: ${roundedTotalMoney(summary.aging[key].amount)}`} style={{ flexGrow: summary.aging[key].amount, background: color }} />)}</span>
            </span>
            <span className="right">
                <span className="balance"><small>{rows.length !== summary.invoices ? 'Shown' : 'Outstanding'}</small><strong className="num">{roundedTotalMoney(shown)}</strong></span>
                <ChevronDown className="i chev" aria-hidden="true" />
            </span>
        </button>
        <div className="cact">
            {phone && <><a className="btn call" href={`tel:${phone}`}><Phone className="i" aria-hidden="true" />Call</a>
                <a className="btn wa" href={`https://wa.me/${phone.slice(1)}?text=${encodeURIComponent(message)}`} target="_blank" rel="noreferrer"><MessageCircle className="i" aria-hidden="true" />WhatsApp reminder</a></>}
            {canViewStatement && !customer.archived && <a className="btn" href={route('ledger.customer.pdf', summary.id, false)} target="_blank" rel="noreferrer">
                <FileText className="i" aria-hidden="true" />Statement
            </a>}
            {summary.flags.broken > 0 ? <span className="prom bad">{summary.flags.broken} broken {summary.flags.broken === 1 ? 'promise' : 'promises'}</span>
                : summary.flags.promised > 0 ? <span className="prom ok">{roundedTotalMoney(summary.promised_amount)} promised</span> : null}
            <span className="sp" />
            <button type="button" className="btn pri" onClick={() => onFollowUp(oldest)}><MessageSquare className="i" aria-hidden="true" />{canManage ? 'Log follow-up' : 'View follow-ups'}</button>
        </div>
        <div id={tableId} hidden={!expanded}>{expanded && <InvoiceTable rows={rows} today={today} onFollowUp={onFollowUp} canManage={canManage} />}</div>
    </article>;
}

function InvoiceTable({ rows, today, showCustomer, onFollowUp, canManage }: {
    rows: CollectionRow[]; today: string; showCustomer?: boolean; onFollowUp: (row: CollectionRow) => void; canManage: boolean;
}) {
    return <div className="tblwrap" role="region" aria-label="Outstanding invoices" tabIndex={0}>
        <table><thead><tr>
            <th scope="col">Invoice</th><th scope="col">Due</th><th scope="col">Status</th>
            <th scope="col" className="r">Invoice</th><th scope="col" className="r">Paid</th><th scope="col" className="r">Returns</th>
            <th scope="col">Settled</th><th scope="col" className="r">Outstanding</th><th scope="col">Last follow-up</th><th scope="col"><span className="sr-only">Action</span></th>
        </tr></thead><tbody>{rows.map(row => {
            const settled = row.total_amount > 0 ? (row.paid_amount + row.return_credit + row.applied_credit) / row.total_amount * 100 : 0;
            return <tr key={row.id}>
                <td><Link className="inv" href={route('collections.show', row.id, false)}>{row.invoice_number}</Link>
                    {showCustomer && <small className="muted customer-name">{row.customer.name?.toUpperCase()}</small>}</td>
                <td>{shortDate(row.due_on)}</td><td><DueBadge date={row.due_on} today={today} /></td>
                <td className="r num">{amount(row.total_amount)}</td><td className={`r num ${row.paid_amount ? '' : 'muted'}`}>{amount(row.paid_amount)}</td>
                <td className={`r num ${row.return_credit ? '' : 'muted'}`}>{amount(row.return_credit)}</td>
                <td><div className="paybar" title={row.applied_credit > 0 ? `Includes ${money(row.applied_credit)} applied credit` : undefined}>
                    <span className="tr" aria-hidden="true">{[[row.paid_amount, '#059669'], [row.return_credit, '#7c3aed'], [row.applied_credit, '#1f4e79']].map(([value, color]) =>
                        <span key={color} style={{ width: `${row.total_amount > 0 ? Math.max(0, Number(value) / row.total_amount * 100) : 0}%`, background: String(color) }} />)}</span>
                    <small>{Math.round(settled)}%</small>
                </div></td>
                <td className="r outv num">{amount(row.outstanding)}</td>
                <td className="last">{row.promise ? <span className={`prom ${row.flag === 'broken' ? 'bad' : 'ok'}`}>
                    {row.flag === 'broken' ? 'Broken' : 'Promised'} {money(row.promise.amount)} · {shortDay(row.promise.date)}
                </span> : row.follow_up ? <>{followUpLabel(row.follow_up.outcome)}<small>{shortDay(row.follow_up.created_at)}
                    {row.follow_up.next_follow_up && ` · next ${shortDay(row.follow_up.next_follow_up)}`}</small></> : <span className="muted">No follow-up yet</span>}</td>
                <td className="r"><button type="button" className="btn sm" onClick={() => onFollowUp(row)}>
                    <MessageSquare className="i" aria-hidden="true" />{canManage ? 'Follow up' : 'View history'}
                </button></td>
            </tr>;
        })}</tbody></table>
    </div>;
}
