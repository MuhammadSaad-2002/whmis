<?php

use Illuminate\Database\Migrations\Migration;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;

return new class extends Migration
{
    public function up(): void
    {
        $permission = Permission::findOrCreate('global-search.use', 'web');

        Role::query()->where('guard_name', 'web')->whereIn('name', ['Super Admin', 'Admin'])
            ->each(fn (Role $role) => $role->givePermissionTo($permission));
    }

    public function down(): void
    {
        Permission::query()->where('name', 'global-search.use')->where('guard_name', 'web')->first()?->delete();
    }
};
