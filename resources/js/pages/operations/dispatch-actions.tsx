import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { money } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useForm } from '@inertiajs/react';
import { useState } from 'react';
import { card, type DeliveryProps } from './dispatch-detail';
import { Errors, Field, selectClass } from './shared';

const collectionInputs = () => ['cash', 'online'].map(method => ({ method, amount: '', reference: '', request_key: crypto.randomUUID() }));

export function useDeliveryAction(p: DeliveryProps) {
    const form = useForm({
        request_key: crypto.randomUUID(), receiver_name: '', notes: '',
        assigned_to: String(p.dispatch?.assigned_to ?? ''), planned_date: p.dispatch?.planned_date ?? '',
        items: p.items.map(item => ({ sales_invoice_item_id: item.id, quantity: '0' })),
        pickup_lines: p.pickupLines.map(line => ({ id: line.id, quantity: '0' })),
        collections: collectionInputs(),
    });

    function submit(action: string, { notes, onSuccess }: { notes?: string; onSuccess?: () => void } = {}) {
        if (form.processing) return;
        const correction = action === 'correct_delivery' && p.dispatch?.custody_required;
        form.transform(data => {
            const effectiveNotes = (notes ?? data.notes).trim();
            const items = data.items.filter(item => Number(item.quantity) > 0);
            if (correction) return { kind: 'delivery_correction', date: p.today, invoice_id: p.invoice.id, request_key: data.request_key, notes: effectiveNotes, items };
            return {
                action, request_key: data.request_key, notes: effectiveNotes,
                ...(p.canManage && (action === 'assign' || action === 'request_handover') ? {
                    assigned_to: data.assigned_to || null,
                    ...(action === 'assign' ? { planned_date: data.planned_date || null } : {}),
                } : {}),
                ...(['pickup', 'put_back'].includes(action) ? { pickup_lines: data.pickup_lines.filter(line => Number(line.quantity) > 0) } : {}),
                ...(['delivered', 'correct_delivery'].includes(action) ? { items } : {}),
                ...(action === 'delivered' ? { receiver_name: data.receiver_name.trim(),
                    collections: p.dispatch?.custody_required && p.collectiblePaisa > 0 ? data.collections.filter(row => Number(row.amount) > 0) : [] } : {}),
            };
        });
        form.post(correction ? '/finance-approvals' : '/dispatch/' + p.invoice.id + '/events', {
            preserveScroll: !p.scoped,
            onSuccess: () => {
                form.setData('request_key', crypto.randomUUID());
                if (action === 'delivered') form.setData('collections', collectionInputs());
                onSuccess?.();
            },
        });
    }

    return {
        form, submit,
        setBatch: (id: number, value: string) => form.setData('pickup_lines', form.data.pickup_lines.map(line => line.id === id ? { ...line, quantity: value } : line)),
        setItem: (id: number, value: string) => form.setData('items', form.data.items.map(item => item.sales_invoice_item_id === id ? { ...item, quantity: value } : item)),
    };
}

export type DeliveryForm = ReturnType<typeof useDeliveryAction>['form'];

export function Notes({ value, change, required = false, label = 'Notes / reason', placeholder = 'Optional. Anything the office should know' }: {
    value: string; change: (value: string) => void; required?: boolean; label?: string; placeholder?: string;
}) {
    return <Field label={label + (required ? ' *' : '')}><Textarea rows={2} required={required} maxLength={1000} value={value} onChange={event => change(event.target.value)} placeholder={placeholder} className="min-h-20 text-base sm:text-sm" /></Field>;
}

export function DeliveryFields({ p, form }: { p: DeliveryProps; form: DeliveryForm }) {
    const collected = form.data.collections.some(row => Number(row.amount) > 0);
    return <div className="space-y-3">
        <Field label="Received by *"><Input required maxLength={150} value={form.data.receiver_name} onChange={event => form.setData('receiver_name', event.target.value)} placeholder="Name at the pharmacy" /></Field>
        {p.dispatch?.custody_required && p.collectiblePaisa > 0 && <>
            <div className="grid gap-2 sm:grid-cols-2">{form.data.collections.map((row, index) => {
                const otherPaisa = Math.round((Number(form.data.collections[1 - index].amount) || 0) * 100);
                return <Field key={row.method} label={row.method === 'cash' ? 'Cash collected (PKR)' : 'Bank transfer (PKR)'}>
                    <Input type="number" inputMode="decimal" min="0" max={Math.max(0, p.collectiblePaisa - otherPaisa) / 100} step=".01" value={row.amount}
                        onChange={event => form.setData('collections', form.data.collections.map((item, i) => i === index ? { ...item, amount: event.target.value } : item))} placeholder="0.00" />
                </Field>;
            })}</div>
            {Number(form.data.collections[1].amount) > 0 && <Field label="Bank transaction reference *"><Input required maxLength={200} value={form.data.collections[1].reference} onChange={event => form.setData('collections', form.data.collections.map((row, index) => index === 1 ? { ...row, reference: event.target.value } : row))} /></Field>}
            <p className="text-xs text-muted-foreground">{collected ? 'Finance verifies this collection before it reduces the invoice balance.' : 'Leave both amounts empty if no payment was collected.'}</p>
        </>}
    </div>;
}

export function FollowUpCollection({ invoiceId, collectiblePaisa, inline = false, onSaved }: { invoiceId: number; collectiblePaisa: number; inline?: boolean; onSaved?: () => void }) {
    const form = useForm({ amount: '', method: 'cash', reference: '', request_key: crypto.randomUUID() });
    return <form className={cn('space-y-3 print:hidden', !inline && card + ' p-4')} onSubmit={event => {
        event.preventDefault();
        form.post('/dispatch/' + invoiceId + '/collection', { preserveScroll: true, onSuccess: () => {
            form.setData({ amount: '', method: 'cash', reference: '', request_key: crypto.randomUUID() });
            onSaved?.();
        } });
    }}>
        {!inline && <h2 className="text-base font-bold">Report a follow-up collection</h2>}
        <Field label="Amount (PKR)"><Input required type="number" inputMode="decimal" min=".01" max={collectiblePaisa / 100} step=".01" value={form.data.amount} onChange={event => form.setData('amount', event.target.value)} /></Field>
        <Field label="Method"><select className={selectClass} value={form.data.method} onChange={event => form.setData('method', event.target.value)}><option value="cash">Cash</option><option value="online">Online bank transfer</option></select></Field>
        {form.data.method === 'online' && <Field label="Bank transaction reference *"><Input required maxLength={200} value={form.data.reference} onChange={event => form.setData('reference', event.target.value)} /></Field>}
        <p className="text-sm text-muted-foreground">Remaining to collect: {money(collectiblePaisa / 100)}. Finance verifies this before posting the payment.</p>
        <Errors errors={form.errors} /><Button className="w-full" disabled={form.processing}>Report collection</Button>
    </form>;
}

const failureReasons = ['Shop closed', 'Customer not available', 'Refused delivery', 'Wrong address', 'Payment issue', 'Other'];
export function FailureForm({ form, submit }: { form: DeliveryForm; submit: (note: string) => void }) {
    const [reason, setReason] = useState('');
    const [detail, setDetail] = useState('');
    return <form className="space-y-3" onSubmit={event => { event.preventDefault(); if (reason) submit([reason, detail.trim()].filter(Boolean).join(' — ')); }}>
        <fieldset className="space-y-2"><legend className="text-sm font-semibold">What happened? *</legend><div className="grid grid-cols-2 gap-2">
            {failureReasons.map(item => <Button type="button" key={item} variant={reason === item ? 'secondary' : 'outline'} aria-pressed={reason === item} className="min-h-11 whitespace-normal" onClick={() => setReason(item)}>{item}</Button>)}
        </div></fieldset>
        <Notes label="Details" required={reason === 'Other'} value={detail} change={value => setDetail(value.slice(0, 950))} placeholder="e.g. The pharmacy opens at 4 pm." />
        <Errors errors={form.errors} />
        <Button variant="destructive" className="h-11 w-full" disabled={!reason || form.processing}>Record failed attempt</Button>
    </form>;
}
