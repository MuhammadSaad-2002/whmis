<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;

class RolePermissionSeeder extends Seeder
{
    public function run(): void
    {
        app(PermissionRegistrar::class)->forgetCachedPermissions();

        $permissions = [
            'suppliers.view', 'suppliers.manage',
            'categories.view', 'categories.manage',
            'products.view', 'products.manage',
            'customers.view', 'customers.manage',
            'purchases.view', 'purchases.create', 'purchases.post', 'purchases.cancel',
            'sales.view', 'sales.create', 'sales.post', 'sales.cancel',
            'bookings.view', 'bookings.create', 'bookings.approve', 'bookings.convert',
            'incentives.view', 'incentives.manage',
            'returns.view', 'returns.manage',
            'inventory.view', 'inventory.adjust',
            'payments.view', 'payments.manage',
            'ledger.view',
            'reports.view',
            'dashboard.view',
            'users.manage',
            'roles.manage',
            'audit.view',
            'settings.manage',
        ];

        foreach ($permissions as $permission) {
            Permission::findOrCreate($permission);
        }

        $roles = [
            'Super Admin' => $permissions,
            'Admin' => [
                'suppliers.view', 'suppliers.manage',
                'categories.view', 'categories.manage',
                'products.view', 'products.manage',
                'customers.view', 'customers.manage',
                'purchases.view', 'purchases.create', 'purchases.post', 'purchases.cancel',
                'sales.view', 'sales.create', 'sales.post', 'sales.cancel',
                'bookings.view', 'bookings.create', 'bookings.approve', 'bookings.convert',
                'incentives.view',
                'returns.view', 'returns.manage',
                'inventory.view', 'inventory.adjust',
                'payments.view', 'payments.manage',
                'ledger.view', 'reports.view', 'dashboard.view',
                'audit.view',
            ],
            'Booker' => [
                'customers.view', 'products.view',
                'bookings.view', 'bookings.create',
                'dashboard.view',
            ],
            'Accountant' => [
                'ledger.view', 'payments.view', 'payments.manage',
                'reports.view', 'dashboard.view',
                'sales.view', 'purchases.view', 'bookings.view', 'returns.view',
                'customers.view', 'suppliers.view',
            ],
            'Warehouse Staff' => [
                'inventory.view', 'inventory.adjust', 'products.view',
                'purchases.view', 'sales.view', 'dashboard.view',
            ],
        ];

        foreach ($roles as $roleName => $rolePermissions) {
            $role = Role::findOrCreate($roleName);
            $role->syncPermissions($rolePermissions);
        }

        $admin = User::firstOrCreate(
            ['email' => 'admin@whmis.local'],
            ['name' => 'Super Admin', 'password' => 'password', 'email_verified_at' => now()]
        );
        $admin->assignRole('Super Admin');
    }
}
