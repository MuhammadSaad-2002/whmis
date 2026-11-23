<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('sales_return_items', 'bonus_quantity')) {
            Schema::table('sales_return_items', function (Blueprint $table) {
                $table->decimal('bonus_quantity', 12, 2)->default(0);
            });
        }
    }

    public function down(): void
    {
        Schema::table('sales_return_items', function (Blueprint $table) {
            $table->dropColumn('bonus_quantity');
        });
    }
};
