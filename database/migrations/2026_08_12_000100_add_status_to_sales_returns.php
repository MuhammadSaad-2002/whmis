<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('sales_returns', function (Blueprint $table) {
            // A sales return is 'posted' when made; 'cancelled' reverses the
            // stock restore + credit note. Cancelled returns are excluded from
            // the net position, returnable-capacity math, and reports.
            $table->string('status')->default('posted')->after('return_date');
            $table->timestamp('cancelled_at')->nullable()->after('reason');
            $table->foreignId('cancelled_by')->nullable()->after('cancelled_at')
                ->constrained('users')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('sales_returns', function (Blueprint $table) {
            $table->dropConstrainedForeignId('cancelled_by');
            $table->dropColumn(['status', 'cancelled_at']);
        });
    }
};
