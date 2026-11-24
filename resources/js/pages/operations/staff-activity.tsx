import AppLayout from '@/layouts/app-layout';
import { money, qty, shiftDate } from '@/lib/format';
import { Head, Link, router } from '@inertiajs/react';
import { ArrowUpRight, Banknote, CalendarDays, ChevronLeft, ChevronRight, Clipboard, DollarSign, TrendingUp, Truck, type LucideIcon } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import './staff-activity.css';

type Role = 'Booker' | 'Salesman';
type Filters = { role: Role | null; staff_id: number | null };
type StaffOption = { id: number; name: string };

type StaffActivity = StaffOption & {
    login_name: string | null;
    roles: Role[];
    employee_id: number | null;
    booking_count: number;
    booking_paisa: number;
    sale_count: number;
    sale_paisa: number;
    delivery_count: number;
    delivered_units: number;
    corrected_units: number;
    reported_paisa: number;
    submitted_paisa: number;
    verified_paisa: number;
    commission: {
        calculated_paisa: number;
        earned_paisa: number;
        paid_paisa: number;
        paid_to_date_paisa: number;
        payout_due_paisa: number;
    } | null;
};

type Props = {
    date: string;
    today: string;
    staff: StaffActivity[];
    staffOptions: StaffOption[];
    filters: Filters;
    invoiceTotals: { sale_count: number; sale_paisa: number; delivery_count: number };
    canViewCommissions: boolean;
};

const cash = (paisa: number) => money(paisa / 100);
const count = (n: number, noun: string) => `${qty(n)} ${noun}${n === 1 ? '' : 's'}`;
const dateLabel = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

const stages = {
    bookings: { title: 'Bookings', icon: Clipboard, tone: 'teal' },
    sales: { title: 'Sales posted', icon: TrendingUp, tone: 'blue' },
    deliveries: { title: 'Deliveries', icon: Truck, tone: 'violet' },
    collections: { title: 'Collections', icon: Banknote, tone: 'green' },
    commission: { title: 'Commission & payouts', icon: DollarSign, tone: 'amber' },
} as const;

export default function StaffActivityPage({ date, today, staff, staffOptions, filters, invoiceTotals, canViewCommissions }: Props) {
    const [loading, setLoading] = useState(false);
    const sum = (metric: (person: StaffActivity) => number) => staff.reduce((total, person) => total + metric(person), 0);

    function apply(day: string, next: Filters = filters) {
        if (loading || !/^\d{4}-\d{2}-\d{2}$/.test(day) || day > today || (day === date && next.role === filters.role && next.staff_id === filters.staff_id)) return;
        router.get('/staff-activity', { date: day === today ? undefined : day, role: next.role ?? undefined, staff_id: next.staff_id ?? undefined }, {
            preserveScroll: true,
            preserveState: true,
            only: ['date', 'today', 'staff', 'staffOptions', 'filters', 'invoiceTotals', 'canViewCommissions'],
            onStart: () => setLoading(true),
            onFinish: () => setLoading(false),
        });
    }

    return <AppLayout>
        <Head title="Daily Staff Activity" />
        <main className="staff-day">
            <section className="staff-day-hero" aria-labelledby="staff-day-title">
                <div className="staff-day-heading">
                    <div><h1 id="staff-day-title">Daily Staff Activity</h1><p>Booker and salesman activity for one business day, from bookings through to payouts.</p></div>
                    {canViewCommissions && <Link href="/commissions" className="staff-day-commissions"><DollarSign aria-hidden="true" />Employee commissions</Link>}
                </div>
                <div className="staff-day-controls" role="group" aria-label="Activity filters">
                    <div className="staff-day-date">
                        <button type="button" aria-label="Previous day" disabled={loading || date === '0001-01-01'} onClick={() => apply(shiftDate(date, -1))}><ChevronLeft aria-hidden="true" /></button>
                        <label className="staff-day-select"><span id="staff-day-date-label">Business date (PKT)</span><input aria-labelledby="staff-day-date-label" key={date} type="date" min="0001-01-01" max={today} defaultValue={date} required disabled={loading}
                            onChange={event => { if (event.currentTarget.validity.valid) apply(event.currentTarget.value); }} onBlur={event => { if (!event.currentTarget.validity.valid) event.currentTarget.value = date; }} /></label>
                        <button type="button" aria-label="Next day" disabled={loading || date >= today} onClick={() => apply(shiftDate(date, 1))}><ChevronRight aria-hidden="true" /></button>
                    </div>
                    <button type="button" className="staff-day-today" disabled={loading || date === today} onClick={() => apply(today)}>Today</button>
                    <label className="staff-day-select"><span id="staff-day-role-label">Role</span><select aria-labelledby="staff-day-role-label" value={filters.role ?? ''} disabled={loading} onChange={event => apply(date, { role: (event.target.value || null) as Role | null, staff_id: null })}>
                        <option value="">All roles</option><option>Booker</option><option>Salesman</option>
                    </select></label>
                    <label className="staff-day-select staff-day-person-filter"><span id="staff-day-staff-label">Staff</span><select aria-labelledby="staff-day-staff-label" value={filters.staff_id ?? ''} disabled={loading} onChange={event => apply(date, { ...filters, staff_id: Number(event.target.value) || null })}>
                        <option value="">All staff</option>{staffOptions.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}
                    </select></label>
                </div>
            </section>

            <section aria-label="Staff activity totals" className="staff-day-kpis" aria-busy={loading}>
                <Kpi stage="bookings" title="Bookings made" value={cash(sum(row => row.booking_paisa))} detail={count(sum(row => row.booking_count), 'booking')} />
                <Kpi stage="sales" title="Sales posted" value={cash(invoiceTotals.sale_paisa)} detail={count(invoiceTotals.sale_count, 'invoice')} />
                <Kpi stage="deliveries" title="Delivered" value={count(sum(row => row.delivered_units), 'unit')} detail={count(invoiceTotals.delivery_count, 'invoice')} />
                <Kpi stage="collections" title="Collections verified" value={cash(sum(row => row.verified_paisa))} detail={`${cash(sum(row => row.reported_paisa))} reported`} />
                <Kpi stage="commission" title="Payout due" value={cash(sum(row => row.commission?.payout_due_paisa ?? 0))} detail={`${cash(sum(row => row.commission?.calculated_paisa ?? 0))} calculated for this day`} />
            </section>

            <section aria-labelledby="activity-heading" aria-busy={loading}>
                <div className="staff-day-date-heading">
                    <CalendarDays aria-hidden="true" /><h2 id="activity-heading">{dateLabel.format(new Date(`${date}T00:00:00Z`))}{date === today ? ' · today' : ''}</h2>
                    <span role="status">{loading ? 'Loading activity…' : count(staff.length, 'staff member')}</span>
                </div>
                {staff.length ? staff.map(person => <StaffCard key={person.id} person={person} canViewCommissions={canViewCommissions} />) :
                    <div className="staff-day-empty"><strong>No staff match these filters</strong>Try another role or staff member.</div>}
            </section>

            <details className="staff-day-explainer">
                <summary><ChevronRight aria-hidden="true" />How these figures are counted</summary>
                <div className="staff-day-definitions">
                    <div><h3>Bookings, sales &amp; deliveries</h3><p>Bookings are counted on first save, including drafts but not cancelled or rejected bookings. Sales use posted invoice value before returns. Deliveries include partial handovers and bonus units. Summary invoice counts don’t double-count shared invoices.</p></div>
                    <div><h3>Collections</h3><p><strong>Reported</strong> uses the collection date. <strong>Submitted</strong> uses the handover date and may include earlier reports. <strong>Verified &amp; posted</strong> uses the verification date and counts only completed payments.</p></div>
                    <div><h3>Commissions &amp; payouts</h3><p><strong>Calculated</strong> is the current award for invoices posted on this day. <strong>Net earned</strong> includes ledger reversals on the day. <strong>Payout due</strong> and <strong>paid to date</strong> are balances through the selected date.</p></div>
                </div>
            </details>
        </main>
    </AppLayout>;
}

function StageIcon({ stage }: { stage: keyof typeof stages }) {
    const { icon: Icon, tone }: { icon: LucideIcon; tone: string } = stages[stage];
    return <span className="staff-day-icon" data-tone={tone}><Icon aria-hidden="true" /></span>;
}

function Kpi({ stage, title, value, detail }: { stage: keyof typeof stages; title: string; value: string; detail: string }) {
    return <div className="staff-day-kpi"><StageIcon stage={stage} /><div><div className="staff-day-kpi-label">{title}</div><p className="staff-day-kpi-value">{value}</p><p className="staff-day-kpi-detail">{detail}</p></div></div>;
}

function Stage({ stage, children }: { stage: keyof typeof stages; children: ReactNode }) {
    return <section className="staff-day-stage"><h4><StageIcon stage={stage} />{stages[stage].title}</h4>{children}</section>;
}

function MainMetric({ value, display, detail }: { value: number; display: string; detail: string }) {
    return <><p className="staff-day-metric" data-zero={!value}>{display}</p><p className="staff-day-metric-detail">{detail}</p></>;
}

function StaffCard({ person, canViewCommissions }: { person: StaffActivity; canViewCommissions: boolean }) {
    const { commission, booking_count, sale_count, delivery_count, corrected_units, reported_paisa, submitted_paisa, verified_paisa } = person;
    const anyDailyActivity = booking_count || sale_count || delivery_count || corrected_units || reported_paisa || submitted_paisa || verified_paisa || commission?.calculated_paisa || commission?.earned_paisa || commission?.paid_paisa;
    const notes: { tone: 'amber' | 'green' | 'neutral'; text: string }[] = [];
    if (!anyDailyActivity) notes.push({ tone: 'neutral', text: 'No activity recorded on this day' });
    if (sale_count && !booking_count) notes.push({ tone: 'neutral', text: `${count(sale_count, 'invoice')} posted · no new bookings today` });
    if (delivery_count && !reported_paisa) notes.push({ tone: 'amber', text: 'Deliveries made, no collections reported' });
    if (corrected_units) notes.push({ tone: 'neutral', text: `${count(corrected_units, 'unit')} corrected on this date` });
    if (commission && commission.payout_due_paisa > 0) notes.push({ tone: 'green', text: `${cash(commission.payout_due_paisa)} commission due as of this date` });
    const maxCollection = Math.max(reported_paisa, submitted_paisa, verified_paisa, 1);
    const initials = person.name.trim().split(/\s+/).slice(0, 2).map(part => part.charAt(0)).join('').toUpperCase();

    return <article className="staff-day-card" aria-label={person.name}>
        <header className="staff-day-card-heading">
            <span className="staff-day-avatar" data-role={person.roles.length > 1 ? 'dual' : person.roles[0]} aria-hidden="true">{initials}</span>
            <div className="staff-day-name"><h3>{person.name}</h3>{person.login_name && <small>Login {person.login_name}</small>}</div>
            <div className="staff-day-roles">{person.roles.map(role => <span key={role} data-role={role}>{role}</span>)}</div>
            {canViewCommissions && person.employee_id !== null && <Link href={`/commissions?employee_id=${person.employee_id}`} className="staff-day-details-link">Commission details<ArrowUpRight aria-hidden="true" /></Link>}
        </header>
        <div className="staff-day-flow">
            <Stage stage="bookings"><MainMetric value={person.booking_paisa} display={cash(person.booking_paisa)} detail={`${count(booking_count, 'booking')} made`} /></Stage>
            <Stage stage="sales"><MainMetric value={person.sale_paisa} display={cash(person.sale_paisa)} detail={count(sale_count, 'invoice')} /></Stage>
            <Stage stage="deliveries"><MainMetric value={person.delivered_units} display={count(person.delivered_units, 'unit')} detail={`${count(delivery_count, 'invoice')} delivered`} /></Stage>
            <Stage stage="collections"><dl className="staff-day-funnel">
                <CollectionLine label="Reported" value={reported_paisa} max={maxCollection} tone="neutral" />
                <CollectionLine label="Submitted" value={submitted_paisa} max={maxCollection} tone="blue" />
                <CollectionLine label="Verified & posted" value={verified_paisa} max={maxCollection} tone="green" />
            </dl></Stage>
            <Stage stage="commission">{commission ? <dl className="staff-day-awards">
                <AmountLine label="Calculated" value={commission.calculated_paisa} />
                <AmountLine label="Net earned" value={commission.earned_paisa} />
                <AmountLine label="Payout due as of date" value={commission.payout_due_paisa} highlight />
                <AmountLine label="Paid on date" value={commission.paid_paisa} />
                <AmountLine label="Paid to date" value={commission.paid_to_date_paisa} />
            </dl> : <p className="staff-day-metric-detail">No linked employee record.</p>}</Stage>
        </div>
        {!!notes.length && <footer className="staff-day-notes">{notes.map(note => <span key={note.text} data-tone={note.tone}>{note.text}</span>)}</footer>}
    </article>;
}

function CollectionLine({ label, value, max, tone }: { label: string; value: number; max: number; tone: string }) {
    return <div className="staff-day-funnel-row"><dt>{label}</dt><span className="staff-day-track" aria-hidden="true"><span data-tone={tone} style={{ inlineSize: `${value / max * 100}%` }} /></span><dd data-zero={!value}>{cash(value)}</dd></div>;
}

function AmountLine({ label, value, highlight = false }: { label: string; value: number; highlight?: boolean }) {
    return <div className="staff-day-amount" data-highlight={highlight} data-due={highlight && value > 0}><dt>{label}</dt><dd data-zero={!value}>{cash(value)}</dd></div>;
}
