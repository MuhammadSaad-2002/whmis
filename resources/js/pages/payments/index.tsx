import { type PaginatedData } from '@/components/paginator';
import { RecordPaymentDialog } from '@/components/record-payment-dialog';
import { SearchField } from '@/components/ui/search-field';
import { usePermissions } from '@/hooks/use-permissions';
import AppLayout from '@/layouts/app-layout';
import { money, pakistanDate, shiftDate, shortDate } from '@/lib/format';
import { Head, Link, router } from '@inertiajs/react';
import { Ban, Eye, List, ListFilter, Plus } from 'lucide-react';
import { type ChangeEvent, useEffect, useRef, useState } from 'react';
import '../sales/invoice-list.css';

type Direction = 'in' | 'out';
type Filters = { direction?: Direction; method?: string; search?: string; from?: string; to?: string };
type PaymentRow = {
    id: number;
    payment_number: string;
    direction: Direction;
    method: string;
    amount: string;
    payment_date: string;
    status: string;
    party?: { id: number; name: string } | null;
};
type Option = { id: number; name: string };
type Props = {
    payments: PaginatedData<PaymentRow>;
    customers: Option[];
    companies: Option[];
    filters: Filters;
    summary: { receipts: number; payments: number; net: number };
};

const directions = [['all', 'All'], ['in', 'Receipts'], ['out', 'Payments']] as const;
const methods = { cash: 'Cash', bank: 'Bank', cheque: 'Cheque', online: 'Online', adjustment: 'Adjustment' };
const presets = ['7', '30', '90', 'all'] as const;

function dateRange(preset: (typeof presets)[number], today: string) {
    return preset === 'all' ? { from: '', to: '' } : { from: shiftDate(today, 1 - Number(preset)), to: today };
}

function methodLabel(method: string) {
    return methods[method as keyof typeof methods] ?? method;
}

function PaymentType({ direction }: { direction: Direction }) {
    return <span className={`type ${direction === 'in' ? 'receipt' : 'payment'}`}><i />{direction === 'in' ? 'Receipt' : 'Payment'}</span>;
}

function PaymentStatus({ status }: { status: string }) {
    return <span className={`st ${status === 'completed' ? 'posted' : 'cancelled'}`}>{status}</span>;
}

function PaymentActions({ payment, canManage, canReview }: { payment: PaymentRow; canManage: boolean; canReview: boolean }) {
    if (payment.status !== 'completed') return null;

    return <div className="acts">
        {payment.direction === 'in' && canReview && <Link className="ib" title="Reversal impact"
            aria-label={`Reversal impact for ${payment.payment_number}`} href={`/finance-reversals/receipt/${payment.id}`}>
            <Eye className="i" aria-hidden="true" />
        </Link>}
        {canManage && <button className="ib" type="button" title="Cancel & reverse" aria-label={`Cancel & reverse ${payment.payment_number}`}
            onClick={() => {
                if (confirm(`Cancel ${payment.payment_number}? The ledger entry will be reversed.`)) {
                    router.post(route('payments.cancel', payment.id), {}, { preserveScroll: true });
                }
            }}>
            <Ban className="i neg" aria-hidden="true" />
        </button>}
    </div>;
}

export default function PaymentsIndex({ payments, customers, companies, filters, summary }: Props) {
    const { can } = usePermissions();
    const canManage = can('payments.manage');
    const canReview = can('finance.review');
    const [dialogOpen, setDialogOpen] = useState(false);
    const [search, setSearch] = useState(filters.search ?? '');
    const [dates, setDates] = useState({ from: filters.from ?? '', to: filters.to ?? '' });
    const [dense, setDense] = useState(false);
    const [loading, setLoading] = useState(false);
    const searchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const hasFilters = Boolean(filters.direction || filters.method || filters.search?.trim() || filters.from || filters.to);
    const inverted = Boolean(dates.from && dates.to && dates.to < dates.from);
    const activeDirection = filters.direction ?? 'all';
    const today = pakistanDate();
    const activePreset = presets.find((preset) => {
        const range = dateRange(preset, today);
        return range.from === dates.from && range.to === dates.to;
    });
    const visiblePages = [...new Set([1, payments.current_page - 1, payments.current_page, payments.current_page + 1, payments.last_page])]
        .filter((page) => page >= 1 && page <= payments.last_page)
        .sort((a, b) => a - b);

    useEffect(() => { setSearch(filters.search ?? ''); }, [filters.search]);
    useEffect(() => { setDates({ from: filters.from ?? '', to: filters.to ?? '' }); }, [filters.from, filters.to]);
    useEffect(() => () => clearTimeout(searchTimer.current), []);

    function visit(next: Filters, page = 1, replace = false) {
        clearTimeout(searchTimer.current);
        router.get(route('payments.index', {}, false), { ...next, page: page > 1 ? page : undefined }, {
            only: ['payments', 'filters', 'summary'], preserveState: true, preserveScroll: true, replace,
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
        visit({});
    }

    const kpis = [
        { label: 'Total Receipts', value: summary.receipts, tone: 'var(--teal)', note: 'Completed customer receipts' },
        { label: 'Total Payments', value: summary.payments, tone: 'var(--sales)', note: 'Completed supplier payments' },
        { label: 'Net', value: summary.net, tone: summary.net < 0 ? 'var(--red)' : 'var(--teal)', note: 'Receipts less payments' },
    ];

    return <AppLayout>
        <Head title="Payments & Receipts" />
        <div className="payment-register" aria-busy={loading}>
            <section className="hero">
                <div className="intro">
                    <h1>Payments &amp; Receipts</h1>
                    <p className="sub">Customer receipts and supplier payments</p>
                </div>
                <div className="sp" />
                {canManage && <button className="hbtn pri" type="button" onClick={() => setDialogOpen(true)}><Plus className="i" />Record Payment</button>}
            </section>

            <section className="kpis" aria-label="Payment summary">
                {kpis.map(({ label, value, tone, note }) => <div key={label} className="card kpi">
                    <div className="lbl"><i style={{ background: tone }} />{label}</div>
                    <div className="val num" style={{ color: tone }}>{money(value)}</div>
                    <div className="foot">{note}</div>
                </div>)}
            </section>

            <section className="card list" aria-label="Payments and receipts list">
                <div className="tabs" role="group" aria-label="Filter by payment direction">
                    {directions.map(([key, title]) => <button key={key} className={`tab ${key === activeDirection ? 'on' : ''}`} type="button"
                        aria-pressed={key === activeDirection} onClick={() => change({ direction: key === 'all' ? undefined : key })}>{title}</button>)}
                </div>
                <div className="filters">
                    <SearchField aria-label="Search by payment or receipt number" placeholder="Payment or receipt #" value={search} maxLength={120} onChange={updateSearch} />
                    <label className="fld choice"><ListFilter className="i" aria-hidden="true" />
                        <select aria-label="Payment method" value={filters.method ?? ''} onChange={(event) => change({ method: event.target.value || undefined })}>
                            <option value="">All methods</option>
                            {Object.entries(methods).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                        </select>
                    </label>
                    <label className="fld date-field"><small>From</small><input type="date" value={dates.from} onChange={(event) => updateDates({ ...dates, from: event.target.value })} /></label>
                    <label className="fld date-field"><small>To</small><input aria-invalid={inverted} type="date" value={dates.to} onChange={(event) => updateDates({ ...dates, to: event.target.value })} /></label>
                    <div className="presets" role="group" aria-label="Payment date presets">
                        {presets.map((preset) => <button key={preset} type="button" className={preset === activePreset ? 'on' : ''} aria-pressed={preset === activePreset}
                            onClick={() => updateDates(dateRange(preset, today))}>{preset === 'all' ? 'All' : `${preset}D`}</button>)}
                    </div>
                    {hasFilters && <button className="clear" type="button" onClick={clearFilters}>Clear filters</button>}
                    <div className="fsp" />
                    <button type="button" className="dens" title="Toggle row density" aria-label="Compact rows" aria-pressed={dense} onClick={() => setDense((value) => !value)}><List className="i" /></button>
                    {inverted && <p className="filter-error" role="alert">To date must be on or after From date.</p>}
                </div>

                {payments.data.length === 0 ? <p className="empty">{hasFilters ? 'No payments or receipts match these filters.' : 'No payments or receipts recorded yet.'}</p> : <>
                    <div className="tblwrap payment-table" tabIndex={0} role="region" aria-label="Payments and receipts table">
                        <table className={dense ? 'dense' : undefined}>
                            <thead><tr>
                                <th scope="col">Number</th><th scope="col">Party</th><th scope="col">Direction</th><th scope="col">Method</th>
                                <th scope="col" className="act" aria-sort="descending">Date<span className="ar" aria-hidden="true">↓</span></th>
                                <th scope="col" className="r">Amount</th><th scope="col">Status</th>
                                {(canManage || canReview) && <th scope="col" className="r acts-head">Actions</th>}
                            </tr></thead>
                            <tbody>
                                {payments.data.map((payment) => <tr key={payment.id}>
                                    <td className="payment-number">{payment.payment_number}</td>
                                    <td className="cust"><b>{payment.party?.name ?? '—'}</b></td>
                                    <td><PaymentType direction={payment.direction} /></td>
                                    <td>{methodLabel(payment.method)}</td>
                                    <td className="date">{shortDate(payment.payment_date.slice(0, 10))}</td>
                                    <td className="r num number-cell">{money(payment.amount)}</td>
                                    <td><PaymentStatus status={payment.status} /></td>
                                    {(canManage || canReview) && <td className="acts-cell"><PaymentActions payment={payment} canManage={canManage} canReview={canReview} /></td>}
                                </tr>)}
                            </tbody>
                            <tfoot><tr>
                                <td colSpan={5}>Net movement · completed only</td>
                                <td className={`r num ${summary.net < 0 ? 'neg' : ''}`}>{money(summary.net)}</td>
                                <td colSpan={canManage || canReview ? 2 : 1} />
                            </tr></tfoot>
                        </table>
                    </div>
                    <div className="payment-cards" aria-label="Payment and receipt cards">
                        {payments.data.map((payment) => <article className="payment-card" key={payment.id}>
                            <div className="payment-card-head">
                                <div>
                                    <p className="payment-number">{payment.payment_number}</p>
                                    <h2>{payment.party?.name ?? '—'}</h2>
                                </div>
                                <div className="r">
                                    <p className="num payment-total">{money(payment.amount)}</p>
                                    <PaymentStatus status={payment.status} />
                                </div>
                            </div>
                            <div className="payment-card-foot">
                                <div className="payment-card-meta">
                                    <PaymentType direction={payment.direction} />
                                    <span>{methodLabel(payment.method)} · {shortDate(payment.payment_date.slice(0, 10))}</span>
                                </div>
                                {(canManage || canReview) && <PaymentActions payment={payment} canManage={canManage} canReview={canReview} />}
                            </div>
                        </article>)}
                    </div>
                </>}

                <div className="pager">
                    <span>{payments.total ? `${payments.from ?? 0}–${payments.to ?? 0} of ${payments.total}` : '0 results'}</span>
                    {payments.last_page > 1 && <>
                        <div className="sp" />
                        <nav className="pg" aria-label="Payment pages">
                            <button type="button" disabled={payments.current_page <= 1} onClick={() => visit(filters, payments.current_page - 1)}>‹ Prev</button>
                            {visiblePages.map((page, index) => <span className="pg-entry" key={page}>
                                {index > 0 && page - visiblePages[index - 1] > 1 && <span className="muted">…</span>}
                                <button type="button" aria-current={payments.current_page === page ? 'page' : undefined} className={payments.current_page === page ? 'on' : ''}
                                    onClick={() => visit(filters, page)}>{page}</button>
                            </span>)}
                            <button type="button" disabled={payments.current_page >= payments.last_page} onClick={() => visit(filters, payments.current_page + 1)}>Next ›</button>
                        </nav>
                    </>}
                </div>
            </section>
        </div>

        {dialogOpen && canManage && <RecordPaymentDialog selection={{ type: 'customer' }} parties={{ customer: customers, company: companies }} close={() => setDialogOpen(false)} />}
    </AppLayout>;
}
