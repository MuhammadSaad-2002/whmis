<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Spatie\Permission\Models\{Permission, Role};
use Spatie\Permission\PermissionRegistrar;

class DistributionPermissionSeeder extends Seeder
{
    public const PERMISSIONS = ['dispatch.view', 'dispatch.manage', 'dispatch.plan', 'collections.view', 'collections.manage', 'system.health'];

    public function run(): void
    {
        foreach (self::PERMISSIONS as $permission) Permission::findOrCreate($permission, 'web');
        Permission::findOrCreate('bookers.assign', 'web');
        Permission::findOrCreate('dispatch.assigned', 'web');
        Role::findOrCreate('Salesman', 'web')->givePermissionTo('dispatch.assigned');
        foreach (['Super Admin', 'Admin'] as $role) Role::findOrCreate($role, 'web')->givePermissionTo(self::PERMISSIONS);
        foreach (['Super Admin', 'Admin'] as $role) Role::findOrCreate($role, 'web')->givePermissionTo('bookers.assign');
        Role::findOrCreate('Warehouse Staff', 'web')->givePermissionTo(['dispatch.view', 'dispatch.manage']);
        Role::findOrCreate('Accountant', 'web')->givePermissionTo(['dispatch.view', 'collections.view', 'collections.manage']);
        app(PermissionRegistrar::class)->forgetCachedPermissions();
    }
}
