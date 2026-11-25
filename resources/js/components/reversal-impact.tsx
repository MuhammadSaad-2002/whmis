import { Button } from '@/components/ui/button';
import { money } from '@/lib/format';
import { Link } from '@inertiajs/react';

type Dependency = { id: number; kind: string; status: string; amount_paisa: number; target_id: number | null };
type Invoice = { id: number; number: string; outstanding: number; projected: number; refund_credit: number; commission_paisa: number | null; dependencies: Dependency[] };

export type ReversalImpactData = { label: string; invoices: Invoice[]; accounts: { name: string; delta: number }[] };
export const reversalImpactDescription = 'Preview only. The system checks dependencies and balances again before any reversal.';

const cash = (paisa: number) => money(paisa / 100);

export function ReversalImpact({ invoices, accounts }: Pick<ReversalImpactData, 'invoices' | 'accounts'>) {
    if (invoices.length === 0 && accounts.length === 0) {
        return <p className="text-sm text-muted-foreground">No invoice allocations or visible treasury entries to preview.</p>;
    }

    return <div className="space-y-3">
        {invoices.map((invoice) => <article className="space-y-3 rounded-xl border p-4" key={invoice.id}>
            <h2 className="font-semibold">{invoice.number}</h2>
            <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
                {([
                    ['Current signed balance', invoice.outstanding],
                    ['Balance after reversal', invoice.projected],
                    ['Credit available now', invoice.refund_credit],
                ] as const).map(([label, amount]) => <div key={label}>
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd className="font-semibold tabular-nums">{cash(amount)}</dd>
                </div>)}
            </dl>
            {invoice.commission_paisa !== null && <p className="text-sm">Current earned commission: {cash(invoice.commission_paisa)}. Delivery and settlement will be recalculated after reversal.</p>}
            {invoice.dependencies.map((dependency) => <div className="space-y-1 rounded-md border p-2 text-sm" key={dependency.id}>
                <p>{dependency.kind.replaceAll('_', ' ')} #{dependency.id} · {dependency.status} · {cash(dependency.amount_paisa)}{dependency.target_id && ` · Receiving invoice #${dependency.target_id}`}</p>
                {dependency.kind === 'credit_apply' && dependency.status === 'posted' && <Button variant="outline" asChild><Link href={`/finance-approvals?kind=credit_release&credit_id=${dependency.id}`}>Release linked credit</Link></Button>}
                {dependency.kind === 'refund' && dependency.status === 'posted' && <Button variant="outline" asChild><Link href={`/finance-approvals?kind=refund_recovery&credit_id=${dependency.id}`}>Request refund recovery</Link></Button>}
                {['pending', 'approved'].includes(dependency.status) && <p>Withdraw this request in Finance Approvals before reversing.</p>}
            </div>)}
        </article>)}
        {accounts.length > 0 && <section className="rounded-xl border p-4">
            <h2 className="font-semibold">Treasury effects</h2>
            <dl className="mt-2 space-y-1 text-sm">
                {accounts.map((account, index) => <div key={index} className="flex flex-wrap justify-between gap-x-4">
                    <dt>{account.name}</dt>
                    <dd className="font-semibold tabular-nums">{cash(account.delta)}</dd>
                </div>)}
            </dl>
        </section>}
    </div>;
}
