<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Software licensing: each row is one activation key the Super Admin (the
 * vendor) issues to unlock the system for a period. The effective system
 * expiry is MAX(expires_at) across all rows, so activating a new key simply
 * appends a further-out expiry — there is no "active" flag to maintain, and
 * the table doubles as the who-activated-what-when audit trail.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('licenses', function (Blueprint $table) {
            $table->id();
            $table->string('key')->unique();
            $table->timestamp('expires_at');
            $table->timestamp('activated_at');
            $table->foreignId('activated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->string('notes')->nullable();
            $table->timestamps();

            $table->index('expires_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('licenses');
    }
};
