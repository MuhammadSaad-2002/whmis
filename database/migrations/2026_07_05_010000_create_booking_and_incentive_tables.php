<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('bookings', function (Blueprint $table) {
            $table->id();
            $table->string('booking_number')->unique();
            $table->foreignId('customer_id')->constrained()->restrictOnDelete();
            $table->foreignId('booker_id')->constrained('users')->restrictOnDelete();
            $table->foreignId('warehouse_id')->constrained()->restrictOnDelete();
            $table->date('booking_date');
            $table->string('status')->default('draft'); // draft|pending|approved|converted|rejected|cancelled
            $table->decimal('subtotal', 15, 2)->default(0);
            $table->decimal('item_discount_total', 15, 2)->default(0);
            $table->decimal('item_gst_total', 15, 2)->default(0);
            $table->decimal('total_amount', 15, 2)->default(0);
            $table->text('notes')->nullable();
            $table->foreignId('sales_invoice_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('approved_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('approved_at')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index(['customer_id', 'booking_date']);
            $table->index(['booker_id', 'status']);
        });

        Schema::create('booking_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('booking_id')->constrained()->cascadeOnDelete();
            $table->foreignId('product_id')->constrained()->restrictOnDelete();
            $table->decimal('quantity', 12, 2);
            $table->decimal('requested_bonus', 12, 2)->default(0);
            $table->unsignedBigInteger('applied_rule_id')->nullable();
            $table->decimal('trade_price', 15, 2)->default(0);
            $table->decimal('discount_percent', 5, 2)->default(0);
            $table->decimal('discount_amount', 15, 2)->default(0);
            $table->decimal('gst_percent', 5, 2)->default(0);
            $table->decimal('gst_amount', 15, 2)->default(0);
            $table->decimal('net_amount', 15, 2)->default(0);
            $table->string('remarks')->nullable();
            $table->unsignedInteger('sort_order')->default(0);
            $table->timestamps();
        });

        Schema::create('incentive_rules', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('rule_type'); // qty_bonus | slab_bonus | percent_discount | fixed_discount | price_override
            $table->foreignId('product_id')->nullable()->constrained()->cascadeOnDelete();
            $table->foreignId('company_id')->nullable()->constrained()->cascadeOnDelete();
            $table->foreignId('customer_id')->nullable()->constrained()->cascadeOnDelete();
            $table->decimal('base_qty', 12, 2)->nullable();  // qty_bonus: "buy base_qty"
            $table->decimal('bonus_qty', 12, 2)->nullable(); // qty_bonus: "get bonus_qty"
            $table->json('slabs')->nullable();               // slab_bonus: [{min_qty, max_qty|null, bonus_qty}]
            $table->decimal('value', 15, 2)->nullable();     // percent / fixed Rs / override price
            $table->decimal('min_qty', 12, 2)->nullable();
            $table->date('date_from')->nullable();
            $table->date('date_to')->nullable();
            $table->integer('priority')->default(0);
            $table->boolean('active')->default(true);
            $table->timestamps();

            $table->index(['active', 'product_id']);
        });

        Schema::table('customers', function (Blueprint $table) {
            $table->foreignId('booker_id')->nullable()->after('credit_days')
                ->constrained('users')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('customers', function (Blueprint $table) {
            $table->dropConstrainedForeignId('booker_id');
        });
        Schema::dropIfExists('incentive_rules');
        Schema::dropIfExists('booking_items');
        Schema::dropIfExists('bookings');
    }
};
