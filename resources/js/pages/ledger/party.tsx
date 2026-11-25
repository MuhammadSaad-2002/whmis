import { MasterStatus, RegisterLayout, RegisterList, RegisterMetric } from '@/components/master-register';
import AppLayout from '@/layouts/app-layout';
import { amount, pakistanDate, shiftDate, shortDate, totalAmount, totalMoney } from '@/lib/format';
import { Head, router } from '@inertiajs/react';
import { Printer } from 'lucide-react';
import { useEffect, useState } from 'react';
import './party.css';

interface StatementRow {
    id: number;
    date: string;
    type: string;
    description: string | null;
    debit: number;
    credit: number;
    balance: number;
}

interface Props {
    party: { id: number; name: string; city: string | null; phone: string | null };
    partyType: 'customer' | 'company';
    statement: { opening_balance: number; rows: StatementRow[]; closing_balance: number };
    aging: { current: number; '31_60': number; '61_90': number; over_90: number };
    outstanding: number;
    filters: { from?: string; to?: string };
}

const presets = ['7', '30', '90', 'all'] as const;
type Dates = { from: string; to: string };
const allDates: Dates = { from: '', to: '' };

function presetRange(preset: (typeof presets)[number], today: string): Dates {
    return preset === 'all' ? allDates : { from: shiftDate(today, 1 - Number(preset)), to: today };
}

function EntryType({ type }: { type: string }) {
    const tone = ['payment', 'receipt'].includes(type) ? 'positive'
        : type.includes('return') || type === 'adjustment' ? 'attention' : 'neutral';

    return <MasterStatus status={type.replaceAll('_', ' ')} tone={tone} />;
}

export default function LedgerParty({ party, partyType, statement, aging, outstanding, filters }: Props) {
    const isCustomer = partyType === 'customer';
    const kind = isCustomer ? 'Customer' : 'Supplier';
    const routeName = isCustomer ? 'ledger.customer' : 'ledger.supplier';
    const baseUrl = route(routeName, party.id, false);
    const [dates, setDates] = useState<Dates>({ from: filters.from ?? '', to: filters.to ?? '' });
    const [loading, setLoading] = useState(false);
    const today = pakistanDate();
    const hasFilters = Boolean(filters.from || filters.to || dates.from || dates.to);
    const inverted = Boolean(dates.from && dates.to && dates.from > dates.to);
    const activePreset = presets.find(preset => {
        const range = presetRange(preset, today);
        return range.from === dates.from && range.to === dates.to;
    });

    useEffect(() => setDates({ from: filters.from ?? '', to: filters.to ?? '' }), [filters.from, filters.to]);

    function updateDates(next: Dates) {
        setDates(next);
        if (next.from && next.to && next.from > next.to) return;
        if (!loading && next.from === (filters.from ?? '') && next.to === (filters.to ?? '')) return;
        router.get(baseUrl, { from: next.from || undefined, to: next.to || undefined }, {
            only: ['statement', 'filters'], preserveState: true, preserveScroll: true,
            onStart: () => setLoading(true), onFinish: () => setLoading(false),
        });
    }

    // Customer: debit balance = receivable. Supplier: credit balance = payable.
    const balance = (value: number) => isCustomer ? value : -value;
    const count = statement.rows.length;
    const pdfUrl = route(`${routeName}.pdf`, { [isCustomer ? 'customer' : 'company']: party.id, ...filters }, false);
    const title = `${kind} ledger`;

    return <AppLayout>
        <Head title={`${title} — ${party.name}`} />
        <div className="party-ledger" aria-busy={loading}>
            <RegisterLayout title={party.name}
                description={[title, party.city, party.phone].filter(Boolean).join(' · ')}
                actions={<a className="hbtn" href={pdfUrl} target="_blank" rel="noreferrer"><Printer className="i" aria-hidden="true" />Statement PDF</a>}>
                <section className="kpis" aria-label="Ledger summary">
                    <RegisterMetric label="Outstanding" value={totalMoney(outstanding)} color="var(--sales)" detail={isCustomer ? 'Current receivable' : 'Current payable'} />
                    <RegisterMetric label="Current (0–30)" value={amount(aging.current)} detail="Days outstanding" />
                    <RegisterMetric label="31–60 days" value={amount(aging['31_60'])} color="var(--teal2)" />
                    <RegisterMetric label="61–90 days" value={amount(aging['61_90'])} color="var(--amber)" />
                    <RegisterMetric label="Over 90 days" value={<span className={aging.over_90 > 0 ? 'neg' : undefined}>{amount(aging.over_90)}</span>} color="var(--red)" />
                </section>

                <RegisterList title={title} controls={<>
                    <label className="fld date-field register-date"><small>From</small>
                        <input type="date" value={dates.from} onChange={event => updateDates({ ...dates, from: event.target.value })} />
                    </label>
                    <label className="fld date-field register-date"><small>To</small>
                        <input type="date" value={dates.to} aria-invalid={inverted}
                            aria-describedby={inverted ? 'ledger-date-error' : undefined} onChange={event => updateDates({ ...dates, to: event.target.value })} />
                    </label>
                    <div className="presets" role="group" aria-label="Statement date presets">
                        {presets.map(preset => <button key={preset} type="button" className={preset === activePreset ? 'on' : ''}
                            aria-pressed={preset === activePreset} onClick={() => updateDates(presetRange(preset, today))}>
                            {preset === 'all' ? 'All' : `${preset}D`}
                        </button>)}
                    </div>
                    {hasFilters && <button type="button" className="clear" onClick={() => updateDates(allDates)}>Clear filters</button>}
                    {inverted && <p id="ledger-date-error" className="filter-error" role="alert">To date must be on or after From date.</p>}
                </>}>
                    {dense => <table className={`ledger-entries${dense ? ' dense' : ''}`}>
                        <thead><tr>
                            <th scope="col" aria-sort="ascending">Date</th>
                            <th scope="col">Type</th>
                            <th scope="col">Description</th>
                            <th scope="col" className="r">Debit</th>
                            <th scope="col" className="r">Credit</th>
                            <th scope="col" className="r">Balance</th>
                        </tr></thead>
                        <tbody>
                            <tr className="ledger-opening">
                                <td colSpan={5}>Opening Balance</td>
                                <td className="r num">{amount(balance(statement.opening_balance))}</td>
                            </tr>
                            {count === 0 && <tr><td colSpan={6} className="empty">No ledger entries {filters.from || filters.to ? 'in this period.' : 'yet.'}</td></tr>}
                            {statement.rows.map(row => <tr key={row.id}>
                                <td>{shortDate(row.date)}</td>
                                <td><EntryType type={row.type} /></td>
                                <td className="wrap-cell ledger-description">{row.description || <span className="muted">—</span>}</td>
                                <td className="r num">{row.debit > 0 ? amount(row.debit) : ''}</td>
                                <td className="r num">{row.credit > 0 ? amount(row.credit) : ''}</td>
                                <td className="r num number-cell">{amount(balance(row.balance))}</td>
                            </tr>)}
                        </tbody>
                        <tfoot><tr>
                            <td colSpan={5}>Closing Balance <small className="muted">· {count.toLocaleString('en-PK')} {count === 1 ? 'entry' : 'entries'}</small></td>
                            <td className="r num">{totalAmount(balance(statement.closing_balance))}</td>
                        </tr></tfoot>
                    </table>}
                </RegisterList>
            </RegisterLayout>
        </div>
    </AppLayout>;
}
