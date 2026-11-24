import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import AppLayout from '@/layouts/app-layout';
import { Head, router } from '@inertiajs/react';
import { cloneElement, isValidElement, useId, useState, type ReactNode } from 'react';

export const selectClass = 'h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-base sm:text-sm';
export type Staff = { id: number; name: string };
export function todayPK(): string {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}
export function stamp(value: string): string {
    return new Date(value).toLocaleString('en-GB', { timeZone: 'Asia/Karachi', dateStyle: 'medium', timeStyle: 'short' }) + ' PKT';
}
export function Layout({ title, description, children, actions }: { title: string; description: string; children: ReactNode; actions?: ReactNode }) {
    return <AppLayout><Head title={title}/><main className="flex w-full min-w-0 flex-col gap-4 p-4">
        <header className="flex flex-wrap items-start justify-between gap-3 border-b pb-4"><div><h1 className="text-2xl font-bold sm:text-3xl">{title}</h1><p className="mt-1 text-sm text-muted-foreground">{description}</p></div>{actions}</header>
        {children}
    </main></AppLayout>;
}
export function Field({ label, children }: { label: string; children: ReactNode }) {
    const id = useId();
    const control = isValidElement<{ 'aria-labelledby'?: string }>(children) ? cloneElement(children, { 'aria-labelledby': id }) : children;
    return <div className="block min-w-0 space-y-1 text-sm"><span id={id} className="font-medium" data-popup-label>{label}</span>{control}</div>;
}
export function Errors({ errors }: { errors: Record<string, string> }) {
    return <>{Object.entries(errors).map(([key, message]) => <p role="alert" key={key} className="text-sm text-destructive">{message}</p>)}</>;
}
export function Status({ value }: { value: string }) {
    return <Badge variant={['delivered', 'visited', 'promised'].includes(value) ? 'default' : value === 'failed' ? 'destructive' : 'secondary'}>{value.replaceAll('_', ' ')}</Badge>;
}
export function StaffSelect({ staff, value, onChange, 'aria-labelledby': labelledBy }: { staff: Staff[]; value: string; onChange: (value: string) => void; 'aria-labelledby'?: string }) {
    return <select aria-labelledby={labelledBy} className={selectClass} value={value} onChange={e => onChange(e.target.value)}><option value="">Unassigned</option>{staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select>;
}
export function Filters({ path, filters, choices, field }: { path: string; filters: { search?: string; status?: string; bucket?: string }; choices: string[]; field: 'status' | 'bucket' }) {
    const [search, setSearch] = useState(filters.search ?? '');
    const [value, setValue] = useState(filters[field] ?? '');
    return <form className="flex flex-wrap gap-2" onSubmit={e => { e.preventDefault(); router.get(path, { search, [field]: value }, { preserveState: true }); }}>
        <Input aria-label="Search invoice or customer" placeholder="Invoice or customer…" className="w-full sm:w-72" value={search} onChange={e => setSearch(e.target.value)}/>
        <select aria-label="Filter status" className={selectClass + ' sm:w-48'} value={value} onChange={e => setValue(e.target.value)}><option value="">All</option>{choices.map(v => <option key={v} value={v}>{v.replaceAll('_', ' ')}</option>)}</select>
        <Button type="submit">Apply filters</Button>
    </form>;
}
