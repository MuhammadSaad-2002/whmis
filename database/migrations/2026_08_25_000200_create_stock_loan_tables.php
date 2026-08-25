<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Stock temporarily received from (direction = in) or handed to
        // (direction = out) a supplier/partner. Carries NO money: no ledger,
        // no receivable, no revenue. Only physical stock moves, kept apart from
        // sellable inventory. Mirrors the samples module.
        Schema::create('stock_loans', function (Blueprint $table) {
            $table->id();
            $table->string('loan_number')->unique();
            $table->boolean('manual_number')->default(false);
            $table->string('direction'); // in | out
            $table->foreignId('company_id')->constrained()->restrictOnDelete();
            $table->foreignId('warehouse_id')->constrained()->restrictOnDelete();
            $table->date('loan_date');
            // pending | loaned | partially_returned | returned | closed | cancelled
            $table->string('status')->default('pending');

            // People involved — all optional links to system users.
            $table->foreignId('requested_by_id')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('received_by_id')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('request_received_by_id')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('handed_over_by_id')->nullable()->constrained('users')->nullOnDelete();

            $table->decimal('total_quantity', 12, 2)->default(0);
            $table->decimal('returned_quantity', 12, 2)->default(0);
            $table->text('notes')->nullable();
            $table->timestamp('posted_at')->nullable();
            $table->foreignId('posted_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('closed_at')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index(['company_id', 'loan_date']);
            $table->index(['direction', 'status']);
        });

        Schema::create('stock_loan_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('stock_loan_id')->constrained()->cascadeOnDelete();
            $table->foreignId('product_id')->constrained()->restrictOnDelete();
            $table->foreignId('batch_id')->nullable()->constrained()->nullOnDelete();
            $table->string('batch_number')->nullable(); // captured for loan-in
            $table->date('expiry_date')->nullable();     // captured for loan-in
            $table->decimal('quantity', 12, 2);
            $table->decimal('returned_quantity', 12, 2)->default(0);
            $table->string('remarks')->nullable();
            $table->unsignedInteger('sort_order')->default(0);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('stock_loan_items');
        Schema::dropIfExists('stock_loans');
    }
};
