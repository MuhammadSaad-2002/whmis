<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Append-only audit of every customer↔booker assignment change (mirrors the
 * stock_movements / ledger_entries pattern). Pivot sync() fires no model
 * events, so these rows are written explicitly by the controller — this is the
 * durable "who assigned whom, when, by whom" trail the admin audits.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('booker_assignment_logs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('customer_id')->constrained()->cascadeOnDelete();
            $table->foreignId('booker_id')->constrained('users')->cascadeOnDelete();
            $table->string('action'); // assigned | unassigned
            $table->foreignId('changed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->string('note')->nullable();
            $table->timestamp('created_at')->nullable();

            $table->index(['customer_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('booker_assignment_logs');
    }
};
