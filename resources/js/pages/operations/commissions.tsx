import { Paginator, type PaginatedData } from '@/components/paginator';
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { usePermissions } from '@/hooks/use-permissions';
import AppLayout from '@/layouts/app-layout';
import { money, pct, shortDate, totalPaisaMoney as cashTotal } from '@/lib/format';
import { Head, Link, router, useForm } from '@inertiajs/react';
import { ArrowUpRight, CalendarDays, ChevronRight, DollarSign, FileText, List, Plus, type LucideIcon } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Errors } from './shared';
import './commissions.css';

type Rule = { id: number; scope: string; source: string; role: string; effective_from: string; mode: string; rate: number; basis: string; current_version_date: string | null };
type Award = { id: number; invoice_number: string; role: string; state: string; verified_paisa: number; calculated_paisa: number; accrued_paisa: number; earned_paisa: number; payable_paisa: number; paid_paisa: number };
type Entry = { id: number; invoice_number: string | null; role: string | null; kind: string; business_date: string; payable_paisa: number; recovery_paisa: number; cash_out_paisa: number; reason: string };
type Employee = { id: number; name: string; employee_number: string };
type Totals = Record<'calculated' | 'accrued' | 'pending' | 'earned' | 'paid' | 'recovery' | 'recovered' | 'payable', number>;
type Column<T> = { title: string; cell: (row: T) => ReactNode };
type PreviewRules = Partial<Record<'booker' | 'salesman', Rule>>;
type Props = { employee: Employee | null; employees: Employee[]; employeeIdentity: { login: string; roles: string[] } | null; manage: boolean; totals: Totals; awards: PaginatedData<Award>; entries: PaginatedData<Entry>; rules: PaginatedData<Rule>; previewRules: PreviewRules; hold: boolean; today: string };

const cash = (value: number) => money(Number(value) / 100);
const words = (value: string) => value.replaceAll('_', ' ');
const modes: Record<string, string> = { percent: 'Percentage', proportional: 'Proportional fixed', full_fixed: 'Full fixed', off: 'Disabled' };
const bases: Record<string, string> = { collected: 'Verified collections', invoice: 'Invoice', booking: 'Approved booking' };
const describeStages = [
    ['calculated', 'Calculated', 'Under the applicable rates'], ['accrued', 'Accrued', 'Tracks verified settlement'],
    ['pending', 'Pending', 'Waiting for delivery and settlement'], ['earned', 'Earned', 'Awarded on settled invoices'],
] as const;

export default function Commissions({ employee, employees, employeeIdentity, manage, totals, awards, entries, rules, previewRules, hold, today }: Props) {
    const { can } = usePermissions();
    const [loading, setLoading] = useState(false);
    const canRequest = manage && can('finance.request');
    const hasDue = Number(totals.payable) > 0;
    const hasRecovery = Number(totals.recovery) > 0;
    const initial = employee?.name.trim().split(/\s+/).slice(0, 2).map(word => word[0]).join('').toUpperCase();

    function selectEmployee(id: string) {
        router.get('/commissions', { employee_id: id }, { preserveState: true, preserveScroll: true, onStart: () => setLoading(true), onFinish: () => setLoading(false) });
    }

    const awardColumns: Column<Award>[] = [
        { title: 'Invoice', cell: row => <><strong>{row.invoice_number}</strong><small className="commission-capitalize">{row.role}</small></> },
        { title: 'Status', cell: row => <AwardStatus award={row} /> },
        { title: 'Verified collected', cell: row => cash(row.verified_paisa) }, { title: 'Calculated', cell: row => cash(row.calculated_paisa) },
        { title: 'Accrued', cell: row => cash(row.accrued_paisa) }, { title: 'Earned', cell: row => cash(row.earned_paisa) },
        { title: 'Paid', cell: row => cash(row.paid_paisa) }, { title: 'Due', cell: row => <strong>{cash(row.payable_paisa)}</strong> },
        ...(canRequest && employee ? [{ title: 'Action', cell: (row: Award) => Number(row.payable_paisa) > 0 ? <Link className="commission-table-action" href={approvalLink('commission_payout', employee.id, row)}>Request payout<ArrowUpRight aria-hidden="true" /></Link> : '—' }] : []),
    ];
    const entryColumns: Column<Entry>[] = [
        { title: 'Date', cell: row => shortDate(row.business_date) },
        { title: 'Activity', cell: row => <strong className="commission-capitalize">{words(row.kind)}</strong> },
        { title: 'Invoice', cell: row => <>{row.invoice_number ?? '—'}{row.role && <small className="commission-capitalize">{row.role}</small>}</> },
        { title: 'Details', cell: row => row.reason || '—' },
        { title: 'Payable change', cell: row => cash(row.payable_paisa) }, { title: 'Recovery change', cell: row => cash(row.recovery_paisa) },
        { title: 'Cash out', cell: row => cash(row.cash_out_paisa) },
    ];

    return <AppLayout><Head title="Employee Commissions" />
        <main className="commission-page">
            <section className="commission-hero" aria-labelledby="commission-title">
                <div className="commission-hero-top"><div><h1 id="commission-title">Employee Commissions</h1><p>What each employee earned, what’s due, and what’s already been paid.</p></div>
                    {can('view-staff-daily-activity') && <Link href="/staff-activity" className="commission-hero-link"><CalendarDays aria-hidden="true" />Daily staff activity</Link>}
                </div>
                <div className="commission-employee">
                    {employee && <span className="commission-avatar" aria-hidden="true">{initial}</span>}
                    <div className="commission-employee-picker">
                        <select aria-label="Employee" value={employee?.id ?? ''} disabled={loading || !employees.length} onChange={event => selectEmployee(event.target.value)}>
                            {!employees.length && <option value="">No employees available</option>}
                            {employees.map(person => <option key={person.id} value={person.id}>{person.name.toUpperCase()}</option>)}
                        </select>
                    </div>
                    <div className="commission-roles">{employeeIdentity?.roles.map(role => <Pill key={role} tone={role === 'Booker' ? 'teal' : 'blue'}>{role}</Pill>)}</div>
                    <small className="commission-employee-note" role="status">{loading ? 'Loading employee…' : <>{employee?.employee_number}{employeeIdentity?.login && <> · login {employeeIdentity.login}</>}{employee && ' · '}all-time balances, dates in PKT</>}</small>
                </div>
            </section>

            {employee && <div aria-busy={loading}>
                <section className="commission-balances" aria-label="Employee commission balances">
                    <div className="commission-card commission-pad"><h2>Payouts</h2><div className="commission-due">
                        <small>Payout due</small><strong>{cashTotal(totals.payable)}</strong><em>{hasDue ? 'Ready to request' : 'Nothing due yet'}</em>
                    </div><dl className="commission-paid"><BalanceLine label="Paid to date" value={totals.paid} /></dl></div>
                    <div className="commission-card commission-pad commission-earn"><div className="commission-section-title"><h2>Earnings</h2><span>how commission moves to payable</span></div>
                        <div className="commission-stages">{describeStages.map(([key, label, detail]) => <div key={key} data-stage={key}>
                            <small><i />{label}</small><strong data-zero={!Number(totals[key])}>{cashTotal(totals[key])}</strong><p>{detail}</p>
                        </div>)}</div>
                    </div>
                    <div className="commission-card commission-pad"><h2>Recovery</h2><dl>
                        <BalanceLine label="Recovery outstanding" value={totals.recovery} warning />
                        <BalanceLine label="Recovery adjusted" value={totals.recovered} />
                        <div className="commission-kv"><dt>Status</dt><dd><Pill tone={hold ? 'neutral' : hasRecovery ? 'amber' : 'green'} dot={!hold && !hasRecovery}>{hold ? 'On hold' : hasRecovery ? 'Recovering' : 'Nothing to recover'}</Pill></dd></div>
                    </dl></div>
                </section>

                {canRequest && <div className="commission-card commission-actions">
                    <ApprovalAction employee={employee.id} kind="commission_payout" enabled={hasDue} primary><DollarSign aria-hidden="true" />Request commission payout</ApprovalAction>
                    <ApprovalAction employee={employee.id} kind="recovery_repayment" enabled={hasRecovery}>Recovery repayment</ApprovalAction>
                    <ApprovalAction employee={employee.id} kind="recovery_waiver" enabled={hasRecovery}>Recovery waiver</ApprovalAction>
                    <ApprovalAction employee={employee.id} kind={hold ? 'recovery_resume' : 'recovery_hold'} enabled={hasRecovery || hold}>{hold ? 'Resume recovery' : 'Hold recovery'}</ApprovalAction>
                    {!hasDue && <p>{!hasRecovery && !hold ? 'Nothing is due and nothing to recover, so these actions are off.' : 'No payout due yet.'}</p>}
                </div>}

                <Tabs defaultValue="earnings" className="commission-card commission-lower-card">
                    <TabsList className="commission-tabs" aria-label="Commission details">
                        <TabsTrigger value="earnings"><FileText aria-hidden="true" />Invoice earnings <span>{awards.total}</span></TabsTrigger>
                        <TabsTrigger value="history"><List aria-hidden="true" />Commission &amp; recovery history <span>{entries.total}</span></TabsTrigger>
                    </TabsList>
                    <TabsContent value="earnings" className="commission-tab-content">
                        <CommissionTable label="Invoice earnings" page={awards} columns={awardColumns} icon={FileText} empty="No invoice earnings yet" note="Verified collections and commission are shown per invoice and role. Payouts become available after delivery and settlement." />
                    </TabsContent>
                    <TabsContent value="history" className="commission-tab-content">
                        <CommissionTable label="Commission and recovery history" page={entries} columns={entryColumns} icon={List} empty="No history yet" note="Commission awards, payouts and recoveries will be listed here in date order." />
                    </TabsContent>
                </Tabs>
            </div>}

            {manage && <section className="commission-card commission-lower-card" aria-labelledby="commission-rate-title">
                <div className="commission-rates-header"><h2 id="commission-rate-title">Commission rates</h2><span>{rules.total} {rules.total === 1 ? 'version' : 'versions'}</span><RateEditor employees={employees} today={today} /></div>
                <CommissionTable label="Commission rate versions" page={rules} columns={rateColumns(today, employees)} icon={List} empty="No commission rates yet" note="Add a rate version for the Booker or Salesman role." />
                <RatePreview rules={previewRules} />
            </section>}

            <details className="commission-card commission-explainer"><summary><ChevronRight aria-hidden="true" />How these figures are counted</summary>
                <div className="commission-definitions">
                    <p><strong>Verified collections</strong> count amounts Finance verified and posted against the invoice. Reports awaiting verification, shortage amounts, and credits are not collections.</p>
                    <p><strong>Calculated</strong> and <strong>accrued</strong> are not payable yet. A delivered and fully settled invoice releases eligible commission. <strong>Payout due</strong> is what remains after payouts and recovery offsets.</p>
                    <p><strong>Paid to date</strong> includes posted payouts only. These are the selected employee’s <strong>all-time</strong> figures. Daily Staff Activity shows one business day.</p>
                </div>
            </details>
        </main>
    </AppLayout>;
}

function Pill({ children, tone, dot }: { children: ReactNode; tone: string; dot?: boolean }) {
    return <span className="commission-pill" data-tone={tone}>{dot && <i />}{children}</span>;
}

function BalanceLine({ label, value, warning }: { label: string; value: number; warning?: boolean }) {
    return <div className="commission-kv"><dt>{label}</dt><dd data-zero={!Number(value)} data-warning={warning && Number(value) > 0}>{cash(value)}</dd></div>;
}

function AwardStatus({ award }: { award: Award }) {
    if (award.state === 'due' && Number(award.payable_paisa) === 0) {
        if (Number(award.paid_paisa) > 0) return <Pill tone="green" dot>Paid</Pill>;
        if (Number(award.earned_paisa) > 0) return <Pill tone="neutral">Offset</Pill>;
        return <Pill tone="neutral">No commission</Pill>;
    }
    return <Pill tone={award.state === 'due' ? 'green' : award.state.startsWith('pending') ? 'amber' : 'neutral'} dot>{words(award.state)}</Pill>;
}

function approvalLink(kind: string, employee: number, award?: Award) {
    const query = new URLSearchParams({ kind, employee_id: String(employee) });
    if (award) { query.set('award_id', String(award.id)); query.set('amount', (Number(award.payable_paisa) / 100).toFixed(2)); }
    return `/finance-approvals?${query.toString()}`;
}

function ApprovalAction({ kind, employee, enabled, primary, children }: { kind: string; employee: number; enabled: boolean; primary?: boolean; children: ReactNode }) {
    const className = `commission-button${primary ? ' commission-button-primary' : ''}`;
    return enabled ? <Link className={className} href={approvalLink(kind, employee)}>{children}</Link> : <button type="button" className={className} disabled>{children}</button>;
}

function CommissionTable<T extends { id: number }>({ label, page, columns, icon: Icon, empty, note }: { label: string; page: PaginatedData<T>; columns: Column<T>[]; icon: LucideIcon; empty: string; note: string }) {
    if (!page.data.length && page.last_page <= 1) return <div className="commission-empty"><span><Icon aria-hidden="true" /></span><strong>{empty}</strong><p>{note}</p></div>;
    return <>
        <div className="commission-table-scroll" tabIndex={0} role="region" aria-label={`${label} table`}>
            <table aria-label={label}><thead><tr>{columns.map(column => <th key={column.title} scope="col">{column.title}</th>)}</tr></thead>
                <tbody>{page.data.map(row => <tr key={row.id}>{columns.map(column => <td key={column.title}>{column.cell(row)}</td>)}</tr>)}</tbody></table>
        </div>
        {page.last_page > 1 && <div className="commission-pager"><Paginator meta={page} /></div>}
    </>;
}

function rateColumns(today: string, employees: Employee[]): Column<Rule>[] {
    const names = new Map(employees.map(person => [String(person.id), person.name]));
    return [
        { title: 'Status', cell: row => row.effective_from > today ? <Pill tone="amber" dot>Scheduled</Pill> : row.effective_from === row.current_version_date ? <Pill tone={row.mode === 'off' ? 'neutral' : 'green'} dot>{row.mode === 'off' ? 'Disabled' : 'Active'}</Pill> : <Pill tone="neutral" dot>Replaced</Pill> },
        { title: 'Effective from', cell: row => <strong>{shortDate(row.effective_from)}</strong> },
        { title: 'Source', cell: row => row.source === 'direct' ? 'Direct sale' : 'Booking' },
        { title: 'Role', cell: row => <Pill tone={row.role === 'booker' ? 'teal' : 'blue'}>{row.role}</Pill> },
        { title: 'Scope', cell: row => {
            const [scope, id] = row.scope.split(':');
            return scope === 'employee' ? names.get(id) ?? `Employee #${id}` : scope === 'booking' ? `Booking #${id}` : 'Default';
        } },
        { title: 'Rate', cell: row => <div className="commission-rate"><strong>{row.mode === 'off' ? '—' : row.mode === 'percent' ? pct(row.rate / 100) : cash(row.rate)}</strong><small>{modes[row.mode]}</small></div> },
        { title: 'Basis', cell: row => bases[row.basis] ?? row.basis },
    ];
}

function RatePreview({ rules }: { rules: PreviewRules }) {
    const [value, setValue] = useState('10000');
    const estimate = (rule?: Rule) => !rule || rule.mode === 'off' ? 0 : rule.mode === 'percent' ? Math.round(Math.max(0, Number(value) || 0) * Number(rule.rate) / 100) : Number(rule.rate);
    const booker = estimate(rules.booker);
    const salesman = estimate(rules.salesman);
    return <div className="commission-preview"><label>Preview: on a fully delivered, settled booking invoice of <span>Rs <input aria-label="Example eligible amount" type="number" min="0" step=".01" value={value} onChange={event => setValue(event.target.value)} /></span></label>
        <p>Booker <strong>{cash(booker)}</strong> · Salesman <strong>{cash(salesman)}</strong> · Both roles <strong>{cashTotal(booker + salesman)}</strong></p>
        <small>Illustration using default rates and the same eligible amount for both roles, with no split or overrides.</small>
    </div>;
}

function RateEditor({ employees, today }: { employees: Employee[]; today: string }) {
    const [open, setOpen] = useState(false);
    const form = useForm({ source: 'booking', role: 'booker', employee_id: '', booking_id: '', basis: 'collected', mode: 'percent', rate: '', effective_from: today, dispatch_share: '' });
    const percent = form.data.mode === 'percent';
    const segment = (field: 'source' | 'role', label: string, options: [string, string][]) => <div className="commission-form-field"><span>{label}</span>
        <div className="commission-segment" role="group" aria-label={label}>{options.map(([value, title]) => <button key={value} type="button" aria-pressed={form.data[field] === value} onClick={() => {
            if (field === 'source' && value === 'direct') form.setData(data => ({ ...data, source: value, booking_id: '', basis: data.basis === 'booking' ? 'collected' : data.basis }));
            else form.setData(field, value);
        }}>{title}</button>)}</div></div>;
    return <Dialog open={open} onOpenChange={next => { setOpen(next); if (!next) { form.reset(); form.clearErrors(); } }}>
        <DialogTrigger asChild><button type="button" className="commission-button commission-button-primary"><Plus aria-hidden="true" />New rate version</button></DialogTrigger>
        <DialogContent appearance="form" className="commission-dialog">
            <div data-popup-section="header"><DialogTitle>New commission rate version</DialogTitle><DialogDescription>A new version takes over on its effective date. Earlier commission snapshots keep their original rate.</DialogDescription></div>
            <form onSubmit={event => { event.preventDefault(); form.post('/commissions/rules', { preserveScroll: true, onSuccess: () => { setOpen(false); form.reset(); } }); }}>
                <div data-popup-section="body"><div className="commission-form">
                    {segment('source', 'Invoice source', [['booking', 'Booking'], ['direct', 'Direct sale']])}
                    {segment('role', 'Role', [['booker', 'Booker'], ['salesman', 'Salesman']])}
                    <label className="commission-form-field">Calculation mode<select value={form.data.mode} onChange={event => form.setData('mode', event.target.value)}>{Object.entries(modes).map(([key, text]) => <option value={key} key={key}>{text}</option>)}</select></label>
                    <label className="commission-form-field" htmlFor="commission-rule-rate">Rate <span className="commission-required">*</span><span className="commission-rate-input" data-popup-composite>
                        {!percent && <span>Rs</span>}<input id="commission-rule-rate" required type="number" min="0" max={percent ? 100 : undefined} step=".01" value={form.data.rate} onChange={event => form.setData('rate', event.target.value)} />{percent && <span>%</span>}
                    </span></label>
                    <label className="commission-form-field" htmlFor="commission-rule-basis">Calculation basis<select id="commission-rule-basis" aria-label="Calculation basis" aria-describedby="commission-basis-help" value={form.data.basis} onChange={event => form.setData('basis', event.target.value)}>
                        {Object.entries(bases).filter(([value]) => value !== 'booking' || form.data.source === 'booking').map(([key, text]) => <option value={key} key={key}>{text}</option>)}
                    </select><small id="commission-basis-help">{form.data.basis === 'collected' ? 'Only collections verified and posted by Finance count.' : 'Uses eligible goods value after discounts and returns.'}</small></label>
                    <label className="commission-form-field">Effective from <span className="commission-required">*</span><input required type="date" min={today} value={form.data.effective_from} onChange={event => form.setData('effective_from', event.target.value)} /></label>
                    <label className="commission-form-field">Employee override <small>optional</small><select value={form.data.employee_id} onChange={event => form.setData('employee_id', event.target.value)}><option value="">Everyone in this role</option>{employees.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
                    {form.data.source === 'booking' && <label className="commission-form-field">Booking ID override <small>optional</small><input type="number" min="1" value={form.data.booking_id} onChange={event => form.setData('booking_id', event.target.value)} /></label>}
                    {form.data.role === 'salesman' && <label className="commission-form-field">Original assignee share (%)<input type="number" min="0" max="100" step=".01" value={form.data.dispatch_share} onChange={event => form.setData('dispatch_share', event.target.value)} /></label>}
                </div>
                <div className="mt-4" data-popup-note>{form.data.rate !== '' ? <>From <strong>{shortDate(form.data.effective_from)}</strong>, the {form.data.role} rule is <strong>{percent ? pct(form.data.rate) : money(form.data.rate)}</strong> on the {bases[form.data.basis].toLowerCase()} basis.</> : 'Enter a rate to see how it applies.'}</div>
                <Errors errors={form.errors} /></div>
                <div data-popup-section="footer"><button className="commission-button" data-popup-action="secondary" type="button" onClick={() => { setOpen(false); form.reset(); form.clearErrors(); }}>Cancel</button><button className="commission-button commission-button-primary" data-popup-action="primary" disabled={form.processing}>Save rate version</button></div>
            </form>
        </DialogContent>
    </Dialog>;
}
