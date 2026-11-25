<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('sales_invoices', 'mp_inv_ref')) {
            Schema::table('sales_invoices', fn (Blueprint $table) => $table->string('mp_inv_ref', 64)->nullable());
        }
    }

    public function down(): void
    {
        Schema::table('sales_invoices', fn (Blueprint $table) => $table->dropColumn('mp_inv_ref'));
    }
};
