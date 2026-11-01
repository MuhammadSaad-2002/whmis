import { Button } from '@/components/ui/button';
import { usePermissions } from '@/hooks/use-permissions';
import { money } from '@/lib/format';
import { router, Link } from '@inertiajs/react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Editor, Grid, HrLayout, today, type Row, type Values } from './shared';

interface Props {payroll:Row & {items:Row[]};balances:Record<number,{advance:number;due:number}>}
export default function PayrollPage({payroll:p,balances}:Props) {
    const {can}=usePermissions(); const [editing,setEditing]=useState<Row|null>(null); const [action,setAction]=useState<'post'|'cancel'|null>(null); const [busy,setBusy]=useState(false);
    const invoke=(act:string)=>{if(!confirm(act==='regenerate'?'Regenerate this draft? Manual adjustments will be cleared.':`${act} this payroll?`))return;setBusy(true);router.post(`/hr/payroll/${p.id}/${act}`,{},{preserveScroll:true,onError:e=>toast.error(Object.values(e)[0]),onFinish:()=>setBusy(false)});};
    const total=(key:string)=>p.items.reduce((sum,i)=>sum+Number(i[key]??0),0);
    const fields=['bonus','commission','deductions','recovery']; const initial:Values=editing?Object.fromEntries([...fields.map(k=>[k,Number(editing[k])]),['notes',String(editing.notes??'')]]) as Values:{};
    return <HrLayout title={`${p.number} · ${String(p.period).slice(0,7)}`} actions={<div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-muted px-3 py-1 text-sm font-semibold capitalize">{String(p.status)}</span>
        {p.status==='draft'&&can('hr.payroll.manage')&&<Button variant="outline" disabled={busy} onClick={()=>invoke('regenerate')}>Regenerate</Button>}
        {p.status==='draft'&&can('hr.payroll.approve')&&<Button disabled={busy} onClick={()=>invoke('approve')}>Approve</Button>}
        {p.status==='approved'&&can('hr.payroll.approve')&&<Button variant="outline" disabled={busy} onClick={()=>invoke('reopen')}>Reopen</Button>}
        {p.status==='approved'&&can('hr.payroll.post')&&<Button onClick={()=>setAction('post')}>Post Payroll</Button>}
        {p.status!=='cancelled'&&can('hr.payroll.cancel')&&<Button variant="outline" onClick={()=>setAction('cancel')}>Cancel / Reverse</Button>}
        {p.status==='posted'&&can('hr.payroll.pay')&&<Button asChild><Link href="/hr/finance">Record Salary Payment</Link></Button>}
    </div>}>
        <div className="grid gap-3 sm:grid-cols-3">{[['Salary Expense',total('expense')],['Advance Recovery',total('recovery')],['Net Salary',total('net_pay')]].map(([label,value])=><div key={label} className="rounded-xl border p-4"><p className="text-sm text-muted-foreground">{label}</p><p className="text-2xl font-bold">{money(value)}</p></div>)}</div>
        <p className="text-sm text-muted-foreground">Review attendance and salary calculations before approval. Commission amounts are entered with supporting notes. Posting creates salary expense and payable; payments settle the payable. Advance recovery reduces an existing advance balance.</p>
        <Grid rows={p.items} columns={[{key:'employee',label:'Employee',render:r=>String((r.snapshot as Row).employee_name)},{key:'days',label:'Eligible / Unpaid',render:r=>`${(r.snapshot as Row).eligible_days} / ${(r.snapshot as Row).unpaid_days}`},...['base','overtime','bonus','commission','deductions','recovery','net_pay'].map(key=>({key,label:key.replaceAll('_',' '),render:(r:Row)=>money(Number(r[key]))})),{key:'due',label:'Unpaid',render:r=>money(balances[r.id]?.due)},{key:'missing',label:'Attendance',render:r=>{const missing=(r.snapshot as {missing_attendance:string[]}).missing_attendance;return <span title={missing.join(', ')} className={missing.length?'text-destructive':''}>{missing.length?`${missing.length} missing days`:'Complete'}</span>;}}]} actions={r=><>{p.status==='draft'&&can('hr.payroll.manage')&&<Button size="sm" variant="outline" onClick={()=>setEditing(r)}>Adjust</Button>}{['posted','cancelled'].includes(String(p.status))&&<Button size="sm" variant="outline" asChild><a href={`/hr/payslips/${r.id}/pdf`} target="_blank" rel="noreferrer">PDF</a></Button>}</>}/>
        {p.items.some(i=>(i.snapshot as {missing_attendance:string[]}).missing_attendance.length>0)&&<details className="rounded-xl border p-4"><summary className="cursor-pointer font-medium">Missing attendance dates</summary>{p.items.map(i=><p key={i.id} className="mt-2 text-sm"><strong>{String((i.snapshot as Row).employee_name)}:</strong> {(i.snapshot as {missing_attendance:string[]}).missing_attendance.join(', ')||'Complete'}</p>)}</details>}
        {editing&&<Editor title="Payroll Adjustments" url={`/hr/payslips/${editing.id}`} method="put" description={`Recoverable advance: ${money(balances[editing.id]?.advance)}. Other deductions reduce salary expense; statutory tax/benefit withholding is not automated.`} fields={[...fields.map(key=>({key,label:key==='recovery'?'Advance Recovery':key,type:'number',required:true})),{key:'notes',label:'Adjustment Reason / Commission Basis',required:true}]} initial={initial} onClose={()=>setEditing(null)}/>}
        {action&&<Editor title={action==='post'?'Post Payroll':'Cancel / Reverse Payroll'} url={`/hr/payroll/${p.id}/${action}`} fields={[{key:'date',label:'Accounting Date',type:'date',required:true},...(action==='cancel'?[{key:'reason',label:'Reason',required:true}]:[])]} initial={{date:today(),reason:''}} onClose={()=>setAction(null)}/>}
    </HrLayout>;
}
