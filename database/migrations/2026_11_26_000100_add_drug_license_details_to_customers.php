<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('customers', 'drug_license_expires_on')) {
            Schema::table('customers', fn (Blueprint $table) => $table->date('drug_license_expires_on')->nullable());
        }
        if (! Schema::hasColumn('customers', 'drug_license_path')) {
            Schema::table('customers', fn (Blueprint $table) => $table->string('drug_license_path')->nullable());
        }
    }

    public function down(): void
    {
        Schema::table('customers', fn (Blueprint $table) => $table->dropColumn(['drug_license_expires_on', 'drug_license_path']));
    }
};
