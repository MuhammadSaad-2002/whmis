import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useForm } from '@inertiajs/react';
import { Check, Info } from 'lucide-react';
import { Errors, Field, selectClass, type Staff } from './shared';
import { AccountGlyph, Avatar, type Account } from './treasury-ui';

const accountTypes = [
    { kind: 'bank', label: 'Bank', description: 'Bank or wallet account' },
    { kind: 'cash', label: 'Cash', description: 'Till or petty cash' },
    { kind: 'custody', label: 'Custody', description: 'Cash held by staff' },
];

export function TreasuryAccountForm({ account, staff, salesmen, locked, onCancel, onSaved, modal = false }: {
    account?: Account; staff: Staff[]; salesmen: Staff[]; locked: boolean; onCancel?: () => void; onSaved?: () => void; modal?: boolean;
}) {
    const form = useForm({
        id: account?.id ?? null, name: account?.name ?? '', kind: account?.kind ?? 'cash',
        custodian_id: String(account?.custodian_id ?? ''), opening: (Number(account?.opening_paisa ?? 0) / 100).toFixed(2),
        opening_reference: account?.opening_reference ?? '', operators: account?.operators.map((user) => user.id) ?? [],
    });
    const category = form.data.kind === 'petty_cash' ? 'cash' : form.data.kind;
    const preserveType = locked && !!account;
    const allOperators = [...staff, ...(account?.operators ?? []).filter((user) => !staff.some((active) => active.id === user.id))];
    const missingCustodian = form.data.custodian_id && !salesmen.some((user) => String(user.id) === form.data.custodian_id);

    return <form className={cn('flex min-h-0 flex-col', modal && 'overflow-hidden')} onSubmit={(event) => {
        event.preventDefault();
        form.post('/treasury/accounts', {
            preserveScroll: true,
            onSuccess: () => {
                if (!account) form.reset();
                onSaved?.();
            },
        });
    }}>
        <div className="grid gap-x-4 gap-y-3.5 sm:grid-cols-2" data-popup-section={modal ? 'body' : undefined}>
            <div className="sm:col-span-2"><Field label="Account name *"><Input required maxLength={120} placeholder="e.g. Meezan Bank – Current Account" value={form.data.name} onChange={(event) => form.setData('name', event.target.value)} /></Field></div>
            <fieldset className="min-w-0 space-y-1.5 sm:col-span-2">
                <legend className="text-sm font-semibold">Type</legend>
                <div className="grid gap-2 sm:grid-cols-3">
                    {accountTypes.map(({ kind, label, description }) => <button key={kind} type="button" aria-pressed={category === kind} disabled={preserveType || form.processing}
                        className={cn('flex min-h-14 items-center gap-2 rounded-xl border bg-card px-2.5 py-2 text-left text-sm font-semibold transition-colors hover:border-ring/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-65', category === kind && 'border-ring/70 bg-accent/55')}
                        onClick={() => { if (category !== kind) form.setData({ ...form.data, kind, custodian_id: '' }); }}>
                        <AccountGlyph kind={kind} /><span>{label}<small className="block text-xs leading-snug font-medium text-muted-foreground">{description}</small></span>
                    </button>)}
                </div>
            </fieldset>
            {category === 'cash' && <div className="sm:col-span-2"><Field label="Cash account type"><select disabled={preserveType} className={selectClass} value={form.data.kind} onChange={(event) => form.setData('kind', event.target.value)}>
                <option value="cash">Cash till</option><option value="petty_cash">Petty cash</option>
            </select></Field></div>}
            {category === 'custody' && <div className="sm:col-span-2"><Field label="Custodian *"><select required disabled={preserveType} className={selectClass} value={form.data.custodian_id} onChange={(event) => form.setData('custodian_id', event.target.value)}>
                <option value="">Choose a Salesman</option>
                {missingCustodian && <option value={form.data.custodian_id}>Existing custodian #{form.data.custodian_id}</option>}
                {salesmen.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
            </select></Field></div>}
            <div>
                <Field label="Opening balance (PKR)"><Input disabled={locked} type="number" inputMode="decimal" min="0" step=".01" value={form.data.opening} onChange={(event) => form.setData('opening', event.target.value)} /></Field>
                <p className="mt-1 text-xs text-muted-foreground">{locked ? 'Posted openings are locked. Use a finance adjustment to correct them.' : 'Use the counted cash or bank statement balance at go-live.'}</p>
            </div>
            <Field label="Opening count or statement reference"><Input disabled={locked} maxLength={200} placeholder="e.g. Opening cash count" value={form.data.opening_reference} onChange={(event) => form.setData('opening_reference', event.target.value)} /></Field>
            <fieldset className="min-w-0 space-y-1.5 sm:col-span-2">
                <legend className="text-sm font-semibold">Account operators <span className="font-normal text-muted-foreground">· can record movements in this account</span></legend>
                <div className="flex flex-wrap gap-2">
                    {allOperators.map((user) => {
                        const selected = form.data.operators.includes(user.id);
                        return <button key={user.id} type="button" aria-pressed={selected} disabled={form.processing}
                            onClick={() => form.setData('operators', selected ? form.data.operators.filter((id) => id !== user.id) : [...form.data.operators, user.id])}
                            className={cn('inline-flex min-h-10 items-center gap-2 rounded-full border bg-card py-1 pr-2.5 pl-1.5 text-sm font-semibold transition-colors hover:border-ring/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none', selected && 'border-ring/70 bg-accent/55')}>
                            <Avatar name={user.name} /> {user.name}<span aria-hidden="true" className={cn('grid size-4 shrink-0 place-items-center rounded-full border border-input/60', selected && 'border-ring bg-ring text-white')}>{selected && <Check className="size-3" />}</span>
                        </button>;
                    })}
                    {!allOperators.length && <p className="text-sm text-muted-foreground">No staff available.</p>}
                </div>
            </fieldset>
            {modal && locked && <p className="flex items-start gap-2 sm:col-span-2" data-popup-note><Info className="mt-0.5 size-4 shrink-0" />A new account starts at zero. Its balance changes only through posted transactions.</p>}
            <div className="empty:hidden sm:col-span-2"><Errors errors={form.errors} /></div>
        </div>
        <div className={modal ? undefined : 'mt-4 flex shrink-0 flex-wrap items-center gap-2 border-t pt-3'} data-popup-section={modal ? 'footer' : undefined}>
            <span aria-live="polite" className="flex-1 text-sm text-muted-foreground">{account ? (form.isDirty ? 'Unsaved changes' : 'No changes') : ''}</span>
            <Button type="button" variant="outline" disabled={form.processing || (!!account && !form.isDirty)} onClick={account ? () => { form.reset(); form.clearErrors(); } : onCancel}>{account ? 'Reset' : 'Cancel'}</Button>
            <Button disabled={form.processing || !form.data.name.trim() || (!!account && !form.isDirty)}>{form.processing ? 'Saving…' : 'Save account'}</Button>
        </div>
    </form>;
}
