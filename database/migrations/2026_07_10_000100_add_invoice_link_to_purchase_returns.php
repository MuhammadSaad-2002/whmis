<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('purchase_returns', function (Blueprint $table) {
            $table->foreignId('purchase_invoice_id')->nullable()->after('company_id')
                ->constrained()->restrictOnDelete();
        });

        Schema::table('purchase_return_items', function (Blueprint $table) {
            $table->foreignId('purchase_invoice_item_id')->nullable()->after('purchase_return_id')
                ->constrained()->restrictOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('purchase_return_items', function (Blueprint $table) {
            $table->dropConstrainedForeignId('purchase_invoice_item_id');
        });

        Schema::table('purchase_returns', function (Blueprint $table) {
            $table->dropConstrainedForeignId('purchase_invoice_id');
        });
    }
};
