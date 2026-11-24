import { Paginator, type PaginatedData } from '@/components/paginator';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { money } from '@/lib/format';
import { Link, router, useForm } from '@inertiajs/react';
import { Errors, Field, Layout, selectClass, StaffSelect, Status, todayPK, type Staff } from './shared';

type Award = { id: number; invoice_number: string; role: string; state: string; calculated_paisa: number; accrued_paisa: number; earned_paisa: number; payable_paisa: number; paid_paisa: number };
type Entry = { id: number; commission_award_id: number | null; kind: string; business_date: string; expense_paisa: number; payable_paisa: number; recovery_paisa: number; cash_out_paisa: number; reason: string };
type Rule = { id: number; scope: string; source: string; role: string; effective_from: string; mode: string; rate: number; basis: string; dispatch_share_bp: number };
const cash = (v: number) => money(Number(v) / 100);
export default function Commissions({ employee, employees, manage, totals, awards, entries, rules, hold }: { employee: Staff | null; employees: Staff[]; manage: boolean; totals: Record<string, number>; awards: PaginatedData<Award>; entries: PaginatedData<Entry>; rules: PaginatedData<Rule> | null; hold: boolean }) {
    return <Layout title="Employee Commissions" description="Commission becomes due only after delivery and verified invoice settlement.">
        {manage && <div className="sm:max-w-xs"><Field label="Employee"><StaffSelect staff={employees} value={String(employee?.id ?? '')} onChange={v => router.get('/commissions', { employee_id: v || undefined })}/></Field></div>}
        {!employee && <p className="rounded-lg border p-4">No employee is linked to this login.</p>}
        {employee && <>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">{Object.entries(totals).map(([key, value]) => <div className="rounded-lg border p-3" key={key}><p className="text-sm capitalize">{({ recovery: 'Recovery outstanding', recovered: 'Recovery adjusted', payable: 'Net commission payable' } as Record<string,string>)[key] ?? key}</p><p className="mt-1 text-lg font-bold tabular-nums">{cash(value)}</p></div>)}</div>
            {hold && <p className="text-sm">Automatic recovery offsets are on hold.</p>}
            {manage && <div className="flex flex-wrap gap-2">{['commission_payout','recovery_repayment','recovery_waiver',hold ? 'recovery_resume' : 'recovery_hold'].map(kind => <Button variant="outline" key={kind} asChild><Link className="capitalize" href={`/finance-approvals?kind=${kind}&employee_id=${employee.id}`}>{kind.replaceAll('_',' ')}</Link></Button>)}</div>}
            <section className="space-y-2"><h2 className="font-semibold">Invoice earnings</h2>{awards.data.map(row => <article key={row.id} className="flex flex-wrap justify-between gap-2 rounded-lg border p-3 text-sm"><p>{row.invoice_number} · {row.role}</p><Status value={row.state === 'due' && Number(row.payable_paisa) === 0 ? (Number(row.paid_paisa) ? 'paid' : 'offset') : row.state}/><p>Calculated {cash(row.calculated_paisa)} · Accrued {cash(row.accrued_paisa)} · Earned {cash(row.earned_paisa)} · Paid {cash(row.paid_paisa)} · Due {cash(row.payable_paisa)}</p></article>)}<Paginator meta={awards}/></section>
            <section className="space-y-2"><h2 className="font-semibold">Commission and recovery history</h2>{entries.data.map(row => <article key={row.id} className="rounded-lg border p-3 text-sm"><b className="capitalize">{row.kind.replaceAll('_',' ')}</b> · {row.business_date}{row.commission_award_id && ` · Award #${row.commission_award_id}`}
                <p>{row.reason}</p><p>Payable {cash(row.payable_paisa)} · Recovery {cash(row.recovery_paisa)} · Cash out {cash(row.cash_out_paisa)}</p></article>)}<Paginator meta={entries}/></section>
        </>}
        {manage && rules && <><RuleEditor employees={employees}/><section className="space-y-2"><h2 className="font-semibold">Rate versions</h2>{rules.data.map(rule => <p className="rounded-lg border p-3 text-sm" key={rule.id}>{rule.effective_from} · {rule.source} · {rule.role} · {rule.scope} · {rule.mode.replaceAll('_',' ')} · {rule.mode === 'percent' ? `${rule.rate / 100}%` : cash(rule.rate)} · {rule.basis} basis</p>)}<Paginator meta={rules}/></section></>}
    </Layout>;
}

function RuleEditor({ employees }: { employees: Staff[] }) {
    const form = useForm({ source: 'booking', role: 'booker', employee_id: '', booking_id: '', basis: 'invoice', mode: 'percent', rate: '', effective_from: todayPK(), dispatch_share: '' });
    const s = (key: 'source' | 'role' | 'mode' | 'basis', values: string[]) => <select className={selectClass} value={form.data[key]} onChange={e => form.setData(key,e.target.value)}>{values.map(v => <option value={v} key={v}>{v.replaceAll('_',' ')}</option>)}</select>;
    return <details className="rounded-lg border p-3"><summary className="cursor-pointer font-semibold">Configure a commission rate</summary><form className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3" onSubmit={e => { e.preventDefault(); form.post('/commissions/rules', { preserveScroll: true }); }}>
        <Field label="Invoice source">{s('source',['booking','direct'])}</Field><Field label="Role">{s('role',['booker','salesman'])}</Field>
        <Field label="Employee override (optional)"><StaffSelect staff={employees} value={form.data.employee_id} onChange={v => form.setData('employee_id',v)}/></Field>
        {form.data.source === 'booking' && <Field label="Booking ID override (optional)"><Input type="number" min="1" value={form.data.booking_id} onChange={e => form.setData('booking_id',e.target.value)}/></Field>}
        <Field label="Calculation basis">{s('basis',form.data.source === 'booking' ? ['invoice','booking'] : ['invoice'])}</Field><Field label="Calculation mode">{s('mode',['percent','proportional','full_fixed','off'])}</Field>
        <Field label={form.data.mode === 'percent' ? 'Rate (%)' : 'Fixed cap (PKR)'}><Input required type="number" step=".01" min="0" value={form.data.rate} onChange={e => form.setData('rate',e.target.value)}/></Field>
        {form.data.role === 'salesman' && <Field label="Original assignee share (%)"><Input type="number" step=".01" min="0" max="100" value={form.data.dispatch_share} onChange={e => form.setData('dispatch_share',e.target.value)}/></Field>}
        <Field label="Effective from"><Input required type="date" min={todayPK()} value={form.data.effective_from} onChange={e => form.setData('effective_from',e.target.value)}/></Field><div className="self-end"><Errors errors={form.errors}/><Button disabled={form.processing}>Save rate version</Button></div>
    </form></details>;
}
