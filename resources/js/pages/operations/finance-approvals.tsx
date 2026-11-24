import { Paginator, type PaginatedData } from '@/components/paginator';
import { usePermissions } from '@/hooks/use-permissions';
import AppLayout from '@/layouts/app-layout';
import { shortDate } from '@/lib/format';
import { Head, Link, router, usePage } from '@inertiajs/react';
import { ArrowLeft, Banknote, Lock, Plus, Search, ShieldCheck, UsersRound } from 'lucide-react';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { Account } from './daily-collections';
import { ApprovalBadge, ApprovalDetail, ApprovalIcon } from './finance-approval-detail';
import { RequestDialog, type DraftSeed } from './finance-approval-request';
import { amountText, kindName, statuses, type ApprovalItem, type ApprovalStatus } from './finance-approval-types';
import './finance-approvals.css';

type QueueTab = ApprovalStatus | 'all';
type Filters = { status: QueueTab; type: string; search: string };
type Summary = Partial<Record<ApprovalStatus, { count: number; amount_paisa: number }>>;
type Props = {
    items: PaginatedData<ApprovalItem>; accounts: Account[]; kinds: string[]; today: string; actorId: number; requestId: number | null;
    filters: Filters; summary: Summary;
};
const tiles = [
    { status: 'pending', color: '#d97706', description: 'Awaiting an independent decision' },
    { status: 'approved', color: '#1f4e79', description: 'Waiting to be posted or applied' },
    { status: 'posted', color: '#059669', description: 'Total value of posted requests' },
    { status: 'rejected', color: '#dc2626', description: 'Returned to the requester' },
] as const;
const rules = [
    { title: 'Two people, every time', body: 'The person who submits a request cannot review it.', icon: UsersRound, tone: 'blue' },
    { title: 'Evidence stays private', body: 'Supporting files are available only to users authorized to view the request.', icon: Lock, tone: 'amber' },
    { title: 'Approval ≠ payment', body: 'Approving a request does not post it or move cash.', icon: Banknote, tone: 'teal' },
] as const;

export default function FinanceApprovals({ items, accounts, kinds, today, actorId, requestId, filters, summary }: Props) {
    const { can } = usePermissions();
    const { url, props } = usePage<{ auth: { user: { name: string } | null } }>();
    const query = new URL(url, 'http://localhost').searchParams;
    const creatable = kinds.filter(kind => kind !== 'delivery_correction' && (kind !== 'opening' || can('treasury.manage')));
    const canCreate = can('finance.request') && creatable.length > 0;
    const [search, setSearch] = useState(filters.search);
    const [selectedId, setSelectedId] = useState<number | null>(requestId);
    const [seed, setSeed] = useState<DraftSeed | undefined>(() => {
        const kind = query.get('kind');
        return !requestId && canCreate && kind && creatable.includes(kind) ? Object.fromEntries(query) : undefined;
    });
    const detailRef = useRef<HTMLDivElement>(null);
    const requestTrigger = useRef<HTMLButtonElement>(null);
    const selected = items.data.find(item => item.id === selectedId) ?? items.data[0];
    const allCount = Object.values(summary).reduce((sum, bucket) => sum + bucket.count, 0);
    const tabs: QueueTab[] = ['pending', 'approved', 'posted', 'rejected', ...(summary.cancelled?.count ? ['cancelled' as const] : []), 'all'];

    function apply(changes: Partial<Filters>) {
        const next = { ...filters, search: search.trim(), ...changes };
        router.get('/finance-approvals', { status: next.status, type: next.type || undefined, search: next.search || undefined },
            { preserveScroll: true, preserveState: true, replace: !requestId });
    }

    useEffect(() => {
        const trimmed = search.trim();
        if (requestId || trimmed === filters.search) return;
        const timer = window.setTimeout(() => router.get('/finance-approvals', { status: filters.status, type: filters.type || undefined, search: trimmed || undefined },
            { preserveScroll: true, preserveState: true, replace: true }), 300);
        return () => window.clearTimeout(timer);
    }, [filters.search, filters.status, filters.type, requestId, search]);

    function choose(item: ApprovalItem) {
        setSelectedId(item.id);
        if (window.matchMedia('(max-width: 1200px)').matches) {
            detailRef.current?.scrollIntoView({ block: 'start' });
            detailRef.current?.focus({ preventScroll: true });
        }
    }

    return <AppLayout><Head title="Finance Approvals" />
        <main className="finance-approvals">
            <header className="finance-hero">
                <div className="min-w-0">
                    <h1>Finance Approvals</h1>
                    <p><ShieldCheck />An independent approver must review each request. Approval alone does not move cash.</p>
                </div>
                <div className="finance-hero-actions">
                    {props.auth.user && <span className="signed-in"><UsersRound />{props.auth.user.name}</span>}
                    {requestId ? <Link className="finance-hero-button secondary" href="/finance-approvals?status=all"><ArrowLeft />View all requests</Link>
                        : canCreate && <button className="finance-hero-button" type="button" ref={requestTrigger} onClick={() => setSeed({})}><Plus />New request</button>}
                </div>
            </header>
            {!requestId && <>
                <section className="finance-rules" aria-label="Approval rules">
                    {rules.map(({ title, body, icon: Icon, tone }) => <article key={title} className="finance-card">
                        <span className="finance-icon" data-tone={tone}><Icon /></span><div><strong>{title}</strong><p>{body}</p></div>
                    </article>)}
                </section>
                <section className="finance-kpis" aria-label="Approval totals">
                    {tiles.map(({ status, color, description }) => <button className="finance-card finance-kpi" type="button" key={status} aria-pressed={filters.status === status}
                        style={{ '--kpi-color': color } as CSSProperties} onClick={() => apply({ status })}>
                        <span>{statuses[status]}</span><strong>{summary[status]?.count ?? 0}</strong>
                        <small>{status === 'rejected' ? description : amountText(summary[status]?.amount_paisa ?? 0) + ' · ' + description}</small>
                    </button>)}
                </section>
            </>}

            <div className={'finance-main' + (requestId ? ' direct' : '')}>
                {!requestId && <section className="finance-card approval-queue" aria-label="Request queue">
                    <nav className="approval-tabs" aria-label="Request status">
                        {tabs.map(status => <button type="button" key={status} aria-pressed={filters.status === status} onClick={() => apply({ status })}>
                            {status === 'all' ? 'All' : status === 'approved' ? 'Approved' : statuses[status]}<span>{status === 'all' ? allCount : summary[status]?.count ?? 0}</span>
                        </button>)}
                    </nav>
                    <form className="approval-tools" onSubmit={event => { event.preventDefault(); apply({}); }}>
                        <label className="approval-search"><Search aria-hidden="true" />
                            <input aria-label="Search requests" placeholder="Search requests…" maxLength={120} value={search} onChange={event => setSearch(event.target.value)} />
                        </label>
                        <select className="approval-type-filter" aria-label="Filter by request type" value={filters.type} onChange={event => apply({ type: event.target.value })}>
                            <option value="">All types</option>{kinds.map(kind => <option key={kind} value={kind}>{kindName(kind)}</option>)}
                        </select>
                        {(filters.type || search) && <button type="button" className="filter-clear" onClick={() => { setSearch(''); apply({ type: '', search: '' }); }}>Clear</button>}
                    </form>
                    <div className="approval-list">
                        {items.data.map(item => <button type="button" className="approval-row" key={item.id} aria-pressed={selected?.id === item.id} onClick={() => choose(item)}>
                            <ApprovalIcon kind={item.kind} />
                            <span className="row-title">#{item.id} · {kindName(item.kind)}{actorId === item.created_by && item.status === 'pending' && <small>Yours</small>}</span>
                            <span className="row-amount">{amountText(item.amount_paisa)}</span>
                            <span className="row-summary">{shortDate(typeof item.payload.date === 'string' ? item.payload.date : null)}{item.payload.notes ? ' · ' + item.payload.notes : ''}</span>
                            <span className="row-status"><ApprovalBadge status={item.status} compact /></span>
                        </button>)}
                        {!items.data.length && <div className="finance-empty">
                            <strong>{filters.status === 'pending' && !filters.search && !filters.type ? 'Nothing waiting for review' : 'No matching requests'}</strong>
                            <p>{filters.search || filters.type ? 'Try another search or clear the filters.' : 'Requests will appear here when they reach this status.'}</p>
                        </div>}
                    </div>
                    {items.last_page > 1 && <div className="approval-pages"><Paginator meta={items} /></div>}
                </section>}
                <div ref={detailRef} tabIndex={-1} className="min-w-0 outline-none">
                    {selected ? <ApprovalDetail key={selected.id + ':' + selected.status} item={selected} actorId={actorId} accounts={accounts}
                        copy={canCreate && selected.status === 'rejected' && selected.created_by === actorId && creatable.includes(selected.kind)
                            ? () => setSeed({ ...selected.payload, kind: selected.kind, amount: (selected.amount_paisa / 100).toFixed(2) }) : undefined} />
                        : <div className="finance-card finance-empty detail-empty">
                            <strong>{requestId ? 'This request is not available' : 'Select a request'}</strong>
                            <p>{requestId ? 'It may be outside your access or no longer available.' : 'Choose a request to see its details, review, and private evidence.'}</p>
                        </div>}
                </div>
            </div>
        </main>
        {canCreate && <RequestDialog open={seed !== undefined} seed={seed} close={() => setSeed(undefined)}
            restoreFocus={() => requestTrigger.current?.focus()} created={() => { setSeed(undefined); setSearch(''); setSelectedId(null); apply({ status: 'pending', search: '', type: '' }); }}
            kinds={creatable} accounts={accounts} today={today} />}
    </AppLayout>;
}
