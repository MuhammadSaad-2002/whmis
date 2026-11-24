<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('bookings', function (Blueprint $table) {
            $table->timestamp('remainder_closed_at')->nullable();
        });
        Schema::table('booking_items', function (Blueprint $table) {
            $table->decimal('cancelled_quantity', 12, 2)->default(0);
            $table->decimal('cancelled_bonus', 12, 2)->default(0);
        });
        Schema::create('booking_invoice_lines', function (Blueprint $table) {
            $table->id();
            $table->foreignId('booking_item_id')->constrained()->restrictOnDelete();
            $table->foreignId('sales_invoice_id')->constrained()->restrictOnDelete();
            $table->decimal('quantity', 12, 2);
            $table->decimal('bonus_quantity', 12, 2);
            $table->unique(['booking_item_id', 'sales_invoice_id'], 'booking_invoice_line_unique');
        });
        Schema::table('sales_invoices', function (Blueprint $table) {
            $table->foreignId('planned_salesman_id')->nullable()->constrained('users')->restrictOnDelete();
        });
        Schema::table('dispatches', function (Blueprint $table) {
            $table->boolean('custody_required')->default(false);
            $table->foreignId('original_assignee_id')->nullable()->constrained('users')->restrictOnDelete();
            $table->foreignId('custodian_id')->nullable()->constrained('users')->restrictOnDelete();
            $table->foreignId('handover_to_id')->nullable()->constrained('users')->restrictOnDelete();
            $table->timestamp('pickup_confirmed_at')->nullable();
        });
        Schema::create('sale_batch_allocations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('sales_invoice_item_id')->constrained()->restrictOnDelete();
            $table->foreignId('batch_id')->constrained()->restrictOnDelete();
            $table->decimal('quantity', 14, 2);
        });
        Schema::create('dispatch_pickup_lines', function (Blueprint $table) {
            $table->id();
            $table->foreignId('dispatch_event_id')->constrained()->restrictOnDelete();
            $table->foreignId('sale_batch_allocation_id')->constrained()->restrictOnDelete();
            $table->decimal('quantity', 14, 2);
            $table->unique(['dispatch_event_id', 'sale_batch_allocation_id'], 'dispatch_pickup_line_unique');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('dispatch_pickup_lines');
        Schema::dropIfExists('sale_batch_allocations');
        Schema::table('dispatches', function (Blueprint $table) {
            foreach (['original_assignee_id', 'custodian_id', 'handover_to_id'] as $column) {
                $table->dropConstrainedForeignId($column);
            }
            $table->dropColumn(['custody_required', 'pickup_confirmed_at']);
        });
        Schema::table('sales_invoices', fn (Blueprint $table) => $table->dropConstrainedForeignId('planned_salesman_id'));
        Schema::dropIfExists('booking_invoice_lines');
        Schema::table('booking_items', fn (Blueprint $table) => $table->dropColumn(['cancelled_quantity', 'cancelled_bonus']));
        Schema::table('bookings', fn (Blueprint $table) => $table->dropColumn('remainder_closed_at'));
    }
};
