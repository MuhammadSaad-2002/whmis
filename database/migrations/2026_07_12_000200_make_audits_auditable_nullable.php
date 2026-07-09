<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Allow audits with no auditable model — needed for system/auth events such as
 * a failed login for an email that matches no user account.
 */
return new class extends Migration
{
    public function up(): void
    {
        $table = config('audit.drivers.database.table', 'audits');

        Schema::table($table, function (Blueprint $table) {
            $table->string('auditable_type')->nullable()->change();
            $table->unsignedBigInteger('auditable_id')->nullable()->change();
        });
    }

    public function down(): void
    {
        $table = config('audit.drivers.database.table', 'audits');

        Schema::table($table, function (Blueprint $table) {
            $table->string('auditable_type')->nullable(false)->change();
            $table->unsignedBigInteger('auditable_id')->nullable(false)->change();
        });
    }
};
