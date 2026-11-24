<?php

use Illuminate\Database\Migrations\Migration;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;

return new class extends Migration
{
    public function up(): void
    {
        $role = Role::query()->where('name', 'Super Admin')->where('guard_name', 'web')->first();
        if (! $role) {
            // Fresh installations grant these permissions when provisioning the role.
            return;
        }

        $grants = [
            'distribution.reconcile', 'treasury.view', 'treasury.manage',
            'finance.review', 'finance.request', 'finance.approve', 'finance.post',
            'commission.manage', 'commission.waive',
        ];
        foreach ($grants as $grant) {
            Permission::query()->firstOrCreate(['name' => $grant, 'guard_name' => 'web']);
        }
        $role->givePermissionTo($grants);
        app(PermissionRegistrar::class)->forgetCachedPermissions();
    }

    public function down(): void
    {
        // Existing grants cannot be distinguished from grants restored on upgrade.
    }
};
