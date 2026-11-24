<?php

use Illuminate\Database\Migrations\Migration;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;

return new class extends Migration
{
    public function up(): void
    {
        // A manual SQL import may have created the permission while Spatie's cache is stale.
        $permission = Permission::query()->firstOrCreate(['name' => 'global-search.use', 'guard_name' => 'web']);

        Role::query()->where('guard_name', 'web')->whereIn('name', ['Super Admin', 'Admin'])
            ->each(fn (Role $role) => $role->givePermissionTo($permission));
    }

    public function down(): void
    {
        Permission::query()->where('name', 'global-search.use')->where('guard_name', 'web')->first()?->delete();
    }
};
