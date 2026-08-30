<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('stock_loans', function (Blueprint $table) {
            $table->string('external_requested_by')->nullable()->after('received_by_id');
            $table->string('external_received_by')->nullable()->after('external_requested_by');
        });
    }

    public function down(): void
    {
        Schema::table('stock_loans', function (Blueprint $table) {
            $table->dropColumn(['external_requested_by', 'external_received_by']);
        });
    }
};
