import { RegisterMetric } from '@/components/master-register';
import { Button } from '@/components/ui/button';
import { usePermissions } from '@/hooks/use-permissions';
import { money, shortDate, totalMoney } from '@/lib/format';
import { useState } from 'react';
import CustomerAssignments, { type AssignmentOption } from './customer-assignments';
import { Editor, Grid, HrLayout, HrStatus, nameOf, options, today, type Field, type Option, type Row, type Values } from './shared';

interface Props {employee:Row;self:boolean;showEmployeeDetails:boolean;salaries:Row[];balances:{advance:number;payable:number}|null;payslips:Row[];leaveTypes:Option[];leaves:Row[];attendance:Row[];customers:Option[];customerOptions:AssignmentOption[]|null;customerAssignmentIssue?:string|null}
export default function EmployeePage(p:Props) {
    const {can}=usePermissions(); const [mode,setMode]=useState<'salary'|'leave'|null>(null);
    const salaryFields:Field[]=[{key:'effective_from',label:'Effective Month Start',type:'date',required:true},...['basic','allowances','overtime_rate','sales_target'].map(key=>({key,label:key.replaceAll('_',' '),type:'number',required:true})),{key:'notes',label:'Notes'}];
    const leaveFields:Field[]=[{key:'leave_type_id',label:'Leave Type',options:options(p.leaveTypes),required:true},{key:'from_date',label:'From',type:'date',required:true},{key:'to_date',label:'To',type:'date',required:true},{key:'reason',label:'Reason',required:true}];
    const initial:Values=mode==='salary'?{effective_from:today().slice(0,7)+'-01',basic:0,allowances:0,overtime_rate:0,sales_target:0,notes:''}:{employee_id:p.employee.id,leave_type_id:'',from_date:today(),to_date:today(),reason:''};
    return <HrLayout title={p.self ? 'My HR' : String(p.employee.name)} description={p.self ? `${p.employee.name} · ${p.employee.employee_number}` : `Employee ${p.employee.employee_number}`} actions={<div className="register-hero-actions">{can('hr.payroll.manage')&&<button type="button" className="hbtn" onClick={()=>setMode('salary')}>Add Salary Version</button>}{(can('hr.leave.manage')||p.self)&&<button type="button" className="hbtn pri" onClick={()=>setMode('leave')}>Request Leave</button>}</div>}>
        {(!!p.employee.is_booker||(!p.self&&can('bookers.assign')))&&<CustomerAssignments employeeId={p.employee.id} linked={!!p.employee.user_id} customers={p.customers} options={p.customerOptions} issue={p.customerAssignmentIssue}/>}
        {p.showEmployeeDetails&&<dl aria-label="Employee details" className="card register-panel grid gap-3 break-words sm:grid-cols-3">{[['Department',nameOf(p.employee.department)],['Designation',nameOf(p.employee.designation)],['Manager',nameOf(p.employee.manager)],['Joined',shortDate(String(p.employee.joining_date))],['Last Day',p.employee.leaving_date?shortDate(String(p.employee.leaving_date)):'—'],['Status',String(p.employee.status)],['Phone',String(p.employee.phone??'—')],['Email',String(p.employee.email??'—')],['Login',nameOf(p.employee.user)]].map(([label,value])=><div key={label}><dt className="muted text-sm">{label}</dt><dd className="font-medium">{value}</dd></div>)}</dl>}
        {p.balances&&<section className="register-stats" aria-label="Employee balances">
            <RegisterMetric label="Salary Payable" value={totalMoney(p.balances.payable)} />
            <RegisterMetric label="Recoverable Advance" value={totalMoney(p.balances.advance)} color="var(--amber)" />
        </section>}
        {p.salaries.length>0&&<Grid title="Salary History" controls={<div><h2 className="font-bold">Salary History</h2><p className="muted text-sm">Calendar-day proration. Overtime uses the explicit hourly rate. Commissions and other deductions require payroll review.</p></div>} rows={p.salaries} columns={[{key:'effective_from',label:'Effective',render:r=>shortDate(String(r.effective_from))},...['basic','allowances','overtime_rate','sales_target'].map(key=>({key,label:key.replaceAll('_',' '),render:(r:Row)=>money(Number(r[key]))})),{key:'notes',label:'Notes'}]}/>}
        <Grid title="Payslips" controls={<div><h2 className="font-bold">Payslips</h2></div>} rows={p.payslips} columns={[{key:'payroll',label:'Payroll',render:r=>String((r.payroll as Row).number)},{key:'status',label:'Status',render:r=><HrStatus value={(r.payroll as Row).status} />},{key:'net_pay',label:'Net Salary',render:r=>totalMoney(Number(r.net_pay))}]} actions={r=><Button variant="outline" size="sm" asChild><a href={`/hr/payslips/${r.id}/pdf`} target="_blank" rel="noreferrer">Payslip PDF</a></Button>}/>
        <Grid title="Recent Attendance" controls={<div><h2 className="font-bold">Recent Attendance</h2></div>} rows={p.attendance} columns={[{key:'date',label:'Date',render:r=>shortDate(String(r.date))},{key:'status',label:'Status'},{key:'overtime_hours',label:'Overtime Hours'}]}/>
        <Grid title="Leave History" controls={<div><h2 className="font-bold">Leave History</h2></div>} rows={p.leaves} columns={[{key:'leave_type',label:'Type',render:r=>nameOf(r.leave_type)},{key:'from_date',label:'From',render:r=>shortDate(String(r.from_date))},{key:'to_date',label:'To',render:r=>shortDate(String(r.to_date))},{key:'days',label:'Days'},{key:'status',label:'Status'}]}/>
        {mode&&<Editor title={mode==='salary'?'Add Salary Version':'Request Leave'} url={mode==='salary'?`/hr/employees/${p.employee.id}/salary`:'/hr/leave'} fields={mode==='salary'?salaryFields:leaveFields} initial={initial} onClose={()=>setMode(null)}/>}
    </HrLayout>;
}
