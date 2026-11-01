<?php

namespace App\Services;

use App\Models\{Employee, EmployeeAttendance, EmployeeLeave, EmployeeSalary, HrLeaveType, HrTransaction, Payroll, PayrollItem};
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class HrService
{
    public function __construct(private readonly NumberSeriesService $numbers) {}

    private function require(bool $condition, string $message): void
    {
        if (! $condition) throw ValidationException::withMessages(['hr' => $message]);
    }

    public function unlocked(Employee $employee, string $from, string $to): void
    {
        $locked = PayrollItem::where('employee_id', $employee->id)->whereHas('payroll', fn ($q) => $q
            ->whereIn('status', ['approved', 'posted'])
            ->whereDate('period', '>=', Carbon::parse($from)->startOfMonth())->whereDate('period', '<=', Carbon::parse($to)->startOfMonth()))->exists();
        $this->require(! $locked, 'This period is locked by approved or posted payroll. Reopen or reverse payroll first.');
    }

    public function employed(Employee $e, string $date): bool
    {
        return $date >= $e->joining_date->toDateString() && (! $e->leaving_date || $date <= $e->leaving_date->toDateString());
    }

    public function attendance(Employee $employee, array $data): void
    {
        DB::transaction(function () use ($employee, $data) {
            $employee = Employee::whereKey($employee->id)->lockForUpdate()->firstOrFail();
            $this->unlocked($employee, $data['date'], $data['date']);
            $this->require($this->employed($employee, $data['date']), 'Attendance must fall within employment dates.');
            $this->require(! EmployeeLeave::where('employee_id', $employee->id)->where('status', 'approved')
                ->whereDate('from_date', '<=', $data['date'])->whereDate('to_date', '>=', $data['date'])->exists(), 'Approved leave already covers this day.');
            $this->require(in_array($data['status'], ['present','half_day']) || (float) $data['overtime_hours'] == 0, 'Overtime requires a present or half-day attendance record.');
            $attendance = EmployeeAttendance::where('employee_id', $employee->id)->whereDate('date', $data['date'])->first() ?? new EmployeeAttendance(['employee_id' => $employee->id]);
            $attendance->fill($data)->save();
        });
    }

    public function salary(Employee $employee, array $data): void
    {
        DB::transaction(function () use ($employee, $data) {
            $employee = Employee::whereKey($employee->id)->lockForUpdate()->firstOrFail();
            $this->require(Carbon::parse($data['effective_from'])->day === 1, 'Salary versions start on the first day of a month. Joining and leaving months are prorated.');
            $next = $employee->salaries()->whereDate('effective_from', '>', $data['effective_from'])->reorder('effective_from')->first();
            $this->unlocked($employee, $data['effective_from'], $next ? $next->effective_from->copy()->subDay()->toDateString() : '9999-12-01');
            $salary = $employee->salaries()->whereDate('effective_from', $data['effective_from'])->first() ?? new EmployeeSalary(['employee_id' => $employee->id]);
            $salary->fill($data)->save();
        });
    }

    public function requestLeave(Employee $employee, array $data): EmployeeLeave
    {
        return DB::transaction(function () use ($employee, $data) {
            $employee = Employee::whereKey($employee->id)->lockForUpdate()->firstOrFail();
            $type = HrLeaveType::whereKey($data['leave_type_id'])->where('is_active', true)->firstOrFail();
            $this->unlocked($employee, $data['from_date'], $data['to_date']);
            $this->require($this->employed($employee, $data['from_date']) && $this->employed($employee, $data['to_date']), 'Leave must fall within employment dates.');
            $this->require(substr($data['from_date'], 0, 4) === substr($data['to_date'], 0, 4), 'Split leave at the calendar year boundary.');
            $days = 0;
            for ($d = Carbon::parse($data['from_date']); $d->lte(Carbon::parse($data['to_date'])); $d->addDay()) {
                if (! in_array($d->dayOfWeek, $employee->weekly_off_days, true)) $days++;
            }
            $this->require($days > 0, 'This leave contains no working days.');
            $this->require(! EmployeeLeave::where('employee_id', $employee->id)->whereIn('status', ['pending','approved'])
                ->whereDate('from_date', '<=', $data['to_date'])->whereDate('to_date', '>=', $data['from_date'])->exists(), 'Another leave request overlaps these dates.');
            return EmployeeLeave::create($data + ['employee_id' => $employee->id, 'days' => $days, 'is_paid' => $type->is_paid]);
        });
    }

    public function leaveDecision(EmployeeLeave $leave, string $status): void
    {
        DB::transaction(function () use ($leave, $status) {
            $employee = Employee::whereKey($leave->employee_id)->lockForUpdate()->firstOrFail();
            $leave = EmployeeLeave::whereKey($leave->id)->lockForUpdate()->firstOrFail();
            $this->require(in_array($leave->status, ['pending','approved']) && ($leave->status === 'pending' || $status === 'cancelled'), 'This leave decision is no longer available.');
            $this->unlocked($employee, $leave->from_date->toDateString(), $leave->to_date->toDateString());
            if ($status === 'approved') {
                $type = $leave->leaveType;
                $used = EmployeeLeave::where('employee_id', $employee->id)->where('leave_type_id', $type->id)
                    ->where('status', 'approved')->whereYear('from_date', $leave->from_date->year)->sum('days');
                $this->require($used + $leave->days <= $type->annual_days, 'Leave exceeds the annual allowance. Update the leave policy first.');
                $this->require(! EmployeeAttendance::where('employee_id', $employee->id)->whereDate('date', '>=', $leave->from_date)->whereDate('date', '<=', $leave->to_date)->exists(), 'Attendance already exists in this range. Remove the conflicting entries before approving leave.');
                $this->require(! EmployeeLeave::where('employee_id', $employee->id)->where('status', 'approved')
                    ->whereDate('from_date', '<=', $leave->to_date)->whereDate('to_date', '>=', $leave->from_date)->exists(), 'Approved leave overlaps.');
            }
            $leave->update(['status' => $status, 'approved_by' => Auth::id()]);
        });
    }

    /** Monthly base is prorated by calendar days; only recorded unpaid days are deducted. */
    public function calculate(Employee $employee, Carbon $period): array
    {
        $start = $period->copy()->startOfMonth(); $end = $period->copy()->endOfMonth();
        $salary = $employee->salaries()->whereDate('effective_from', '<=', $start)->lockForUpdate()->first();
        $this->require((bool) $salary, "{$employee->name}: add a salary version effective on or before this month.");
        $attendance = EmployeeAttendance::where('employee_id', $employee->id)->whereDate('date', '>=', $start)->whereDate('date', '<=', $end)->lockForUpdate()->get()->keyBy(fn ($a) => $a->date->toDateString());
        $leaves = EmployeeLeave::where('employee_id', $employee->id)->where('status', 'approved')
            ->whereDate('from_date', '<=', $end)->whereDate('to_date', '>=', $start)->lockForUpdate()->get();
        $eligible = 0; $unpaid = 0; $overtime = 0; $missing = [];
        for ($d = $start->copy(); $d->lte($end); $d->addDay()) {
            $date = $d->toDateString();
            if (! $this->employed($employee, $date)) continue;
            $eligible++;
            $a = $attendance->get($date);
            $off = in_array($d->dayOfWeek, $employee->weekly_off_days, true);
            $leave = $leaves->first(fn ($l) => $date >= $l->from_date->toDateString() && $date <= $l->to_date->toDateString());
            if ($a) {
                $unpaid += match ($a->status) { 'absent' => 1, 'half_day' => 0.5, default => 0 };
                $overtime += (float) $a->overtime_hours;
            } elseif (! $off && $leave) {
                if (! $leave->is_paid) $unpaid++;
            } elseif (! $off) $missing[] = $date;
        }
        $monthly = (float) $salary->basic + (float) $salary->allowances;
        return [
            'employee_name' => $employee->name, 'employee_number' => $employee->employee_number,
            'salary_id' => $salary->id, 'basic' => (float) $salary->basic, 'allowances' => (float) $salary->allowances,
            'calendar_days' => $start->daysInMonth, 'eligible_days' => $eligible, 'unpaid_days' => $unpaid,
            'unpaid_deduction' => round($monthly * $unpaid / $start->daysInMonth, 2),
            'base' => round($monthly * ($eligible - $unpaid) / $start->daysInMonth, 2),
            'overtime_hours' => $overtime, 'overtime_rate' => (float) $salary->overtime_rate,
            'overtime' => round($overtime * (float) $salary->overtime_rate, 2), 'missing_attendance' => $missing,
        ];
    }

    public function generate(string $month): Payroll
    {
        return DB::transaction(function () use ($month) {
            $period = Carbon::parse($month.'-01');
            $this->require(! Payroll::whereDate('active_period', $period)->exists(), 'A payroll already exists for this month. Open it or reverse it before replacing it.');
            $payroll = Payroll::create(['number' => $this->numbers->next('payroll'), 'period' => $period, 'active_period' => $period, 'created_by' => Auth::id()]);
            $this->regenerate($payroll);
            return $payroll;
        });
    }

    public function regenerate(Payroll $payroll): void
    {
        DB::transaction(function () use ($payroll) {
            $payroll = Payroll::whereKey($payroll->id)->lockForUpdate()->firstOrFail();
            $this->require($payroll->status === 'draft', 'Only draft payroll can be regenerated.');
            $employees = Employee::whereDate('joining_date', '<=', $payroll->period->copy()->endOfMonth())
                ->where(fn ($q) => $q->whereNull('leaving_date')->orWhereDate('leaving_date', '>=', $payroll->period))
                ->orderBy('id')->lockForUpdate()->get();
            $this->require($employees->isNotEmpty(), 'No employees are employed in this month.');
            $payroll->items()->delete();
            foreach ($employees as $employee) {
                $s = $this->calculate($employee, $payroll->period);
                $payroll->items()->create(['employee_id' => $employee->id, 'snapshot' => $s, 'base' => $s['base'], 'overtime' => $s['overtime'], 'expense' => $s['base'] + $s['overtime'], 'net_pay' => $s['base'] + $s['overtime']]);
            }
        });
    }

    public function adjust(PayrollItem $item, array $data): void
    {
        DB::transaction(function () use ($item, $data) {
            $payroll = Payroll::whereKey($item->payroll_id)->lockForUpdate()->firstOrFail();
            $this->require($payroll->status === 'draft', 'Only draft payroll can be adjusted.');
            $item->refresh();
            $expense = round((float) $item->base + (float) $item->overtime + $data['bonus'] + $data['commission'] - $data['deductions'], 2);
            $net = round($expense - $data['recovery'], 2);
            $this->require($net >= 0, 'Deductions and advance recovery cannot exceed earnings.');
            $this->require($data['recovery'] <= $this->balance($item->employee_id, 'advance') + 0.001, 'Recovery exceeds the outstanding advance.');
            $item->update($data + ['expense' => $expense, 'net_pay' => $net]);
        });
    }

    public function approve(Payroll $payroll): void
    {
        DB::transaction(function () use ($payroll) {
            $payroll = Payroll::whereKey($payroll->id)->lockForUpdate()->firstOrFail();
            $this->require($payroll->status === 'draft', 'Only a draft can be approved.');
            $expected = Employee::whereDate('joining_date', '<=', $payroll->period->copy()->endOfMonth())
                ->where(fn ($q) => $q->whereNull('leaving_date')->orWhereDate('leaving_date', '>=', $payroll->period))->orderBy('id')->lockForUpdate()->pluck('id')->all();
            $actual = $payroll->items()->orderBy('employee_id')->pluck('employee_id')->all();
            $this->require($expected === $actual && count($actual) > 0, 'Employee roster changed. Regenerate the draft before approval.');
            $this->require($payroll->period->copy()->endOfMonth()->startOfDay()->lte(now()->startOfDay()), 'Approve payroll only after the last day of its month has started.');
            foreach ($payroll->items()->orderBy('employee_id')->get() as $item) {
                $employee = Employee::whereKey($item->employee_id)->lockForUpdate()->firstOrFail();
                $snapshot = $this->calculate($employee, $payroll->period);
                $this->require($snapshot == $item->snapshot, 'Salary or attendance changed. Regenerate the draft and review it again.');
                $this->require(empty($snapshot['missing_attendance']), "{$employee->name}: complete all working-day attendance before approval.");
            }
            $payroll->update(['status' => 'approved', 'approved_by' => Auth::id()]);
        });
    }

    public function reopen(Payroll $payroll): void
    {
        DB::transaction(function () use ($payroll) {
            $payroll = Payroll::whereKey($payroll->id)->lockForUpdate()->firstOrFail();
            $this->require($payroll->status === 'approved', 'Only approved, unposted payroll can be reopened.');
            $payroll->update(['status' => 'draft', 'approved_by' => null]);
        });
    }

    public function post(Payroll $payroll, string $date): void
    {
        DB::transaction(function () use ($payroll, $date) {
            $payroll = Payroll::whereKey($payroll->id)->lockForUpdate()->firstOrFail();
            $this->require($payroll->status === 'approved', 'Payroll must be approved before posting.');
            $this->require($date >= $payroll->period->copy()->endOfMonth()->toDateString(), 'Posting date must be on or after month end.');
            foreach ($payroll->items()->orderBy('employee_id')->get() as $item) {
                Employee::whereKey($item->employee_id)->lockForUpdate()->firstOrFail();
                $this->require((float) $item->recovery <= $this->balance($item->employee_id, 'advance') + 0.001, 'Advance balance changed. Reopen payroll and review recovery.');
                $this->entry($item->employee_id, 'payroll', $date, (float) $item->expense, (float) $item->net_pay, -(float) $item->recovery, 0, "Payroll {$payroll->number}", $item->id);
            }
            $payroll->update(['status' => 'posted', 'posted_by' => Auth::id(), 'posting_date' => $date]);
        });
    }

    public function cancelPayroll(Payroll $payroll, string $date, string $reason): void
    {
        DB::transaction(function () use ($payroll, $date, $reason) {
            $payroll = Payroll::whereKey($payroll->id)->lockForUpdate()->firstOrFail();
            $this->require($payroll->status !== 'cancelled', 'Payroll is already cancelled.');
            if ($payroll->status === 'posted') {
                $this->require($date >= $payroll->posting_date->toDateString(), 'Reversal date precedes posting.');
                foreach ($payroll->items()->orderBy('employee_id')->get() as $item) {
                    Employee::whereKey($item->employee_id)->lockForUpdate()->firstOrFail();
                    $this->require(abs((float) $item->transactions()->lockForUpdate()->get(['cash_out'])->sum('cash_out')) < 0.005, 'Reverse all salary payments before cancelling payroll.');
                    $original = $item->transactions()->where('kind', 'payroll')->firstOrFail();
                    $this->reverseEntry($original, $date, $reason);
                }
            }
            $payroll->update(['status' => 'cancelled', 'active_period' => null]);
        });
    }

    public function balance(int $employeeId, string $column): float
    {
        return round((float) HrTransaction::where('employee_id', $employeeId)->lockForUpdate()->get([$column])->sum($column), 2);
    }

    public function cash(Employee $employee, array $data): HrTransaction
    {
        return DB::transaction(function () use ($employee, $data) {
            // Payroll lock first everywhere to serialize payment with reversal.
            $item = ! empty($data['payroll_item_id']) ? PayrollItem::findOrFail($data['payroll_item_id']) : null;
            $payroll = $item ? Payroll::whereKey($item->payroll_id)->lockForUpdate()->firstOrFail() : null;
            $employee = Employee::whereKey($employee->id)->lockForUpdate()->firstOrFail();
            $amount = round((float) $data['amount'], 2);
            $this->require($amount > 0, 'Amount must be positive.');
            if ($data['kind'] === 'salary_payment') {
                $this->require($item && $item->employee_id === $employee->id && $payroll->status === 'posted', 'Select a posted payslip for this employee.');
                $this->require($data['date'] >= $payroll->posting_date->toDateString(), 'Payment date precedes payroll posting.');
                $due = round((float) $item->transactions()->lockForUpdate()->get(['payable'])->sum('payable'), 2);
                $this->require($amount <= $due + 0.001, 'Payment exceeds the remaining salary payable.');
                return $this->entry($employee->id, $data['kind'], $data['date'], 0, -$amount, 0, $amount, $data['notes'], $item->id, $data);
            }
            $this->require(in_array($data['kind'], ['advance','advance_repayment']), 'Unsupported employee transaction.');
            $this->require(! $item, 'Only salary payments can reference a payslip.');
            if ($data['kind'] === 'advance_repayment') $this->require($amount <= $this->balance($employee->id, 'advance') + 0.001, 'Repayment exceeds the employee advance balance.');
            $sign = $data['kind'] === 'advance' ? 1 : -1;
            return $this->entry($employee->id, $data['kind'], $data['date'], 0, 0, $sign * $amount, $sign * $amount, $data['notes'], null, $data);
        });
    }

    public function reverseCash(HrTransaction $transaction, string $date, string $reason): void
    {
        DB::transaction(function () use ($transaction, $date, $reason) {
            if ($transaction->payroll_item_id) Payroll::whereKey($transaction->payrollItem->payroll_id)->lockForUpdate()->firstOrFail();
            Employee::whereKey($transaction->employee_id)->lockForUpdate()->firstOrFail();
            $transaction = HrTransaction::whereKey($transaction->id)->lockForUpdate()->firstOrFail();
            $this->require(in_array($transaction->kind, ['salary_payment','advance','advance_repayment']), 'Reverse payroll from the payroll screen.');
            $this->require($this->balance($transaction->employee_id, 'advance') - (float) $transaction->advance >= -0.001, 'This advance has been recovered. Reverse its recoveries first.');
            $this->reverseEntry($transaction, $date, $reason);
        });
    }

    private function reverseEntry(HrTransaction $t, string $date, string $reason): void
    {
        $this->require(! $t->reversal()->exists(), 'This transaction has already been reversed.');
        $this->require($date >= $t->date->toDateString(), 'Reversal date precedes the original transaction.');
        $this->entry($t->employee_id, 'reversal', $date, -(float) $t->expense, -(float) $t->payable, -(float) $t->advance, -(float) $t->cash_out, $reason, $t->payroll_item_id, ['reverses_id' => $t->id, 'method' => $t->method]);
    }

    private function entry(int $employeeId, string $kind, string $date, float $expense, float $payable, float $advance, float $cash, string $notes, ?int $itemId = null, array $extra = []): HrTransaction
    {
        $last = HrTransaction::where('employee_id', $employeeId)->orderByDesc('date')->lockForUpdate()->first();
        $this->require(! $last || $date >= $last->date->toDateString(), 'Use an accounting date on or after the employee’s latest transaction to preserve historical balances.');
        return HrTransaction::create([
            'number' => $this->numbers->next('hr_transaction'), 'employee_id' => $employeeId, 'kind' => $kind,
            'date' => $date, 'expense' => round($expense,2), 'payable' => round($payable,2), 'advance' => round($advance,2),
            'cash_out' => round($cash,2), 'notes' => $notes, 'payroll_item_id' => $itemId, 'created_by' => Auth::id(),
            'method' => $extra['method'] ?? null, 'reference' => $extra['reference'] ?? null, 'reverses_id' => $extra['reverses_id'] ?? null,
        ]);
    }
}
