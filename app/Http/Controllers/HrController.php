<?php

namespace App\Http\Controllers;

use App\Models\{Employee, EmployeeAttendance, EmployeeLeave, EmployeeSalary, HrDepartment, HrDesignation, HrLeaveType, HrTransaction, Payroll, PayrollItem, User};
use App\Services\{HrService, NumberSeriesService};
use Barryvdh\DomPDF\Facade\Pdf;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;

class HrController extends Controller
{
    public function __construct(private readonly HrService $hr) {}

    public const SECTIONS = [
        'employees' => 'employees.view', 'attendance' => 'hr.attendance.view',
        'leave' => 'hr.leave.view', 'payroll' => 'hr.payroll.view',
        'finance' => 'hr.payroll.view', 'settings' => 'hr.settings.manage',
    ];

    public function index(Request $request, string $section)
    {
        abort_unless(isset(self::SECTIONS[$section]), 404);
        abort_unless($request->user()->can(self::SECTIONS[$section]), 403);
        $request->validate(['month' => ['nullable','date_format:Y-m'], 'employee_id' => ['nullable','integer'], 'search' => ['nullable','string','max:100']]);
        $month = $request->input('month', now()->format('Y-m'));
        $from = $month.'-01'; $to = \Illuminate\Support\Carbon::parse($from)->endOfMonth()->toDateString();
        $query = match ($section) {
            'employees' => Employee::with(['department','designation','user:id,name'])->when($request->search, fn ($q,$v) => $q->where(fn($s) => $s->where('name','like',"%{$v}%")->orWhere('employee_number','like',"%{$v}%")))->orderBy('name'),
            'attendance' => EmployeeAttendance::query()->whereDate('date','>=',$from)->whereDate('date','<=',$to)->orderByDesc('date'),
            'leave' => EmployeeLeave::with(['employee:id,name','leaveType'])->whereDate('from_date','<=',$to)->whereDate('to_date','>=',$from)->latest(),
            'payroll' => Payroll::withCount('items')->withSum('items','net_pay')->latest('period'),
            'finance' => HrTransaction::with(['employee:id,name','reversal:id,reverses_id'])->whereDate('date','>=',$from)->whereDate('date','<=',$to)->latest('date')->latest('id'),
            default => HrDepartment::query()->orderBy('name'),
        };
        if (in_array($section,['attendance','leave','finance']) && $request->employee_id) $query->where('employee_id',$request->employee_id);
        return Inertia::render('hr/index', [
            'section' => $section, 'records' => $query->paginate(25)->withQueryString(),
            'employees' => Employee::orderBy('name')->get(['id','name','employee_number']),
            'departments' => HrDepartment::orderBy('name')->get(), 'designations' => HrDesignation::orderBy('name')->get(),
            'leaveTypes' => HrLeaveType::orderBy('name')->get(),
            'users' => $section === 'employees' ? User::where('is_active',true)
                ->when(! $request->user()->hasRole('Super Admin'), fn($q) => $q->whereDoesntHave('roles',fn($r)=>$r->where('name','Super Admin')))
                ->orderBy('name')->get(['id','name']) : [],
            'payslips' => $section === 'finance' ? PayrollItem::with('employee:id,name','payroll:id,number,period')->whereHas('payroll',fn($q)=>$q->where('status','posted'))->get()->map(fn($i)=>['id'=>$i->id,'employee_id'=>$i->employee_id,'name'=>$i->employee->name.' / '.$i->payroll->number,'due'=>round((float)$i->transactions()->sum('payable'),2)]) : [],
            'filters' => ['month'=>$month,'employee_id'=>$request->employee_id,'search'=>$request->search],
        ]);
    }

    public function employee(Request $request, Employee $employee)
    {
        $self = $request->routeIs('hr.self');
        if ($self) abort_unless($employee->user_id === $request->user()->id,403);
        $financial = $self || $request->user()->can('hr.payroll.view');
        $employee->load(['department','designation','user:id,name,is_active','manager:id,name']);
        $assignmentIssue = match (true) {
            ! $request->user()->can('bookers.assign') => 'Your role does not have customer assignment permission.',
            ! $employee->is_booker => 'Enable Sales Booker in Employees → Edit Employee. A Booker designation alone does not enable customer assignments.',
            ! $employee->user => 'Link an existing Booker system login in Employees → Edit Employee.',
            ! $employee->user->is_active => 'The linked login is inactive. Activate it in Users before assigning customers.',
            ! $employee->user->hasRole('Booker') => 'The linked login needs the Booker role. Review its role in Users.',
            default => null,
        };
        return Inertia::render('hr/employee', [
            'employee'=>$employee, 'self'=>$self,
            'salaries'=>$financial ? $employee->salaries()->get() : [],
            'balances'=>$financial ? ['advance'=>$this->hr->balance($employee->id,'advance'),'payable'=>$this->hr->balance($employee->id,'payable')] : null,
            'payslips'=>$financial ? PayrollItem::with('payroll')->where('employee_id',$employee->id)->whereHas('payroll',fn($q)=>$q->whereIn('status',['posted','cancelled']))->latest()->limit(24)->get() : [],
            'leaveTypes'=>HrLeaveType::where('is_active',true)->get(),
            'leaves'=>EmployeeLeave::with('leaveType')->where('employee_id',$employee->id)->latest()->limit(50)->get(),
            'attendance'=>EmployeeAttendance::where('employee_id',$employee->id)->latest('date')->limit(31)->get(),
            'customers'=>$employee->is_booker && $employee->user_id ? \App\Models\Customer::forBooker($employee->user_id)->get(['id','name']) : [],
            'customerAssignmentIssue' => $self ? null : $assignmentIssue,
            'customerOptions'=>! $self && $assignmentIssue === null
                ? \App\Models\Customer::where(fn ($q) => $q->where('status', 'active')->orWhere(fn ($q) => $q->forBooker($employee->user_id)))
                    ->orderBy('name')->get(['id','name','city','status','booker_id'])->map(fn ($c) => [
                        'id'=>$c->id, 'name'=>$c->name, 'city'=>$c->city, 'status'=>$c->status,
                        'primary'=>$c->booker_id === $employee->user_id,
                    ]) : null,
        ]);
    }

    public function selfProfile(Request $request)
    {
        $employee = Employee::where('user_id',$request->user()->id)->first();
        if (! $employee) return Inertia::render('hr/unlinked');
        return $this->employee($request,$employee);
    }

    public function assignCustomers(Request $request, Employee $employee)
    {
        $data = $request->validate(['customer_ids'=>['present','array'], 'customer_ids.*'=>['integer','distinct','exists:customers,id']]);
        app(\App\Services\BookerAssignmentService::class)->assign($employee, $data['customer_ids'], $request->user());
        return back()->with('success', 'Customers assigned. They are now available in this Booker’s new bookings.');
    }

    public function saveEmployee(Request $request, ?Employee $employee = null)
    {
        $data = $request->validate([
            'name'=>['required','string','max:255'], 'user_id'=>['nullable','exists:users,id',Rule::unique('employees')->ignore($employee?->id)],
            'department_id'=>['nullable','exists:hr_departments,id'], 'designation_id'=>['nullable','exists:hr_designations,id'],
            'manager_id'=>['nullable','exists:employees,id'], 'cnic'=>['nullable','regex:/^[0-9]{5}-[0-9]{7}-[0-9]$/',Rule::unique('employees')->ignore($employee?->id)],
            'email'=>['nullable','email','max:255'], 'phone'=>['nullable','string','max:50'], 'address'=>['nullable','string','max:2000'],
            'emergency_contact'=>['nullable','string','max:255'], 'notes'=>['nullable','string','max:2000'],
            'joining_date'=>['required','date_format:Y-m-d'], 'leaving_date'=>['nullable','date_format:Y-m-d','after_or_equal:joining_date'],
            'status'=>['required',Rule::in(['active','on_leave','left'])], 'employment_type'=>['required',Rule::in(['permanent','contract','probation'])],
            'is_booker'=>['required','boolean'], 'weekly_off_days'=>['present','array','max:6'], 'weekly_off_days.*'=>['integer','between:0,6','distinct'],
        ]);
        if ($data['status'] === 'left' && empty($data['leaving_date'])) throw ValidationException::withMessages(['leaving_date'=>'Enter the last employment date.']);
        if (! empty($data['user_id'])) {
            $user = User::findOrFail($data['user_id']);
            abort_if($user->hasRole('Super Admin') && ! $request->user()->hasRole('Super Admin'),403);
            if ($data['is_booker'] && ! $user->hasRole('Booker')) throw ValidationException::withMessages(['user_id'=>'Link a user with the Booker role for sales attribution.']);
        }
        $saved = DB::transaction(function () use ($data,$employee) {
            if ($employee) {
                $employee = Employee::whereKey($employee->id)->lockForUpdate()->firstOrFail();
                if ($employee->user_id && (int)($data['user_id'] ?? 0) !== $employee->user_id) throw ValidationException::withMessages(['user_id'=>'An existing login link cannot be replaced; preserve employee and Booker history.']);
                $manager = $data['manager_id'] ?? null; $seen = [$employee->id];
                while ($manager) {
                    if (in_array((int)$manager,$seen,true)) throw ValidationException::withMessages(['manager_id'=>'Reporting managers cannot form a cycle.']);
                    $seen[] = (int)$manager; $manager = Employee::findOrFail($manager)->manager_id;
                }
                if ($employee->joining_date->toDateString() !== $data['joining_date'] || $employee->weekly_off_days !== $data['weekly_off_days']) {
                    $this->hr->unlocked($employee,'1900-01-01','9999-12-01');
                    if (EmployeeLeave::where('employee_id',$employee->id)->whereIn('status',['pending','approved'])->exists()) throw ValidationException::withMessages(['weekly_off_days'=>'Resolve existing leave before changing employment dates or weekly days off.']);
                }
                if (($employee->leaving_date?->toDateString()) !== ($data['leaving_date'] ?? null)) {
                    $dates = array_filter([$data['leaving_date'] ?? null,$employee->leaving_date?->toDateString()]);
                    $this->hr->unlocked($employee,min($dates),'9999-12-01');
                }
                $outsideAttendance = EmployeeAttendance::where('employee_id', $employee->id)->where(fn ($q) => $q
                    ->whereDate('date', '<', $data['joining_date'])
                    ->when($data['leaving_date'] ?? null, fn ($q, $date) => $q->orWhereDate('date', '>', $date)))->exists();
                $outsideLeave = EmployeeLeave::where('employee_id', $employee->id)->whereIn('status', ['pending', 'approved'])->where(fn ($q) => $q
                    ->whereDate('from_date', '<', $data['joining_date'])
                    ->when($data['leaving_date'] ?? null, fn ($q, $date) => $q->orWhereDate('to_date', '>', $date)))->exists();
                if ($outsideAttendance || $outsideLeave) throw ValidationException::withMessages(['leaving_date' => 'Employment dates must include existing attendance and pending or approved leave.']);
                $employee->update($data); return $employee;
            }
            if (Payroll::whereIn('status',['approved','posted'])->whereDate('period','>=',\Illuminate\Support\Carbon::parse($data['joining_date'])->startOfMonth())
                ->when($data['leaving_date']??null,fn($q,$d)=>$q->whereDate('period','<=',\Illuminate\Support\Carbon::parse($d)->startOfMonth()))->exists()) {
                throw ValidationException::withMessages(['joining_date'=>'Employment overlaps locked payroll. Reopen or reverse that payroll before adding this employee.']);
            }
            return Employee::create($data + ['employee_number'=>app(NumberSeriesService::class)->next('employee')]);
        });
        return redirect()->route('hr.employee',$saved)->with('success','Employee saved.');
    }

    public function salary(Request $request, Employee $employee)
    {
        $data=$request->validate(['effective_from'=>['required','date_format:Y-m-d'],'basic'=>['required','numeric','min:0','max:999999999'], 'allowances'=>['required','numeric','min:0','max:999999999'], 'overtime_rate'=>['required','numeric','min:0','max:999999'], 'sales_target'=>['required','numeric','min:0','max:999999999'], 'notes'=>['nullable','string','max:2000']]);
        $this->hr->salary($employee,$data); return back()->with('success','Salary version added.');
    }

    public function attendance(Request $request)
    {
        $d=$request->validate(['employee_id'=>['required','exists:employees,id'],'date'=>['required','date_format:Y-m-d','before_or_equal:today'], 'status'=>['required',Rule::in(['present','absent','half_day','holiday','weekly_off'])], 'clock_in'=>['nullable','date_format:H:i'], 'clock_out'=>['nullable','required_with:clock_in','date_format:H:i','after:clock_in'], 'overtime_hours'=>['required','numeric','between:0,24'],'notes'=>['nullable','string','max:2000']]);
        $this->hr->attendance(Employee::findOrFail($d['employee_id']),$d); return back()->with('success','Attendance saved.');
    }

    public function removeAttendance(EmployeeAttendance $attendance)
    {
        DB::transaction(function () use ($attendance) {
            $e=Employee::whereKey($attendance->employee_id)->lockForUpdate()->firstOrFail();
            $this->hr->unlocked($e,$attendance->date->toDateString(),$attendance->date->toDateString()); $attendance->delete();
        });
        return back()->with('success','Attendance removed.');
    }

    public function leave(Request $request)
    {
        abort_unless($request->user()->can('hr.self.view') || $request->user()->can('hr.leave.manage'),403);
        $d=$request->validate(['employee_id'=>['required','exists:employees,id'],'leave_type_id'=>['required','exists:hr_leave_types,id'],'from_date'=>['required','date_format:Y-m-d'],'to_date'=>['required','date_format:Y-m-d','after_or_equal:from_date'],'reason'=>['required','string','max:2000']]);
        $e=Employee::findOrFail($d['employee_id']);
        if (! $request->user()->can('hr.leave.manage')) abort_unless($e->user_id===$request->user()->id,403);
        $this->hr->requestLeave($e,$d); return back()->with('success','Leave request submitted.');
    }

    public function leaveDecision(Request $request, EmployeeLeave $leave)
    {
        $d=$request->validate(['status'=>['required',Rule::in(['approved','rejected','cancelled'])]]);
        $this->hr->leaveDecision($leave,$d['status']); return back()->with('success','Leave decision saved.');
    }

    public function setting(Request $request, string $type)
    {
        $model=match($type){'departments'=>HrDepartment::class,'designations'=>HrDesignation::class,'leave-types'=>HrLeaveType::class,default=>abort(404)};
        $d=$request->validate(['id'=>['nullable','integer'],'name'=>['required','string','max:100'],'is_active'=>['required','boolean'],'is_paid'=>['sometimes','boolean'],'annual_days'=>['sometimes','integer','between:0,366']]);
        $row=isset($d['id']) ? $model::findOrFail($d['id']) : new $model;
        $request->validate(['name'=>[Rule::unique($row->getTable())->ignore($row->id)]]);
        $row->fill(collect($d)->only($type==='leave-types'?['name','is_active','is_paid','annual_days']:['name','is_active'])->all())->save();
        return back()->with('success','HR setting saved.');
    }

    public function generate(Request $request)
    {
        $d=$request->validate(['month'=>['required','date_format:Y-m']]);
        $p=$this->hr->generate($d['month']); return redirect()->route('hr.payroll',$p);
    }

    public function payroll(Payroll $payroll)
    {
        return Inertia::render('hr/payroll',['payroll'=>$payroll->load('items.employee:id,name'), 'balances'=>$payroll->items->mapWithKeys(fn($i)=>[$i->id=>['advance'=>$this->hr->balance($i->employee_id,'advance'),'due'=>round((float)$i->transactions()->sum('payable'),2)]])]);
    }

    public function adjust(Request $request, PayrollItem $item)
    {
        $d=$request->validate(['bonus'=>['required','numeric','between:0,999999999'],'commission'=>['required','numeric','between:0,999999999'],'deductions'=>['required','numeric','between:0,999999999'],'recovery'=>['required','numeric','between:0,999999999'],'notes'=>['required','string','max:2000']]);
        $this->hr->adjust($item,$d); return back()->with('success','Payroll adjustment saved.');
    }

    public function payrollAction(Request $request, Payroll $payroll, string $action)
    {
        $permission=match($action){'regenerate'=>'hr.payroll.manage','approve','reopen'=>'hr.payroll.approve','post'=>'hr.payroll.post','cancel'=>'hr.payroll.cancel',default=>abort(404)};
        abort_unless($request->user()->can($permission),403);
        if (in_array($action,['post','cancel'])) $d=$request->validate(['date'=>['required','date_format:Y-m-d','before_or_equal:today'],'reason'=>[$action==='cancel'?'required':'nullable','string','max:2000']]);
        match($action){'regenerate'=>$this->hr->regenerate($payroll),'approve'=>$this->hr->approve($payroll),'reopen'=>$this->hr->reopen($payroll),'post'=>$this->hr->post($payroll,$d['date']),'cancel'=>$this->hr->cancelPayroll($payroll,$d['date'],$d['reason'])};
        return back()->with('success','Payroll updated.');
    }

    public function cash(Request $request)
    {
        $d=$request->validate(['employee_id'=>['required','exists:employees,id'],'kind'=>['required',Rule::in(['salary_payment','advance','advance_repayment'])],'payroll_item_id'=>['nullable','exists:payroll_items,id'],'date'=>['required','date_format:Y-m-d','before_or_equal:today'],'amount'=>['required','numeric','min:0.01','max:999999999'],'method'=>['required',Rule::in(['cash','bank','online'])],'reference'=>['nullable','string','max:255'],'notes'=>['required','string','max:2000']]);
        $this->hr->cash(Employee::findOrFail($d['employee_id']),$d); return back()->with('success','Employee transaction recorded.');
    }

    public function reverse(Request $request, HrTransaction $transaction)
    {
        $d=$request->validate(['date'=>['required','date_format:Y-m-d','before_or_equal:today'],'reason'=>['required','string','max:2000']]);
        $this->hr->reverseCash($transaction,$d['date'],$d['reason']); return back()->with('success','Reversal recorded.');
    }

    public function payslip(Request $request, PayrollItem $item)
    {
        $item->load('payroll','employee');
        abort_unless($request->user()->can('hr.payroll.view') || ($request->user()->can('hr.self.view') && $item->employee->user_id===$request->user()->id),403);
        abort_unless(in_array($item->payroll->status,['posted','cancelled']),404);
        return Pdf::loadView('pdf.payslip',['item'=>$item,'due'=>round((float)$item->transactions()->sum('payable'),2)])->stream('payslip-'.$item->id.'.pdf');
    }
}
