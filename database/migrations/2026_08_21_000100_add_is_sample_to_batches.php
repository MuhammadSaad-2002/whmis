<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('batches', function (Blueprint $table) {
            // Free-sample stock is segregated from purchased stock: normal sales
            // never touch it, and it leaves only via a Sample Issue.
            $table->boolean('is_sample')->default(false)->after('warehouse_id');
            $table->index(['product_id', 'warehouse_id', 'is_sample']);
        });
    }

    public function down(): void
    {
        Schema::table('batches', function (Blueprint $table) {
            $table->dropIndex(['product_id', 'warehouse_id', 'is_sample']);
            $table->dropColumn('is_sample');
        });
    }
};
