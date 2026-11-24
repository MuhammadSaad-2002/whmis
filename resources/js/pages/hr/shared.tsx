import { MasterStatus, RegisterLayout, RegisterList } from '@/components/master-register';
import { type PaginatedData } from '@/components/paginator';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import AppLayout from '@/layouts/app-layout';
import { Head, useForm } from '@inertiajs/react';
import { type ReactNode } from 'react';

export type Values = Record<string, string | number | boolean | number[] | null>;
export type Row = { id: number; [key: string]: unknown };
export type Option = { id: number; name: string };
export type Field = { key: string; label: string; type?: string; required?: boolean; options?: { value: string; label: string }[]; hint?: string };
export const options = (items: Option[]) => items.map(i => ({ value: String(i.id), label: i.name }));
export const choices = (...values: string[]) => values.map(value => ({ value, label: value.replaceAll('_',' ') }));
export const today = () => new Date().toLocaleDateString('en-CA');
export const selectClass = 'h-9 w-full rounded-md border bg-background px-3 text-sm';
export const nameOf = (value: unknown) => (value as Option | null)?.name ?? '—';
export const textOf = (value: unknown) => value == null ? '—' : String(value);
export const fieldLabel = (key: string) => key.replaceAll('_', ' ').replace(/\b\w/g, char => char.toUpperCase());

export function HrLayout({ title, description, children, actions }: { title: string; description?: ReactNode; children: ReactNode; actions?: ReactNode }) {
    return <AppLayout breadcrumbs={[{title:'Human Resources',href:'/hr/employees'},{title,href:'#'}]}>
        <Head title={title}/>
        <RegisterLayout title={title} description={description} actions={actions}>
            {children}
        </RegisterLayout>
    </AppLayout>;
}

export function Editor({title,url,method='post',fields,initial,onClose,description}:{title:string;url:string;method?:'post'|'put';fields:Field[];initial:Values;onClose:()=>void;description?:string}) {
    const f=useForm<Values>(initial);
    return <Dialog open onOpenChange={open=>{if(!open&&!f.processing)onClose();}}><DialogContent appearance="form" className="sm:max-w-2xl" {...(!description && {'aria-describedby': undefined})}><DialogHeader><DialogTitle>{title}</DialogTitle>{description&&<DialogDescription>{description}</DialogDescription>}</DialogHeader>
        <form onSubmit={e=>{e.preventDefault();f.transform(d=>Object.fromEntries(Object.entries(d).map(([k,v])=>[k,v===''?null:v])) as Values);f[method](url,{preserveScroll:true,onSuccess:onClose});}}>
            <DialogBody className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">{fields.map(field=><div key={field.key} className={field.type==='weekdays'?'sm:col-span-2':''}>
                <Label htmlFor={`hr-${field.key}`}>{fieldLabel(field.label)}{field.required?' *':''}</Label>
                {field.type==='checkbox'?<input id={`hr-${field.key}`} type="checkbox" className="ml-3" checked={!!f.data[field.key]} onChange={e=>f.setData(field.key,e.target.checked)}/>
                :field.type==='weekdays'?<div className="flex flex-wrap gap-3 py-2">{['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((d,i)=>{const selected=(f.data[field.key]??[]) as number[];return <label key={d} className="flex items-center gap-1 text-sm"><input type="checkbox" checked={selected.includes(i)} onChange={e=>f.setData(field.key,e.target.checked?[...selected,i].sort():selected.filter(v=>v!==i))}/>{d}</label>;})}</div>
                :field.options?<select id={`hr-${field.key}`} className={selectClass} required={field.required} value={String(f.data[field.key]??'')} onChange={e=>f.setData(field.key,e.target.value)}><option value="">Select…</option>{field.options.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select>
                :<Input id={`hr-${field.key}`} type={field.type??'text'} required={field.required} step={field.type==='number'?'0.01':undefined} min={field.type==='number'?0:undefined} value={String(f.data[field.key]??'')} onChange={e=>f.setData(field.key,e.target.value)}/>}
                {field.hint&&<p className="mt-1 text-xs text-muted-foreground">{field.hint}</p>}
                {f.errors[field.key]&&<p className="text-xs text-destructive">{f.errors[field.key]}</p>}
            </div>)}</div>
            {Object.entries(f.errors).filter(([k])=>!fields.some(field=>field.key===k)).map(([k,v])=><p key={k} className="text-sm text-destructive">{v}</p>)}
            </DialogBody>
            <DialogFooter><Button type="button" variant="outline" onClick={onClose} disabled={f.processing}>Cancel</Button><Button disabled={f.processing}>{f.processing?'Saving…':'Save'}</Button></DialogFooter>
        </form>
    </DialogContent></Dialog>;
}

type HrColumn = { key: string; label: string; render?: (row: Row) => ReactNode };
const numericColumns = new Set(['overtime_hours', 'days', 'annual_days', 'items_count', 'items_sum_net_pay', 'expense', 'payable', 'advance', 'cash_out',
    'base', 'overtime', 'bonus', 'commission', 'deductions', 'recovery', 'net_pay', 'due', 'basic', 'allowances', 'overtime_rate', 'sales_target']);
export function HrStatus({ value }: { value: unknown }) {
    const status = textOf(value);
    const tone = ['active', 'present', 'approved', 'posted'].includes(status) ? 'positive'
        : ['left', 'absent', 'rejected', 'cancelled'].includes(status) ? 'negative'
        : ['on_leave', 'pending', 'draft', 'half_day'].includes(status) ? 'attention' : 'neutral';
    return <MasterStatus status={status.replaceAll('_', ' ')} tone={tone} />;
}

export function Grid({ title, columns, rows, actions, page, controls, compactTable, empty = 'No records found.' }: {
    title: string; columns: HrColumn[]; rows: Row[]; actions?: (row: Row) => ReactNode;
    page?: PaginatedData<unknown>; controls?: ReactNode; compactTable?: boolean; empty?: string;
}) {
    return <RegisterList title={title} page={page} controls={controls}>
        {dense => <table className={`${compactTable ? 'register-short-table' : 'hr-table'}${dense ? ' dense' : ''}`}>
            <thead><tr>
                {columns.map(column => <th scope="col" key={column.key} className={numericColumns.has(column.key) ? 'r' : undefined}>{fieldLabel(column.label)}</th>)}
                {actions && <th scope="col" className="r">Actions</th>}
            </tr></thead>
            <tbody>
                {!rows.length && <tr><td colSpan={columns.length + (actions ? 1 : 0)} className="empty">{empty}</td></tr>}
                {rows.map(row => <tr key={row.id}>
                    {columns.map(column => <td key={column.key} className={numericColumns.has(column.key) ? 'r num' : ['notes', 'reason', 'name'].includes(column.key) ? 'wrap-cell' : undefined}>
                        {column.render ? column.render(row) : column.key === 'status' ? <HrStatus value={row.status} /> : textOf(row[column.key])}
                    </td>)}
                    {actions && <td><div className="acts">{actions(row)}</div></td>}
                </tr>)}
            </tbody>
        </table>}
    </RegisterList>;
}
