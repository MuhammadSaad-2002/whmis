<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('batches', function (Blueprint $table) {
            // Loaned-in stock is segregated from purchased AND sample stock: normal
            // sales and sample issues never touch it, and it leaves only via a
            // Stock Loan return. Owned by the lender, so it is stocked at zero cost.
            $table->boolean('is_loan')->default(false)->after('is_sample');
            $table->index(['product_id', 'warehouse_id', 'is_loan']);
        });
    }

    public function down(): void
    {
        Schema::table('batches', function (Blueprint $table) {
            $table->dropIndex(['product_id', 'warehouse_id', 'is_loan']);
            $table->dropColumn('is_loan');
        });
    }
};
