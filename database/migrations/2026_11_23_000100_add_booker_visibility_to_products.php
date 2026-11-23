<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('products', 'visible_to_bookers')) {
            Schema::table('products', fn (Blueprint $table) => $table->boolean('visible_to_bookers')->default(true));
        }
    }

    public function down(): void
    {
        Schema::table('products', fn (Blueprint $table) => $table->dropColumn('visible_to_bookers'));
    }
};
