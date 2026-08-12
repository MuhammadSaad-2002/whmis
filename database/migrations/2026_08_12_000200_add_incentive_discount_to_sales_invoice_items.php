<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('sales_invoice_items', function (Blueprint $table) {
            // Aggregated Rs discount contributed by stacked incentive rules,
            // folded into the line discount alongside the manual discount_percent.
            $table->decimal('incentive_discount', 15, 2)->default(0)->after('discount_amount');
        });
    }

    public function down(): void
    {
        Schema::table('sales_invoice_items', function (Blueprint $table) {
            $table->dropColumn('incentive_discount');
        });
    }
};
