<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        foreach (['bookings', 'sales_invoices', 'purchase_invoices'] as $table) {
            if (! Schema::hasColumn($table, 'rounding_amount')) {
                Schema::table($table, fn (Blueprint $t) => $t->decimal('rounding_amount', 5, 2)->nullable());
            }
        }
        Schema::table('payments', function (Blueprint $table) {
            foreach (['tendered_paisa', 'received_paisa'] as $column) {
                if (! Schema::hasColumn('payments', $column)) $table->unsignedBigInteger($column)->nullable();
            }
        });
    }

    public function down(): void
    {
        foreach (['bookings', 'sales_invoices', 'purchase_invoices'] as $table) {
            Schema::table($table, fn (Blueprint $t) => $t->dropColumn('rounding_amount'));
        }
        Schema::table('payments', fn (Blueprint $t) => $t->dropColumn(['tendered_paisa', 'received_paisa']));
    }
};
