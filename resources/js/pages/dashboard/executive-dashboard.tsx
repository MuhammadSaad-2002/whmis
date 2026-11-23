import { usePermissions } from '@/hooks/use-permissions';
import AppLayout from '@/layouts/app-layout';
import { money, qty, toNumber } from '@/lib/format';
import { Head, Link, router } from '@inertiajs/react';
import { AlertTriangle, ArrowDownLeft, ArrowDownUp, ArrowUpRight, CalendarDays, CheckCircle2, Clock, FileDown, FileText, Pencil, TrendingUp } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { ActivityChart, colors, compact, Donut, RankingChart, Spark, Waterfall, type ActivityPoint, type Datum, type Slice } from './executive-charts';
import './executive.css';

interface Kpis {
    sales: number;
    sales_delta: number | null;
    profit: number;
    profit_delta: number | null;
    margin_pct: number;
    prev_margin_pct: number | null;
    purchases: number;
    purchases_delta: number | null;
    invoice_count: number;
    average_invoice: number | null;
}

interface Financials {
    employee_payable: number;
    employee_advances: number;
    receivable: number;
    payable: number;
    net_position: number;
    inventory_value: number;
}

interface RecentSale {
    id: number;
    invoice_number: string;
    invoice_date: string;
    status: string;
    total_amount: string | number;
    customer?: { id: number; name: string } | null;
}

export interface ExecutiveProps {
    asOf: string;
    hr: { expense: number };
    filterValues: { period: string; from: string; to: string };
    kpis: Kpis;
    financials: Financials;
    workingCapital: { dso: number | null; dio: number | null; dpo: number | null; cash_cycle: number | null };
    monthlyTrend: ActivityPoint[];
    aging: Datum[];
    topProducts: Datum[];
    salesBySupplier: Datum[];
    rankingTotals: { products: number; customers: number; suppliers: number };
    topDebtors: { customer: string; city: string | null; balance: number; over_90: number }[];
    topCustomers: { customer_id: number; customer: string | null; total: number; profit: number }[];
    stockOnLoan: { outstanding_out: number; outstanding_in: number };
    attention: { draft_sales: number; draft_sales_total: number; pending_bookings: number; expiring_90: number; overdue_accounts: number; overdue_amount: number };
    recentSales: RecentSale[];
    expiringSoon: { id: number; product: string | null; batch_number: string; expiry_date: string; qty_available: number }[];
}

const periods = [
    ['last_3', '3M', 'Last 3 Months'],
    ['last_6', '6M', 'Last 6 Months'],
    ['ytd', 'YTD', 'Year to Date'],
    ['last_12', '12M', 'Last 12 Months'],
] as const;
const dateFormatter = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
const clockFormatter = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Karachi' });
const dateText = (date: string) => dateFormatter.format(new Date(`${date.slice(0, 10)}T00:00:00Z`));
const share = (value: number, total: number) => total > 0 ? 100 * value / total : 0;
const clamp = (value: number) => Math.min(100, Math.max(0, value));
const percent = (value: number, digits = 1) => `${value.toFixed(digits)}%`;
const billTotal = (rows: RecentSale[]) => rows.reduce((total, row) => total + toNumber(row.total_amount), 0);

function CardHead({ title, tag, children }: { title: string; tag?: string; children?: ReactNode }) {
    return <header className="exec-card-head"><h2>{title}</h2>{tag && <span className="exec-tag">{tag}</span>}{children && <><span className="exec-spacer" />{children}</>}</header>;
}

function Delta({ value, points = false, invert = false }: { value: number | null; points?: boolean; invert?: boolean }) {
    if (value === null) return <span className="exec-delta">no prior</span>;
    return <span className={`exec-delta ${(invert ? value <= 0 : value >= 0) ? 'up' : 'down'}`} title="Compared with the previous equal-length period">
        {value === 0 ? '—' : value > 0 ? '▲' : '▼'} {Math.abs(value).toFixed(1)}{points ? ' pts' : '%'}
    </span>;
}

function Kpi({ title, color, value, foot, children, negative }: {
    title: string; color: string; value: ReactNode; foot: ReactNode; children: ReactNode; negative?: boolean;
}) {
    return <article className="exec-card exec-c2 exec-kpi">
        <h2 className="exec-kpi-label"><i aria-hidden="true" style={{ background: color }} />{title}</h2>
        <div className={`exec-kpi-value exec-num ${negative ? 'exec-red' : ''}`}>{value}</div>
        <div className="exec-kpi-foot">{foot}</div>
        {children}
    </article>;
}

function Meter({ parts, className = '' }: { parts: { width: number; color: string }[]; className?: string }) {
    return <div className={`exec-meter ${className}`} aria-hidden="true">
        {parts.map((part, index) => <span key={index} style={{ width: `${clamp(part.width)}%`, background: part.color }} />)}
    </div>;
}

function Breakdown({ slices, renderValue, base }: { slices: Slice[]; renderValue: (slice: Slice) => string; base?: number }) {
    return <div className="exec-rows">
        {slices.map((slice, index) => <div className="exec-list-row" key={`${slice.label}-${index}`}>
            <i aria-hidden="true" style={{ background: slice.color }} /><span className="name" title={slice.label}>{slice.label}</span>
            <b className="exec-num">{renderValue(slice)}</b>
            {base !== undefined && <small className="exec-num">{base > 0 ? percent(share(slice.value, base)) : '—'}</small>}
        </div>)}
    </div>;
}

function RecentSales({ sales }: { sales: RecentSale[] }) {
    const { can } = usePermissions();
    const [status, setStatus] = useState('all');
    const [query, setQuery] = useState('');
    type SortKey = 'invoice' | 'customer' | 'date' | 'amount';
    const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: 'date', desc: true });
    const columns = [['invoice', 'Invoice'], ['customer', 'Customer'], ['date', 'Date'], ['amount', 'Total']] as const;
    const invoiceStatuses = ['all', 'draft', 'posted', ...(sales.some((sale) => sale.status === 'cancelled') ? ['cancelled'] : [])];
    const rows = useMemo(() => {
        const needle = query.trim().toLowerCase();
        const value = (sale: RecentSale) => ({
            invoice: sale.invoice_number,
            customer: sale.customer?.name ?? '',
            date: sale.invoice_date,
            amount: toNumber(sale.total_amount),
        })[sort.key];
        return sales.filter((sale) => (status === 'all' || sale.status === status) &&
            [sale.invoice_number, sale.customer?.name ?? ''].some((text) => text.toLowerCase().includes(needle)))
            .sort((a, b) => {
                const first = value(a);
                const second = value(b);
                const result = typeof first === 'number' ? first - Number(second) : first.localeCompare(String(second), undefined, { numeric: true, sensitivity: 'base' });
                return result * (sort.desc ? -1 : 1) || b.id - a.id;
            });
    }, [query, sales, sort, status]);
    const header = ([key, label]: (typeof columns)[number]) => (
        <th key={key} scope="col" className={key === 'amount' ? 'right' : undefined}
            aria-sort={key === sort.key ? sort.desc ? 'descending' : 'ascending' : undefined}>
            <button type="button" onClick={() => setSort((current) => ({ key, desc: current.key === key ? !current.desc : true }))}>
                {label}{key === sort.key && <ArrowDownUp aria-hidden="true" size={11} />}
            </button>
        </th>
    );
    return <section className="exec-card exec-c8">
        <CardHead title="Recent Sales">
            <div className="exec-tools">
                <input className="exec-search" value={query} onChange={(event) => setQuery(event.target.value)} type="search" aria-label="Search recent sales" placeholder="Search invoice or customer…" />
                <div className="exec-mini-seg" role="group" aria-label="Invoice status">
                    {invoiceStatuses.map((option) => <button key={option} type="button" className="capitalize" aria-pressed={status === option} onClick={() => setStatus(option)}>{option}</button>)}
                </div>
            </div>
        </CardHead>
        <div className="exec-table-wrap" tabIndex={0} role="region" aria-label="Recent sales table">
            <table className="exec-table">
                <thead><tr>{columns.slice(0, 3).map(header)}<th scope="col">Status</th>{header(columns[3])}</tr></thead>
                <tbody>
                    {rows.map((row) => <tr key={row.id}>
                        <td>{can('sales.view') ? <Link href={route('sales.edit', row.id)}>{row.invoice_number}</Link> : row.invoice_number}</td>
                        <td>{row.customer?.name?.toUpperCase() ?? '—'}</td>
                        <td className="exec-muted">{dateText(row.invoice_date)}</td>
                        <td><span className={`exec-status ${row.status}`}>{row.status}</span></td>
                        <td className="right exec-num"><b>{money(row.total_amount)}</b></td>
                    </tr>)}
                    {!rows.length && <tr><td colSpan={5} className="exec-empty">No invoices match.</td></tr>}
                </tbody>
            </table>
        </div>
        <p className="exec-note" aria-live="polite">{rows.length} {rows.length === 1 ? 'invoice' : 'invoices'} · total {money(billTotal(rows))}</p>
    </section>;
}

export default function ExecutiveDashboard({ asOf, filterValues, kpis, financials, workingCapital, monthlyTrend, aging, topProducts, salesBySupplier, topDebtors, topCustomers, rankingTotals, stockOnLoan, attention, recentSales, expiringSoon, hr }: ExecutiveProps) {
    const { can } = usePermissions();
    const [loading, setLoading] = useState(false);
    const [productMode, setProductMode] = useState<'revenue' | 'share'>('revenue');
    const periodLabel = periods.find(([period]) => period === filterValues.period)?.[2] ?? (filterValues.period === 'custom' ? 'Custom Range' : 'This Month');
    const selectPeriod = (period: string) => {
        if (period === filterValues.period) return;
        router.get(route('dashboard'), { period }, {
            preserveState: true, preserveScroll: true, replace: true,
            onStart: () => setLoading(true), onFinish: () => setLoading(false),
        });
    };
    const ops = [
        { label: 'Draft invoices', value: attention.draft_sales, detail: attention.draft_sales ? `${money(attention.draft_sales_total)} unposted` : '', Icon: FileText, tone: attention.draft_sales ? 'hot' : '', href: can('sales.view') ? route('sales.index', { status: 'draft' }) : null },
        { label: 'Pending bookings', value: attention.pending_bookings, Icon: CalendarDays, href: can('bookings.view') ? route('bookings.index', { status: 'pending' }) : null },
        { label: 'Loan stock out', value: stockOnLoan.outstanding_out, Icon: ArrowUpRight, href: can('loans.view') ? route('loans.index', 'out') : null },
        { label: 'Borrowed stock in', value: stockOnLoan.outstanding_in, Icon: ArrowDownLeft, href: can('loans.view') ? route('loans.index', 'in') : null },
        { label: 'Batches expiring ≤90d', value: attention.expiring_90, Icon: Clock, href: can('inventory.view') ? route('inventory.batches', { expiry: '90' }) : null },
        { label: 'Overdue 90+ accounts', value: attention.overdue_accounts, detail: attention.overdue_accounts ? money(attention.overdue_amount) : '', Icon: AlertTriangle, tone: attention.overdue_accounts ? 'bad' : '', href: can('reports.view') ? route('reports.show', { key: 'outstanding' }) : null },
    ];

    const ar = Math.max(0, financials.receivable);
    const ap = Math.max(0, financials.payable);
    const arBar = share(ar, ar + ap);
    const coverage = share(ar + Math.max(0, financials.inventory_value), ap);
    const arCoverage = clamp(share(ar, ap));
    const working = [
        ['DSO', workingCapital.dso, 'Estimated days sales outstanding'],
        ['DIO', workingCapital.dio, 'Estimated days inventory outstanding'],
        ['DPO', workingCapital.dpo, 'Estimated days payables outstanding'],
        ['Cash cycle', workingCapital.cash_cycle, 'Estimated days: DSO + DIO − DPO'],
    ] as const;
    const agingSlices = aging.map((slice, index) => ({ ...slice, label: `${slice.label} days`, color: ['#99e0d6', '#14b8a6', '#0f6f66', '#dc2626'][index] }));
    const agingTotal = agingSlices.reduce((sum, slice) => sum + slice.value, 0);
    const supplierSlices = salesBySupplier.map((slice, index) => ({ ...slice, color: index % 2 === 0 ? colors.sales : colors.purchases }));
    const pipeline = ['draft', 'posted', 'cancelled'].flatMap((status, index) => {
        const rows = recentSales.filter((row) => row.status === status);
        return status === 'cancelled' && !rows.length ? [] : [{ label: `${status[0].toUpperCase() + status.slice(1)} · ${rows.length}`, value: billTotal(rows), color: [colors.purchases, '#059669', '#cbd5e1'][index] }];
    });
    const openValue = share(pipeline[0].value, pipeline[0].value + pipeline[1].value);
    const top = topCustomers.find((row) => row.total > 0);
    const nextCustomers = topCustomers.filter((row) => row !== top && row.total > 0);
    const nextValue = nextCustomers.reduce((sum, row) => sum + row.total, 0);
    const concentration = [
        { label: top?.customer ?? 'Top customer', value: top?.total ?? 0, color: colors.sales },
        { label: nextCustomers.length === 1 ? 'Next customer' : `Next ${nextCustomers.length || 4} customers`, value: nextValue, color: colors.profit },
        { label: 'All others', value: Math.max(0, rankingTotals.customers - (top?.total ?? 0) - nextValue), color: '#cbd5e1' },
    ];
    const isDaily = monthlyTrend.some((point) => /^\d{2} /.test(point.label));
    const peak = monthlyTrend.reduce<ActivityPoint | null>((max, next) => next.sales > (max?.sales ?? 0) ? next : max, null);
    const topProduct = topProducts.find((row) => row.value > 0);
    const periodTag = `${isDaily ? 'daily' : 'monthly'} · selected period`;
    const insights = [
        { tone: 'red', Icon: AlertTriangle, title: top
            ? `${top.customer ?? 'Top customer'}: ${percent(share(top.total, rankingTotals.customers), 0)} of sales at ${percent(share(top.profit, top.total))} margin` : 'No customer sales to rank',
            text: top ? (top.profit <= 0 ? `${money(top.total)} net revenue with no positive recorded profit. Review pricing and cost.` : `${money(top.total)} net revenue and ${money(top.profit)} profit from the leading customer.`) : 'Customer rankings appear after sales are posted in the selected period.' },
        { tone: 'amber', Icon: ArrowUpRight, title: ap > 0 && ar > 0 ? `Payables are ${(ap / ar).toFixed(1)}× receivables` : ap > 0 ? 'Supplier payables exceed receivables' : 'No net supplier payables',
            text: `Net position ${money(financials.net_position)}. Customers owe ${money(financials.receivable)} and supplier payables are ${money(financials.payable)}.` },
        { tone: 'blue', Icon: Pencil, title: attention.draft_sales ? `${attention.draft_sales} draft ${attention.draft_sales === 1 ? 'invoice' : 'invoices'} worth ${money(attention.draft_sales_total)}` : 'No draft sales invoices',
            text: attention.draft_sales ? 'Drafts do not affect the ledger or deduct stock. Review them before posting.' : 'There are no unposted sales drafts to review.' },
        { tone: 'teal', Icon: TrendingUp, title: peak ? `Sales peaked in ${peak.label} at Rs ${compact(peak.sales)}` : 'No positive net sales this period',
            text: topProduct ? `${topProduct.label} represents ${percent(share(topProduct.value, rankingTotals.products), 0)} of positive product net revenue for this period.` : 'Product mix becomes available when there is positive net product revenue.' },
    ];

    return <AppLayout breadcrumbs={[{ title: 'Dashboard', href: '/dashboard' }]}>
        <Head title="Executive Dashboard">
            <link head-key="executive-inter" rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" referrerPolicy="no-referrer" />
        </Head>
        <main className="executive" aria-busy={loading}>
            <section className="exec-hero">
                <div>
                    <h1>Executive Overview</h1>
                    <p className="exec-sub" aria-live="polite"><b>{periodLabel}</b> · {dateText(filterValues.from)} — {dateText(filterValues.to)} · Balances as of {clockFormatter.format(new Date(asOf))} PKT</p>
                </div>
                <span className="exec-spacer" />
                <div className="exec-hero-actions">
                    <div className="exec-seg" role="group" aria-label="Dashboard period">
                        {periods.map(([period, name, full]) => <button key={period} type="button" title={full} disabled={loading} aria-pressed={filterValues.period === period} onClick={() => selectPeriod(period)}>{name}</button>)}
                    </div>
                    <button className="exec-export" type="button" disabled={loading} onClick={() => window.print()}><FileDown size={14} aria-hidden="true" />Export PDF</button>
                </div>
            </section>
            <section className="exec-grid" aria-label="Key performance indicators">
                <Kpi title="Net Sales" color={colors.sales} value={money(kpis.sales)} foot={<Delta value={kpis.sales_delta} />}><Spark values={monthlyTrend.map((point) => point.sales)} color={colors.sales} /></Kpi>
                <Kpi title="Net Profit" color={colors.profit} value={money(kpis.profit)} foot={<Delta value={kpis.profit_delta} />}><Spark values={monthlyTrend.map((point) => point.profit)} color={colors.profit} /></Kpi>
                <Kpi title="Net Margin" color="#64748b" value={kpis.sales > 0 ? percent(kpis.margin_pct) : '—'}
                    foot={<Delta value={kpis.prev_margin_pct === null || kpis.sales <= 0 ? null : kpis.margin_pct - kpis.prev_margin_pct} points />}>
                    <Spark values={monthlyTrend.map((point) => share(point.profit, point.sales))} color="#64748b" />
                </Kpi>
                <Kpi title="Net Purchases" color={colors.purchases} value={money(kpis.purchases)} foot={<Delta value={kpis.purchases_delta} invert />}><Spark values={monthlyTrend.map((point) => point.purchases)} color={colors.purchases} /></Kpi>
                <Kpi title="Invoices · Avg value" color={colors.cogs} value={<>{kpis.invoice_count}{kpis.average_invoice !== null && <small>· {money(kpis.average_invoice)}</small>}</>} foot="posted sales invoices in period">
                    <Spark values={monthlyTrend.map((point) => point.invoice_count)} color={colors.cogs} />
                </Kpi>
                <Kpi title="Net Position" color={colors.danger} value={money(financials.net_position)} negative={financials.net_position < 0} foot="receivables − payables ± staff">
                    <Meter parts={[{ width: arBar, color: colors.profit }, { width: ap > 0 ? 100 - arBar : 0, color: '#f3b1b1' }]} />
                    <div className="exec-meta"><span title={money(financials.receivable)}>AR {compact(financials.receivable)}</span><span title={money(financials.payable)}>AP {compact(financials.payable)}</span></div>
                </Kpi>
            </section>
            <section className="exec-grid" aria-label="Operational snapshot">
                <div className="exec-card exec-c12 exec-ops">
                    {ops.map(({ value, label, detail, Icon, tone, href }) => {
                        const content = <><span className={`exec-op-icon ${tone ?? ''}`}><Icon size={17} aria-hidden="true" /></span><span><span className="exec-op-value exec-num block">{qty(value)}</span><span className="exec-op-label block">{label}</span>{detail && <span className="exec-op-detail block">{detail}</span>}</span></>;
                        return href ? <Link href={href} className="exec-op" key={label}>{content}</Link> : <div className="exec-op" key={label}>{content}</div>;
                    })}
                </div>
            </section>
            <section className="exec-grid">
                <div className="exec-card exec-c12">
                    <CardHead title="Needs attention" tag="auto-generated from current data" />
                    <div className="exec-insights">{insights.map(({ tone, Icon, title, text }) => <article className={`exec-insight ${tone}`} key={tone}>
                        <span className="exec-insight-icon"><Icon size={13} aria-hidden="true" /></span><div><b>{title}</b><p>{text}</p></div>
                    </article>)}</div>
                </div>
            </section>
            <div className="exec-grid">
                <section className="exec-card exec-c8"><ActivityChart data={monthlyTrend} title="Sales, Profit & Margin" subtitle={periodTag} /></section>
                <section className="exec-card exec-c4">
                    <CardHead title="Working Capital" tag="as of now"><span className="exec-pill" title="Calculated from current balances and selected-period activity">
                        {workingCapital.cash_cycle === null ? 'Insufficient activity' : workingCapital.cash_cycle < 45 ? 'Short cycle' : 'Long cycle'}
                    </span></CardHead>
                    <div className="exec-working">{working.map(([label, value, description]) => <div key={label} title={description}>
                        <small>{label}</small><b className="exec-num">{value === null ? '—' : Math.round(value)}{value !== null && <em>days</em>}</b>
                    </div>)}</div>
                    <Waterfall total={financials.net_position} entries={[
                        { label: 'Receivables', value: financials.receivable, color: colors.profit }, { label: 'Payables', value: -financials.payable, color: '#f08a8a' },
                        { label: 'Advances', value: financials.employee_advances, color: '#cbd5e1' }, { label: 'Salary pay.', value: -financials.employee_payable, color: '#cbd5e1' },
                    ]} />
                    <div className="exec-cover">
                        <Meter parts={[{ width: arCoverage, color: colors.profit }, { width: Math.max(0, Math.min(coverage - arCoverage, 100 - arCoverage)), color: colors.cogs }]} />
                        <div className="exec-meta"><span title="Compares receivables and inventory at cost with supplier payables; it is not a cash balance.">{ap > 0 ? <><b>{percent(coverage, 0)}</b> of payables covered by AR + stock</> : 'No positive supplier payables'}</span><span>Payables {money(financials.payable)}</span></div>
                    </div>
                </section>
            </div>
            <div className="exec-grid">
                <section className="exec-card exec-c4">
                    <CardHead title="Receivables Aging" tag="as of now" />
                    <div className="exec-donut-layout"><Donut slices={agingSlices} label="Outstanding" value={money(agingTotal)} /><Breakdown slices={agingSlices} renderValue={(slice) => money(slice.value)} base={agingTotal} /></div>
                    <p className="exec-note">{agingTotal > 0 ? <><b className="exec-red">{percent(share(agingSlices[3].value, agingTotal))}</b> is past 90 days · {percent(share(agingSlices[1].value, agingTotal), 0)} sits in the 31–60 day bucket.</> : 'No aged receivables.'}</p>
                </section>
                <section className="exec-card exec-c5">
                    <CardHead title="Top Products" tag="by net revenue · period">
                        <div className="exec-mini-seg" role="group" aria-label="Product ranking metric">
                            <button type="button" aria-pressed={productMode === 'revenue'} onClick={() => setProductMode('revenue')}>Revenue</button>
                            <button type="button" aria-pressed={productMode === 'share'} onClick={() => setProductMode('share')}>Share %</button>
                        </div>
                    </CardHead>
                    <RankingChart title="Top product ranking" data={productMode === 'revenue' ? topProducts : rankingTotals.products > 0 ? topProducts.map((row) => ({ ...row, value: Number(share(row.value, rankingTotals.products).toFixed(1)) })) : []}
                        height={250} color={(index) => index === 0 ? colors.sales : '#5f86ad'} percentage={productMode === 'share'} />
                </section>
                <section className="exec-card exec-c3">
                    <CardHead title="Customer Concentration" />
                    <Donut slices={concentration} label="Top customer" value={rankingTotals.customers > 0 ? percent(share(concentration[0].value, rankingTotals.customers), 0) : '—'} centered />
                    <Breakdown slices={concentration} renderValue={(slice) => rankingTotals.customers > 0 ? percent(share(slice.value, rankingTotals.customers)) : '—'} />
                </section>
            </div>
            <div className="exec-grid">
                <section className="exec-card exec-c6"><ActivityChart data={monthlyTrend} title="Stock Build-up" subtitle="purchases vs cost of goods sold" stock /></section>
                <section className="exec-card exec-c3">
                    <CardHead title="Sales by Supplier" tag="period" />
                    <RankingChart data={supplierSlices} title="Sales by supplier" height={Math.max(130, supplierSlices.length * 24 + 25)} showLabels={false} color={(index) => supplierSlices[index].color} />
                    <Breakdown slices={supplierSlices} renderValue={(slice) => money(slice.value)} base={rankingTotals.suppliers} />
                </section>
                <section className="exec-card exec-c3">
                    <CardHead title="Invoice Pipeline" tag={`recent ${recentSales.length}`} />
                    <Donut slices={pipeline} label="Unposted" value={recentSales.length > 0 ? percent(openValue, 0) : '—'} centered />
                    <Breakdown slices={pipeline} renderValue={(slice) => money(slice.value)} />
                </section>
            </div>
            <div className="exec-grid">
                <section className="exec-card exec-c7">
                    <CardHead title="Top Customers" tag="sales & profitability · period" />
                    <div className="exec-table-wrap" tabIndex={0} role="region" aria-label="Top customers table"><table className="exec-table">
                        <thead><tr><th>#</th><th>Customer</th><th className="right">Sales</th><th className="right">Share</th><th className="right">Profit</th><th className="right">Margin</th></tr></thead>
                        <tbody>{topCustomers.map((row, index) => {
                            const margin = row.total > 0 ? share(row.profit, row.total) : null;
                            const name = row.customer?.toUpperCase() ?? '—';
                            return <tr key={row.customer_id}><td className="exec-muted">{index + 1}</td>
                                <td><b>{can('ledger.view') ? <Link href={route('ledger.customer', row.customer_id)}>{name}</Link> : name}</b></td>
                                <td className="right exec-num">{money(row.total)}</td><td className="right exec-num exec-muted">{rankingTotals.customers > 0 ? percent(share(row.total, rankingTotals.customers)) : '—'}</td>
                                <td className="right exec-num">{money(row.profit)}</td><td className="right"><div className="exec-margin">
                                    <Meter parts={[{ width: margin === null ? 0 : margin <= 0 ? 100 : margin, color: margin !== null && margin <= 0 ? colors.danger : colors.profit }]} />
                                    <b className={`exec-num ${margin !== null && margin <= 0 ? 'exec-red' : ''}`}>{margin === null ? '—' : percent(margin)}</b>
                                </div></td>
                            </tr>;
                        })}{!topCustomers.length && <tr><td colSpan={6} className="exec-empty">No posted sales in this period.</td></tr>}</tbody>
                    </table></div>
                </section>
                <section className="exec-card exec-c5">
                    <CardHead title="Top Debtors" tag="as of now" />
                    <div className="exec-table-wrap" tabIndex={0} role="region" aria-label="Top debtors table"><table className="exec-table">
                        <thead><tr><th>Customer</th><th className="right">Balance</th><th className="right">90+ days</th><th className="right">Aging mix</th></tr></thead>
                        <tbody>{topDebtors.map((row, index) => {
                            const overdue = clamp(share(row.over_90, row.balance));
                            return <tr key={`${row.customer}-${index}`}><td><b>{row.customer.toUpperCase()}</b>{row.city && <small>{row.city}</small>}</td>
                                <td className="right exec-num"><b>{money(row.balance)}</b></td><td className="right exec-num">{row.over_90 > 0 ? <span className="exec-red">{money(row.over_90)}</span> : '—'}</td>
                                <td className="right">{row.balance > 0 ? <div role="img" aria-label={`${percent(overdue)} past 90 days`}><Meter className="exec-agebar" parts={[{ width: 100 - overdue, color: colors.profit }, { width: overdue, color: colors.danger }]} /></div> : <span className="exec-muted">credit</span>}</td>
                            </tr>;
                        })}{!topDebtors.length && <tr><td colSpan={4} className="exec-empty">Nothing outstanding.</td></tr>}</tbody>
                    </table></div>
                    <p className="exec-note">Aging mix: <span style={{ color: colors.profit }}>■</span> 0–90 days &nbsp; <span style={{ color: colors.danger }}>■</span> Past 90 days</p>
                </section>
            </div>
            <div className="exec-grid">
                <RecentSales sales={recentSales} />
                <div className="exec-c4 exec-stack">
                    <section className="exec-card">
                        <CardHead title="Expiring within 90 days"><span className="exec-pill">{attention.expiring_90} {attention.expiring_90 === 1 ? 'batch' : 'batches'}</span></CardHead>
                        {expiringSoon.length ? <div className="exec-table-wrap" tabIndex={0} role="region" aria-label="Expiring batches"><table className="exec-table">
                            <thead><tr><th>Product / Batch</th><th>Expiry</th><th className="right">Qty</th></tr></thead>
                            <tbody>{expiringSoon.map((batch) => <tr key={batch.id}><td><b>{batch.product ?? '—'}</b><small>{batch.batch_number}</small></td><td>{dateText(batch.expiry_date)}</td><td className="right exec-num">{qty(batch.qty_available)}</td></tr>)}</tbody>
                        </table></div> : <div className="exec-empty"><CheckCircle2 size={34} strokeWidth={1.6} aria-hidden="true" />No batches expiring in the next 90 days.</div>}
                    </section>
                    <section className="exec-card">
                        <CardHead title="Payroll & Staff" tag="selected period" />
                        {([
                            ['Payroll expense', hr.expense], ['Profit after payroll', kpis.profit - hr.expense],
                            ['Employee salary payable', financials.employee_payable], ['Employee advances', financials.employee_advances],
                        ] as const).map(([label, value]) => <div className="exec-payroll-row" key={label}><span>{label}</span><b className="exec-num">{money(value)}</b></div>)}
                        <p className="exec-note">{hr.expense === 0 ? 'No net payroll expense in this period — profit after payroll equals net profit.' : 'Payroll expense follows the selected period. Staff balances are as of now.'}</p>
                    </section>
                </div>
            </div>
        </main>
    </AppLayout>;
}
