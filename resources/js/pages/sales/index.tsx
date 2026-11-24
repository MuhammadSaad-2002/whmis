import './invoice-list.css';
import { type PaginatedData } from '@/components/paginator';
import { SearchField } from '@/components/ui/search-field';
import { useListKeyboardNav } from '@/hooks/use-list-keyboard-nav';
import { usePermissions } from '@/hooks/use-permissions';
import AppLayout from '@/layouts/app-layout';
import { amount, money } from '@/lib/format';
import { Head, Link, router } from '@inertiajs/react';
import { Check, Download, Eye, List, ListFilter, Plus, Printer, Undo2, UserRound } from 'lucide-react';
import { type ChangeEvent, type ReactNode, useEffect, useRef, useState } from 'react';
import { InvoicePreview, type InvoiceRow, listDate, SaleStatus, SaleType, saleTypes } from './invoice-preview';

const tabs = [
    ['all', 'All'], ['draft', 'Draft'], ['posted', 'Posted'], ['returned', 'With returns'], ['zero', 'Zero margin'], ['cancelled', 'Cancelled'],
] as const;

const columns = [
    ['invoice', 'Invoice #'], ['customer', 'Customer'], ['date', 'Date'], ['type', 'Type'], ['total', 'Total'],
    ['returns', 'Returns'], ['net', 'Net'], ['profit', 'Profit'], ['margin', 'Margin'],
] as const;

type Status = Exclude<(typeof tabs)[number][0], 'all'>;
type Sort = (typeof columns)[number][0];
type Preset = '7' | '30' | '90' | 'all';
type Filters = {
    search?: string; customer_id?: string; status?: Status; sale_type?: string;
    from?: string; to?: string; sort?: Sort; direction?: 'asc' | 'desc'; per_page?: string;
};
type Summary = Record<'gross' | 'returns' | 'net' | 'net_profit' | 'returned_count' | 'drafts_total' | 'drafts_count', number> & { margin: number | null };

interface Props {
    invoices: PaginatedData<InvoiceRow> & { per_page: number };
    customers: { id: number; name: string }[];
    filters: Filters;
    summary: Summary;
    counts: Record<(typeof tabs)[number][0], number>;
    headerCounts: { total: number; drafts: number };
    today: string;
}

const listPath = '/sales';
const pct = (value: number | string | null, decimals = 1) => value == null ? '—' : `${Number(value).toFixed(decimals)}%`;
const count = (value: number, name: string) => `${value.toLocaleString('en-PK')} ${name}${value === 1 ? '' : 's'}`;
const dayMs = 86_400_000;
const presets: Preset[] = ['7', '30', '90', 'all'];

function range(preset: Preset, today: string) {
    if (preset === 'all') return { from: undefined, to: undefined };
    const from = new Date(Date.parse(today) - Number(preset) * dayMs).toISOString().slice(0, 10);
    return { from, to: today };
}

function relativeDate(date: string, today: string) {
    const difference = Math.round((Date.parse(today) - Date.parse(date.slice(0, 10))) / dayMs);
    return difference === 0 ? 'today' : difference === 1 ? 'yesterday' : difference === -1 ? 'tomorrow'
        : difference < 0 ? `in ${-difference} days` : `${difference} days ago`;
}

function Kpi({ label, value, color, tone, children }: { label: string; value: number; color: string; tone?: string; children: ReactNode }) {
    return <div className="card kpi">
        <div className="lbl"><i style={{ background: color }} />{label}</div>
        <div className="val num" style={{ color: tone }}>{money(value)}</div>
        <div className="foot">{children}</div>
    </div>;
}

function currencyCell(value: number | string | null) {
    return value == null ? <span className="muted">—</span> : money(value);
}

export default function SalesIndex({ invoices, customers, filters, summary, counts, headerCounts, today }: Props) {
    const { can } = usePermissions();
    const [search, setSearch] = useState(filters.search ?? '');
    const [dates, setDates] = useState({ from: filters.from ?? '', to: filters.to ?? '' });
    const [selected, setSelected] = useState<Set<number>>(() => new Set());
    const [dense, setDense] = useState(false);
    const [previewId, setPreviewId] = useState<number>();
    const [posting, setPosting] = useState(false);
    const [loading, setLoading] = useState(false);
    const searchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const pageCheckbox = useRef<HTMLInputElement>(null);
    const preview = invoices.data.find((invoice) => invoice.id === previewId);
    const selection = invoices.data.filter((invoice) => selected.has(invoice.id));
    const drafts = selection.filter((invoice) => invoice.status === 'draft');
    const allSelected = selection.length > 0 && selection.length === invoices.data.length;
    const canPost = can('sales.post');
    const canReturn = (invoice: InvoiceRow) => can('returns.view') && can('returns.manage') && invoice.status === 'posted' && invoice.return_status !== 'fully_returned';
    const sort = filters.sort ?? 'date';
    const direction = filters.direction ?? 'desc';
    const activeStatus = filters.status ?? 'all';
    const hasFilters = Boolean(filters.search?.trim() || filters.customer_id || filters.status || filters.sale_type || filters.from || filters.to);
    const inverted = !!dates.from && !!dates.to && dates.from > dates.to;
    const activePreset = presets.find((preset) => {
        const item = range(preset, today);
        return (item.from ?? '') === dates.from && (item.to ?? '') === dates.to;
    });
    const { searchRef, onSearchKeyDown, rowProps } = useListKeyboardNav({
        rowCount: invoices.data.length,
        onActivate: (index) => setPreviewId(invoices.data[index]?.id),
        autoFocus: false,
    });
    const shouldShowCancelled = counts.cancelled > 0 || activeStatus === 'cancelled';
    const exportUrl = route('sales.export', filters, false);
    const selectionTotal = selection.reduce((total, row) => total + Math.round(Number(row.total_amount) * 100), 0) / 100;

    useEffect(() => setSearch(filters.search ?? ''), [filters.search]);
    useEffect(() => setDates({ from: filters.from ?? '', to: filters.to ?? '' }), [filters.from, filters.to]);
    useEffect(() => () => clearTimeout(searchTimer.current), []);
    useEffect(() => {
        if (pageCheckbox.current) pageCheckbox.current.indeterminate = selection.length > 0 && !allSelected;
    }, [selection.length, allSelected]);

    function visit(next: Filters, page = 1, replace = false) {
        clearTimeout(searchTimer.current);
        setSelected(new Set());
        setPreviewId(undefined);
        router.get(listPath, { ...next, page: page === 1 ? undefined : page }, {
            only: ['invoices', 'filters', 'summary', 'counts', 'headerCounts', 'today'],
            preserveState: true, preserveScroll: true, replace,
            onStart: () => setLoading(true),
            onFinish: () => setLoading(false),
        });
    }

    function changeFilters(change: Partial<Filters>) {
        visit({ ...filters, search: search.trim() || undefined, ...change });
    }

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
        if (next.from && next.to && next.from > next.to) return;
        changeFilters({ from: next.from || undefined, to: next.to || undefined });
    }

    function clearFilters() {
        setSearch('');
        setDates({ from: '', to: '' });
        visit({ sort: filters.sort, direction: filters.direction, per_page: filters.per_page });
    }

    function sortBy(key: Sort) {
        changeFilters({ sort: key, direction: key === sort ? direction === 'asc' ? 'desc' : 'asc' : ['invoice', 'customer', 'type'].includes(key) ? 'asc' : 'desc' });
    }

    function toggleRow(id: number, checked: boolean) {
        setSelected((prior) => {
            const ids = new Set(prior);
            if (checked) ids.add(id);
            else ids.delete(id);
            return ids;
        });
    }

    function post(rows: InvoiceRow[]) {
        if (posting || !rows.length || !canPost) return;
        if (!window.confirm(`Post ${rows.length === 1 ? rows[0].invoice_number : count(rows.length, 'draft invoice')}? This updates inventory and the ledger.`)) return;
        clearTimeout(searchTimer.current);
        setPosting(true);
        router.post(rows.length === 1 ? route('sales.post', rows[0].id, false) : route('sales.post-selected', {}, false),
            rows.length === 1 ? {} : { ids: rows.map((row) => row.id) }, {
                preserveScroll: true,
                onSuccess: () => { setSelected(new Set()); setPreviewId(undefined); },
                onFinish: () => setPosting(false),
            });
    }

    const visiblePages = [...new Set([1, invoices.current_page - 1, invoices.current_page, invoices.current_page + 1, invoices.last_page])]
        .filter((page) => page >= 1 && page <= invoices.last_page).sort((a, b) => a - b);

    return <AppLayout>
        <Head title="Sales Invoices" />
        <div className="sales-invoices" aria-busy={loading || posting}>
            <section className="hero">
                <div className="intro"><h1>Sales Invoices</h1>
                    <p className="sub">Invoices issued to pharmacies · {count(headerCounts.total, 'invoice')} · {count(headerCounts.drafts, 'draft')} awaiting posting</p>
                </div>
                <div className="sp" />
                <a className="hbtn" href={exportUrl} download><Download className="i" />Export CSV</a>
                <a className="hbtn" href={route('sales.list.pdf', { ...filters, page: invoices.current_page, per_page: invoices.per_page }, false)} target="_blank" rel="noopener"><Printer className="i" />Print list</a>
                {can('sales.create') && <Link className="hbtn pri" href={route('sales.create', {}, false)}><Plus className="i" />New Sale</Link>}
            </section>
            <section className="kpis" aria-label="Sales summary">
                <Kpi label="Gross Sales" value={summary.gross} color="#1f4e79">{count(invoices.total, 'invoice')} · avg {money(invoices.total ? summary.gross / invoices.total : 0)}</Kpi>
                <Kpi label="Returns" value={summary.returns} color="#dc2626" tone="var(--red)">
                    <span className="chip r">{pct(summary.gross ? summary.returns * 100 / summary.gross : 0)}</span>return rate · {count(summary.returned_count, 'invoice')}
                </Kpi>
                <Kpi label="Net Sales" value={summary.net} color="#0f8f80" tone="var(--teal)">gross less returns</Kpi>
                <Kpi label="Net Profit" value={summary.net_profit} color="#14b8a6" tone={summary.net_profit < 0 ? 'var(--red)' : 'var(--green)'}>
                    <span className={`chip ${summary.net_profit < 0 ? 'r' : 'g'}`}>{pct(summary.margin)}</span>margin on posted
                </Kpi>
                <Kpi label="Unposted Drafts" value={summary.drafts_total} color="#e3a008">
                    <span className="chip a">{summary.drafts_count}</span>not yet in ledger
                </Kpi>
            </section>

            <section className="card list" aria-label="Invoice list">
                <div className="tabs" role="group" aria-label="Filter by invoice status">
                    {tabs.filter(([key]) => key !== 'cancelled' || shouldShowCancelled).map(([key, title]) =>
                        <button key={key} className={`tab ${activeStatus === key ? 'on' : ''}`} type="button" aria-pressed={activeStatus === key}
                            onClick={() => changeFilters({ status: key === 'all' ? undefined : key })}>{title}<span className="ct">{counts[key]}</span></button>)}
                </div>
                <div className="filters">
                    <SearchField ref={searchRef} onKeyDown={onSearchKeyDown} maxLength={120} aria-label="Search invoices" placeholder="Invoice # or customer" value={search} onChange={updateSearch} />
                    <label className="fld choice"><UserRound className="i" /><select aria-label="Customer" value={filters.customer_id ?? ''} onChange={(event) => changeFilters({ customer_id: event.target.value || undefined })}>
                        <option value="">All customers</option>
                        {customers.map((customer) => <option value={customer.id} key={customer.id}>{customer.name}</option>)}
                    </select></label>
                    <label className="fld choice"><ListFilter className="i" /><select aria-label="Sale type" value={filters.sale_type ?? ''} onChange={(event) => changeFilters({ sale_type: event.target.value || undefined })}>
                        <option value="">All types</option>{saleTypes.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                    </select></label>
                    <label className="fld date-field"><small>From</small><input type="date" value={dates.from} onChange={(event) => updateDates({ ...dates, from: event.target.value })} /></label>
                    <label className="fld date-field"><small>To</small><input aria-invalid={inverted} type="date" value={dates.to} onChange={(event) => updateDates({ ...dates, to: event.target.value })} /></label>
                    <div className="presets" role="group" aria-label="Invoice date presets">
                        {presets.map((preset) => <button key={preset} type="button" className={preset === activePreset ? 'on' : ''} aria-pressed={preset === activePreset} onClick={() => {
                            const value = range(preset, today);
                            setDates({ from: value.from ?? '', to: value.to ?? '' });
                            changeFilters(value);
                        }}>{preset === 'all' ? 'All' : `${preset}D`}</button>)}
                    </div>
                    {hasFilters && <button type="button" className="clear" onClick={clearFilters}>Clear filters</button>}<div className="fsp" />
                    <button type="button" className="dens" title="Toggle row density" aria-label="Compact rows" aria-pressed={dense} onClick={() => setDense((value) => !value)}><List className="i" /></button>
                    {inverted && <p className="filter-error" role="alert">To date must be on or after From date.</p>}
                </div>
                {selection.length > 0 && <div className="bulk show" aria-label="Selected invoices">
                    <b>{selection.length} selected</b><span className="selection-sum">· {money(selectionTotal)} · {count(drafts.length, 'draft')}</span><div className="sp" />
                    {canPost && <button type="button" disabled={posting || drafts.length === 0} onClick={() => post(drafts)}><Check className="i" />Post drafts</button>}
                    <a href={route('sales.list.pdf', { ...filters, ids: selection.map((row) => row.id) }, false)} target="_blank" rel="noopener"><Printer className="i" />Print</a>
                    <a href={route('sales.export', { ...filters, ids: selection.map((row) => row.id) }, false)} download><Download className="i" />Export</a>
                    <button type="button" onClick={() => setSelected(new Set())}>Clear</button>
                </div>}
                <div className="tblwrap" tabIndex={0} role="region" aria-label="Sales invoices table">
                    <table className={dense ? 'dense' : undefined}>
                        <thead><tr>
                            <th className="check-col" scope="col"><input ref={pageCheckbox} type="checkbox" aria-label="Select all invoices on this page"
                                checked={allSelected} disabled={!invoices.data.length} onChange={(event) => setSelected(new Set(event.target.checked ? invoices.data.map((row) => row.id) : []))} /></th>
                            {columns.map(([key, label], index) => <th key={key} scope="col" className={`s ${sort === key ? 'act' : ''} ${index >= 4 ? 'r' : ''}`}
                                aria-sort={sort === key ? direction === 'asc' ? 'ascending' : 'descending' : undefined}>
                                <button className="sort" type="button" onClick={() => sortBy(key)}>{label}<span className="ar" aria-hidden="true">{sort === key ? direction === 'asc' ? '↑' : '↓' : '↕'}</span></button>
                            </th>)}
                            <th scope="col">Status</th><th scope="col" className="r acts-head">Actions</th>
                        </tr></thead>
                        <tbody>
                            {!invoices.data.length && <tr><td colSpan={12} className="empty">{hasFilters ? 'No invoices match these filters.' : 'No invoices found.'}</td></tr>}
                            {invoices.data.map((invoice, index) => <tr key={invoice.id} {...rowProps(index)} className={selected.has(invoice.id) ? 'sel' : ''} onClick={(event) => {
                                if (event.target instanceof Element && !event.target.closest('a,button,input,.check-col')) setPreviewId(invoice.id);
                            }}>
                                <td className="check-col"><input type="checkbox" aria-label={`Select ${invoice.invoice_number}`} checked={selected.has(invoice.id)} onChange={(event) => toggleRow(invoice.id, event.target.checked)} /></td>
                                <td><button className="inv" type="button" onClick={() => setPreviewId(invoice.id)}>{invoice.invoice_number}</button></td>
                                <td className="cust"><b>{invoice.customer?.name ?? '—'}</b><small>{invoice.customer?.city ?? '—'}</small></td>
                                <td className="date">{listDate(invoice.invoice_date)}<small className="muted">{relativeDate(invoice.invoice_date, today)}</small></td>
                                <td><SaleType type={invoice.sale_type} /></td>
                                <td className="r num number-cell">{money(invoice.total_amount)}</td>
                                <td className={`r num ${Number(invoice.returned_amount) ? 'neg' : 'muted'}`}>{Number(invoice.returned_amount) ? `−${amount(invoice.returned_amount)}` : '—'}</td>
                                <td className="r num">{money(invoice.net_amount)}</td>
                                <td className={`r num ${Number(invoice.net_profit) < 0 ? 'neg' : ''}`}>{currencyCell(invoice.net_profit)}</td>
                                <td className={`r num ${invoice.margin == null ? 'muted' : Number(invoice.margin) <= 0 ? 'neg' : ''}`}>{pct(invoice.margin, 0)}</td>
                                <td><SaleStatus invoice={invoice} /></td>
                                <td className="acts-cell"><div className="acts">
                                    {invoice.status === 'draft' && canPost && <button type="button" className="ib" title="Post invoice" aria-label={`Post ${invoice.invoice_number}`} disabled={posting} onClick={() => post([invoice])}><Check className="i" /></button>}
                                    {canReturn(invoice) && <Link className="ib" title="Create return" aria-label={`Create return for ${invoice.invoice_number}`} href={route('returns.sales.create', { invoice_id: invoice.id }, false)}><Undo2 className="i" /></Link>}
                                    <button type="button" className="ib" title="View invoice" aria-label={`View ${invoice.invoice_number}`} onClick={() => setPreviewId(invoice.id)}><Eye className="i" /></button>
                                    <a className="ib" title="Print invoice" aria-label={`Print ${invoice.invoice_number}`} href={route('sales.print', invoice.id, false)} target="_blank" rel="noreferrer"><Printer className="i" /></a>
                                </div></td>
                            </tr>)}
                        </tbody>
                        {!!invoices.total && <tfoot><tr>
                            <td className="check-col" /><td colSpan={4}>Totals · {count(invoices.total, 'invoice')}</td>
                            <td className="r num">{money(summary.gross)}</td><td className="r num neg">{summary.returns ? `−${amount(summary.returns)}` : '—'}</td>
                            <td className="r num">{money(summary.net)}</td><td className="r num">{money(summary.net_profit)}</td>
                            <td className="r num">{pct(summary.margin)}</td><td colSpan={2} />
                        </tr></tfoot>}
                    </table>
                </div>
                <div className="pager">
                    <span>{invoices.total ? `${invoices.from}–${invoices.to} of ${invoices.total}` : '0 results'}</span>
                    <label>· Rows <select value={invoices.per_page} onChange={(event) => changeFilters({ per_page: event.target.value })}>
                        {[10, 15, 25, 50].map((size) => <option key={size} value={size}>{size}</option>)}
                    </select></label>
                    <div className="sp" />
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
        {preview && <InvoicePreview key={preview.id} invoice={preview} close={() => setPreviewId(undefined)}
            busy={posting} canEdit={can('sales.create')} canReturn={canReturn(preview)} post={canPost ? () => post([preview]) : undefined} />}
    </AppLayout>;
}
