<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Samples received free-of-charge from a supplier. They stock in like a
        // purchase but at zero cost (effective_cost = 0), so they never inflate COGS.
        Schema::create('sample_receipts', function (Blueprint $table) {
            $table->id();
            $table->string('receipt_number')->unique();
            $table->boolean('manual_number')->default(false);
            $table->foreignId('company_id')->constrained()->restrictOnDelete();
            $table->foreignId('warehouse_id')->constrained()->restrictOnDelete();
            $table->date('receipt_date');
            $table->string('status')->default('draft'); // draft | posted | cancelled
            $table->decimal('total_quantity', 12, 2)->default(0);
            $table->text('notes')->nullable();
            $table->timestamp('posted_at')->nullable();
            $table->foreignId('posted_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index(['company_id', 'receipt_date']);
            $table->index('status');
        });

        Schema::create('sample_receipt_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('sample_receipt_id')->constrained()->cascadeOnDelete();
            $table->foreignId('product_id')->constrained()->restrictOnDelete();
            $table->string('batch_number')->nullable();
            $table->date('expiry_date')->nullable();
            $table->decimal('quantity', 12, 2);
            $table->foreignId('batch_id')->nullable()->constrained()->nullOnDelete();
            $table->string('remarks')->nullable();
            $table->unsignedInteger('sort_order')->default(0);
            $table->timestamps();
        });

        // Products given free to a customer. No charge, no receivable: revenue is
        // always zero. Sample-origin stock is consumed first, then normal stock.
        Schema::create('sample_issues', function (Blueprint $table) {
            $table->id();
            $table->string('issue_number')->unique();
            $table->boolean('manual_number')->default(false);
            $table->foreignId('customer_id')->constrained()->restrictOnDelete();
            $table->foreignId('warehouse_id')->constrained()->restrictOnDelete();
            $table->date('issue_date');
            $table->string('recipient_name')->nullable();       // free-text doctor / recipient
            $table->string('representative_name')->nullable();  // free-text rep who delivered
            $table->string('status')->default('draft'); // draft | posted | cancelled
            $table->decimal('total_quantity', 12, 2)->default(0);
            $table->decimal('total_cost', 15, 2)->default(0);
            $table->text('notes')->nullable();
            $table->timestamp('posted_at')->nullable();
            $table->foreignId('posted_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index(['customer_id', 'issue_date']);
            $table->index('status');
        });

        Schema::create('sample_issue_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('sample_issue_id')->constrained()->cascadeOnDelete();
            $table->foreignId('product_id')->constrained()->restrictOnDelete();
            $table->foreignId('batch_id')->nullable()->constrained()->nullOnDelete(); // null = auto sample-first FIFO
            $table->decimal('quantity', 12, 2);
            $table->decimal('cost_amount', 15, 4)->default(0); // COGS of consumed stock (0 for sample-origin)
            $table->string('remarks')->nullable();
            $table->unsignedInteger('sort_order')->default(0);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('sample_issue_items');
        Schema::dropIfExists('sample_issues');
        Schema::dropIfExists('sample_receipt_items');
        Schema::dropIfExists('sample_receipts');
    }
};
