<?php

namespace Tests\Feature;

use App\Models\Role;
use App\Models\User;
use Database\Seeders\RolePermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class RoleManagementTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolePermissionSeeder::class);

        $admin = User::factory()->create();
        $admin->assignRole('Super Admin');
        $this->actingAs($admin);
    }

    public function test_roles_page_requires_roles_manage(): void
    {
        $this->actingAs(User::factory()->create());
        $this->get('/roles')->assertForbidden();
    }

    public function test_can_create_a_role_with_permissions(): void
    {
        $this->post('/roles', [
            'name' => 'Cashier',
            'permissions' => ['payments.view', 'payments.manage'],
        ])->assertRedirect();

        $role = Role::findByName('Cashier');
        $this->assertTrue($role->hasPermissionTo('payments.view'));
        $this->assertTrue($role->hasPermissionTo('payments.manage'));
    }

    public function test_syncing_permissions_writes_an_audit(): void
    {
        $this->post('/roles', [
            'name' => 'Cashier',
            'permissions' => ['payments.view'],
        ]);

        $role = Role::findByName('Cashier');
        $this->assertDatabaseHas('audits', [
            'auditable_type' => 'role',
            'auditable_id' => $role->id,
            'event' => 'permissions_synced',
        ]);
    }

    public function test_super_admin_role_cannot_be_deleted(): void
    {
        $role = Role::findByName('Super Admin');
        $this->delete("/roles/{$role->id}")->assertSessionHas('error');
        $this->assertDatabaseHas('roles', ['id' => $role->id]);
    }

    public function test_role_with_users_cannot_be_deleted(): void
    {
        $role = Role::create(['name' => 'Temp', 'guard_name' => 'web']);
        User::factory()->create()->assignRole('Temp');

        $this->delete("/roles/{$role->id}")->assertSessionHas('error');
        $this->assertDatabaseHas('roles', ['id' => $role->id]);
    }
}
