<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('booker_visits', function (Blueprint $table) {
            $table->id();
            $table->foreignId('booker_id')->constrained('users')->restrictOnDelete();
            $table->foreignId('customer_id')->constrained()->restrictOnDelete();
            $table->date('visit_date');
            $table->string('outcome')->default('planned');
            $table->text('notes')->nullable();
            $table->timestamps();
            $table->unique(['booker_id', 'customer_id', 'visit_date']);
        });
        Schema::create('dispatches', function (Blueprint $table) {
            $table->id();
            $table->foreignId('sales_invoice_id')->unique()->constrained()->restrictOnDelete();
            $table->foreignId('assigned_to')->nullable()->constrained('users')->restrictOnDelete();
            $table->string('status')->default('pending');
            $table->timestamps();
        });
        Schema::create('dispatch_events', function (Blueprint $table) {
            $table->id();
            $table->foreignId('dispatch_id')->constrained()->restrictOnDelete();
            $table->string('action');
            $table->uuid('request_key')->unique();
            $table->foreignId('assigned_to')->nullable()->constrained('users')->restrictOnDelete();
            $table->string('receiver_name')->nullable();
            $table->text('notes')->nullable();
            $table->foreignId('created_by')->constrained('users')->restrictOnDelete();
            $table->timestamp('created_at')->useCurrent();
        });
        Schema::create('dispatch_event_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('dispatch_event_id')->constrained()->restrictOnDelete();
            $table->foreignId('sales_invoice_item_id')->constrained()->restrictOnDelete();
            $table->decimal('quantity', 14, 2);
            $table->unique(['dispatch_event_id', 'sales_invoice_item_id'], 'dispatch_event_line_unique');
        });
        Schema::create('collection_follow_ups', function (Blueprint $table) {
            $table->id();
            $table->foreignId('sales_invoice_id')->constrained()->restrictOnDelete();
            $table->foreignId('assigned_to')->nullable()->constrained('users')->restrictOnDelete();
            $table->string('outcome');
            $table->date('promised_date')->nullable();
            $table->decimal('promised_amount', 14, 2)->nullable();
            $table->date('next_follow_up');
            $table->text('notes');
            $table->foreignId('created_by')->constrained('users')->restrictOnDelete();
            $table->timestamp('created_at')->useCurrent();
            $table->index(['sales_invoice_id', 'id']);
        });
    }

    public function down(): void
    {
        foreach (['collection_follow_ups', 'dispatch_event_items', 'dispatch_events', 'dispatches', 'booker_visits'] as $table) {
            Schema::dropIfExists($table);
        }
    }
};
