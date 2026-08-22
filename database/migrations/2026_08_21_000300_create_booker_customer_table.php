<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * customer ↔ booker many-to-many. A customer keeps a single "primary" booker
 * (customers.booker_id, used for sales-credit reporting) and, in addition, may
 * be assigned to several bookers here — all of whom can see/book that customer.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('booker_customer', function (Blueprint $table) {
            $table->id();
            $table->foreignId('customer_id')->constrained()->cascadeOnDelete();
            $table->foreignId('booker_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('assigned_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->unique(['customer_id', 'booker_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('booker_customer');
    }
};
