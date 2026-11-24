<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('treasury_control', function (Blueprint $t) {
            $t->id();
            $t->date('go_live_date')->nullable();
            $t->timestamp('locked_at')->nullable();
            $t->json('approval_limits')->nullable();
        });
        DB::table('treasury_control')->insert(['id' => 1]);
        Schema::create('financial_accounts', function (Blueprint $t) {
            $t->id();
            $t->string('name')->unique();
            $t->string('kind', 16);
            $t->foreignId('custodian_id')->nullable()->unique()->constrained('users')->restrictOnDelete();
            $t->boolean('active')->default(true);
            $t->unsignedBigInteger('opening_paisa')->default(0);
            $t->string('opening_reference')->nullable();
            $t->timestamps();
        });
        Schema::create('financial_account_users', function (Blueprint $t) {
            $t->foreignId('account_id')->constrained('financial_accounts')->restrictOnDelete();
            $t->foreignId('user_id')->constrained()->restrictOnDelete();
            $t->primary(['account_id', 'user_id']);
        });
        Schema::create('finance_work_items', function (Blueprint $t) {
            $t->id();
            $t->string('kind', 32);
            $t->string('status', 16)->default('pending');
            $t->uuid('request_key')->unique();
            $t->foreignId('created_by')->constrained('users')->restrictOnDelete();
            $t->foreignId('beneficiary_id')->nullable()->constrained('users')->restrictOnDelete();
            $t->foreignId('approved_by')->nullable()->constrained('users')->restrictOnDelete();
            $t->foreignId('posted_by')->nullable()->constrained('users')->restrictOnDelete();
            $t->timestamp('approved_at')->nullable();
            $t->timestamp('posted_at')->nullable();
            $t->unsignedBigInteger('amount_paisa')->default(0);
            $t->json('payload');
            $t->string('evidence_path')->nullable();
            $t->text('approval_note')->nullable();
            $t->timestamps();
            $t->index(['kind','status']);
        });
        Schema::create('treasury_entries', function (Blueprint $t) {
            $t->id();
            $t->foreignId('account_id')->constrained('financial_accounts')->restrictOnDelete();
            $t->string('kind', 32);
            $t->string('source_key')->unique();
            $t->string('source_type', 32);
            $t->unsignedBigInteger('source_id');
            $t->bigInteger('paisa');
            $t->date('business_date');
            $t->string('reference')->nullable();
            $t->foreignId('actor_id')->constrained('users')->restrictOnDelete();
            $t->foreignId('reverses_id')->nullable()->unique()->constrained('treasury_entries')->restrictOnDelete();
            $t->timestamp('created_at')->useCurrent();
            $t->index(['account_id', 'business_date', 'id'], 'treasury_account_date');
            $t->index(['source_type', 'source_id']);
        });
        Schema::create('collection_days', function (Blueprint $t) {
            $t->id();
            $t->foreignId('salesman_id')->constrained('users')->restrictOnDelete();
            $t->date('business_date');
            $t->unsignedInteger('revision')->default(1);
            $t->timestamp('submitted_at')->nullable();
            $t->timestamp('closed_at')->nullable();
            $t->foreignId('closed_by')->nullable()->constrained('users')->restrictOnDelete();
            $t->unsignedBigInteger('counted_cash_paisa')->nullable();
            $t->text('variance_note')->nullable();
            $t->timestamps();
            $t->unique(['salesman_id','business_date','revision'], 'collection_day_version');
        });
        Schema::create('delivery_collections', function (Blueprint $t) {
            $t->id();
            $t->foreignId('collection_day_id')->constrained()->restrictOnDelete();
            $t->foreignId('sales_invoice_id')->constrained()->restrictOnDelete();
            $t->foreignId('reporter_id')->constrained('users')->restrictOnDelete();
            $t->foreignId('dispatch_event_id')->nullable()->constrained()->restrictOnDelete();
            $t->uuid('request_key')->unique();
            $t->string('method', 12);
            $t->string('reference')->nullable();
            $t->unsignedBigInteger('reported_paisa');
            $t->unsignedBigInteger('previous_paid_paisa');
            $t->unsignedBigInteger('verified_paisa')->nullable();
            $t->unsignedBigInteger('shortage_paisa')->default(0);
            $t->foreignId('payment_id')->nullable()->unique()->constrained()->restrictOnDelete();
            $t->boolean('included_in_opening')->default(false);
            $t->foreignId('reviewer_id')->nullable()->constrained('users')->restrictOnDelete();
            $t->text('review_note')->nullable();
            $t->timestamp('recorded_at')->nullable();
            $t->timestamp('created_at')->useCurrent();
            $t->index(['sales_invoice_id', 'recorded_at']);
        });
        Schema::create('finance_work_events', function (Blueprint $t) {
            $t->id();
            $t->string('source_type', 32);
            $t->unsignedBigInteger('source_id');
            $t->string('action', 32);
            $t->foreignId('actor_id')->constrained('users')->restrictOnDelete();
            $t->json('data')->nullable();
            $t->timestamp('created_at')->useCurrent();
            $t->index(['source_type', 'source_id']);
        });
        Schema::table('purchase_invoices', fn (Blueprint $t) => $t->foreignId('financial_account_id')->nullable()->constrained()->restrictOnDelete());
    }

    public function down(): void
    {
        Schema::table('purchase_invoices', fn (Blueprint $t) => $t->dropConstrainedForeignId('financial_account_id'));
        foreach (['finance_work_events', 'delivery_collections', 'collection_days', 'treasury_entries', 'finance_work_items', 'financial_account_users', 'financial_accounts', 'treasury_control'] as $table) Schema::dropIfExists($table);
    }
};
