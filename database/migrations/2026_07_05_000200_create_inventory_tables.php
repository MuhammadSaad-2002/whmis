<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('number_series', function (Blueprint $table) {
            $table->id();
            $table->string('doc_type')->unique();
            $table->string('prefix');
            $table->unsignedBigInteger('next_number')->default(1);
            $table->unsignedTinyInteger('padding')->default(4);
            $table->boolean('yearly')->default(true);
            $table->timestamps();
        });

        Schema::create('batches', function (Blueprint $table) {
            $table->id();
            $table->foreignId('product_id')->constrained()->restrictOnDelete();
            $table->foreignId('warehouse_id')->constrained()->restrictOnDelete();
            $table->string('batch_number');
            $table->date('expiry_date')->nullable();
            $table->decimal('purchase_rate', 15, 4)->default(0);
            // net purchase amount / (purchased + bonus qty) — bonus-diluted unit cost
            $table->decimal('effective_cost', 15, 4)->default(0);
            $table->decimal('trade_price', 15, 2)->default(0);
            $table->decimal('retail_price', 15, 2)->default(0);
            $table->decimal('qty_purchased', 12, 2)->default(0);
            $table->decimal('qty_bonus', 12, 2)->default(0);
            $table->decimal('qty_sold', 12, 2)->default(0);
            $table->decimal('qty_reserved', 12, 2)->default(0);
            $table->decimal('qty_available', 12, 2)->default(0);
            $table->unsignedBigInteger('purchase_invoice_item_id')->nullable();
            $table->timestamps();

            $table->index(['product_id', 'warehouse_id', 'expiry_date']);
            $table->index('batch_number');
        });

        Schema::create('stock_movements', function (Blueprint $table) {
            $table->id();
            $table->foreignId('batch_id')->constrained()->restrictOnDelete();
            $table->foreignId('product_id')->constrained()->restrictOnDelete();
            $table->foreignId('warehouse_id')->constrained()->restrictOnDelete();
            $table->string('type'); // purchase, sale, sale_return, purchase_return, adjustment_in, adjustment_out, transfer_in, transfer_out, damage, expired
            $table->decimal('quantity', 12, 2); // signed: + in, - out
            $table->decimal('unit_cost', 15, 4)->default(0);
            $table->nullableMorphs('reference');
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('remarks')->nullable();
            $table->timestamps();

            $table->index(['product_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('stock_movements');
        Schema::dropIfExists('batches');
        Schema::dropIfExists('number_series');
    }
};
