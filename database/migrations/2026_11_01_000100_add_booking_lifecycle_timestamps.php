<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('bookings', function (Blueprint $table) {
            foreach (['last_edited_at', 'submitted_at', 'rejected_at', 'converted_at', 'cancelled_at'] as $column) {
                $table->timestamp($column)->nullable();
            }
        });
        // Historically approved_at also stored rejection time.
        DB::table('bookings')->where('status', 'rejected')->update(['rejected_at' => DB::raw('approved_at')]);
    }

    public function down(): void
    {
        Schema::table('bookings', fn (Blueprint $table) => $table->dropColumn([
            'last_edited_at', 'submitted_at', 'rejected_at', 'converted_at', 'cancelled_at',
        ]));
    }
};
