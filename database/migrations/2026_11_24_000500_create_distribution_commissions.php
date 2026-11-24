<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('commission_rules', function (Blueprint $t) {
            $t->id();
            $t->string('scope', 48);
            $t->string('role', 12);
            $t->string('source', 12);
            $t->date('effective_from');
            $t->string('mode', 16);
            $t->string('basis', 16);
            $t->unsignedBigInteger('rate');
            $t->unsignedSmallInteger('dispatch_share_bp')->default(0);
            $t->foreignId('created_by')->constrained('users')->restrictOnDelete();
            $t->timestamps();
            $t->unique(['scope','role','source','effective_from'], 'commission_rule_version');
        });
        Schema::create('commission_scopes', function (Blueprint $t) {
            $t->id();
            $t->string('source_key')->unique();
            $t->foreignId('booking_id')->nullable()->constrained()->restrictOnDelete();
            $t->foreignId('booker_id')->nullable()->constrained('users')->restrictOnDelete();
            $t->foreignId('original_salesman_id')->nullable()->constrained('users')->restrictOnDelete();
            $t->json('rules');
            $t->json('snapshots');
            $t->unsignedBigInteger('original_paisa');
            $t->timestamps();
        });
        Schema::create('commission_awards', function (Blueprint $t) {
            $t->id();
            $t->foreignId('commission_scope_id')->constrained()->restrictOnDelete();
            $t->foreignId('sales_invoice_id')->constrained()->restrictOnDelete();
            $t->foreignId('employee_id')->constrained()->restrictOnDelete();
            $t->string('role', 12);
            $t->unsignedBigInteger('calculated_paisa')->default(0);
            $t->unsignedBigInteger('accrued_paisa')->default(0);
            $t->unsignedBigInteger('earned_paisa')->default(0);
            $t->string('state', 24);
            $t->timestamps();
            $t->unique(['sales_invoice_id','employee_id','role'], 'commission_invoice_employee_role');
        });
        Schema::create('commission_entries', function (Blueprint $t) {
            $t->id();
            $t->foreignId('employee_id')->constrained()->restrictOnDelete();
            $t->foreignId('commission_award_id')->nullable()->constrained()->restrictOnDelete();
            $t->foreignId('finance_work_item_id')->nullable()->constrained()->restrictOnDelete();
            $t->string('kind', 24);
            $t->bigInteger('expense_paisa')->default(0);
            $t->bigInteger('payable_paisa')->default(0);
            $t->bigInteger('recovery_paisa')->default(0);
            $t->bigInteger('cash_out_paisa')->default(0);
            $t->date('business_date');
            $t->foreignId('actor_id')->nullable()->constrained('users')->restrictOnDelete();
            $t->string('reason', 255);
            $t->timestamp('created_at')->useCurrent();
            $t->index(['employee_id','business_date']);
        });
        Schema::create('commission_employee_controls', function (Blueprint $t) {
            $t->foreignId('employee_id')->primary()->constrained()->restrictOnDelete();
            $t->boolean('hold_recovery')->default(false);
        });
    }

    public function down(): void
    {
        foreach (['commission_employee_controls','commission_entries','commission_awards','commission_scopes','commission_rules'] as $table) Schema::dropIfExists($table);
    }
};
