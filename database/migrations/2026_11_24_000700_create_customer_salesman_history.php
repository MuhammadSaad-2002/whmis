<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('customer_salesman_history', function (Blueprint $table) {
            $table->id();
            $table->foreignId('customer_id')->constrained()->restrictOnDelete();
            foreach (['previous_salesman', 'salesman', 'changed_by'] as $person) {
                // Snapshot identities even if a staff login is renamed or deleted.
                $table->unsignedBigInteger($person.'_id')->nullable();
                $table->string($person.'_name')->nullable();
            }
            $table->timestamp('changed_at');
            $table->index(['customer_id', 'id'], 'customer_salesman_history_lookup');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('customer_salesman_history');
    }
};
