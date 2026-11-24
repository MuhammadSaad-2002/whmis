import { type PaginatedData } from '@/components/paginator';
import { SearchField } from '@/components/ui/search-field';
import { WorkspaceRecordLink } from '@/components/workspace/record-link';
import { useListKeyboardNav } from '@/hooks/use-list-keyboard-nav';
import { usePermissions } from '@/hooks/use-permissions';
import AppLayout from '@/layouts/app-layout';
import { money, shiftDate, shortDate, totalMoney } from '@/lib/format';
import { Head, Link, router } from '@inertiajs/react';
import { Building2, Eye, List, ListFilter, Plus, Printer } from 'lucide-react';
import { type ChangeEvent, type ReactNode, useEffect, useRef, useState } from 'react';
import '../sales/invoice-list.css';

const tabs = [['all', 'All'], ['draft', 'Draft'], ['posted', 'Posted'], ['cancelled', 'Cancelled']] as const;
const columns = [
    ['invoice', 'Invoice #'], ['reference', 'Supplier Inv #'], ['supplier', 'Supplier'], ['date', 'Date'],
    ['type', 'Type'], ['total', 'Total'], ['margin', 'Margin'],
] as const;
const presets = ['7', '30', '90', 'all'] as const;
const pageSizes = [10, 15, 25, 50];

type Status = Exclude<(typeof tabs)[number][0], 'all'>;
type Sort = (typeof columns)[number][0];
type Preset = (typeof presets)[number];
type Filters = {
    search?: string; company_id?: string | number; status?: Status; purchase_type?: 'cash' | 'credit';
    from?: string; to?: string; sort?: Sort; direction?: 'asc' | 'desc'; per_page?: string;
};
type Invoice = {
    id: number; invoice_number: string; supplier_invoice_number: string | null; invoice_date: string;
    purchase_type: 'cash' | 'credit'; status: Status; total_amount: string; total_margin: string;
    company: { id: number; name: string } | null;
};
type Props = {
    invoices: PaginatedData<Invoice> & { per_page: number };
    companies: { id: number; name: string }[];
    filters: Filters;
    summary: { gross: number; returns: number; net: number; drafts_total: number };
    counts: Record<(typeof tabs)[number][0], number>;
    today: string;
};

function dateRange(preset: Preset, today: string) {
    return preset === 'all' ? { from: undefined, to: undefined } : { from: shiftDate(today, 1 - Number(preset)), to: today };
}

function relativeDate(date: string, today: string) {
    const days = (Date.parse(today) - Date.parse(date.slice(0, 10))) / 86_400_000;
    if (days === 0) return 'today';
    if (days === 1) return 'yesterday';
    if (days === -1) return 'tomorrow';
    return days < 0 ? `in ${-days} days` : `${days} days ago`;
}

function countLabel(count: number, label: string) {
    return `${count.toLocaleString('en-PK')} ${label}${count === 1 ? '' : 's'}`;
}

function Kpi({ title, value, color, tone, children }: { title: string; value: number; color: string; tone?: string; children: ReactNode }) {
    return <div className="card kpi">
        <div className="lbl"><i style={{ background: color }} />{title}</div>
        <div className="val num" style={{ color: tone }}>{totalMoney(value)}</div>
        <div className="foot">{children}</div>
    </div>;
}

export default function PurchasesIndex({ invoices, companies, filters, summary, counts, today }: Props) {
    const { can } = usePermissions();
    const [search, setSearch] = useState(filters.search ?? '');
    const [dates, setDates] = useState({ from: filters.from ?? '', to: filters.to ?? '' });
    const [dense, setDense] = useState(false);
    const [loading, setLoading] = useState(false);
    const searchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const inverted = Boolean(dates.from && dates.to && dates.from > dates.to);
    const activeStatus = filters.status ?? 'all';
    const hasFilters = Boolean(filters.search?.trim() || filters.company_id || filters.status || filters.purchase_type || filters.from || filters.to);
    const sort = filters.sort ?? 'date';
    const direction = filters.direction ?? 'desc';
    const activePreset = presets.find((preset) => {
        const range = dateRange(preset, today);
        return (range.from ?? '') === dates.from && (range.to ?? '') === dates.to;
    });
    const { searchRef, onSearchKeyDown, rowProps } = useListKeyboardNav({
        rowCount: invoices.data.length,
        onActivate: (index) => router.visit(route('purchases.edit', invoices.data[index].id, false)),
        autoFocus: false,
    });

    useEffect(() => { setSearch(filters.search ?? ''); }, [filters.search]);
    useEffect(() => { setDates({ from: filters.from ?? '', to: filters.to ?? '' }); }, [filters.from, filters.to]);
    useEffect(() => () => clearTimeout(searchTimer.current), []);

    function visit(next: Filters, page = 1, replace = false) {
        clearTimeout(searchTimer.current);
        router.get(route('purchases.index', {}, false), { ...next, page: page === 1 ? undefined : page }, {
            only: ['invoices', 'filters', 'counts', 'summary', 'today'], preserveState: true, preserveScroll: true, replace,
            onStart: () => setLoading(true), onFinish: () => setLoading(false),
        });
    }

    const change = (next: Partial<Filters>) => visit({ ...filters, search: search.trim() || undefined, ...next });

    function updateSearch(event: ChangeEvent<HTMLInputElement>) {
        const value = event.target.value;
        setSearch(value);
        clearTimeout(searchTimer.current);
        searchTimer.current = setTimeout(() => {
            if ((filters.search ?? '') !== value.trim()) visit({ ...filters, search: value.trim() || undefined }, 1, true);
        }, 300);
    }

    function updateDates(next: typeof dates) {
        setDates(next);
        if (!next.from || !next.to || next.from <= next.to) change({ from: next.from || undefined, to: next.to || undefined });
    }

    function clearFilters() {
        setSearch('');
        setDates({ from: '', to: '' });
        visit({ sort: filters.sort, direction: filters.direction, per_page: filters.per_page });
    }

    function sortBy(key: Sort) {
        change({ sort: key, direction: key === sort ? (direction === 'asc' ? 'desc' : 'asc') : (['date', 'margin', 'total'].includes(key) ? 'desc' : 'asc') });
    }

    const visiblePages = [...new Set([1, invoices.current_page - 1, invoices.current_page, invoices.current_page + 1, invoices.last_page])]
        .filter((page) => page >= 1 && page <= invoices.last_page).sort((a, b) => a - b);

    return <AppLayout>
        <Head title="Purchase Invoices" />
        <div className="purchase-invoices" aria-busy={loading}>
            <section className="hero">
                <div className="intro"><h1>Purchase Invoices</h1>
                    <p className="sub">Supplier invoices · {countLabel(counts.all, 'matching invoice')} · {countLabel(counts.draft, 'draft')} awaiting posting</p>
                </div>
                <div className="sp" />
                {can('purchases.create') && <Link className="hbtn pri" href={route('purchases.create', {}, false)}><Plus className="i" />New Purchase</Link>}
            </section>

            <section className="kpis" aria-label="Purchase summary">
                <Kpi title="Gross Purchases" value={summary.gross} color="#1f4e79">{countLabel(invoices.total, 'invoice')} · avg {money(invoices.total ? summary.gross / invoices.total : 0)}</Kpi>
                <Kpi title="Returns" value={summary.returns} color="#dc2626" tone="var(--red)">By supplier and return date</Kpi>
                <Kpi title="Net Purchases" value={summary.net} color="#0f8f80" tone={summary.net < 0 ? 'var(--red)' : 'var(--teal)'}>Gross less returns</Kpi>
                <Kpi title="Unposted Drafts" value={summary.drafts_total} color="#e3a008"><span className="chip a">{counts.draft}</span>Not yet in the ledger</Kpi>
            </section>

            <section className="card list" aria-label="Purchase invoice list">
                <div className="tabs" role="group" aria-label="Filter by invoice status">
                    {tabs.filter(([key]) => key !== 'cancelled' || counts.cancelled > 0 || activeStatus === key).map(([key, title]) =>
                        <button key={key} className={`tab ${activeStatus === key ? 'on' : ''}`} type="button" aria-pressed={activeStatus === key}
                            onClick={() => change({ status: key === 'all' ? undefined : key })}>{title}<span className="ct">{counts[key]}</span></button>)}
                </div>
                <div className="filters">
                    <SearchField ref={searchRef} onKeyDown={onSearchKeyDown} maxLength={120} aria-label="Search purchase invoices" placeholder="Invoice # or supplier" value={search} onChange={updateSearch} />
                    <label className="fld choice"><Building2 className="i" aria-hidden="true" /><select aria-label="Supplier" value={filters.company_id ?? ''} onChange={(event) => change({ company_id: event.target.value || undefined })}>
                        <option value="">All suppliers</option>{companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
                    </select></label>
                    <label className="fld choice"><ListFilter className="i" aria-hidden="true" /><select aria-label="Purchase type" value={filters.purchase_type ?? ''}
                        onChange={(event) => change({ purchase_type: event.target.value ? (event.target.value as Filters['purchase_type']) : undefined })}>
                        <option value="">All types</option><option value="cash">Cash</option><option value="credit">Credit</option>
                    </select></label>
                    <label className="fld date-field"><small>From</small><input type="date" value={dates.from} onChange={(event) => updateDates({ ...dates, from: event.target.value })} /></label>
                    <label className="fld date-field"><small>To</small><input aria-invalid={inverted} type="date" value={dates.to} onChange={(event) => updateDates({ ...dates, to: event.target.value })} /></label>
                    <div className="presets" role="group" aria-label="Invoice date presets">
                        {presets.map((preset) => <button key={preset} type="button" aria-pressed={activePreset === preset} className={activePreset === preset ? 'on' : ''}
                            onClick={() => {
                                const range = dateRange(preset, today);
                                setDates({ from: range.from ?? '', to: range.to ?? '' });
                                change(range);
                            }}>{preset === 'all' ? 'All' : `${preset}D`}</button>)}
                    </div>
                    {hasFilters && <button type="button" className="clear" onClick={clearFilters}>Clear filters</button>}<div className="fsp" />
                    <button type="button" className="dens" title="Toggle row density" aria-label="Compact rows" aria-pressed={dense} onClick={() => setDense((value) => !value)}><List className="i" /></button>
                    {inverted && <p className="filter-error" role="alert">To date must be on or after From date.</p>}
                </div>
                <div className="tblwrap" tabIndex={0} role="region" aria-label="Purchase invoices table">
                    <table className={dense ? 'dense' : undefined}>
                        <thead><tr>
                            {columns.map(([key, label]) => <th key={key} scope="col" className={`s ${sort === key ? 'act' : ''} ${key === 'total' || key === 'margin' ? 'r' : ''}`}
                                aria-sort={sort === key ? (direction === 'asc' ? 'ascending' : 'descending') : undefined}>
                                <button className="sort" type="button" onClick={() => sortBy(key)}>{label}<span className="ar" aria-hidden="true">{sort === key ? (direction === 'asc' ? '↑' : '↓') : '↕'}</span></button>
                            </th>)}
                            <th scope="col">Status</th><th scope="col" className="r acts-head">Actions</th>
                        </tr></thead>
                        <tbody>
                            {!invoices.data.length && <tr><td colSpan={columns.length + 2} className="empty">{hasFilters ? 'No purchase invoices match these filters.' : 'No purchase invoices found.'}</td></tr>}
                            {invoices.data.map((invoice, index) => {
                                const href = route('purchases.edit', invoice.id, false);
                                const type = invoice.purchase_type === 'cash' ? 'Cash' : 'Credit';
                                return <tr key={invoice.id} {...rowProps(index)} onClick={(event) => {
                                    if (event.target instanceof Element && !event.target.closest('a,button')) router.visit(href);
                                }}>
                                    <td className="inv"><WorkspaceRecordLink href={href} number={invoice.invoice_number} /></td>
                                    <td className={invoice.supplier_invoice_number ? undefined : 'muted'}>{invoice.supplier_invoice_number || '—'}</td>
                                    <td className="cust"><b>{invoice.company?.name ?? '—'}</b></td>
                                    <td className="date">{shortDate(invoice.invoice_date.slice(0, 10))}<small className="muted">{relativeDate(invoice.invoice_date, today)}</small></td>
                                    <td><span className={`type ${type}`}><i />{type}</span></td>
                                    <td className="r num number-cell">{totalMoney(invoice.total_amount)}</td>
                                    <td className={`r num ${Number(invoice.total_margin) < 0 ? 'neg' : ''}`}>{totalMoney(invoice.total_margin)}</td>
                                    <td><span className={`st ${invoice.status}`}>{invoice.status}</span></td>
                                    <td className="acts-cell"><div className="acts">
                                        <Link className="ib" title="Open invoice" aria-label={`Open ${invoice.invoice_number}`} href={href}><Eye className="i" /></Link>
                                        <a className="ib" title="Print invoice PDF" aria-label={`Print ${invoice.invoice_number}`} href={route('purchases.print', invoice.id, false)} target="_blank" rel="noopener"><Printer className="i" /></a>
                                    </div></td>
                                </tr>;
                            })}
                        </tbody>
                        {invoices.total > 0 && <tfoot><tr>
                            <td colSpan={5}>Gross total · {countLabel(invoices.total, 'invoice')}</td><td className="r num">{totalMoney(summary.gross)}</td><td colSpan={3} />
                        </tr></tfoot>}
                    </table>
                </div>
                <div className="pager">
                    <span>{invoices.total ? `${invoices.from}–${invoices.to} of ${invoices.total}` : '0 results'}</span>
                    <label>· Rows <select aria-label="Rows per page" value={invoices.per_page} onChange={(event) => change({ per_page: event.target.value })}>
                        {pageSizes.map((size) => <option key={size} value={size}>{size}</option>)}
                    </select></label><div className="sp" />
                    <nav className="pg" aria-label="Pages">
                        <button type="button" disabled={invoices.current_page <= 1} onClick={() => visit(filters, invoices.current_page - 1)}>‹ Prev</button>
                        {visiblePages.map((page, index) => <span className="pg-entry" key={page}>
                            {index > 0 && page - visiblePages[index - 1] > 1 && <span className="muted">…</span>}
                            <button type="button" aria-current={invoices.current_page === page ? 'page' : undefined} className={invoices.current_page === page ? 'on' : ''} onClick={() => visit(filters, page)}>{page}</button>
                        </span>)}
                        <button type="button" disabled={invoices.current_page >= invoices.last_page} onClick={() => visit(filters, invoices.current_page + 1)}>Next ›</button>
                    </nav>
                </div>
            </section>
        </div>
    </AppLayout>;
}
