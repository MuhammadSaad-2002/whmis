import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { router } from '@inertiajs/react';
import { X } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Errors } from './shared';
import { cash, kindText, PaneCard } from './treasury-ui';

const overview: Record<string, { label: string; applies: string }> = {
    opening: { label: 'Opening balance', applies: 'Opening balance requests' },
    transfer: { label: 'Transfer', applies: 'Between your own accounts' },
    expense: { label: 'Expense payout', applies: 'Cash or bank expenses' },
    adjustment: { label: 'Adjustment', applies: 'Balance differences and corrections' },
    statement: { label: 'Statement', applies: 'Cash counts and bank reconciliations' },
};

export function TreasuryApprovalLimits({ limits }: { limits: Record<string, number | null> }) {
    const [edits, setEdits] = useState<Record<string, string>>({});
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [saving, setSaving] = useState(false);
    const defaultFor = (kind: string) => limits[kind] === null ? '' : (Number(limits[kind]) / 100).toFixed(2);
    const dirty = Object.keys(edits).filter((kind) => (edits[kind] === '' ? null : Math.round(Number(edits[kind]) * 100)) !== limits[kind]);
    const save = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!dirty.length || saving) return;
        setSaving(true);
        router.post('/treasury/limits', { limits: Object.fromEntries(dirty.map((kind) => [kind, edits[kind] || null])) }, {
            preserveScroll: true, onError: setErrors, onSuccess: () => { setErrors({}); setEdits({}); }, onFinish: () => setSaving(false),
        });
    };
    const row = (kind: string) => <tr key={kind} className={cn('border-t', dirty.includes(kind) ? 'bg-chart-4/8' : 'hover:bg-muted/30')}>
        <th scope="row" className="px-3 py-2.5 text-left font-semibold">{overview[kind]?.label ?? kindText(kind)}</th>
        <td className="px-3 py-2.5 text-muted-foreground">{overview[kind]?.applies ?? 'Requests of this type'}</td>
        <td className="px-3 py-2.5"><span className={cn('whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold', limits[kind] === null ? 'bg-chart-4/12 text-chart-4' : 'bg-accent text-accent-foreground')}>{limits[kind] === null ? 'Super Admin approval only' : 'Delegated up to ' + cash(limits[kind] ?? 0)}</span></td>
        <td className="px-3 py-2">
            <Input className="ml-auto h-9 w-40 text-right text-base tabular-nums sm:text-sm" type="number" inputMode="decimal" min="0" max="999999999999" step=".01" placeholder="Blank = revoked"
                aria-label={(overview[kind]?.label ?? kindText(kind)) + ' limit (Rs)'} value={edits[kind] ?? defaultFor(kind)} onChange={(event) => setEdits((current) => ({ ...current, [kind]: event.target.value }))} />
        </td>
        <td className="w-12 px-2 py-2"><Button type="button" variant="ghost" size="icon" aria-label={'Revoke ' + kindText(kind) + ' limit'} disabled={(edits[kind] ?? defaultFor(kind)) === '' || saving} onClick={() => setEdits((current) => ({ ...current, [kind]: '' }))}><X /></Button></td>
    </tr>;
    const primary = Object.keys(overview).filter((kind) => kind in limits);
    const other = Object.keys(limits).filter((kind) => !(kind in overview));
    const tableHeader = <thead className="bg-muted/65 text-xs font-semibold tracking-wide text-muted-foreground uppercase"><tr>{['Movement type', 'Applies to', 'Current policy', 'Limit (Rs)', ''].map((label, index) => <th scope="col" key={index} className={cn('px-3 py-2.5', index === 3 && 'text-right')}>{label || <span className="sr-only">Action</span>}</th>)}</tr></thead>;

    return <PaneCard aria-labelledby="treasury-limits">
        <form onSubmit={save}>
            <div className="flex flex-wrap items-center gap-3 border-b px-4 py-3.5">
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1"><h2 id="treasury-limits" className="text-base font-bold">Delegated Approval Limits</h2><p className="text-sm text-muted-foreground">Limits cap what authorized reviewers can approve. A blank limit leaves approval with Super Admin.</p></div>
                <Button disabled={!dirty.length || saving}>{saving ? 'Saving…' : 'Save limits'}</Button>
            </div>
            <div className="space-y-3 p-3 sm:p-4">
                <div className="relative overflow-x-auto rounded-xl border" tabIndex={0} aria-label="Delegated limits table">
                    <table className="w-full min-w-[675px] text-left text-sm">
                        {tableHeader}
                        <tbody>{primary.map(row)}</tbody>
                    </table>
                </div>
                {!!other.length && <details className="rounded-lg border px-3 py-2.5" open={Object.keys(errors).some((key) => other.some((kind) => key === 'limits.' + kind)) || undefined}>
                    <summary className="cursor-pointer text-sm font-semibold">Other approval types ({other.length})</summary>
                    <div className="relative mt-2 overflow-x-auto rounded-lg border"><table aria-label="Other approval types" className="w-full min-w-[675px] text-sm">
                        {tableHeader}
                        <tbody>{other.map(row)}</tbody>
                    </table></div>
                </details>}
                <Errors errors={errors} />
            </div>
        </form>
    </PaneCard>;
}
