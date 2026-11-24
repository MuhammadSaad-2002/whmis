import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useForm } from '@inertiajs/react';
import { FileSpreadsheet, Upload, X } from 'lucide-react';
import { useState } from 'react';
import type { Account } from './daily-collections';
import { kindIcon, kindName, type ApprovalPayload } from './finance-approval-types';
import { Errors, Field, selectClass } from './shared';

export type DraftSeed = ApprovalPayload & { kind?: string; amount?: string };
const shortcuts = ['opening', 'expense', 'transfer', 'adjustment', 'statement'];
const requiresEvidence = ['opening', 'statement', 'adjustment', 'shortage', 'shortage_repayment', 'shortage_receipt_reverse', 'refund_recovery', 'refund_correction'];

export function RequestDialog({ open, close, created, restoreFocus, seed, kinds, accounts, today }: {
    open: boolean; close: () => void; created: () => void; restoreFocus: () => void; seed?: DraftSeed; kinds: string[]; accounts: Account[]; today: string;
}) {
    return <Dialog open={open} onOpenChange={next => { if (!next) close(); }}>
        <DialogContent appearance="form" className="finance-modal max-w-[720px]"
            onCloseAutoFocus={event => { event.preventDefault(); restoreFocus(); }}>
            <DialogHeader>
                <DialogTitle>Create finance request</DialogTitle>
                <DialogDescription>It goes to an independent reviewer. Nothing is posted until it’s approved.</DialogDescription>
            </DialogHeader>
            {open && <RequestForm seed={seed} accounts={accounts} kinds={kinds} today={today} close={close} created={created} />}
        </DialogContent>
    </Dialog>;
}

function RequestForm({ seed, accounts, kinds, today, close, created }: {
    seed?: DraftSeed; accounts: Account[]; kinds: string[]; today: string; close: () => void; created: () => void;
}) {
    const value = (key: string, fallback = '') => String(seed?.[key] ?? fallback);
    const initial = kinds.find(kind => kind === seed?.kind) ?? kinds[0] ?? '';
    const form = useForm({
        kind: initial, date: today, notes: value('notes'), request_key: crypto.randomUUID(), amount: value('amount'),
        account_id: value('account_id'), target_id: value('target_id'), invoice_id: value('invoice_id'), day_id: value('day_id'),
        credit_id: value('credit_id'), collection_id: value('collection_id'), employee_id: value('employee_id'), booking_id: value('booking_id'), award_id: value('award_id'),
        commission_role: value('commission_role', 'salesman'), share: value('share'), method: value('method', 'cash'), direction: value('direction', 'out'),
        evidence: null as File | null, opening_csv: null as File | null,
    });
    const kind = form.data.kind;
    const useAccount = ['transfer', 'expense', 'adjustment', 'statement', 'refund', 'shortage_repayment', 'commission_payout', 'recovery_repayment', 'refund_recovery'].includes(kind);
    const useInvoice = ['refund', 'credit_apply', 'commission_share'].includes(kind);
    const useAmount = !['opening', 'credit_release', 'close_variance', 'recovery_hold', 'recovery_resume', 'commission_share', 'shortage_receipt_reverse'].includes(kind);
    const evidenceRequired = requiresEvidence.includes(kind);
    const numbers = (field: 'invoice_id' | 'target_id' | 'credit_id' | 'booking_id' | 'day_id' | 'collection_id' | 'employee_id', label: string) =>
        <Field label={label}><Input required type="number" min="1" readOnly={field === 'employee_id' && kind === 'commission_payout' && !!form.data.award_id} value={form.data[field]} onChange={event => form.setData(field, event.target.value)} /></Field>;
    const setKind = (next: string) => {
        if (next === kind) return;
        form.clearErrors();
        form.setData(current => ({ ...current, kind: next, account_id: '', target_id: '', invoice_id: '', credit_id: '',
            day_id: '', collection_id: '', employee_id: '', booking_id: '', award_id: '', opening_csv: null }));
    };

    return <form className="flex min-h-0 flex-1 flex-col" onSubmit={event => {
        event.preventDefault();
        if (evidenceRequired && !form.data.evidence) {
            form.setError('evidence', 'Attach supporting evidence before submitting.');
            return;
        }
        form.transform(data => ({ ...data, notes: data.notes.trim(), opening_csv: kind === 'opening' ? data.opening_csv : null }));
        form.post('/finance-approvals', { preserveScroll: true, onSuccess: created });
    }}>
        <div data-popup-section="body">
            <div className="request-grid">
                <div className="full min-w-0 space-y-3">
                    <fieldset>
                        <legend className="mb-2 text-sm font-semibold">Common request types</legend>
                        <div className="request-types">
                            {shortcuts.filter(type => kinds.includes(type)).map(type => {
                                const [Icon, tone] = kindIcon(type);
                                return <button type="button" aria-pressed={type === kind} onClick={() => setKind(type)} key={type}>
                                    <span className="finance-icon" data-tone={tone}><Icon /></span>{kindName(type)}
                                </button>;
                            })}
                        </div>
                    </fieldset>
                    <Field label="Request type"><select className={selectClass} value={kind} onChange={event => setKind(event.target.value)}>
                        {kinds.map(type => <option key={type} value={type}>{kindName(type)}</option>)}
                    </select></Field>
                </div>
                <Field label="Effective date *"><Input required type="date" value={form.data.date} onChange={event => form.setData('date', event.target.value)} /></Field>
                {useAmount && <Field label="Amount (PKR) *"><Input required type="number" min="0" step=".01" placeholder="0.00" value={form.data.amount} onChange={event => form.setData('amount', event.target.value)} /></Field>}
                {useInvoice && numbers('invoice_id', 'Source sales invoice ID')}
                {kind === 'commission_share' && <Field label="Original assignee share (%)"><Input required type="number" min="0" max="100" step=".01" value={form.data.share} onChange={event => form.setData('share', event.target.value)} /></Field>}
                {kind === 'commission_share' && <p className="full text-sm text-muted-foreground">After independent approval and posting, this overrides how the original assignee and the Salesman who delivered share this invoice’s Salesman commission. It does not change the Booker commission or pay anyone.</p>}
                {kind === 'credit_apply' && numbers('target_id', 'Receiving invoice ID')}
                {['credit_release', 'refund_correction', 'refund_recovery'].includes(kind) && numbers('credit_id', kind === 'credit_release' ? 'Credit application request #' : 'Original refund request #')}
                {kind === 'commission_cap' && <>{numbers('booking_id', 'Booking ID')}<Field label="Commission role"><select className={selectClass}
                    value={form.data.commission_role} onChange={event => form.setData('commission_role', event.target.value)}><option value="salesman">Salesman</option><option value="booker">Booker</option></select></Field></>}
                {kind === 'close_variance' && numbers('day_id', 'Reconciliation day ID')}
                {['shortage', 'shortage_repayment', 'shortage_receipt_reverse'].includes(kind) && numbers('collection_id', 'Collection ID')}
                {['commission_payout', 'recovery_waiver', 'recovery_repayment', 'recovery_hold', 'recovery_resume'].includes(kind) && numbers('employee_id', 'Employee ID')}
                {kind === 'commission_payout' && form.data.award_id && <p className="full text-sm text-muted-foreground">This payout is limited to invoice commission award #{form.data.award_id}.</p>}
                {useAccount && <Field label="Cash or bank account"><select required className={selectClass} value={form.data.account_id} onChange={event => form.setData('account_id', event.target.value)}>
                    <option value="">Select account</option>{accounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}
                </select></Field>}
                {kind === 'transfer' && <Field label="Destination account"><select required className={selectClass} value={form.data.target_id} onChange={event => form.setData('target_id', event.target.value)}>
                    <option value="">Select account</option>{accounts.filter(account => String(account.id) !== form.data.account_id).map(account => <option key={account.id} value={account.id}>{account.name}</option>)}
                </select></Field>}
                {kind === 'refund' && <Field label="Method"><select className={selectClass} value={form.data.method} onChange={event => form.setData('method', event.target.value)}>
                    <option value="cash">Cash</option><option value="bank">Bank transfer</option></select></Field>}
                {kind === 'adjustment' && <Field label="Direction"><select className={selectClass} value={form.data.direction} onChange={event => form.setData('direction', event.target.value)}>
                    <option value="out">Decrease</option><option value="in">Increase</option></select></Field>}
                <div className="full">
                    <Field label="Explanation *"><Textarea rows={3} required maxLength={1500} placeholder="What is this request for, and why is it needed?"
                        value={form.data.notes} onChange={event => form.setData('notes', event.target.value)} /></Field>
                    <p className="form-hint">Be specific. The reviewer decides from this explanation and the evidence.</p>
                </div>
                <FileDrop label={'Private supporting evidence' + (evidenceRequired ? ' *' : ' (optional)')}
                    hint="PDF, PNG, JPEG or CSV · Up to 8 MB" accept=".pdf,.png,.jpg,.jpeg,.csv" file={form.data.evidence}
                    update={file => { form.clearErrors('evidence'); form.setData('evidence', file); }} />
                {kind === 'opening' && <FileDrop label="Opening obligations CSV (optional)" hint="Use the opening import template · Up to 1 MB"
                    accept=".csv,.txt" file={form.data.opening_csv} update={file => form.setData('opening_csv', file)} csv />}
            </div>
            <div className="mt-3"><Errors errors={form.errors} /></div>
        </div>
        <footer data-popup-section="footer">
            <p className="form-hint">Someone else must review your request.</p>
            <Button type="button" variant="outline" disabled={form.processing} onClick={close}>Cancel</Button>
            <Button disabled={form.processing || !kind}>{form.processing ? 'Submitting…' : 'Submit for review'}</Button>
        </footer>
    </form>;
}

function FileDrop({ label, hint, accept, file, update, csv }: { label: string; hint: string; accept: string; file: File | null; update: (file: File | null) => void; csv?: boolean }) {
    const [over, setOver] = useState(false);
    const Icon = csv ? FileSpreadsheet : Upload;
    return <div className="full min-w-0 space-y-1.5">
        <p className="text-sm font-semibold">{label}</p>
        <div className="file-drop" data-over={over} data-attached={!!file} onDragOver={event => {
            if (event.dataTransfer.types.includes('Files')) { event.preventDefault(); setOver(true); }
        }} onDragLeave={event => { if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) setOver(false); }}
        onDrop={event => { event.preventDefault(); setOver(false); if (event.dataTransfer.files[0]) update(event.dataTransfer.files[0]); }}>
            <label>
                <input type="file" className="sr-only" aria-label={label} accept={accept}
                    onChange={event => { if (event.target.files?.[0]) update(event.target.files[0]); event.target.value = ''; }} />
                <span className="finance-icon" data-tone={file ? 'green' : 'neutral'}><Icon /></span>
                <span className="min-w-0"><b>{file?.name ?? 'Drop a file or click to upload'}</b><small>{file ? Math.max(1, Math.round(file.size / 1024)) + ' KB · click to replace' : hint}</small></span>
            </label>
            {file && <Button type="button" size="icon" variant="ghost" aria-label={'Remove ' + (csv ? 'CSV' : 'evidence')} onClick={() => update(null)}><X /></Button>}
        </div>
    </div>;
}
