<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Customer ledger: debit = receivable up (sale), credit = receivable down (receipt).
        // Supplier ledger: credit = payable up (purchase), debit = payable down (payment).
        Schema::create('ledger_entries', function (Blueprint $table) {
            $table->id();
            $table->morphs('party'); // Customer | Company
            $table->date('entry_date');
            $table->string('entry_type'); // opening, sale, purchase, receipt, payment, credit_note, debit_note, adjustment
            $table->nullableMorphs('reference');
            $table->decimal('debit', 15, 2)->default(0);
            $table->decimal('credit', 15, 2)->default(0);
            $table->string('description')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index(['party_type', 'party_id', 'entry_date']);
        });

        Schema::create('payments', function (Blueprint $table) {
            $table->id();
            $table->string('payment_number')->unique();
            $table->morphs('party'); // Customer | Company
            $table->string('direction'); // in (receipt) | out (payment)
            $table->string('method'); // cash, bank, cheque, online, adjustment
            $table->decimal('amount', 15, 2);
            $table->date('payment_date');
            $table->string('bank_name')->nullable();
            $table->string('cheque_number')->nullable();
            $table->date('cheque_date')->nullable();
            $table->string('reference_no')->nullable();
            $table->string('status')->default('completed'); // completed | pending | bounced | cancelled
            $table->text('notes')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index(['party_type', 'party_id', 'payment_date']);
        });

        Schema::create('payment_allocations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('payment_id')->constrained()->cascadeOnDelete();
            $table->morphs('invoice'); // SalesInvoice | PurchaseInvoice
            $table->decimal('amount', 15, 2);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('payment_allocations');
        Schema::dropIfExists('payments');
        Schema::dropIfExists('ledger_entries');
    }
};
