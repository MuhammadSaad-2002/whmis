import { Button } from '@/components/ui/button';
import { money } from '@/lib/format';
import { Link } from '@inertiajs/react';
import { Layout } from './shared';

type Dependency = { id: number; kind: string; status: string; amount_paisa: number; target_id: number | null };
type Invoice = { id: number; number: string; outstanding: number; projected: number; refund_credit: number; commission_paisa: number | null; dependencies: Dependency[] };
const cash = (n: number) => money(Number(n) / 100);
export default function ReversalPreview({ label, invoices, accounts }: { label: string; invoices: Invoice[]; accounts: {name: string; delta: number}[] }) {
    return <Layout title={`Reversal impact · ${label}`} description="Preview only. The system checks dependencies and balances again before any reversal.">
        {invoices.map(i => <article className="space-y-2 rounded-xl border p-4" key={i.id}>
            <h2 className="font-semibold">{i.number}</h2>
            <p>Current signed balance: {cash(i.outstanding)} · After reversal: {cash(i.projected)} · Credit available now: {cash(i.refund_credit)}</p>
            {i.commission_paisa !== null && <p>Current earned commission: {cash(i.commission_paisa)}. Delivery and settlement will be recalculated after reversal.</p>}
            {i.dependencies.map(d => <div className="space-y-1 rounded-md border p-2 text-sm" key={d.id}>
                <p>{d.kind.replaceAll('_',' ')} #{d.id} · {d.status} · {cash(d.amount_paisa)}{d.target_id && ` · Receiving invoice #${d.target_id}`}</p>
                {d.kind === 'credit_apply' && d.status === 'posted' && <Button variant="outline" asChild><Link href={`/finance-approvals?kind=credit_release&credit_id=${d.id}`}>Release linked credit</Link></Button>}
                {d.kind === 'refund' && d.status === 'posted' && <Button variant="outline" asChild><Link href={`/finance-approvals?kind=refund_recovery&credit_id=${d.id}`}>Request refund recovery</Link></Button>}
                {['pending','approved'].includes(d.status) && <p>Withdraw this request in Finance Approvals before reversing.</p>}
            </div>)}
        </article>)}
        {accounts.length > 0 && <section className="rounded-xl border p-4"><h2 className="font-semibold">Treasury effects</h2>{accounts.map(a => <p key={a.name}>{a.name}: {cash(a.delta)}</p>)}</section>}
    </Layout>;
}
