import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { usePermissions } from '@/hooks/use-permissions';
import { shortDate } from '@/lib/format';
import { Link, useForm } from '@inertiajs/react';
import { AlertCircle, ArrowDownToLine, Banknote, Check, FileText, Lock, ShieldCheck, UsersRound } from 'lucide-react';
import type { Account } from './daily-collections';
import { amountText, kindIcon, kindName, person, statuses, type ApprovalItem, type ApprovalStatus } from './finance-approval-types';
import { Errors, Field, selectClass, stamp } from './shared';

export function ApprovalBadge({ status, compact = false }: { status: ApprovalStatus; compact?: boolean }) {
    return <span className="approval-badge" data-status={status}><i />{compact && status === 'approved' ? 'Approved' : statuses[status]}</span>;
}

export function ApprovalIcon({ kind }: { kind: string }) {
    const [Icon, tone] = kindIcon(kind);
    return <span className="finance-icon" data-tone={tone} aria-hidden="true"><Icon /></span>;
}

export function ApprovalDetail({ item, actorId, accounts, copy }: { item: ApprovalItem; actorId: number; accounts: Account[]; copy?: () => void }) {
    const requester = person(item.requester_name, item.created_by);
    const reviewer = person(item.reviewer_name, item.approved_by);
    const poster = person(item.poster_name, item.posted_by);
    const date = typeof item.payload.date === 'string' ? shortDate(item.payload.date) : '—';
    const related = [
        ['Sales invoice', item.payload.invoice_id], ['Target', item.payload.target_id], ['Related request', item.payload.credit_id],
        ['Booking', item.payload.booking_id], ['Collection', item.payload.collection_id], ['Employee', item.payload.employee_id],
    ].filter(([, value]) => value != null && value !== '');
    return <article className="finance-card approval-detail" aria-label="Request details">
        <header className="approval-detail-header">
            <ApprovalIcon kind={item.kind} />
            <div className="min-w-0">
                <h2>#{item.id} · {kindName(item.kind)} <ApprovalBadge status={item.status} /></h2>
                <p>Effective {date} · Submitted {stamp(item.created_at)}</p>
            </div>
            <div className="detail-amount"><small>Amount</small><strong>{amountText(item.amount_paisa)}</strong></div>
        </header>
        <ol className="approval-flow" aria-label="Approval progress">
            <li data-step="done">Submitted<small>{requester}</small></li>
            <li data-step={item.status === 'pending' ? 'current' : item.status === 'rejected' ? 'failed' : item.approved_by ? 'done' : undefined}>
                {item.status === 'rejected' ? 'Rejected' : 'Reviewed'}<small>{item.approved_by ? reviewer : item.status === 'pending' ? 'Waiting' : '—'}</small>
            </li>
            <li data-step={item.status === 'approved' ? 'current' : item.status === 'posted' ? 'done' : undefined}>
                Approved<small>{['approved', 'posted'].includes(item.status) ? 'By reviewer' : '—'}</small>
            </li>
            <li data-step={item.status === 'posted' ? 'done' : item.status === 'cancelled' ? 'failed' : undefined}>
                {item.status === 'cancelled' ? 'Withdrawn' : 'Posted'}<small>{item.posted_at ? stamp(item.posted_at) : 'Not posted'}</small>
            </li>
        </ol>
        <div className="approval-detail-body">
            <dl className="approval-facts">
                <div><dt>Type</dt><dd>{kindName(item.kind)}</dd></div>
                <div><dt>Effective date</dt><dd>{date}</dd></div>
                <div><dt>Requested by</dt><dd>{requester}</dd></div>
                <div><dt>Reviewed by</dt><dd>{item.approved_by ? reviewer : 'Not reviewed'}</dd></div>
            </dl>
            {related.length > 0 && <p className="finance-muted related">{related.map(([name, value]) => name + ' #' + value).join(' · ')}</p>}
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

function ApprovalActions({ item, actorId, accounts, copy, poster }: { item: ApprovalItem; actorId: number; accounts: Account[]; copy?: () => void; poster: string }) {
    const { can } = usePermissions();
    const decision = useForm({ note: '', approve: true });
    const post = useForm({ reference: '', account_id: '' });
    const withdraw = useForm({ reason: '' });
    const path = '/finance-approvals/' + item.id;
    const self = item.created_by === actorId;
    const beneficiary = item.beneficiary_id === actorId;
    const reconciliation = ['close_variance', 'shortage'].includes(item.kind);
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
            {reconciliation && can('distribution.reconcile') && <Button asChild variant="outline"><Link href="/daily-reconciliation">Open Daily Reconciliation</Link></Button>}
            {!reconciliation && can('finance.post') && <form className="space-y-3" onSubmit={event => { event.preventDefault(); post.post(path + '/post', { preserveScroll: true }); }}>
                <Field label="Completed transaction reference"><Input maxLength={200} value={post.data.reference} onChange={event => post.setData('reference', event.target.value)} /></Field>
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
