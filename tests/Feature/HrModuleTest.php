<?php

namespace Tests\Feature;

use App\Models\{Employee, EmployeeAttendance, EmployeeLeave, EmployeeSalary, HrDepartment, HrDesignation, HrLeaveType, HrTransaction, Payroll, PayrollItem, User};
use App\Services\{HrService, HrReportService, LedgerService, ReportService};
use Barryvdh\DomPDF\Facade\Pdf;
use Database\Seeders\{RolePermissionSeeder, SystemSeeder};
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Validation\ValidationException;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

class HrModuleTest extends TestCase
{
    use RefreshDatabase;
    private HrService $hr;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed([RolePermissionSeeder::class, SystemSeeder::class]);
        $this->actingAs(User::where('email','admin@whmis.local')->firstOrFail());
        $this->travelTo(Carbon::parse('2026-10-31 14:00:00'));
        $this->hr=app(HrService::class);
    }

    private function employee(array $overrides=[]): Employee
    {
        $e=Employee::create($overrides+['employee_number'=>'EMP-'.(Employee::count()+1),'name'=>'Staff Member','joining_date'=>'2026-10-01','weekly_off_days'=>[0],'status'=>'active']);
        $this->hr->salary($e,['effective_from'=>'2026-10-01','basic'=>31000,'allowances'=>0,'overtime_rate'=>100,'sales_target'=>0]);
        return $e;
    }

    private function attendance(Employee $e): void
    {
        for($d=Carbon::parse('2026-10-01');$d->month===10;$d->addDay()) {
            if(!$this->hr->employed($e,$d->toDateString())||in_array($d->dayOfWeek,$e->weekly_off_days,true))continue;
            $this->hr->attendance($e,['date'=>$d->toDateString(),'status'=>'present','overtime_hours'=>0]);
        }
    }

    private function posted(Employee $e): Payroll
    {
        $this->attendance($e);$p=$this->hr->generate('2026-10');$this->hr->approve($p);$this->hr->post($p,'2026-10-31');return $p->refresh();
    }

    public function test_payroll_advance_payment_and_reversal_reconcile_accounting(): void
    {
        $e=$this->employee();$this->attendance($e);
        $advance=$this->hr->cash($e,['kind'=>'advance','date'=>'2026-10-01','amount'=>5000,'method'=>'cash','notes'=>'Advance']);
        $p=$this->hr->generate('2026-10');$item=$p->items()->firstOrFail();
        $this->hr->adjust($item,['bonus'=>500,'commission'=>1000,'deductions'=>200,'recovery'=>2000,'notes'=>'Approved commission and recovery']);
        $this->hr->approve($p);$this->hr->post($p,'2026-10-31');
        $totals=app(HrReportService::class)->totals();
        $this->assertEquals(['expense'=>32300,'payable'=>30300,'advance'=>3000,'cash_out'=>5000],$totals);
        $payment=$this->hr->cash($e,['kind'=>'salary_payment','payroll_item_id'=>$item->id,'date'=>'2026-10-31','amount'=>10000,'method'=>'bank','notes'=>'Partial salary']);
        $this->assertEquals(20300,$this->hr->balance($e->id,'payable'));
        $position=app(LedgerService::class)->financialPosition();
        $this->assertEquals(-17300,$position['totals']['net']);
        $this->assertEquals(-15000,$position['totals']['net_cash_flow']);
        $this->assertEquals(-32300,app(ReportService::class)->build('hr-operating-profit',[])['rows'][0]['profit']);
        $monthly=app(ReportService::class)->profitByMonth();
        $this->assertEquals(32300,$monthly['totals']['payroll_expense']);
        $this->assertEquals(-32300,$monthly['totals']['profit_after_payroll']);
        $this->assertEquals(0,\App\Models\LedgerEntry::count());
        $this->hr->reverseCash($payment,'2026-10-31','Payment reversed');
        $this->hr->cancelPayroll($p,'2026-10-31','Payroll corrected');
        $this->assertEquals(5000,$this->hr->balance($e->id,'advance'));
        $this->hr->reverseCash($advance,'2026-10-31','Advance reversed');
        $this->assertEquals(['expense'=>0,'payable'=>0,'advance'=>0,'cash_out'=>0],app(HrReportService::class)->totals());
        $this->assertEquals(6,HrTransaction::count());
        $replacement=$this->hr->generate('2026-10');$this->assertNotEquals($p->id,$replacement->id);
    }

    public function test_calendar_proration_absence_overtime_and_paid_leave(): void
    {
        $e=$this->employee(['joining_date'=>'2026-10-16','leaving_date'=>'2026-10-30']);
        $type=HrLeaveType::create(['name'=>'Annual','is_paid'=>true,'annual_days'=>12]);
        $leave=$this->hr->requestLeave($e,['leave_type_id'=>$type->id,'from_date'=>'2026-10-19','to_date'=>'2026-10-20','reason'=>'Leave']);
        $this->hr->leaveDecision($leave,'approved');
        $this->hr->attendance($e,['date'=>'2026-10-21','status'=>'absent','overtime_hours'=>0]);
        $this->hr->attendance($e,['date'=>'2026-10-22','status'=>'half_day','overtime_hours'=>2]);
        $s=$this->hr->calculate($e,Carbon::parse('2026-10-01'));
        $this->assertEquals(15,$s['eligible_days']);$this->assertEquals(1.5,$s['unpaid_days']);
        $this->assertEquals(13500,$s['base']);$this->assertEquals(200,$s['overtime']);
        $this->assertNotContains('2026-10-19',$s['missing_attendance']);
        $this->assertContains('2026-10-16',$s['missing_attendance']);
    }

    public function test_missing_attendance_blocks_approval_and_posting_requires_approval(): void
    {
        $this->employee();$p=$this->hr->generate('2026-10');
        $this->post(route('hr.payroll.action',[$p,'approve']))->assertSessionHasErrors('hr');
        $this->post(route('hr.payroll.action',[$p,'post']),['date'=>'2026-10-31'])->assertSessionHasErrors('hr');
        $this->assertEquals(0,HrTransaction::count());
    }

    public function test_locked_period_and_duplicate_payroll_cannot_be_changed_or_paid_twice(): void
    {
        $e=$this->employee();$p=$this->posted($e);$item=$p->items()->firstOrFail();
        $this->post(route('hr.payroll.generate'),['month'=>'2026-10'])->assertSessionHasErrors('hr');
        $this->post(route('hr.attendance'),['employee_id'=>$e->id,'date'=>'2026-10-01','status'=>'absent','overtime_hours'=>0])->assertSessionHasErrors('hr');
        $this->post(route('hr.salary',$e),['effective_from'=>'2026-10-01','basic'=>1,'allowances'=>0,'overtime_rate'=>0,'sales_target'=>0])->assertSessionHasErrors('hr');
        $payload=['employee_id'=>$e->id,'kind'=>'salary_payment','payroll_item_id'=>$item->id,'date'=>'2026-10-31','amount'=>31000,'method'=>'cash','notes'=>'Salary'];
        $this->post(route('hr.cash'),$payload)->assertSessionHasNoErrors();
        $this->post(route('hr.cash'),$payload)->assertSessionHasErrors('hr');
        $this->post(route('hr.payroll.action',[$p,'cancel']),['date'=>'2026-10-31','reason'=>'Correction'])->assertSessionHasErrors('hr');
        $this->assertEquals(0,$this->hr->balance($e->id,'payable'));
    }

    public function test_leave_allowance_overlap_and_attendance_conflicts_are_enforced(): void
    {
        $e=$this->employee();$type=HrLeaveType::create(['name'=>'Casual','is_paid'=>true,'annual_days'=>1]);
        $l=$this->hr->requestLeave($e,['leave_type_id'=>$type->id,'from_date'=>'2026-10-01','to_date'=>'2026-10-02','reason'=>'Two days']);
        $this->post(route('hr.leave.decision',$l),['status'=>'approved'])->assertSessionHasErrors('hr');
        $this->post(route('hr.leave'),['employee_id'=>$e->id,'leave_type_id'=>$type->id,'from_date'=>'2026-10-02','to_date'=>'2026-10-03','reason'=>'Overlap'])->assertSessionHasErrors('hr');
        $this->hr->leaveDecision($l,'rejected');
        $l=$this->hr->requestLeave($e,['leave_type_id'=>$type->id,'from_date'=>'2026-10-01','to_date'=>'2026-10-01','reason'=>'One day']);
        $this->hr->leaveDecision($l,'approved');
        $this->post(route('hr.attendance'),['employee_id'=>$e->id,'date'=>'2026-10-01','status'=>'present','overtime_hours'=>0])->assertSessionHasErrors('hr');
    }

    public function test_booker_self_service_cannot_read_other_employees_or_financial_reports(): void
    {
        $booker=User::factory()->create();$booker->assignRole('Booker');
        $e=$this->employee(['user_id'=>$booker->id,'is_booker'=>true]);$p=$this->posted($e);
        $this->actingAs($booker);
        $this->get(route('hr.self'))->assertOk()->assertInertia(fn (Assert $page) => $page
            ->where('employee.id', $e->id)
            ->where('showEmployeeDetails', false)
            ->missing('employee.department')
            ->missing('employee.joining_date')
            ->missing('employee.user')
            ->has('payslips', 1)
            ->has('attendance')
            ->has('leaves'));
        $this->get(route('hr.index','employees'))->assertForbidden();
        $this->get(route('hr.employee',$e))->assertForbidden();
        config(['branding.footer' => 'Payroll Document Footer']);
        $document = app('dompdf.wrapper');
        Pdf::swap($document);
        $this->get(route('hr.payslip',$p->items()->first()))->assertOk()->assertHeader('content-type','application/pdf');
        $pdf = $document->output(['compress' => false]);
        foreach (['Salary Payslip', 'Current Unpaid Balance', 'Payroll Document Footer'] as $text) {
            $this->assertStringContainsString(mb_convert_encoding($text, 'UTF-16BE', 'UTF-8'), $pdf);
        }
        $this->get(route('reports.show',['key'=>'hr-payroll','format'=>'xlsx']))->assertForbidden();
        $other=User::factory()->create();$other->assignRole('Booker');$this->actingAs($other);
        $this->get(route('hr.payslip',$p->items()->first()))->assertForbidden();

        $this->actingAs(User::where('email', 'admin@whmis.local')->firstOrFail())
            ->get(route('hr.employee', $e))->assertOk()->assertInertia(fn (Assert $page) => $page
                ->where('showEmployeeDetails', true)
                ->has('employee.joining_date')
                ->where('employee.user.id', $booker->id));
    }

    public function test_hr_reports_pages_and_pdf_exports_work_and_salary_is_permission_scoped(): void
    {
        $e=$this->employee();$p=$this->posted($e);
        foreach(['employees','attendance','leave','payroll','finance','settings'] as $section)$this->get(route('hr.index',$section))->assertOk();
        $this->get(route('hr.payroll',$p))->assertOk();$this->get(route('hr.employee',$e))->assertOk();
        foreach(array_keys(HrReportService::catalog()) as $key) {
            $this->get(route('reports.show',$key))->assertOk();
            $this->get(route('reports.show',['key'=>$key,'format'=>'pdf']))->assertOk()->assertHeader('content-type','application/pdf');
        }
        $this->get(route('reports.show',['key'=>'hr-payroll','format'=>'xlsx']))->assertOk();
        $staff=User::factory()->create();$staff->givePermissionTo(['employees.view','reports.view']);$this->actingAs($staff);
        $this->get(route('hr.employee',$e))->assertInertia(fn(Assert $page)=>$page->has('salaries',0)->where('balances',null));
        $this->get(route('reports.show',['key'=>'hr-payroll','format'=>'pdf']))->assertForbidden();
    }

    public function test_hr_models_resolve_audit_morph_aliases(): void
    {
        foreach([Employee::class,EmployeeAttendance::class,EmployeeLeave::class,EmployeeSalary::class,HrDepartment::class,HrDesignation::class,HrLeaveType::class,HrTransaction::class,Payroll::class,PayrollItem::class] as $model) $this->assertStringNotContainsString('\\',(new $model)->getMorphClass());
    }

    public function test_attendance_report_includes_month_end_and_stale_payroll_requires_regeneration(): void
    {
        $e=$this->employee(); $this->attendance($e); $p=$this->hr->generate('2026-10');
        $this->hr->attendance($e,['date'=>'2026-10-31','status'=>'half_day','overtime_hours'=>2]);
        $report=app(HrReportService::class)->build('hr-attendance',['from'=>'2026-10-31','to'=>'2026-10-31']);
        $this->assertCount(1,$report['rows']);
        $this->assertEquals(2,$report['totals']['overtime']);
        $this->post(route('hr.payroll.action',[$p,'approve']))->assertSessionHasErrors('hr');
        $this->hr->regenerate($p); $this->hr->approve($p); $this->hr->post($p,'2026-10-31');
        $this->assertEquals(30700,$this->hr->balance($e->id,'payable'));
        $this->post(route('hr.payroll.action',[$p,'post']),['date'=>'2026-10-31'])->assertSessionHasErrors('hr');
        $this->assertEquals(1,HrTransaction::count());
    }

    public function test_advance_recovery_prevents_reversal_and_cash_entries_cannot_be_backdated(): void
    {
        $e=$this->employee();$this->attendance($e);
        $advance=$this->hr->cash($e,['kind'=>'advance','date'=>'2026-10-15','amount'=>1000,'method'=>'cash','notes'=>'Advance']);
        $this->post(route('hr.cash'),['employee_id'=>$e->id,'kind'=>'advance','date'=>'2026-10-14','amount'=>100,'method'=>'cash','notes'=>'Backdated'])->assertSessionHasErrors('hr');
        $p=$this->hr->generate('2026-10');
        $this->hr->adjust($p->items()->first(),['bonus'=>0,'commission'=>0,'deductions'=>0,'recovery'=>1000,'notes'=>'Recover advance']);
        $this->hr->approve($p);$this->hr->post($p,'2026-10-31');
        $this->post(route('hr.cash.reverse',$advance),['date'=>'2026-10-31','reason'=>'Invalid'])->assertSessionHasErrors('hr');
        $this->hr->cancelPayroll($p,'2026-10-31','Reverse payroll');
        $this->hr->reverseCash($advance,'2026-10-31','Reverse advance');
        $this->post(route('hr.cash.reverse',$advance),['date'=>'2026-10-31','reason'=>'Duplicate'])->assertSessionHasErrors('hr');
        $this->assertEquals(4,HrTransaction::count());
    }

    public function test_unpaid_leave_excludes_weekly_off_days_from_deduction(): void
    {
        $e=$this->employee();$type=HrLeaveType::create(['name'=>'Unpaid','is_paid'=>false,'annual_days'=>30]);
        $leave=$this->hr->requestLeave($e,['leave_type_id'=>$type->id,'from_date'=>'2026-10-03','to_date'=>'2026-10-05','reason'=>'Three calendar days']);
        $this->assertEquals(2,$leave->days);$this->hr->leaveDecision($leave,'approved');
        $s=$this->hr->calculate($e,Carbon::parse('2026-10-01'));
        $this->assertEquals(2,$s['unpaid_days']);$this->assertEquals(29000,$s['base']);
    }

    public function test_employee_linked_login_is_preserved_and_audit_cannot_leak_salary(): void
    {
        config(['audit.console'=>true]);
        $user=User::factory()->create();$e=$this->employee(['user_id'=>$user->id]);
        $this->delete('/users/'.$user->id)->assertSessionHas('error');
        $this->assertDatabaseHas('users',['id'=>$user->id]);
        $auditor=User::factory()->create();$auditor->givePermissionTo('audit.view');$this->actingAs($auditor);
        $this->get('/audit-log?model=employee_salary')->assertOk()->assertInertia(fn(Assert $page)=>$page->has('audits.data',0));
        $this->get('/audit-log?model=employee')->assertOk()->assertInertia(fn(Assert $page)=>$page->has('audits.data',0));
    }

    public function test_booker_report_keeps_explicit_attribution_and_nets_only_posted_returns_and_completed_allocations(): void
    {
        $booker=User::factory()->create();$booker->assignRole('Booker');
        $e=$this->employee(['user_id'=>$booker->id,'is_booker'=>true]);
        $this->hr->salary($e,['effective_from'=>'2026-10-01','basic'=>31000,'allowances'=>0,'overtime_rate'=>0,'sales_target'=>50000]);
        $customer=\App\Models\Customer::create(['name'=>'Booker Pharmacy']);
        $sale=\App\Models\SalesInvoice::create(['invoice_number'=>'SI-HR-1','customer_id'=>$customer->id,'booker_id'=>$booker->id,'warehouse_id'=>1,'invoice_date'=>'2026-10-31','status'=>'posted','sale_type'=>'credit','total_amount'=>10000,'total_cost'=>7000,'total_profit'=>3000]);
        \App\Models\SalesInvoice::create(['invoice_number'=>'SI-HR-2','customer_id'=>$customer->id,'warehouse_id'=>1,'invoice_date'=>'2026-10-31','status'=>'posted','sale_type'=>'credit','total_amount'=>5000]);
        $return=['sales_invoice_id'=>$sale->id,'customer_id'=>$customer->id,'warehouse_id'=>1,'return_date'=>'2026-10-31','total_amount'=>2000,'total_cost'=>1400];
        \App\Models\SalesReturn::create($return+['return_number'=>'SR-HR-1','status'=>'posted']);
        \App\Models\SalesReturn::create($return+['return_number'=>'SR-HR-2','status'=>'cancelled']);
        foreach(['completed','cancelled'] as $status) {
            $payment=\App\Models\Payment::create(['payment_number'=>'PAY-HR-'.$status,'party_type'=>'customer','party_id'=>$customer->id,'direction'=>'in','method'=>'cash','amount'=>3000,'payment_date'=>'2026-10-31','status'=>$status]);
            $payment->allocations()->create(['invoice_type'=>'sales_invoice','invoice_id'=>$sale->id,'amount'=>3000]);
        }
        $report=app(HrReportService::class)->build('hr-bookers',['from'=>'2026-10-31','to'=>'2026-10-31']);
        $this->assertCount(1,$report['rows']);
        $this->assertEquals(['name'=>$e->name,'sales'=>10000,'returns'=>2000,'net_sales'=>8000,'collections'=>3000,'target'=>50000],$report['rows'][0]);
        $this->assertEquals(8000,$report['totals']['net_sales']);
    }

    public function test_hr_dates_serialize_without_timezone_day_shift(): void
    {
        config(['app.timezone'=>'Asia/Karachi']);
        $e=$this->employee();
        $this->assertSame('2026-10-01',$e->toArray()['joining_date']);
        $this->assertSame('2026-10-01',$e->salaries()->first()->toArray()['effective_from']);
    }
}
