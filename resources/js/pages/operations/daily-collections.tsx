import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { money, shortDate, totalPaisaMoney as cashTotal, totalMoney } from '@/lib/format';
import { Link, router, useForm } from '@inertiajs/react';
import { useState } from 'react';
import PaymentReconciliation from './payment-reconciliation';
import { Errors, Field, Layout, Status, type Staff } from './shared';

export type Account = { id: number; name: string; kind: string };
export type Day = { id: number; salesman_id: number; salesman: string; revision: number; submitted_at: string | null; closed_at: string | null; counted_cash_paisa: number | null; variance_note: string | null };
export type Row = { id: number; collection_day_id: number; invoice_number: string; sales_invoice_id: number; customer: string; total_amount: string; outstanding: number; reported_paisa: number; previous_paid_paisa: number; verified_paisa: number | null; recorded_at: string | null; shortage_paisa: number; method: string; reference: string | null; payment_number: string | null; payment_status: string | null; review_note: string | null; created_at: string | null; payment_id: number | null; included_in_opening: boolean | number; reviewer?: string | null; posted_reference?: string | null; posted_on_date_paisa?: number;
    actual_received_paisa: number; invoice_settled_paisa: number; payment_date: string | null };
export type ReconciliationProps = { days: Day[]; rows: Row[]; date: string; staff: Staff[]; accounts: Account[]; salesmanId: number | null; cashNotes: number[]; canPost: boolean; actorId: number };
const cash = (paisa: number | null) => money(Number(paisa ?? 0) / 100);

export default function DailyCollections({ finance, ...props }: ReconciliationProps & { finance: boolean }) {
    return finance ? <PaymentReconciliation {...props} /> : <MyCollections key={props.date} {...props} />;
}

function MyCollections({ days, rows, date }: Pick<ReconciliationProps, 'days' | 'rows' | 'date'>) {
    const [day, setDay] = useState(date);
    const path = '/my-collections';
    return <Layout title="Daily Collection Summary" description="Pakistan business date · Reported collections do not count as posted payments."
        actions={<div className="flex flex-wrap gap-2 print:hidden"><Button variant="outline" asChild><a href={`${path}?date=${date}&format=csv`}>Export CSV</a></Button><Button variant="outline" asChild><a href={`${path}?date=${date}&format=pdf`} target="_blank" rel="noopener">Print PDF</a></Button></div>}>
        <form className="flex flex-wrap items-end gap-2 print:hidden" onSubmit={e => { e.preventDefault(); router.get(path, { date: day }); }}>
            <Field label="Date"><Input required type="date" value={day} onChange={e => setDay(e.target.value)}/></Field>
            <Button>Apply</Button>
        </form>
        {!days.length && <p className="rounded-lg border p-4 text-sm">No deliveries or collections reported for this date.</p>}
        {days.map(d => <DayPanel key={d.id} day={d} rows={rows.filter(r => r.collection_day_id === d.id)} />)}
    </Layout>;
}

function DayPanel({ day, rows }: { day: Day; rows: Row[] }) {
    const reported = rows.filter(r => r.method === 'cash').reduce((s, r) => s + Number(r.reported_paisa), 0);
    const verified = rows.filter(r => r.method === 'cash').reduce((s, r) => s + Number(r.verified_paisa ?? 0), 0);
    const recognizedShortage = rows.reduce((s, r) => s + Number(r.shortage_paisa ?? 0), 0);
    const received = rows.reduce((s, r) => s + r.actual_received_paisa, 0);
    const posted = rows.reduce((s, r) => s + r.invoice_settled_paisa, 0);
    const submit = useForm({});
    const pending = rows.filter(r => !r.recorded_at).length;
    return <section className="grid gap-3 rounded-xl border bg-card p-3">
        <div className="flex flex-wrap items-center gap-2"><h2 className="text-lg font-semibold">{day.salesman}{day.revision > 1 ? ` · Supplement ${day.revision - 1}` : ''}</h2><Status value={day.closed_at ? 'closed' : day.submitted_at ? 'submitted' : 'reported'}/><span className="text-sm text-muted-foreground">{pending} pending</span></div>
        <div className="grid gap-1 text-sm sm:grid-cols-3">
            <p>Reported cash: <b>{cashTotal(reported)}</b></p><p>Counted cash: <b>{day.counted_cash_paisa === null ? 'Not counted' : cashTotal(day.counted_cash_paisa)}</b></p>
            <p>Actual received: <b>{cashTotal(received)}</b></p><p>Settled on invoices: <b>{cashTotal(posted)}</b></p>
            {day.counted_cash_paisa !== null && <><p>Reported less counted: <b>{cashTotal(reported - day.counted_cash_paisa)}</b></p><p>Cash applied at reconciliation: <b>{cashTotal(verified)}</b></p><p>Unresolved difference: <b>{cashTotal(reported - day.counted_cash_paisa - recognizedShortage)}</b></p><p>Counted cash not applied: <b>{cashTotal(day.counted_cash_paisa - verified)}</b></p></>}
            {day.variance_note && <p>Variance reason: {day.variance_note}</p>}
        </div>
        {!day.submitted_at && <div className="print:hidden"><Button onClick={() => submit.post(`/my-collections/${day.id}/submit`, { preserveScroll: true })} disabled={submit.processing}>Submit day to Finance</Button><Errors errors={submit.errors}/></div>}
        {rows.map(row => <article key={row.id} className="grid gap-2 rounded-lg border p-3 text-sm">
            <div className="flex flex-wrap justify-between gap-2"><Link className="font-semibold underline-offset-4 hover:underline" href={`/dispatch/${row.sales_invoice_id}`}>{row.customer} · {row.invoice_number}</Link><Status value={row.recorded_at ? row.payment_status === 'cancelled' ? 'reversed' : 'recorded' : 'pending'}/></div>
            <div className="grid gap-1 sm:grid-cols-3">
                <span>Invoice {totalMoney(row.total_amount)}</span><span>Previously paid {cash(row.previous_paid_paisa)}</span><span>Outstanding {money(Math.max(0, Number(row.outstanding)))}</span>
                <span>Reported {cash(row.reported_paisa)} · {row.method === 'none' ? 'No payment' : row.method}</span>
                <span>Actual received {cash(row.actual_received_paisa)}</span><span>Invoice settled {cash(row.invoice_settled_paisa)}</span>
                <span>{row.payment_number ?? row.reference ?? '—'}{row.payment_date ? ` · ${shortDate(row.payment_date)}` : ''}</span>
            </div>
            {row.review_note && <p>{row.review_note}</p>}
            {Number(row.shortage_paisa) > 0 && <p>Employee shortage reported: {cash(row.shortage_paisa)}</p>}
        </article>)}
    </section>;
}
