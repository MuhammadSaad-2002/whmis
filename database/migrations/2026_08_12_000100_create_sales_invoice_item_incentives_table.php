<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('sales_invoice_item_incentives', function (Blueprint $table) {
            $table->id();
            $table->foreignId('sales_invoice_item_id')->constrained()->cascadeOnDelete();
            // Denormalised for reporting (who got what, when) without extra joins.
            $table->foreignId('sales_invoice_id')->constrained()->cascadeOnDelete();
            $table->foreignId('customer_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('product_id')->constrained()->restrictOnDelete();
            // Pointer to the rule; nulled if the rule is later deleted (snapshot fields below persist).
            $table->foreignId('incentive_rule_id')->nullable()->constrained()->nullOnDelete();
            $table->string('rule_type');   // snapshot: qty_bonus|slab_bonus|percent_discount|fixed_discount|price_override
            $table->string('rule_name');   // snapshot of the rule name at issue time
            $table->decimal('bonus_qty', 12, 2)->default(0);
            $table->decimal('discount_amount', 15, 2)->default(0);
            $table->decimal('trade_price', 15, 2)->nullable(); // override price, price_override rules
            $table->decimal('value_given', 15, 2)->default(0); // Rs value of the incentive granted
            $table->unsignedInteger('sort_order')->default(0);
            $table->timestamps();

            // One incentive of a given type per line (bonuses sum across types, not within).
            $table->unique(['sales_invoice_item_id', 'rule_type']);
            $table->index(['sales_invoice_id']);
            $table->index(['customer_id', 'incentive_rule_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('sales_invoice_item_incentives');
    }
};
