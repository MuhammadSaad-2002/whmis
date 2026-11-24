import { Paginator, type PaginatedData } from '@/components/paginator';
import { Button } from '@/components/ui/button';
import { SearchField } from '@/components/ui/search-field';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import AppLayout from '@/layouts/app-layout';
import { shortDate, totalMoney } from '@/lib/format';
import { Head, Link, router } from '@inertiajs/react';
import { ArrowRight, ArrowUpDown, CalendarDays, Columns3, GripVertical, Info, List, Printer, Truck } from 'lucide-react';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { BoardMove, type BoardMoveRequest } from './dispatch-board-move';
import { actions, label } from './dispatch-detail';
import type { DispatchFilters, DispatchRow } from './dispatch-index';
import { stamp, type Staff } from './shared';
import './dispatch-index.css';

const stages = [
    { key: 'untracked', label: 'Untracked', color: '#94a3b8', ink: '#475569', surface: '#f1f4f7' },
    { key: 'pending', label: 'Pending', color: '#64748b', ink: '#475569', surface: '#eef1f5' },
    { key: 'picking', label: 'Picking', color: '#8b5cf6', ink: '#6d28d9', surface: '#f3eefc' },
    { key: 'packed', label: 'Packed', color: '#d97706', ink: '#92400e', surface: '#fff6e0' },
    { key: 'dispatched', label: 'Out for delivery', color: '#2563eb', ink: '#1d4ed8', surface: '#e8effd' },
    { key: 'delivered', label: 'Delivered', color: '#059669', ink: '#047857', surface: '#e3f7ef' },
    { key: 'failed', label: 'Failed / Returned', color: '#dc2626', ink: '#b91c1c', surface: '#fdecec' },
] as const;
type Stage = typeof stages[number];
type StageKey = Stage['key'];
type Sort = 'number' | 'customer' | 'date' | 'value' | 'activity';
type View = 'board' | 'list';
type Filters = DispatchFilters & { stage?: StageKey; view?: View; sort?: Sort; dir?: 'asc' | 'desc' };
type Invoice = DispatchRow & { total_amount: string; items_count: number; last_activity_at: string | null };
type PreviewEvent = { id: number; action: string; created_at: string; by: string | null; receiver: string | null; notes: string | null };
type PreviewData = { first_event_at: string | null; events: PreviewEvent[] };
export type AdminDispatchProps = {
    invoices: PaginatedData<Invoice>; filters: Filters; staff: Staff[]; canPlan: boolean; canManage: boolean; today: string;
    pipeline: Record<StageKey, { count: number; value: number; overdue: number }>;
    board: Partial<Record<StageKey, PaginatedData<Invoice>>>;
};

const resolveStage = (state?: string) => stages.find(stage => stage.key === (state === 'partial' ? 'dispatched' : state === 'closed' ? 'failed' : state)) ?? stages[0];
const stageStyle = (stage: Stage) => ({ '--stage': stage.color, '--stage-ink': stage.ink, '--stage-bg': stage.surface }) as CSSProperties;
const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map(word => word[0]).join('').toUpperCase();
const completed = (row: Invoice) => ['delivered', 'closed'].includes(row.dispatch_status);
const eligibleForPick = (row: Invoice) => ['pending', 'picking'].includes(row.dispatch_status);
const overdue = (row: Invoice, today: string) => Boolean(row.planned_date && row.planned_date < today && !completed(row));
function elapsed(date: string | null, end = Date.now()): string {
    if (!date) return '—';
    const minutes = Math.max(0, Math.floor((end - new Date(date).getTime()) / 60000));
    return minutes < 60 ? minutes + 'm' : minutes < 2880 ? Math.floor(minutes / 60) + 'h' : Math.floor(minutes / 1440) + 'd';
}
const lastActivity = (row: Invoice) => row.last_activity_at ? elapsed(row.last_activity_at) + ' ago' : '—';

export function AdminDispatchIndex({ invoices, filters, staff, canPlan, canManage, today, pipeline, board }: AdminDispatchProps) {
    const [search, setSearch] = useState(filters.search ?? '');
    const [selected, setSelected] = useState<ReadonlySet<number>>(new Set());
    const [preview, setPreview] = useState<Invoice | null>(null);
    const [sheetOpen, setSheetOpen] = useState(false);
    const [move, setMove] = useState<BoardMoveRequest | null>(null);
    const [dragging, setDragging] = useState<number | null>(null);
    const [over, setOver] = useState<StageKey | null>(null);
    const dragRow = useRef<Invoice | null>(null);
    const moveTrigger = useRef<HTMLElement | null>(null);
    const boardRef = useRef<HTMLDivElement | null>(null);
    const previewTrigger = useRef<HTMLButtonElement | null>(null);
    const sheetTrigger = useRef<HTMLButtonElement | null>(null);
    function showPreview(row: Invoice, trigger: HTMLButtonElement) {
        previewTrigger.current = trigger;
        setPreview(row);
    }
    function clearDrag() {
        dragRow.current = null;
        setDragging(null);
        setOver(null);
    }
    const view = filters.view ?? 'board';
    const stageKey = filters.stage ?? (filters.status ? resolveStage(filters.status).key : '');
    const hasFilters = Boolean(filters.search?.trim() || stageKey || filters.assignee_id || filters.date);
    const visible = view === 'board' ? Object.values(board).flatMap(column => column.data) : invoices.data;
    const selection = visible.filter(row => selected.has(row.id));
    const pickable = selection.filter(eligibleForPick);
    const updateFilters = (changes: Filters) => {
        setSelected(new Set());
        router.get('/dispatch', { ...filters, search: search.trim() || undefined, ...changes }, { preserveScroll: true, preserveState: true, replace: true });
    };
    useEffect(() => {
        const trimmed = search.trim();
        if (trimmed === (filters.search ?? '')) return;
        const timeout = window.setTimeout(() => {
            setSelected(new Set());
            router.get('/dispatch', { ...filters, search: trimmed || undefined }, { preserveScroll: true, preserveState: true, replace: true });
        }, 275);
        return () => window.clearTimeout(timeout);
    }, [filters, search]);

    const pickHref = (ids: number[] = []) => {
        const query = new URLSearchParams();
        if (ids.length) ids.forEach(id => query.append('ids[]', String(id)));
        else {
            if (filters.search) query.set('search', filters.search);
            if (filters.assignee_id) query.set('assignee_id', String(filters.assignee_id));
            if (filters.date) query.set('date', filters.date);
        }
        const base = route('dispatch.pick-list', {}, false);
        return query.size ? base + '?' + query : base;
    };
    const allOnPage = invoices.data.length > 0 && invoices.data.every(row => selected.has(row.id));
    function selectRows(rows: Invoice[], checked: boolean) {
        setSelected(previous => {
            const next = new Set(previous);
            rows.forEach(row => checked ? next.add(row.id) : next.delete(row.id));
            return next;
        });
    }
    const sort = filters.sort ?? 'activity';
    const dir = filters.dir ?? (sort === 'customer' ? 'asc' : 'desc');
    const pickSort = (column: Sort) => updateFilters({ sort: column, dir: sort === column ? dir === 'asc' ? 'desc' : 'asc' : column === 'customer' ? 'asc' : 'desc' });
    const invoiceAction = (row: Invoice) => completed(row) ? 'View delivery' : row.dispatch_status === 'packed' ? 'Review pickup' : 'Open delivery';

    return <AppLayout><Head title="Dispatch & Delivery" />
        <main className="admin-dispatch">
            <header className="dispatch-hero">
                <div>
                    <h1>Dispatch &amp; Delivery</h1>
                    <p>Track picking, packing and deliveries for posted sales invoices. Stock is deducted when the invoice is posted.</p>
                </div>
                <div className="hero-actions">
                    {canPlan && <>
                        <Link className="hero-button" href={route('dispatch.schedules', {}, false)}><CalendarDays />Schedules</Link>
                        <button type="button" className="hero-button" ref={sheetTrigger} onClick={() => setSheetOpen(true)}><Printer />Daily delivery sheet</button>
                    </>}
                    <a className="hero-button" href={pickHref()} target="_blank" rel="noopener"><Printer />Print pick list</a>
                    <button type="button" className="hero-button primary" onClick={() => updateFilters({ stage: 'packed', status: undefined })}><Truck />Review packed</button>
                </div>
            </header>

            <section className="pipeline" aria-label="Delivery stages">
                {stages.map(stage => {
                    const totals = pipeline[stage.key];
                    return <button type="button" className="stage" key={stage.key} style={stageStyle(stage)} aria-pressed={stage.key === stageKey}
                        onClick={() => updateFilters({ stage: stageKey === stage.key ? undefined : stage.key, status: undefined })}>
                        <span className="stage-title"><i />{stage.label}</span>
                        <strong className="stage-count">{totals.count}</strong>
                        <span className="stage-value">{totalMoney(totals.value)}{totals.overdue > 0 && <> · <b className="late">{totals.overdue} overdue</b></>}</span>
                        <span className="stage-arrow" aria-hidden="true" />
                    </button>;
                })}
            </section>

            <section className="dispatch-list" aria-label="Posted sales invoices">
                <div className="toolbar">
                    <form className="search-box" role="search" onSubmit={event => { event.preventDefault(); updateFilters({}); }}>
                        <SearchField className="max-w-none" value={search} onChange={event => setSearch(event.target.value)} maxLength={100} aria-label="Invoice or customer" placeholder="Invoice or customer…" />
                    </form>
                    <select className="filter-field" aria-label="Delivery stage" value={stageKey} onChange={event => updateFilters({ stage: event.target.value as StageKey || undefined, status: undefined })}>
                        <option value="">All stages</option>{stages.map(stage => <option key={stage.key} value={stage.key}>{stage.label}</option>)}
                    </select>
                    <select className="filter-field" aria-label="Assigned staff" value={filters.assignee_id ?? ''} onChange={event => updateFilters({ assignee_id: event.target.value || undefined })}>
                        <option value="">All staff</option>{staff.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}
                    </select>
                    <input className="filter-field date-field" aria-label="Planned delivery date" type="date" value={filters.date ?? ''} onChange={event => updateFilters({ date: event.target.value || undefined })} />
                    {hasFilters && <button type="button" className="clear" onClick={() => { setSearch(''); updateFilters({ search: undefined, stage: undefined, status: undefined, assignee_id: undefined, date: undefined }); }}>Clear filters</button>}
                    <div className="view-toggle" role="group" aria-label="Delivery view">
                        <button type="button" aria-pressed={view === 'board'} onClick={() => view !== 'board' && updateFilters({ view: 'board' })}><Columns3 />Board</button>
                        <button type="button" aria-pressed={view === 'list'} onClick={() => view !== 'list' && updateFilters({ view: 'list' })}><List />List</button>
                    </div>
                </div>
                <p className="list-note"><Info />{view === 'board' && canManage
                    ? 'Drag an invoice or use its Move button. You’ll be asked for the details required before the stage changes.'
                    : 'Untracked invoices have no recorded delivery history. Open a delivery to view its assignment and activity.'}</p>
                {selection.length > 0 && <div className="bulk">
                    <strong>{selection.length} selected</strong><span>· {totalMoney(selection.reduce((sum, row) => sum + Number(row.total_amount), 0))}</span>
                    {pickable.length > 0 && pickable.length <= 30 ? <a href={pickHref(pickable.map(row => row.id))} target="_blank" rel="noopener">Print selected pick list</a>
                        : <span>{pickable.length > 30 ? 'Select at most 30 pending or picking invoices to print.' : 'Only pending or picking invoices have a pick list.'}</span>}
                    {pickable.length > 0 && pickable.length < selection.length && <span>Only {pickable.length} {pickable.length === 1 ? 'invoice needs' : 'invoices need'} picking.</span>}
                    <button type="button" onClick={() => setSelected(new Set())}>Clear selection</button>
                </div>}
                {view === 'board' ? <div ref={boardRef} className={'board' + (stageKey ? ' single' : '')} tabIndex={0} aria-label="Delivery board">
                    {stages.filter(stage => board[stage.key]).map(stage => {
                        const column = board[stage.key]!;
                        return <section className="lane" data-drop-over={over === stage.key} key={stage.key} style={stageStyle(stage)} aria-label={stage.label + ' invoices'}
                            onDragOver={event => {
                                if (!canManage || !dragRow.current || stage.key === 'untracked') return;
                                event.preventDefault();
                                event.dataTransfer.dropEffect = 'move';
                                setOver(stage.key);
                            }}
                            onDragLeave={event => {
                                if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) {
                                    setOver(current => current === stage.key ? null : current);
                                }
                            }}
                            onDrop={event => {
                                if (!canManage || !dragRow.current || stage.key === 'untracked') return;
                                event.preventDefault();
                                const row = dragRow.current;
                                clearDrag();
                                setMove({ row, target: stage.key, targetLabel: stage.label });
                            }}>
                            <h2><i />{stage.label}<span>{column.total}</span></h2>
                            <div className="lane-body">
                                {column.data.map(row => <article className="invoice-card" key={row.id} draggable={canManage && !completed(row)} data-dragging={dragging === row.id}
                                    onDragStart={event => {
                                        if (!canManage || completed(row) || event.target !== event.currentTarget) return;
                                        dragRow.current = row;
                                        moveTrigger.current = event.currentTarget.querySelector('.move-card');
                                        event.dataTransfer.setData('text/plain', row.invoice_number);
                                        event.dataTransfer.effectAllowed = 'move';
                                        setDragging(row.id);
                                    }} onDragEnd={clearDrag}>
                                    <div className="card-top">
                                        <input type="checkbox" checked={selected.has(row.id)} aria-label={'Select ' + row.invoice_number} onChange={event => selectRows([row], event.target.checked)} />
                                        <button type="button" onClick={event => showPreview(row, event.currentTarget)}>{row.invoice_number}</button><span>{totalMoney(row.total_amount)}</span>
                                    </div>
                                    <div className="customer">{row.customer?.name ?? 'Customer'}</div>
                                    <div className="card-meta">
                                        {row.assignee && <Avatar name={row.assignee} />}
                                        <span>{row.items_count} {row.items_count === 1 ? 'item' : 'items'}</span>
                                        <span className={overdue(row, today) ? 'late' : ''}>{overdue(row, today) ? 'Overdue' : row.last_activity_at ? lastActivity(row) : shortDate(row.invoice_date)}</span>
                                        {canManage && !completed(row) && <button type="button" className="move-card" aria-label={'Move ' + row.invoice_number} title="Move delivery"
                                            onClick={event => { moveTrigger.current = event.currentTarget; setMove({ row }); }}><GripVertical /></button>}
                                    </div>
                                </article>)}
                                {!column.data.length && <p className="lane-empty">{stage.key === 'untracked' ? 'No untracked invoices' : 'No invoices in this stage'}</p>}
                                {column.total > column.data.length && <button className="clear" type="button" onClick={() => updateFilters({ stage: stage.key, status: undefined, view: 'list' })}>View all {column.total} invoices</button>}
                            </div>
                        </section>;
                    })}
                </div> : <>
                    <div className="table-scroll" tabIndex={0} aria-label="Delivery list">
                        <table>
                            <thead><tr>
                                <th><input type="checkbox" checked={allOnPage} disabled={!invoices.data.length} aria-label="Select invoices on this page" onChange={event => selectRows(invoices.data, event.target.checked)} /></th>
                                <SortHeading title="Invoice" field="number" sort={sort} dir={dir} change={pickSort} />
                                <SortHeading title="Customer" field="customer" sort={sort} dir={dir} change={pickSort} />
                                <SortHeading title="Invoice date" field="date" sort={sort} dir={dir} change={pickSort} />
                                <SortHeading title="Value" field="value" sort={sort} dir={dir} change={pickSort} />
                                <th>Items</th><th>Stage</th><th>Progress</th><th>Assigned staff</th>
                                <SortHeading title="Last update" field="activity" sort={sort} dir={dir} change={pickSort} />
                                <th>Action</th>
                            </tr></thead>
                            <tbody>{invoices.data.map(row => <tr key={row.id} className={selected.has(row.id) ? 'selected' : ''}>
                                <td><input type="checkbox" checked={selected.has(row.id)} aria-label={'Select ' + row.invoice_number} onChange={event => selectRows([row], event.target.checked)} /></td>
                                <td><button type="button" className="invoice-link" onClick={event => showPreview(row, event.currentTarget)}>{row.invoice_number}</button></td>
                                <td className="customer-cell"><b>{row.customer?.name ?? 'Customer'}</b><small>{row.customer?.city}</small></td>
                                <td>{shortDate(row.invoice_date)}</td><td className="numeric">{totalMoney(row.total_amount)}</td><td>{row.items_count}</td>
                                <td><StageBadge row={row} /></td><td><StageProgress row={row} /></td>
                                <td>{row.assignee ? <span className="staff-cell"><Avatar name={row.assignee} />{row.assignee}</span> : '—'}</td>
                                <td title={row.last_activity_at ? stamp(row.last_activity_at) : undefined} className={overdue(row, today) ? 'late' : 'muted'}>{overdue(row, today) ? 'Overdue · ' : ''}{lastActivity(row)}</td>
                                <td><Link className="outline-button" href={route('dispatch.show', row.id, false)}>{invoiceAction(row)}<ArrowRight /></Link></td>
                            </tr>)}
                            {!invoices.data.length && <tr><td colSpan={11} className="table-empty">No invoices match.</td></tr>}
                            </tbody>
                        </table>
                    </div>
                    {invoices.last_page > 1 ? <div className="page-footer"><Paginator meta={invoices} /></div> : <p className="page-footer">{invoices.total} {invoices.total === 1 ? 'invoice' : 'invoices'}</p>}
                </>}
            </section>
        </main>
        <Sheet open={preview !== null} onOpenChange={open => { if (!open) setPreview(null); }}>
            <SheetContent side="right" className="dispatch-preview w-full gap-0 p-0 sm:max-w-[500px]" onCloseAutoFocus={event => { event.preventDefault(); previewTrigger.current?.focus(); }}>
                {preview && <InvoicePreview key={preview.id} row={preview} today={today} />}
            </SheetContent>
        </Sheet>
        {canPlan && <DailySheet open={sheetOpen} setOpen={setSheetOpen} today={today} staff={staff} restoreFocus={() => sheetTrigger.current?.focus()} />}
        {canManage && <BoardMove request={move} close={() => setMove(null)} restoreFocus={() => {
            (moveTrigger.current?.isConnected ? moveTrigger.current : boardRef.current)?.focus();
        }} />}
    </AppLayout>;
}

function Avatar({ name }: { name: string }) {
    return <span className="avatar" title={name}>{initials(name)}</span>;
}

function SortHeading({ title, field, sort, dir, change }: { title: string; field: Sort; sort: Sort; dir: 'asc' | 'desc'; change: (sort: Sort) => void }) {
    return <th aria-sort={sort === field ? dir === 'asc' ? 'ascending' : 'descending' : undefined}>
        <button type="button" className="sort" onClick={() => change(field)}>{title}<ArrowUpDown aria-hidden="true" /></button>
    </th>;
}

function StageBadge({ row }: { row: Invoice }) {
    const stage = resolveStage(row.dispatch_status);
    return <span className="stage-badge" style={stageStyle(stage)}><i />{row.dispatch_status === 'closed' ? 'Returned / closed' : row.dispatch_status === 'partial' ? 'Partially delivered' : row.dispatch_status === 'failed' ? 'Failed' : stage.label}</span>;
}

const flow = [['pending', 'Pending'], ['picking', 'Picking'], ['packed', 'Packed'], ['dispatched', 'Out'], ['delivered', 'Delivered']];
function StageProgress({ row, labelled = false }: { row: Invoice; labelled?: boolean }) {
    const stage = resolveStage(row.dispatch_status);
    const reached = row.dispatch_status === 'closed' ? -1 : row.dispatch_status === 'failed' ? 3 : flow.findIndex(([key]) => key === stage.key);
    if (row.dispatch_status === 'closed') return labelled ? <p className="muted">Closed: remaining items covered by posted returns.</p> : <span className="muted">—</span>;
    return <div className={labelled ? 'timeline-steps' : 'steps'} role="img" aria-label={'Delivery stage: ' + label(row.dispatch_status)} style={stageStyle(stage)}>
        {flow.map(([key, name], index) => <span key={key} data-reached={index <= reached} data-current={index === reached}>{labelled ? name : null}</span>)}
    </div>;
}

function InvoicePreview({ row, today }: { row: Invoice; today: string }) {
    const [data, setData] = useState<PreviewData | null>(null);
    const [failed, setFailed] = useState(false);
    useEffect(() => {
        const request = new AbortController();
        if (row.dispatch_status === 'untracked') return;
        fetch(route('dispatch.preview', row.id, false), { headers: { Accept: 'application/json' }, signal: request.signal })
            .then(response => { if (!response.ok) throw new Error('Preview unavailable'); return response.json() as Promise<PreviewData>; })
            .then(setData)
            .catch(() => { if (!request.signal.aborted) setFailed(true); });
        return () => request.abort();
    }, [row.id, row.dispatch_status]);
    const lastReceipt = data?.events.find(event => event.action === 'delivered' && event.receiver);
    const lastFailure = row.dispatch_status === 'failed' ? data?.events.find(event => event.action === 'failed') : null;
    return <>
        <SheetHeader className="drawer-header text-left">
            <SheetTitle>{row.invoice_number}</SheetTitle>
            <SheetDescription>{[row.customer?.name, row.customer?.city, 'Invoiced ' + shortDate(row.invoice_date)].filter(Boolean).join(' · ')}</SheetDescription>
            <div><StageBadge row={row} />{overdue(row, today) && <strong className="late"> · Overdue</strong>}</div>
        </SheetHeader>
        <div className="drawer-body">
            <StageProgress row={row} labelled />
            <dl className="drawer-metrics">
                <div><dt>Invoice value</dt><dd>{totalMoney(row.total_amount)}</dd></div>
                <div><dt>Items</dt><dd>{row.items_count} lines</dd></div>
                <div><dt>Last update</dt><dd>{lastActivity(row)}</dd></div>
                <div><dt>Since tracking began</dt><dd>{elapsed(data?.first_event_at ?? null, completed(row) && row.last_activity_at ? new Date(row.last_activity_at).getTime() : undefined)}</dd></div>
            </dl>
            {row.dispatch_status === 'untracked' ? <p className="drawer-note">This invoice has no recorded delivery history. Open it to assign staff and plan delivery.</p> : <>
                <h3>Assignment</h3>
                <p>{row.assignee ?? 'Unassigned'} · {row.planned_date ? shortDate(row.planned_date) : 'Not scheduled'}</p>
                {lastReceipt && <><h3>Proof of delivery</h3><p>Received by <strong>{lastReceipt.receiver}</strong></p></>}
                {lastFailure && <><h3>Failure reason</h3><p className="drawer-note late">{lastFailure.notes ?? 'No reason recorded.'}</p></>}
                <h3>Timeline</h3>
                {failed ? <p className="muted">Could not load activity. Open the delivery to view its full history.</p>
                    : !data ? <p role="status" className="muted">Loading activity…</p>
                        : data.events.length ? <ol className="drawer-events">{data.events.map(event => <li key={event.id}><strong>{label(event.action, actions)}</strong><small>{stamp(event.created_at)}{event.by ? ' · ' + event.by : ''}</small></li>)}</ol>
                            : <p className="muted">No delivery events recorded yet.</p>}
            </>}
        </div>
        <footer className="drawer-footer">
            <Link className="outline-button solid" href={route('dispatch.show', row.id, false)}>Open delivery<ArrowRight /></Link>
            {eligibleForPick(row) && <a className="outline-button" href={route('dispatch.pick-list', {}, false) + '?ids[]=' + row.id} target="_blank" rel="noopener"><Printer />Print pick list</a>}
        </footer>
    </>;
}

function DailySheet({ open, setOpen, today, staff, restoreFocus }: { open: boolean; setOpen: (open: boolean) => void; today: string; staff: Staff[]; restoreFocus: () => void }) {
    return <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent appearance="form" side="right" className="dispatch-preview w-full sm:max-w-[500px]" onCloseAutoFocus={event => { event.preventDefault(); restoreFocus(); }}>
            <SheetHeader>
                <SheetTitle>Daily delivery sheet</SheetTitle>
                <SheetDescription>Print invoices planned for one staff member on the chosen date.</SheetDescription>
            </SheetHeader>
            <form method="get" target="_blank" rel="noopener" action={route('dispatch.sheet', {}, false)}>
                <div className="grid gap-3" data-popup-section="body">
                <label className="grid gap-1">Delivery date<input className="px-3" type="date" name="date" required defaultValue={today} /></label>
                <label className="grid gap-1">Salesman / staff<select className="px-3" name="assignee_id" required defaultValue="">
                    <option value="">Choose staff</option>{staff.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}
                </select></label>
                </div>
                <footer data-popup-section="footer"><Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit"><Printer />Print daily sheet</Button></footer>
            </form>
        </SheetContent>
    </Sheet>;
}
