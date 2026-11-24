import { type PaginatedData } from '@/components/paginator';
import { SearchField } from '@/components/ui/search-field';
import { Link, router } from '@inertiajs/react';
import { CalendarDays, List, type LucideIcon } from 'lucide-react';
import { useEffect, useState, type KeyboardEventHandler, type ReactNode, type Ref } from 'react';
import '../pages/sales/invoice-list.css';
import './master-register.css';

type Filters = Record<string, string | undefined>;

export function useMasterFilters(path: string, filters: Filters) {
    const [search, setSearch] = useState(filters.search ?? '');

    useEffect(() => {
        const value = search.trim();
        if ((filters.search ?? '') === value) return;
        const timer = setTimeout(() => router.get(path, { ...filters, search: value || undefined }, { preserveState: true, preserveScroll: true, replace: true }), 350);
        return () => clearTimeout(timer);
    }, [path, search, filters]);

    return {
        search,
        setSearch,
        applied: Object.values(filters).some(value => value !== undefined && value !== ''),
        change: (patch: Filters) => router.get(path, { ...filters, search: search.trim() || undefined, ...patch }, { preserveState: true, preserveScroll: true }),
        clear: () => {
            setSearch('');
            router.get(path, {}, { preserveState: true, preserveScroll: true });
        },
    };
}

type Props = {
    title: string;
    description: string;
    label: string;
    pluralLabel?: string;
    page: PaginatedData<unknown>;
    actions?: ReactNode;
    summary?: ReactNode;
    filters?: ReactNode;
    status?: { value?: string; onChange: (value: string | undefined) => void };
    state: ReturnType<typeof useMasterFilters>;
    searchRef?: Ref<HTMLInputElement>;
    onSearchKeyDown?: KeyboardEventHandler<HTMLInputElement>;
    placeholder: string;
    children: (dense: boolean) => ReactNode;
};

type RegisterHeading = { title: string; description: ReactNode; actions?: ReactNode };

export function RegisterHeader({ title, description, actions }: RegisterHeading) {
    return <header className="hero">
        <div className="intro"><h1>{title}</h1>{description && <p className="sub">{description}</p>}</div>
        {actions && <><div className="sp" />{actions}</>}
    </header>;
}

export function RegisterLayout({ children, ...heading }: RegisterHeading & { children: ReactNode }) {
    return <main className="master-register" aria-label={heading.title}>
        <RegisterHeader {...heading} />
        {children}
    </main>;
}

export function RegisterMetric({ label, value, color = 'var(--teal)', detail }: { label: string; value: ReactNode; color?: string; detail?: ReactNode }) {
    return <div className="card kpi">
        <div className="lbl"><i aria-hidden="true" style={{ background: color }} />{label}</div>
        <div className="val num">{value}</div>
        {detail && <div className="foot">{detail}</div>}
    </div>;
}

export function RegisterList({ title, page, controls, tabs, children }: {
    title: string;
    page?: PaginatedData<unknown>;
    controls?: ReactNode;
    tabs?: ReactNode;
    children: (dense: boolean) => ReactNode;
}) {
    const [dense, setDense] = useState(false);
    return <section className="card list" aria-label={`${title} list`}>
        {tabs}
        <div className="filters">
            {controls}
            <span className="fsp" />
            <button type="button" className="dens" title="Toggle row density" aria-label="Compact rows" aria-pressed={dense} onClick={() => setDense(value => !value)}><List className="i" aria-hidden="true" /></button>
        </div>
        <div className="tblwrap" tabIndex={0} role="region" aria-label={`${title} table`}>{children(dense)}</div>
        {page && <RegisterPager page={page} />}
    </section>;
}

export function MasterRegister({ title, description, label, pluralLabel = `${label}s`, page, actions, summary, filters, status, state, searchRef, onSearchKeyDown, placeholder, children }: Props) {
    return <RegisterLayout title={title} description={<>{description} · {page.total.toLocaleString()} {page.total === 1 ? label : pluralLabel}</>} actions={actions}>
        {summary}
        <RegisterList title={title} page={page}
            tabs={status && <div className="tabs" role="group" aria-label={`Filter ${title.toLowerCase()} by status`}>
                {(['All', 'Active', 'Inactive'] as const).map(option => {
                    const value = option === 'All' ? undefined : option.toLowerCase();
                    const selected = (status.value || undefined) === value;
                    return <button key={option} type="button" className={`tab${selected ? ' on' : ''}`} aria-pressed={selected} onClick={() => { if (!selected) status.onChange(value); }}>{option}</button>;
                })}
            </div>}
            controls={<>
                <SearchField aria-label={`Search ${title.toLowerCase()}`} placeholder={placeholder} value={state.search} onChange={event => state.setSearch(event.target.value)} ref={searchRef} onKeyDown={onSearchKeyDown} />
                {filters}
                {state.applied && <button type="button" className="clear" onClick={state.clear}>Clear filters</button>}
            </>}>
            {children}
        </RegisterList>
    </RegisterLayout>;
}

export function MasterFilterSelect({ label, icon: Icon, value, onChange, children }: { label: string; icon: LucideIcon; value: string; onChange: (value: string) => void; children: ReactNode }) {
    return <label className="fld choice"><Icon className="i" aria-hidden="true" /><select aria-label={label} value={value} onChange={event => onChange(event.target.value)}>{children}</select></label>;
}

export function MasterFilterDate({ label, value, onChange }: { label: string; value?: string; onChange: (value: string | undefined) => void }) {
    return <label className="fld register-date">
        <CalendarDays className="i" aria-hidden="true" />
        <small>{label}</small>
        <input aria-label={label} type="date" value={value ?? ''} onChange={event => onChange(event.target.value || undefined)} />
    </label>;
}

export function MasterStatus({ status, tone = status === 'active' ? 'positive' : 'neutral' }: { status: string; tone?: 'positive' | 'neutral' | 'attention' | 'negative' }) {
    return <span className={`st register-${tone}`}>{status}</span>;
}

function RegisterPager({ page }: { page: PaginatedData<unknown> }) {
    const urls = page.links.slice(1, -1).filter(link => /^\d+$/.test(link.label))
        .filter(link => Number(link.label) === 1 || Number(link.label) === page.last_page || Math.abs(Number(link.label) - page.current_page) <= 1);
    const previous = page.links[0]?.url;
    const next = page.links.at(-1)?.url;
    return <div className="pager">
        <span>{page.total && page.from !== null ? `${page.from}–${page.to} of ${page.total}` : '0 results'}</span>
        <span className="sp" />
        {page.last_page > 1 && <nav className="pg" aria-label="Pages">
            {previous ? <Link href={previous} preserveState preserveScroll aria-label="Previous page">‹ Prev</Link> : <button type="button" disabled>‹ Prev</button>}
            {urls.map((link, index) => <span className="pg-entry" key={link.label}>
                {index > 0 && Number(link.label) - Number(urls[index - 1].label) > 1 && <span className="muted" aria-hidden="true">…</span>}
                {link.active ? <span className="page-current" aria-current="page">{link.label}</span> : link.url && <Link href={link.url} preserveState preserveScroll>{link.label}</Link>}
            </span>)}
            {next ? <Link href={next} preserveState preserveScroll aria-label="Next page">Next ›</Link> : <button type="button" disabled>Next ›</button>}
        </nav>}
    </div>;
}
