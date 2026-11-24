import { RegisterHeader } from '@/components/master-register';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { SearchField } from '@/components/ui/search-field';
import { useDraftLeave } from '@/hooks/use-draft-leave';
import { usePermissions } from '@/hooks/use-permissions';
import AppLayout from '@/layouts/app-layout';
import { shiftDate, weekdayDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Head, Link, router } from '@inertiajs/react';
import { AlertTriangle, History, RotateCw, Truck } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import './delivery-schedules.css';

type Schedule = { booking_days: number[]; delivery_days: number[]; salesman_id: number | null };
type Customer = Schedule & { id: number; name: string; city: string | null; salesman_name: string | null; bookers: string[] };
type Staff = { id: number; name: string };
type Props = { customers: Customer[]; salesmen: Staff[]; search: string; today: string };
type DaysKey = 'booking_days' | 'delivery_days';
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const COLORS = ['#d97706', '#1f4e79', '#0f8f80', '#684ab4', '#036981'];
const PAGE_SIZE = 60;
const SAVE_LIMIT = 500;
const filters = [
    ['all', 'All'], ['none', 'No schedule'], ['scheduled', 'Scheduled'], ['no-booker', 'No booker'], ['no-city', 'No city'], ['dirty', 'Unsaved'],
] as const;
type Filter = (typeof filters)[number][0];

function matches(customer: Customer, filter: Filter, drafts: Map<number, Schedule>) {
    const scheduled = customer.booking_days.length > 0 || customer.delivery_days.length > 0;
    switch (filter) {
        case 'none': return !scheduled;
        case 'scheduled': return scheduled;
        case 'no-booker': return !customer.bookers.length;
        case 'no-city': return !customer.city?.trim();
        case 'dirty': return drafts.has(customer.id);
        default: return true;
    }
}

function equal(a: Schedule, b: Schedule) {
    return a.salesman_id === b.salesman_id && a.booking_days.join(',') === b.booking_days.join(',') && a.delivery_days.join(',') === b.delivery_days.join(',');
}

function toggleDay(days: number[], day: number) {
    return days.includes(day) ? days.filter(value => value !== day) : [...days, day].sort((a, b) => a - b);
}

function Weekdays({ label, field, days, today, change, disabled }: {
    label: string; field: DaysKey; days: number[]; today?: number; change: (days: number[]) => void; disabled?: boolean;
}) {
    return <div className="days" role="group" aria-label={label}>
        {DAYS.map((name, index) => {
            const day = index + 1;
            return <button type="button" key={day} className={cn('d', field === 'booking_days' ? 'bk' : 'dl', days.includes(day) && 'on', day === today && 'tod')}
                aria-label={name + ' ' + (field === 'booking_days' ? 'booking' : 'delivery')} title={name}
                aria-pressed={days.includes(day)} disabled={disabled} onClick={() => change(toggleDay(days, day))}>{name.slice(0, 2)}</button>;
        })}
    </div>;
}

function NextDelivery({ schedule, day, today, available }: { schedule: Schedule; day: number; today: string; available: boolean }) {
    if (!available) return <><b>—</b><small>No active salesman</small></>;
    if (!schedule.delivery_days.length) return <><b className="now">Today</b><small>No days set: same day</small></>;
    const offset = Math.min(...schedule.delivery_days.map(value => (value - day + 7) % 7));
    const date = weekdayDate(shiftDate(today, offset));
    return <><b>{offset === 0 ? 'Today' : offset === 1 ? 'Tomorrow' : date}</b><small>{offset < 2 ? date : `in ${offset} days`}</small></>;
}

function ScheduleRow({ customer, saved, salesmen, today, todayDay, checked, dirty, disabled, change, select, showHistory, errors }: {
    customer: Customer; saved: Customer; salesmen: Staff[]; today: string; todayDay: number; checked: boolean; dirty: boolean; disabled: boolean;
    change: (patch: Partial<Schedule>) => void; select: () => void; showHistory: () => void; errors: string[];
}) {
    const chosen = salesmen.find(person => person.id === customer.salesman_id);
    const name = chosen?.name ?? (customer.salesman_id === saved.salesman_id ? saved.salesman_name : null);
    const initials = name?.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase() || '—';
    const warnings = [
        customer.booking_days.length && !customer.bookers.length ? 'No booker. Booking days won’t create visits.' : '',
        customer.booking_days.length && !customer.delivery_days.length ? 'Booking days but no delivery days. Invoices go out the same day.' : '',
        customer.delivery_days.length && customer.booking_days.length && customer.delivery_days.every(day => customer.booking_days.includes(day)) ? 'Delivery is on the same day as booking.' : '',
    ].filter(Boolean);
    return <div className={cn('schedule-row', checked && 'sel', dirty && 'dirty')} role="row">
        <div className="ccb" role="cell"><input type="checkbox" aria-label={'Select ' + customer.name} checked={checked} onChange={select} /></div>
        <div className="cust" role="rowheader">
            <b>{customer.name}</b>
            <div className="meta">
                {customer.city ? <span>{customer.city}</span> : <i>City not set</i>} <span aria-hidden="true">·</span>
                {customer.bookers.length ? <span>Booker: {customer.bookers.join(', ')}</span> : <span className="no-booker">No booker</span>}
                <button className="history" type="button" aria-label={'Default salesman history for ' + customer.name} title="Default salesman history" onClick={showHistory}><History /></button>
            </div>
            {warnings.map(warning => <div key={warning} className="warning"><AlertTriangle aria-hidden="true" />{warning}</div>)}
            {errors.map(error => <p key={error} role="alert" className="error">{error}</p>)}
        </div>
        <div className="cbk" role="cell"><span className="mobile-label">Booking</span><Weekdays label={'Booking days for ' + customer.name} field="booking_days"
            days={customer.booking_days} today={todayDay} disabled={disabled} change={booking_days => change({ booking_days })} /></div>
        <div className="cdl" role="cell"><span className="mobile-label">Delivery</span><Weekdays label={'Delivery days for ' + customer.name} field="delivery_days"
            days={customer.delivery_days} today={todayDay} disabled={disabled} change={delivery_days => change({ delivery_days })} /></div>
        <div className="cnext next" role="cell"><NextDelivery schedule={customer} today={today} day={todayDay} available={!!chosen} /></div>
        <div className="csal" role="cell"><span className="mobile-label">Default salesman</span><div className="sal">
            <span aria-hidden="true" className="av" style={{ background: chosen ? COLORS[salesmen.indexOf(chosen) % COLORS.length] : '#94a3b8' }}>{initials}</span>
            <select aria-label={'Default salesman for ' + customer.name} value={customer.salesman_id ?? ''} disabled={disabled}
                onChange={event => change({ salesman_id: event.target.value ? Number(event.target.value) : null })}>
                <option value="">Unassigned</option>
                {customer.salesman_id !== null && !chosen && <option value={customer.salesman_id}>{name ?? 'Salesman'} (unavailable)</option>}
                {salesmen.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}
            </select>
        </div></div>
    </div>;
}

type HistoryPage = {
    data: { id: number; previous_salesman_id: number | null; previous_salesman_name: string | null; salesman_id: number | null;
        salesman_name: string | null; changed_by_name: string | null; changed_at: string }[];
    next_page_url: string | null;
};
const staffName = (id: number | null, name: string | null) => name ?? (id === null ? 'Unassigned' : `Salesman #${id}`);

function SalesmanHistory({ customer, close }: { customer: Customer; close: () => void }) {
    const [page, setPage] = useState(1);
    const [answer, setAnswer] = useState<{ page: number; history: HistoryPage | null } | null>(null);
    const result = answer?.page === page ? answer : null;
    useEffect(() => {
        const controller = new AbortController();
        fetch(route('dispatch.schedules.history', { customer: customer.id, page }, false), {
            headers: { Accept: 'application/json' }, signal: controller.signal,
        }).then(response => {
            if (!response.ok) throw new Error();
            return response.json() as Promise<HistoryPage>;
        }).then(history => setAnswer({ page, history })).catch(() => {
            if (!controller.signal.aborted) setAnswer({ page, history: null });
        });
        return () => controller.abort();
    }, [customer.id, page]);

    return <Dialog open onOpenChange={open => { if (!open) close(); }}>
        <DialogContent className="max-h-[85dvh] w-[calc(100%-1.5rem)] overflow-auto rounded-xl">
            <DialogHeader><DialogTitle>Default salesman history</DialogTitle><DialogDescription>{customer.name} · Pakistan time (PKT)</DialogDescription></DialogHeader>
            {!result ? <p role="status">Loading history…</p> : !result.history ? <p role="alert">Could not load the history. Close this window and try again.</p> :
                !result.history.data.length ? <p className="text-sm text-muted-foreground">No default-salesman changes have been recorded here yet. Existing assignments are unchanged.</p> :
                <ul className="divide-y rounded-lg border px-3">{result.history.data.map(entry => <li key={entry.id} className="space-y-1 py-2.5">
                    <p className="text-sm font-semibold">{staffName(entry.previous_salesman_id, entry.previous_salesman_name)} → {staffName(entry.salesman_id, entry.salesman_name)}</p>
                    <p className="text-xs text-muted-foreground">{entry.changed_at}{entry.changed_by_name ? ' · ' + entry.changed_by_name : ''}</p>
                </li>)}</ul>}
            {result?.history && (page > 1 || result.history.next_page_url) && <div className="flex justify-between text-sm font-semibold">
                <button type="button" disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</button>
                <button type="button" disabled={!result.history.next_page_url} onClick={() => setPage(page + 1)}>Next</button>
            </div>}
        </DialogContent>
    </Dialog>;
}

export default function DeliverySchedules({ customers, salesmen, search, today }: Props) {
    const { canAny } = usePermissions();
    const [query, setQuery] = useState(search);
    const [filter, setFilter] = useState<Filter>('all');
    const [selected, setSelected] = useState<Set<number>>(new Set());
    const [drafts, setDrafts] = useState<Map<number, Schedule>>(new Map());
    const [bulk, setBulk] = useState({ booking_days: [] as number[], delivery_days: [] as number[], salesman: '' });
    const [limit, setLimit] = useState(PAGE_SIZE);
    const [history, setHistory] = useState<Customer | null>(null);
    const [errors, setErrors] = useState<Record<number, string[]>>({});
    const [saving, setSaving] = useState(false);
    const [running, setRunning] = useState(false);
    const selectAll = useRef<HTMLInputElement>(null);
    const todayDay = new Date(today + 'T00:00:00Z').getUTCDay() || 7;
    const base = new Map(customers.map(customer => [customer.id, customer]));
    const current = customers.map(customer => ({ ...customer, ...drafts.get(customer.id) }));
    const term = query.trim().toLocaleLowerCase();
    const filtered = current.filter(customer => matches(customer, filter, drafts)
        && (!term || customer.name.toLocaleLowerCase().includes(term) || customer.city?.toLocaleLowerCase().includes(term)));
    const shown = filtered.slice(0, limit);
    const allSelected = shown.length > 0 && shown.every(customer => selected.has(customer.id));
    const someSelected = shown.some(customer => selected.has(customer.id));
    const changedSalesmen = [...drafts].filter(([id, schedule]) => schedule.salesman_id !== base.get(id)?.salesman_id).length;
    useEffect(() => { if (selectAll.current) selectAll.current.indeterminate = !allSelected && someSelected; }, [allSelected, someSelected]);
    const guard = useDraftLeave({ version: drafts.size ? 'dirty' : 'clean', editable: true, saving, save: done => save(done) });

    function edit(ids: number[], patch: Partial<Schedule>) {
        setDrafts(previous => {
            const next = new Map(previous);
            for (const id of ids) {
                const saved = base.get(id);
                if (!saved) continue;
                const { booking_days, delivery_days, salesman_id } = { ...(previous.get(id) ?? saved), ...patch };
                const schedule = { booking_days, delivery_days, salesman_id };
                if (equal(schedule, saved)) next.delete(id);
                else next.set(id, schedule);
            }
            return next;
        });
        setErrors(previous => {
            const next = { ...previous };
            ids.forEach(id => delete next[id]);
            return next;
        });
    }

    function applyBulk() {
        const patch: Partial<Schedule> = {};
        if (bulk.booking_days.length) patch.booking_days = bulk.booking_days;
        if (bulk.delivery_days.length) patch.delivery_days = bulk.delivery_days;
        if (bulk.salesman) patch.salesman_id = bulk.salesman === 'unassigned' ? null : Number(bulk.salesman);
        if (!Object.keys(patch).length) return;
        edit([...selected], patch);
        toast.info(`Applied to ${selected.size} selected. Save to confirm.`);
    }

    function save(done?: (saved: boolean) => void) {
        if (saving || !drafts.size || drafts.size > SAVE_LIMIT) { done?.(!drafts.size); return; }
        const schedules = [...drafts].map(([customer_id, schedule]) => ({ customer_id, ...schedule }));
        setSaving(true);
        setErrors({});
        router.put(route('dispatch.schedules.bulk-update', {}, false), { schedules }, {
            preserveScroll: true, preserveState: true,
            onSuccess: () => {
                setDrafts(new Map());
                guard.markSaved('clean');
                if (filter === 'dirty') setFilter('all');
                done?.(true);
            },
            onError: validation => {
                const issues: Record<number, string[]> = {};
                for (const [key, message] of Object.entries(validation)) {
                    const match = /^schedules\.(\d+)\./.exec(key);
                    const customer = match && schedules[Number(match[1])];
                    if (customer) (issues[customer.customer_id] ??= []).push(message);
                }
                setErrors(issues);
                toast.error('Schedules weren’t saved. Review the marked rows and try again.');
                setFilter('dirty');
                setQuery('');
                setLimit(Math.max(PAGE_SIZE, schedules.length));
                done?.(false);
            },
            onFinish: () => setSaving(false),
        });
    }

    function toggleSelection(ids: number[], next: boolean) {
        setSelected(previous => {
            const result = new Set(previous);
            ids.forEach(id => next ? result.add(id) : result.delete(id));
            return result;
        });
    }

    return <AppLayout><Head title="Booking & Delivery Schedules" />
        <main className="master-register delivery-schedules">
            <RegisterHeader title="Booking & Delivery Schedules" description="Set the weekdays and default salesman for each customer"
                actions={<div className="register-hero-actions">
                    {canAny('dispatch.view', 'dispatch.assigned') && <Link href="/dispatch" className="hbtn"><Truck className="i" aria-hidden="true" />Dispatch &amp; delivery</Link>}
                    <button type="button" className="hbtn pri" disabled={running || saving} onClick={() => {
                        if (drafts.size) { toast.info('Save your changes first so the plan uses them.'); return; }
                        setRunning(true);
                        router.post(route('dispatch.schedules.generate', {}, false), {}, { preserveScroll: true, onFinish: () => setRunning(false) });
                    }}><RotateCw className="i" aria-hidden="true" />{running ? 'Generating…' : 'Generate plan now'}</button>
                </div>} />

            {!salesmen.length && <p className="setup">No active Salesmen yet. In Users, assign the Salesman role to an active login.</p>}
            <section className="card list" aria-label="Customer schedules">
                <div className="tabs" role="group" aria-label="Schedule filters">
                        {filters.map(([key, label]) => {
                            const count = current.filter(customer => matches(customer, key, drafts)).length;
                            return <button key={key} type="button" aria-pressed={filter === key} className={cn('tab', filter === key && 'on')}
                                onClick={() => { setFilter(key); setLimit(PAGE_SIZE); }}>{label}<span className="ct">{count}</span></button>;
                        })}
                </div>
                <div className="filters">
                    <SearchField aria-label="Search by customer or city" placeholder="Customer or city…" value={query}
                        onChange={event => { setQuery(event.target.value); setLimit(PAGE_SIZE); }} />
                    {(filter !== 'all' || term) && <button className="clear" type="button" onClick={() => { setQuery(''); setFilter('all'); setLimit(PAGE_SIZE); }}>Clear filters</button>}
                    <div className="fsp" />
                    <span className="shown" aria-live="polite">{filtered.length} of {customers.length} customers</span>
                </div>

                {selected.size > 0 && <div className="schedule-bulk" role="region" aria-label="Bulk schedule editor">
                    <b>{selected.size} selected</b>
                    <span className="lbl">Booking</span><Weekdays label="Bulk booking days" field="booking_days" days={bulk.booking_days}
                        change={booking_days => setBulk({ ...bulk, booking_days })} />
                    <span className="lbl">Delivery</span><Weekdays label="Bulk delivery days" field="delivery_days" days={bulk.delivery_days}
                        change={delivery_days => setBulk({ ...bulk, delivery_days })} />
                    <span className="lbl">Salesman</span><select aria-label="Bulk default salesman" value={bulk.salesman} onChange={event => setBulk({ ...bulk, salesman: event.target.value })}>
                        <option value="">Keep</option><option value="unassigned">Unassigned</option>
                        {salesmen.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}
                    </select>
                    <button type="button" className="bb" disabled={saving || (!bulk.booking_days.length && !bulk.delivery_days.length && !bulk.salesman)} onClick={applyBulk}>Apply to selected</button>
                    <div className="sp" />
                    <button type="button" className="bb" onClick={() => {
                        setSelected(new Set());
                        setBulk({ booking_days: [], delivery_days: [], salesman: '' });
                    }}>Clear selection</button>
                </div>}
                <div role="table" aria-label="Booking and delivery schedules">
                    <div className="thead" role="row">
                        <div role="columnheader"><input type="checkbox" ref={selectAll} aria-label="Select all shown customers" disabled={!shown.length}
                            checked={allSelected} onChange={event => toggleSelection(shown.map(customer => customer.id), event.target.checked)} /></div>
                        <div role="columnheader">Customer</div>
                        <div role="columnheader" className="hd"><i className="booking-key" />Booking days</div>
                        <div role="columnheader" className="hd"><i className="delivery-key" />Delivery days</div>
                        <div role="columnheader" className="cnext">Next delivery</div>
                        <div role="columnheader">Default salesman</div>
                    </div>
                    {shown.map(customer => <ScheduleRow key={customer.id} customer={customer} saved={base.get(customer.id)!} salesmen={salesmen} today={today} todayDay={todayDay}
                        checked={selected.has(customer.id)} dirty={drafts.has(customer.id)} disabled={saving}
                        change={patch => edit([customer.id], patch)} select={() => toggleSelection([customer.id], !selected.has(customer.id))}
                        showHistory={() => setHistory(customer)} errors={errors[customer.id] ?? []} />)}
                </div>
                {!shown.length && <p className="empty">No customers match.</p>}
                {shown.length < filtered.length && <div className="more"><button type="button" onClick={() => setLimit(value => value + PAGE_SIZE)}>Show more customers</button></div>}
            </section>

            {drafts.size > 0 && <div className="savebar" role="region" aria-label="Unsaved schedules">
                <span className="dot" aria-hidden="true" />
                <div className="save-label"><b>{drafts.size} {drafts.size === 1 ? 'schedule' : 'schedules'} changed</b>
                    <small>{drafts.size > SAVE_LIMIT ? `You can save up to ${SAVE_LIMIT} schedules at once.` :
                        changedSalesmen ? `${changedSalesmen} default salesman ${changedSalesmen === 1 ? 'change' : 'changes'} · existing assignments stay unchanged` : 'Booking and delivery days only'}</small>
                </div>
                <button type="button" className="btn" disabled={saving} onClick={() => { setDrafts(new Map()); setErrors({}); toast.info('Changes discarded.'); }}>Discard</button>
                <button type="button" className="btn pri" disabled={saving || drafts.size > SAVE_LIMIT} onClick={() => save()}>{saving ? 'Saving…' : 'Save changes'}</button>
            </div>}
        </main>
        {history && <SalesmanHistory key={history.id} customer={history} close={() => setHistory(null)} />}
        {guard.dialog}
    </AppLayout>;
}
