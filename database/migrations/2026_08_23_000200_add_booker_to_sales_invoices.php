<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('sales_invoices', function (Blueprint $table) {
            // Optional booker credited with the sale (admin/manager may set it when
            // entering an order on a field booker's behalf). Pure header reference —
            // never enters money/stock math.
            $table->foreignId('booker_id')->nullable()->after('customer_id')
                ->constrained('users')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('sales_invoices', function (Blueprint $table) {
            $table->dropConstrainedForeignId('booker_id');
        });
    }
};
