<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        foreach (['hr_departments', 'hr_designations'] as $name) {
            Schema::create($name, function (Blueprint $t) {
                $t->id(); $t->string('name')->unique(); $t->boolean('is_active')->default(true); $t->timestamps();
            });
        }
        Schema::create('employees', function (Blueprint $t) {
            $t->id(); $t->string('employee_number')->unique(); $t->string('name');
            $t->foreignId('user_id')->nullable()->unique()->constrained()->restrictOnDelete();
            $t->foreignId('department_id')->nullable()->constrained('hr_departments')->restrictOnDelete();
            $t->foreignId('designation_id')->nullable()->constrained('hr_designations')->restrictOnDelete();
            $t->foreignId('manager_id')->nullable()->constrained('employees')->restrictOnDelete();
            $t->string('cnic')->nullable()->unique(); $t->string('phone')->nullable(); $t->string('email')->nullable();
            $t->text('address')->nullable(); $t->string('emergency_contact')->nullable();
            $t->date('joining_date'); $t->date('leaving_date')->nullable();
            $t->string('status')->default('active'); $t->string('employment_type')->default('permanent');
            $t->boolean('is_booker')->default(false); $t->json('weekly_off_days');
            $t->text('notes')->nullable(); $t->timestamps();
        });
        Schema::create('employee_salaries', function (Blueprint $t) {
            $t->id(); $t->foreignId('employee_id')->constrained()->restrictOnDelete(); $t->date('effective_from');
            $t->decimal('basic',15,2); $t->decimal('allowances',15,2)->default(0);
            $t->decimal('overtime_rate',15,2)->default(0); $t->decimal('sales_target',15,2)->default(0);
            $t->text('notes')->nullable(); $t->timestamps(); $t->unique(['employee_id','effective_from']);
        });
        Schema::create('employee_attendances', function (Blueprint $t) {
            $t->id(); $t->foreignId('employee_id')->constrained()->restrictOnDelete(); $t->date('date');
            $t->string('status'); $t->time('clock_in')->nullable(); $t->time('clock_out')->nullable();
            $t->decimal('overtime_hours',6,2)->default(0); $t->text('notes')->nullable(); $t->timestamps();
            $t->unique(['employee_id','date']);
        });
        Schema::create('hr_leave_types', function (Blueprint $t) {
            $t->id(); $t->string('name')->unique(); $t->boolean('is_paid')->default(true);
            $t->unsignedSmallInteger('annual_days')->default(0); $t->boolean('is_active')->default(true); $t->timestamps();
        });
        Schema::create('employee_leaves', function (Blueprint $t) {
            $t->id(); $t->foreignId('employee_id')->constrained()->restrictOnDelete();
            $t->foreignId('leave_type_id')->constrained('hr_leave_types')->restrictOnDelete();
            $t->date('from_date'); $t->date('to_date'); $t->unsignedSmallInteger('days'); $t->boolean('is_paid');
            $t->string('status')->default('pending'); $t->text('reason');
            $t->foreignId('approved_by')->nullable()->constrained('users')->restrictOnDelete(); $t->timestamps();
        });
        Schema::create('payrolls', function (Blueprint $t) {
            $t->id(); $t->string('number')->unique(); $t->date('period'); $t->date('active_period')->nullable()->unique();
            $t->string('status')->default('draft'); $t->date('posting_date')->nullable();
            $t->foreignId('created_by')->nullable()->constrained('users')->restrictOnDelete();
            $t->foreignId('approved_by')->nullable()->constrained('users')->restrictOnDelete();
            $t->foreignId('posted_by')->nullable()->constrained('users')->restrictOnDelete(); $t->timestamps();
        });
        Schema::create('payroll_items', function (Blueprint $t) {
            $t->id(); $t->foreignId('payroll_id')->constrained()->restrictOnDelete();
            $t->foreignId('employee_id')->constrained()->restrictOnDelete(); $t->json('snapshot');
            foreach (['base','overtime','bonus','commission','deductions','recovery','expense','net_pay'] as $c) $t->decimal($c,15,2)->default(0);
            $t->text('notes')->nullable(); $t->timestamps(); $t->unique(['payroll_id','employee_id']);
        });
        Schema::create('hr_transactions', function (Blueprint $t) {
            $t->id(); $t->string('number')->unique(); $t->foreignId('employee_id')->constrained()->restrictOnDelete();
            $t->foreignId('payroll_item_id')->nullable()->constrained()->restrictOnDelete();
            $t->foreignId('reverses_id')->nullable()->unique()->constrained('hr_transactions')->restrictOnDelete();
            $t->date('date'); $t->string('kind'); $t->string('method')->nullable(); $t->string('reference')->nullable();
            foreach (['expense','payable','advance','cash_out'] as $c) $t->decimal($c,15,2)->default(0);
            $t->text('notes'); $t->foreignId('created_by')->nullable()->constrained('users')->restrictOnDelete(); $t->timestamps();
            $t->index(['employee_id','date']);
        });
    }

    public function down(): void
    {
        foreach (['hr_transactions','payroll_items','payrolls','employee_leaves','hr_leave_types','employee_attendances','employee_salaries','employees','hr_designations','hr_departments'] as $table) Schema::dropIfExists($table);
    }
};
