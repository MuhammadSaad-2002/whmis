<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('customer_delivery_schedules', function (Blueprint $table) {
            $table->id();
            $table->foreignId('customer_id')->unique()->constrained()->restrictOnDelete();
            $table->foreignId('salesman_id')->nullable()->constrained('users')->nullOnDelete();
            $table->json('booking_days');
            $table->json('delivery_days');
            $table->timestamp('delivery_enabled_at')->nullable();
            $table->timestamps();
        });

        Schema::table('dispatches', function (Blueprint $table) {
            $table->date('planned_date')->nullable()->index('dispatches_planned_date_index');
        });
    }

    public function down(): void
    {
        Schema::table('dispatches', function (Blueprint $table) {
            $table->dropIndex('dispatches_planned_date_index');
            $table->dropColumn('planned_date');
        });
        Schema::dropIfExists('customer_delivery_schedules');
    }
};
