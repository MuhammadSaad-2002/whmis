<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('booking_items', function (Blueprint $table) {
            // Aggregated Rs discount contributed by stacked incentive rules,
            // folded into the line discount alongside the manual discount_percent
            // (mirrors sales_invoice_items.incentive_discount).
            $table->decimal('incentive_discount', 15, 2)->default(0)->after('discount_amount');
        });

        // Per-line durable record of every incentive rule applied to a booking —
        // a copy of sales_invoice_item_incentives so bookings mirror the sales flow
        // and the stacked rules survive conversion to a sale.
        Schema::create('booking_item_incentives', function (Blueprint $table) {
            $table->id();
            $table->foreignId('booking_item_id')->constrained()->cascadeOnDelete();
            // Denormalised for reporting (who booked what, when) without extra joins.
            $table->foreignId('booking_id')->constrained()->cascadeOnDelete();
            $table->foreignId('customer_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('product_id')->constrained()->restrictOnDelete();
            // Pointer to the rule; nulled if the rule is later deleted (snapshot fields below persist).
            $table->foreignId('incentive_rule_id')->nullable()->constrained()->nullOnDelete();
            $table->string('rule_type');   // snapshot: qty_bonus|slab_bonus|percent_discount|fixed_discount|price_override
            $table->string('rule_name');   // snapshot of the rule name at pick time
            $table->decimal('bonus_qty', 12, 2)->default(0);
            $table->decimal('discount_amount', 15, 2)->default(0);
            $table->decimal('trade_price', 15, 2)->nullable(); // override price, price_override rules
            $table->decimal('value_given', 15, 2)->default(0); // Rs value of the incentive granted
            $table->unsignedInteger('sort_order')->default(0);
            $table->timestamps();

            // One incentive of a given type per line (bonuses sum across types, not within).
            $table->unique(['booking_item_id', 'rule_type']);
            $table->index(['booking_id']);
            $table->index(['customer_id', 'incentive_rule_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('booking_item_incentives');

        Schema::table('booking_items', function (Blueprint $table) {
            $table->dropColumn('incentive_discount');
        });
    }
};
