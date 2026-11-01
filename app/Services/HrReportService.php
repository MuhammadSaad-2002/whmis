<?php

namespace App\Services;

use App\Models\{Employee, EmployeeAttendance, EmployeeLeave, HrLeaveType, HrTransaction, PayrollItem, SalesInvoice, SalesReturn, PaymentAllocation};
use Illuminate\Support\Carbon;

class HrReportService
{
    public static function catalog(): array
    {
        $reports = [
            'hr-employees'=>['Employee Register','Employee directory, employment dates, departments and designations',[]],
            'hr-attendance'=>['Attendance Register','Recorded attendance, hours and overtime in the selected period',['date_range']],
            'hr-leave'=>['Leave Balances','Annual allowance and approved days used in the year of the From date',['date_range']],
            'hr-payroll'=>['Payroll Register','Posted payroll by payroll month, earnings, deductions and current unpaid salaries',['date_range']],
            'hr-balances'=>['Employee Balances','Current salary payable and recoverable employee advances',[]],
            'hr-ledger'=>['Employee Ledger','Append-only HR expense, payable, advance and cash movements',['date_range']],
            'hr-bookers'=>['Booker Performance','Employee Bookers: explicitly attributed sales, returns, collected allocations and monthly targets',['date_range']],
            'hr-operating-profit'=>['Profit after Payroll','Sales contribution less posted payroll expense; excludes other operating expenses',['date_range']],
        ];
        $result=[];
        foreach($reports as $key=>[$title,$description,$filters]) $result[$key]=compact('title','description','filters')+['category'=>'Human Resources','permission'=>'hr.reports.view'];
        return $result;
    }

    public function totals(?Carbon $from=null, ?Carbon $to=null): array
    {
        $q=HrTransaction::query()->when($from,fn($q)=>$q->whereDate('date','>=',$from))->when($to,fn($q)=>$q->whereDate('date','<=',$to));
        $t=$q->selectRaw('COALESCE(SUM(expense),0) as expense, COALESCE(SUM(payable),0) as payable, COALESCE(SUM(advance),0) as advance, COALESCE(SUM(cash_out),0) as cash_out')->first();
        return collect($t->only(['expense','payable','advance','cash_out']))->map(fn($v)=>round((float)$v,2))->all();
    }

    private function result(array $spec, array $rows): array
    {
        $columns=[]; $totals=[];
        foreach($spec as $key=>$definition) {
            [$label,$format]=is_array($definition)?$definition:[$definition,null];
            $columns[]=['key'=>$key,'label'=>$label]+($format?['format'=>$format]:[])+(in_array($format,['money','qty'])?['align'=>'right']:[]);
            if(in_array($format,['money','qty'])) $totals[$key]=round(array_sum(array_column($rows,$key)),2);
        }
        return compact('columns','rows','totals');
    }

    public function build(string $key, array $filters): array
    {
        $from=Carbon::parse($filters['from']??now()->startOfMonth()->toDateString())->startOfDay();
        $to=Carbon::parse($filters['to']??now()->toDateString())->endOfDay();
        if($key==='hr-employees') return $this->result(['number'=>'Employee #','name'=>'Employee','department'=>'Department','designation'=>'Designation','joined'=>['Joined','date'],'left'=>['Last Day','date'],'status'=>'Status','booker'=>'Booker'],Employee::with('department','designation')->orderBy('name')->get()->map(fn($e)=>['number'=>$e->employee_number,'name'=>$e->name,'department'=>$e->department?->name,'designation'=>$e->designation?->name,'joined'=>$e->joining_date->toDateString(),'left'=>$e->leaving_date?->toDateString(),'status'=>$e->status,'booker'=>$e->is_booker?'Yes':'No'])->all());
        if($key==='hr-attendance') {
            $employees=Employee::pluck('name','id');
            return $this->result(['date'=>['Date','date'],'name'=>'Employee','status'=>'Attendance','clock_in'=>'In','clock_out'=>'Out','overtime'=>['Overtime Hours','qty']],EmployeeAttendance::whereDate('date','>=',$from)->whereDate('date','<=',$to)->orderBy('date')->get()->map(fn($a)=>['date'=>$a->date->toDateString(),'name'=>$employees[$a->employee_id]??'','status'=>$a->status,'clock_in'=>$a->clock_in,'clock_out'=>$a->clock_out,'overtime'=>(float)$a->overtime_hours])->all());
        }
        if($key==='hr-leave') {
            $rows=[]; $types=HrLeaveType::all();
            $used=EmployeeLeave::where('status','approved')->whereYear('from_date',$from->year)->get()->groupBy(fn($l)=>$l->employee_id.':'.$l->leave_type_id);
            foreach(Employee::orderBy('name')->get() as $e) foreach($types as $type) {
                $days=(float)($used->get($e->id.':'.$type->id)?->sum('days')??0);
                $rows[]=['name'=>$e->name,'type'=>$type->name,'year'=>(string)$from->year,'allowance'=>(float)$type->annual_days,'used'=>$days,'remaining'=>(float)$type->annual_days-$days];
            }
            return $this->result(['name'=>'Employee','type'=>'Leave Type','year'=>'Year','allowance'=>['Allowance','qty'],'used'=>['Approved Days','qty'],'remaining'=>['Remaining','qty']],$rows);
        }
        if($key==='hr-payroll') return $this->result(['period'=>['Month','date'],'number'=>'Payroll','name'=>'Employee','base'=>['Prorated Salary','money'],'overtime'=>['Overtime','money'],'bonus'=>['Bonus','money'],'commission'=>['Commission','money'],'deductions'=>['Other Deductions','money'],'expense'=>['Salary Expense','money'],'recovery'=>['Advance Recovery','money'],'net_pay'=>['Net Salary','money'],'due'=>['Unpaid','money']],PayrollItem::with('payroll')->whereHas('payroll',fn($q)=>$q->where('status','posted')->whereDate('period','>=',$from->copy()->startOfMonth())->whereDate('period','<=',$to->copy()->startOfMonth()))->get()->map(fn($i)=>['period'=>$i->payroll->period->toDateString(),'number'=>$i->payroll->number,'name'=>$i->snapshot['employee_name'],'base'=>(float)$i->base,'overtime'=>(float)$i->overtime,'bonus'=>(float)$i->bonus,'commission'=>(float)$i->commission,'deductions'=>(float)$i->deductions,'expense'=>(float)$i->expense,'recovery'=>(float)$i->recovery,'net_pay'=>(float)$i->net_pay,'due'=>round((float)$i->transactions()->sum('payable'),2)])->all());
        if($key==='hr-balances') return $this->result(['number'=>'Employee #','name'=>'Employee','payable'=>['Salary Payable','money'],'advance'=>['Advance Recoverable','money']],Employee::withSum('transactions as payable','payable')->withSum('transactions as advance','advance')->orderBy('name')->get()->map(fn($e)=>['number'=>$e->employee_number,'name'=>$e->name,'payable'=>(float)$e->payable,'advance'=>(float)$e->advance])->all());
        if($key==='hr-ledger') return $this->result(['date'=>['Date','date'],'number'=>'Transaction','name'=>'Employee','kind'=>'Type','expense'=>['Expense','money'],'payable'=>['Payable Change','money'],'advance'=>['Advance Change','money'],'cash_out'=>['Cash Out / (In)','money'],'notes'=>'Notes'],HrTransaction::with('employee:id,name')->whereDate('date','>=',$from)->whereDate('date','<=',$to)->orderBy('date')->orderBy('id')->get()->map(fn($t)=>['date'=>$t->date->toDateString(),'number'=>$t->number,'name'=>$t->employee->name,'kind'=>$t->kind,'expense'=>(float)$t->expense,'payable'=>(float)$t->payable,'advance'=>(float)$t->advance,'cash_out'=>(float)$t->cash_out,'notes'=>$t->notes])->all());
        if($key==='hr-bookers') {
            $rows=[];
            foreach(Employee::where('is_booker',true)->whereNotNull('user_id')->with('salaries')->get() as $e) {
                $sales=(float)SalesInvoice::where('booker_id',$e->user_id)->where('status','posted')->whereDate('invoice_date','>=',$from)->whereDate('invoice_date','<=',$to)->sum('total_amount');
                $returns=(float)SalesReturn::where('status','posted')->whereHas('invoice',fn($q)=>$q->where('booker_id',$e->user_id)->where('status','posted'))->whereDate('return_date','>=',$from)->whereDate('return_date','<=',$to)->sum('total_amount');
                $collected=(float)PaymentAllocation::where('invoice_type','sales_invoice')->whereIn('invoice_id',SalesInvoice::where('booker_id',$e->user_id)->where('status','posted')->select('id'))->whereHas('payment',fn($q)=>$q->where('status','completed')->whereDate('payment_date','>=',$from)->whereDate('payment_date','<=',$to))->sum('amount');
                $target=0;
                for($month=$from->copy()->startOfMonth();$month->lte($to);$month->addMonth()) {
                    if($e->joining_date->gt($month->copy()->endOfMonth()) || ($e->leaving_date && $e->leaving_date->lt($month))) continue;
                    $s=$e->salaries->first(fn($s)=>$s->effective_from->lte($month)); $target+=(float)($s?->sales_target??0);
                }
                $rows[]=['name'=>$e->name,'sales'=>$sales,'returns'=>$returns,'net_sales'=>round($sales-$returns,2),'collections'=>$collected,'target'=>$target];
            }
            return $this->result(['name'=>'Booker','sales'=>['Sales','money'],'returns'=>['Returns','money'],'net_sales'=>['Net Sales','money'],'collections'=>['Allocated Collections','money'],'target'=>['Targets (Full Months)','money']],$rows);
        }
        $sales=app(ReportService::class)->salesPeriodTotals($from,$to);
        $expense=$this->totals($from,$to)['expense'];
        return $this->result(['from'=>['From','date'],'to'=>['To','date'],'sales'=>['Net Sales','money'],'cost'=>['Net COGS','money'],'contribution'=>['Sales Contribution','money'],'payroll'=>['Payroll Expense','money'],'profit'=>['Profit after Payroll','money']],[['from'=>$from->toDateString(),'to'=>$to->toDateString(),'sales'=>$sales['net_sales'],'cost'=>$sales['net_cost'],'contribution'=>$sales['net_profit'],'payroll'=>$expense,'profit'=>round($sales['net_profit']-$expense,2)]]);
    }
}
