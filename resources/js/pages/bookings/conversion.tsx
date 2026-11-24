import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { qty } from '@/lib/format';
import { Link, useForm } from '@inertiajs/react';
import { Errors } from '../operations/shared';

type Line = { id: number; product: string; approved: number; approved_bonus: number; draft: number; draft_bonus: number; posted: number; posted_bonus: number; cancelled: number; cancelled_bonus: number; remaining: number; remaining_bonus: number };
export type Conversion = { lines: Line[]; invoices: { id: number; invoice_number: string; status: string }[]; legacy: boolean };

export function BookingConversion({ id, value, canLink }: { id: number; value: Conversion; canLink: boolean }) {
    const active = value.lines.filter(line => line.remaining || line.remaining_bonus);
    const draft = useForm({ lines: active.map(line => ({ id: line.id, quantity: String(line.remaining), bonus_quantity: String(line.remaining_bonus) })) });
    const close = useForm({ reason: '' });
    const pair = (regular: number, bonus: number) => `${qty(regular)}${bonus ? ` + ${qty(bonus)} bonus` : ''}`;
    return <section id="booking-invoicing" className="space-y-4 rounded-xl border bg-card p-4">
        <h2 className="text-lg font-semibold">Booking invoicing</h2>
        {value.invoices.length > 0 && <div className="flex flex-wrap gap-2">{value.invoices.map(invoice => canLink
            ? <Button key={invoice.id} variant="outline" asChild><Link href={route('sales.edit', invoice.id)}>{invoice.invoice_number} · {invoice.status}</Link></Button>
            : <p key={invoice.id}>{invoice.invoice_number} · {invoice.status}</p>)}</div>}
        {!value.legacy && <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{['Product', 'Approved', 'In drafts', 'Posted', 'Closed', 'Remaining'].map(h => <th key={h} className="p-2">{h}</th>)}</tr></thead><tbody>{value.lines.map(line => <tr className="border-t" key={line.id}><td className="p-2">{line.product}</td><td className="p-2">{pair(line.approved, line.approved_bonus)}</td><td className="p-2">{pair(line.draft, line.draft_bonus)}</td><td className="p-2">{pair(line.posted, line.posted_bonus)}</td><td className="p-2">{pair(line.cancelled, line.cancelled_bonus)}</td><td className="p-2">{pair(line.remaining, line.remaining_bonus)}</td></tr>)}</tbody></table></div>}
        {!value.legacy && active.length > 0 && <>
            <form className="space-y-3" onSubmit={e => { e.preventDefault(); draft.post(route('bookings.convert', id)); }}>
                <p className="text-sm text-muted-foreground">Select what to invoice now. Other quantities stay on this booking.</p>
                {active.map((line, index) => <div key={line.id} className="grid grid-cols-2 gap-2 rounded-lg border p-2 sm:grid-cols-[minmax(12rem,1fr)_8rem_8rem]">
                    <p className="col-span-2 self-center text-sm font-medium sm:col-span-1">{line.product}</p>
                    {(['quantity', 'bonus_quantity'] as const).map(key => <label key={key} className="text-sm">{key === 'quantity' ? 'Qty' : 'Bonus'}<Input type="number" min="0" step="0.01" max={key === 'quantity' ? line.remaining : line.remaining_bonus} value={draft.data.lines[index]?.[key] ?? ''} onChange={e => draft.setData('lines', draft.data.lines.map(x => x.id === line.id ? { ...x, [key]: e.target.value } : x))} /></label>)}
                </div>)}
                <Errors errors={draft.errors}/><Button disabled={draft.processing}>Create draft invoice</Button>
            </form>
            <details className="rounded-lg border p-3"><summary className="cursor-pointer font-medium">Close remaining quantities</summary>
                <form className="mt-2 space-y-2" onSubmit={e => { e.preventDefault(); close.post(route('bookings.close-remainder', id), { onSuccess: () => close.reset() }); }}>
                    <label className="block text-sm">Reason <Input required maxLength={1000} value={close.data.reason} onChange={e => close.setData('reason', e.target.value)} /></label>
                    <Errors errors={close.errors}/><Button variant="destructive" disabled={close.processing}>Close remainder</Button>
                </form>
            </details>
        </>}
    </section>;
}
