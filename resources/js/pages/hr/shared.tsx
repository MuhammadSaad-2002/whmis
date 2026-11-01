import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
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

export function HrLayout({title,children,actions}:{title:string;children:ReactNode;actions?:ReactNode}) {
    return <AppLayout breadcrumbs={[{title:'Human Resources',href:'/hr/employees'},{title,href:'#'}]}>
        <Head title={title}/><div className="flex flex-col gap-5 p-4 md:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-4"><div><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">People & Payroll</p><h1 className="text-3xl font-bold">{title}</h1></div>{actions}</div>
            {children}
        </div>
    </AppLayout>;
}

export function Editor({title,url,method='post',fields,initial,onClose,description}:{title:string;url:string;method?:'post'|'put';fields:Field[];initial:Values;onClose:()=>void;description?:string}) {
    const f=useForm<Values>(initial);
    return <Dialog open onOpenChange={open=>{if(!open&&!f.processing)onClose();}}><DialogContent className="max-h-[85vh] overflow-auto sm:max-w-2xl"><DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        {description&&<p className="text-sm text-muted-foreground">{description}</p>}
        <form className="space-y-4" onSubmit={e=>{e.preventDefault();f.transform(d=>Object.fromEntries(Object.entries(d).map(([k,v])=>[k,v===''?null:v])) as Values);f[method](url,{preserveScroll:true,onSuccess:onClose});}}>
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
            <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose} disabled={f.processing}>Cancel</Button><Button disabled={f.processing}>{f.processing?'Saving…':'Save'}</Button></div>
        </form>
    </DialogContent></Dialog>;
}

export function Grid({columns,rows,actions}:{columns:{key:string;label:string;render?:(row:Row)=>ReactNode}[];rows:Row[];actions?:(row:Row)=>ReactNode}) {
    return <div className="overflow-auto rounded-xl border"><table className="w-full text-sm"><thead className="bg-muted/60 text-left"><tr>{columns.map(c=><th key={c.key} className="whitespace-nowrap px-4 py-3 font-medium">{fieldLabel(c.label)}</th>)}{actions&&<th className="px-4 py-3">Actions</th>}</tr></thead><tbody>{rows.length===0&&<tr><td colSpan={columns.length+(actions?1:0)} className="p-8 text-center text-muted-foreground">No records found.</td></tr>}{rows.map(row=><tr key={row.id} className="border-t hover:bg-muted/20">{columns.map(c=><td key={c.key} className="whitespace-nowrap px-4 py-3 tabular-nums">{c.render?c.render(row):textOf(row[c.key])}</td>)}{actions&&<td className="px-4 py-3"><div className="flex gap-2">{actions(row)}</div></td>}</tr>)}</tbody></table></div>;
}
