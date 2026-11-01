<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Spatie\Permission\Models\{Permission, Role};
use Spatie\Permission\PermissionRegistrar;

class HrPermissionSeeder extends Seeder
{
    public const PERMISSIONS = ['employees.view','employees.manage','hr.settings.manage','hr.attendance.view','hr.attendance.manage','hr.leave.view','hr.leave.manage','hr.leave.approve','hr.payroll.view','hr.payroll.manage','hr.payroll.approve','hr.payroll.post','hr.payroll.pay','hr.payroll.cancel','hr.reports.view','hr.self.view'];

    public function run(): void
    {
        foreach (self::PERMISSIONS as $p) Permission::findOrCreate($p,'web');
        foreach (['Super Admin','Admin'] as $name) Role::findOrCreate($name,'web')->givePermissionTo(self::PERMISSIONS);
        Role::findOrCreate('HR Manager','web')->givePermissionTo([...self::PERMISSIONS,'reports.view']);
        Role::findOrCreate('Accountant','web')->givePermissionTo(['employees.view','hr.payroll.view','hr.payroll.manage','hr.payroll.post','hr.payroll.pay','hr.reports.view','hr.self.view']);
        foreach (['Booker','Warehouse Staff'] as $name) Role::findOrCreate($name,'web')->givePermissionTo('hr.self.view');
        app(PermissionRegistrar::class)->forgetCachedPermissions();
    }
}
