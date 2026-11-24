<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Spatie\Permission\Models\{Permission, Role};
use Spatie\Permission\PermissionRegistrar;

class DistributionPermissionSeeder extends Seeder
{
    public const PERMISSIONS = ['dispatch.view', 'dispatch.manage', 'dispatch.plan', 'collections.view', 'collections.manage', 'system.health'];
    public const FINANCE_PERMISSIONS = ['distribution.reconcile', 'treasury.view', 'treasury.manage', 'finance.review', 'finance.request', 'finance.approve', 'finance.post'];

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
        foreach (self::FINANCE_PERMISSIONS as $permission) Permission::findOrCreate($permission, 'web');
        Role::findOrCreate('Super Admin', 'web')->givePermissionTo(self::FINANCE_PERMISSIONS);
        Role::findOrCreate('Admin', 'web')->givePermissionTo(['distribution.reconcile', 'treasury.view', 'treasury.manage', 'finance.review', 'finance.request', 'finance.post']);
        Role::findOrCreate('Accountant', 'web')->givePermissionTo(['distribution.reconcile', 'treasury.view', 'finance.review', 'finance.request', 'finance.post']);
        foreach (['commission.self','commission.manage','commission.waive'] as $permission) Permission::findOrCreate($permission, 'web');
        foreach (['Booker','Salesman'] as $role) Role::findOrCreate($role, 'web')->givePermissionTo('commission.self');
        foreach (['Super Admin','Admin'] as $role) Role::findOrCreate($role, 'web')->givePermissionTo(['commission.self','commission.manage']);
        Role::findOrCreate('Super Admin', 'web')->givePermissionTo('commission.waive');
        app(PermissionRegistrar::class)->forgetCachedPermissions();
    }
}
