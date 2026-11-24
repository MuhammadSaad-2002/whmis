<?php

use Illuminate\Database\Migrations\Migration;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;

return new class extends Migration
{
    public function up(): void
    {
        Role::query()->where('guard_name', 'web')->whereIn('name', ['Booker', 'Salesman'])
            ->each(fn (Role $role) => $role->revokePermissionTo(['commission.self', 'commission.manage', 'commission.waive']));

        app(PermissionRegistrar::class)->forgetCachedPermissions();
    }

    public function down(): void
    {
        // Do not restore sensitive grants: the prior role assignments are unknown.
    }
};
