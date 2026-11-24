import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { usePermissions } from '@/hooks/use-permissions';
import { shortDate, totalPaisaMoney } from '@/lib/format';
import { Link, useForm } from '@inertiajs/react';
import { AlertCircle, ArrowDownToLine, Banknote, Check, FileText, Lock, ShieldCheck, UsersRound } from 'lucide-react';
import { amountText, kindIcon, kindName, person, requestGuidance, statuses, type ApprovalItem, type ApprovalStatus, type FinanceAccount } from './finance-approval-types';
import { Errors, Field, selectClass, stamp } from './shared';

export function ApprovalBadge({ status, compact = false }: { status: ApprovalStatus; compact?: boolean }) {
    return <span className="approval-badge" data-status={status}><i />{compact && status === 'approved' ? 'Approved' : statuses[status]}</span>;
}

export function ApprovalIcon({ kind }: { kind: string }) {
    const [Icon, tone] = kindIcon(kind);
    return <span className="finance-icon" data-tone={tone} aria-hidden="true"><Icon /></span>;
}

export function ApprovalDetail({ item, actorId, accounts, copy }: { item: ApprovalItem; actorId: number; accounts: FinanceAccount[]; copy?: () => void }) {
    const requester = person(item.requester_name, item.created_by);
    const reviewer = person(item.reviewer_name, item.approved_by);
    const poster = person(item.poster_name, item.posted_by);
    const date = typeof item.payload.date === 'string' ? shortDate(item.payload.date) : '—';
    const account = (id: unknown) => id ? accounts.find(account => account.id === Number(id))?.name ?? 'Account #' + id : null;
    const related = [
        ['Customer', item.details.customer], ['Source invoice', item.details.invoice], ['Source receipt', item.payload.source_receipt], ['Receiving invoice', item.details.target_invoice],
        ['Account', account(item.payload.account_id)], ['Destination account', item.kind === 'transfer' ? account(item.payload.target_id) : null],
        ['Related request', item.payload.credit_id ? '#' + item.payload.credit_id : null], ['Category', item.payload.category], ['Paid to', item.payload.payee],
        ['Reconciliation day', item.payload.day_id], ['Collection', item.payload.collection_id], ['Employee', item.details.employee],
        ['Commission invoice', item.payload.award_invoice_number], ['Commission role', item.payload.commission_role], ['Cap per', item.payload.cap_period],
        ['Assigned Salesman', item.details.share?.original], ['Delivered by', item.details.share?.delivered],
        ['Original assignee’s share', item.payload.share != null ? item.payload.share + '%' : null],
        ['Calculated Salesman commission before request', item.details.share ? amountText(item.details.share.calculated) : null],
        ['Cash reported', item.payload.reported == null ? null : amountText(Number(item.payload.reported))],
        ['Cash counted', item.payload.counted == null ? null : amountText(Number(item.payload.counted))],
        ['Verified receipts', item.payload.verified == null ? null : amountText(Number(item.payload.verified))],
        ['Resume deductions', typeof item.payload.hold_until === 'string' ? shortDate(item.payload.hold_until) : null],
        ['Repayment via', item.payload.repayment_via], ['Direction', item.payload.direction ? item.payload.direction === 'in' ? 'Increase' : 'Decrease' : null],
        ['Corrected net refund', item.payload.corrected_amount == null ? null : amountText(Math.round(Number(item.payload.corrected_amount) * 100))],
        ['Transaction reference', item.payload.transaction_reference],
    ].filter(([, value]) => value != null && value !== '');
    return <article className="finance-card approval-detail" aria-label="Request details">
        <header className="approval-detail-header">
            <ApprovalIcon kind={item.kind} />
            <div className="min-w-0">
                <h2>#{item.id} · {kindName(item.kind)} <ApprovalBadge status={item.status} /></h2>
                <p>Effective {date} · Submitted {stamp(item.created_at)}</p>
            </div>
            <div className="detail-amount"><small>Amount</small><strong>{totalPaisaMoney(item.amount_paisa)}</strong></div>
        </header>
        <ol className="approval-flow" aria-label="Approval progress">
            <li data-step="done">Submitted<small>{requester}</small></li>
            <li data-step={item.status === 'pending' ? 'current' : item.status === 'rejected' ? 'failed' : item.approved_by ? 'done' : undefined}>
                {item.status === 'rejected' ? 'Rejected' : 'Reviewed'}<small>{item.approved_by ? reviewer : item.status === 'pending' ? 'Waiting' : '—'}</small>
            </li>
            <li data-step={item.status === 'approved' ? 'current' : ['posted','reversed'].includes(item.status) ? 'done' : undefined}>
                Approved<small>{['approved', 'posted','reversed'].includes(item.status) ? 'By reviewer' : '—'}</small>
            </li>
            <li data-step={item.status === 'posted' ? 'done' : ['cancelled','reversed'].includes(item.status) ? 'failed' : undefined}>
                {item.status === 'cancelled' ? 'Withdrawn' : item.status === 'reversed' ? 'Reversed' : 'Posted'}<small>{item.posted_at ? stamp(item.posted_at) : 'Not posted'}</small>
            </li>
        </ol>
        <div className="approval-detail-body">
            <dl className="approval-facts">
                <div><dt>Type</dt><dd>{kindName(item.kind)}</dd></div>
                <div><dt>Effective date</dt><dd>{date}</dd></div>
                <div><dt>Requested by</dt><dd>{requester}</dd></div>
                <div><dt>Reviewed by</dt><dd>{item.approved_by ? reviewer : 'Not reviewed'}</dd></div>
            </dl>
            {related.length > 0 && <dl className="approval-facts approval-related" aria-label="Transaction details">{related.map(([name, value]) => <div key={name}><dt>{name}</dt><dd>{value}</dd></div>)}</dl>}
            {!!item.details.opening?.length && <dl className="approval-facts" aria-label="Opening balances">{item.details.opening.map(row => <div key={row.id}><dt>{row.name}</dt><dd>{amountText(row.opening_paisa)}</dd></div>)}</dl>}
            {item.kind === 'opening' && !!Object.keys(item.details.opening_imports ?? {}).length && <dl className="approval-facts" aria-label="Opening CSV obligations">
                {Object.entries(item.details.opening_imports ?? {}).map(([type, count]) => <div key={type}><dt>{kindName(type)}</dt><dd>{count} matched or imported</dd></div>)}
            </dl>}
            <div className="approval-notice" data-tone="green"><ShieldCheck /><p><strong>Posting effect</strong><br />{requestGuidance[item.kind]}</p></div>
            {!!item.details.share_projection?.length && item.status !== 'posted' && <dl className="approval-facts" aria-label="Projected Salesman awards">
                {item.details.share_projection.map(award => <div key={award.name}><dt>{award.name}</dt><dd>{amountText(award.calculated)} calculated · {amountText(award.earned)} earned</dd></div>)}
            </dl>}
            {!!item.details.movements.length && <dl className="approval-facts" aria-label="Posted account movements">
                {item.details.movements.map((move, index) => <div key={index}><dt>{move.name}</dt><dd>{amountText(move.paisa)}</dd></div>)}
            </dl>}
            {!!item.details.ledger.length && <dl className="approval-facts" aria-label="Posted customer ledger entries">
                {item.details.ledger.map((entry, index) => <div key={index}><dt>{entry.description}</dt><dd>{entry.paisa < 0 ? 'Credit' : 'Debit'} {amountText(Math.abs(entry.paisa))}</dd></div>)}
            </dl>}
            {item.outcomes.map(({action, data}, index) => {
                if (action === 'commission_posted' && data.awards?.length) return <dl key={index} className="approval-facts" aria-label="Posted Salesman awards">
                    {data.awards.map(award => <div key={award.name}><dt>{award.name}</dt><dd>{amountText(award.calculated)} calculated · {amountText(award.earned)} earned</dd></div>)}
                </dl>;
                const result = action === 'reconciled' ? `Checkpoint: book ${amountText(Number(data.book))}, actual ${amountText(Number(data.actual))}, variance ${amountText(Number(data.variance))}. No cash moved.`
                    : action === 'posted' && data.surplus_paisa != null ? `Reconciliation closed · ${amountText(Number(data.surplus_paisa))} unallocated cash posted as other income.`
                    : action === 'posted' && data.payment_id ? `Shortage applied to customer payment #${data.payment_id}.`
                    : action === 'posted' && data.reference ? `Posted reference: ${data.reference}`
                    : data.correction_id ? `Reversed by approval #${data.correction_id}.`
                    : action === 'withdrawn' && data.reason ? 'Withdrawn: ' + data.reason : null;
                return result && <p key={index} className="approval-quote">{result}</p>;
            })}
            <h3>Explanation</h3>
            <p className="approval-quote">{item.payload.notes || 'No explanation recorded.'}</p>
            <Byline name={requester} when={item.created_at} />
            {item.approval_note && <>
                <h3>Review note</h3>
                <p className="approval-quote" data-status={item.status}>{item.approval_note}</p>
                {item.approved_by && <Byline name={reviewer} when={item.approved_at} />}
            </>}
            <h3>Evidence <small><Lock />Private</small></h3>
            {item.has_evidence ? <div className="approval-file">
                <span className="finance-icon" data-tone="blue"><FileText /></span>
                <div><strong>Supporting evidence</strong><small>Private attachment</small></div>
                <Button asChild variant="outline" size="sm"><a href={'/finance-approvals/' + item.id + '/evidence'}><ArrowDownToLine />Download</a></Button>
            </div> : <p className="finance-muted">No evidence attached.</p>}
            <ApprovalActions item={item} actorId={actorId} accounts={accounts} copy={copy} poster={poster} />
        </div>
    </article>;
}

function Byline({ name, when }: { name: string; when: string | null }) {
    return <p className="approval-byline"><span aria-hidden="true">{name.split(/\s+/).slice(0, 2).map(word => word[0]).join('').toUpperCase()}</span>{name}{when ? ' · ' + stamp(when) : ''}</p>;
}

function ApprovalActions({ item, actorId, accounts, copy, poster }: { item: ApprovalItem; actorId: number; accounts: FinanceAccount[]; copy?: () => void; poster: string }) {
    const { can } = usePermissions();
    const decision = useForm({ note: '', approve: true });
    const post = useForm({ reference: String(item.payload.transaction_reference ?? ''), account_id: '' });
    const withdraw = useForm({ reason: '' });
    const path = '/finance-approvals/' + item.id;
    const self = item.created_by === actorId;
    const beneficiary = item.beneficiary_id === actorId;
    const reconciliation = ['close_variance', 'shortage'].includes(item.kind);
    const referenceRequired = ['transfer','refund','refund_recovery','shortage_repayment','commission_payout','recovery_repayment'].includes(item.kind)
        && item.payload.repayment_via !== 'commission';
    return <>
        {item.status === 'pending' && (self || beneficiary || !can('finance.approve') ? <div className="approval-notice" data-tone="amber">
            <UsersRound /><p><strong>{self ? 'You submitted this request, so you can’t review it.' : beneficiary ? 'You can’t review a request that benefits you.' : 'This request awaits an independent reviewer.'}</strong>
                <br />Another authorized user must record the decision.</p>
        </div> : <form className="approval-review" onSubmit={event => {
            event.preventDefault();
            const intent = (event.nativeEvent as SubmitEvent).submitter?.getAttribute('value');
            if (intent !== 'approve' && intent !== 'reject') return;
            decision.transform(data => ({ note: data.note.trim(), approve: intent === 'approve' }));
            decision.post(path + '/approve', { preserveScroll: true });
        }}>
            <h4><ShieldCheck />Your review</h4>
            <Field label="Review remarks *"><Textarea required maxLength={1500} placeholder="What did you check? A note is required for approval and rejection."
                value={decision.data.note} onChange={event => decision.setData('note', event.target.value)} /></Field>
            <Errors errors={decision.errors} />
            <div className="review-actions">
                <Button type="submit" value="reject" variant="outline" className="reject-action" disabled={decision.processing || !decision.data.note.trim()}>Reject</Button>
                <Button type="submit" value="approve" className="approve-action" disabled={decision.processing || !decision.data.note.trim()}>Approve</Button>
            </div>
        </form>)}
        {item.status === 'approved' && <section className="approval-review">
            <h4><Banknote />{reconciliation ? 'Ready for reconciliation' : 'Ready to post'}</h4>
            <p>{reconciliation ? 'Apply this approval in Daily Reconciliation.' : 'The request is approved but not posted. An authorized operator must complete the action.'}</p>
            {reconciliation && can('distribution.reconcile') && <Button asChild variant="outline"><Link href={'/daily-reconciliation?date=' + (item.payload.date ?? '')}>Open Daily Reconciliation</Link></Button>}
            {!reconciliation && can('finance.post') && <form className="space-y-3" onSubmit={event => { event.preventDefault(); post.post(path + '/post', { preserveScroll: true }); }}>
                {(referenceRequired || ['expense','adjustment','refund_correction'].includes(item.kind)) &&
                    <Field label={'Completed transaction reference' + (referenceRequired ? ' *' : ' (optional)')}><Input required={referenceRequired} maxLength={200} value={post.data.reference} onChange={event => post.setData('reference', event.target.value)} /></Field>}
                {item.kind === 'refund' && item.payload.opening_id && <Field label="Refund payout account"><select className={selectClass} required value={post.data.account_id}
                    onChange={event => post.setData('account_id', event.target.value)}><option value="">Select an account</option>
                    {accounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}</select></Field>}
                <Errors errors={post.errors} /><div className="review-actions"><Button disabled={post.processing}>{item.kind === 'opening' ? 'Lock opening balances'
                    : item.kind === 'refund' ? 'Confirm paid' : 'Post approved action'}</Button></div>
            </form>}
        </section>}
        {item.status === 'posted' && <div className="approval-notice" data-tone="green"><Check />
            <p><strong>Posted{item.posted_at ? ' ' + stamp(item.posted_at) : ''}.</strong>{item.posted_by ? ' Recorded by ' + poster + '.' : ' This request is complete.'}</p>
        </div>}
        {item.status === 'rejected' && <div className="approval-notice" data-tone="red"><AlertCircle />
            <div><p><strong>Rejected.</strong> See the review note for the decision.</p>{copy && <Button size="sm" variant="outline" className="mt-2" onClick={copy}>Copy into new request</Button>}</div>
        </div>}
        {item.status === 'cancelled' && <div className="approval-notice" data-tone="neutral"><AlertCircle /><p>This request was withdrawn.</p></div>}
        {['pending', 'approved'].includes(item.status) && can('finance.request') && (self || can('finance.approve')) && <details className="approval-withdraw">
            <summary>Withdraw request</summary>
            <form className="space-y-2 pt-3" onSubmit={event => { event.preventDefault(); withdraw.post(path + '/withdraw', { preserveScroll: true }); }}>
                <Field label="Reason for withdrawal *"><Textarea required maxLength={1500} value={withdraw.data.reason} onChange={event => withdraw.setData('reason', event.target.value)} /></Field>
                <Errors errors={withdraw.errors} /><Button variant="outline" className="reject-action" disabled={withdraw.processing}>Withdraw</Button>
            </form>
        </details>}
    </>;
}
