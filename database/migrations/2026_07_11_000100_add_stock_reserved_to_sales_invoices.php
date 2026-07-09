<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('sales_invoices', function (Blueprint $table) {
            // True while a draft holds a batch reservation (stock moved from
            // qty_available to qty_reserved). Cleared on post / delete / cancel.
            $table->boolean('stock_reserved')->default(false)->after('status');
        });
    }

    public function down(): void
    {
        Schema::table('sales_invoices', function (Blueprint $table) {
            $table->dropColumn('stock_reserved');
        });
    }
};
