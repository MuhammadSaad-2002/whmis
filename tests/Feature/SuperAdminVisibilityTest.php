<?php

namespace Tests\Feature;

use App\Models\User;
use Database\Seeders\RolePermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

class SuperAdminVisibilityTest extends TestCase
{
    use RefreshDatabase;

    private User $superAdmin;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolePermissionSeeder::class);

        // The seeder creates admin@whmis.local as a Super Admin; use it.
        $this->superAdmin = User::where('email', 'admin@whmis.local')->firstOrFail();

        $this->admin = User::factory()->create(['name' => 'Ordinary Admin']);
        $this->admin->assignRole('Admin');

        // A couple of ordinary users the Admin is allowed to see.
        User::factory()->create(['name' => 'Booker Bob'])->assignRole('Booker');
        User::factory()->create(['name' => 'Cashier Cara'])->assignRole('Accountant');
    }

    public function test_admin_can_reach_the_users_screen(): void
    {
        $this->actingAs($this->admin)
            ->get(route('users.index'))
            ->assertOk();
    }

    public function test_admin_never_sees_super_admin_users_or_the_super_admin_role(): void
    {
        $this->actingAs($this->admin)
            ->get(route('users.index'))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('admin/users/index')
                // Super Admin account (admin@whmis.local) is filtered out.
                ->where('users.data', fn ($rows) => collect($rows)
                    ->pluck('email')->doesntContain('admin@whmis.local'))
                // Super Admin is absent from the role picker options.
                ->where('roles', fn ($roles) => ! collect($roles)->contains('Super Admin')));
    }

    public function test_super_admin_sees_super_admin_users_and_role(): void
    {
        $this->actingAs($this->superAdmin)
            ->get(route('users.index'))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->where('users.data', fn ($rows) => collect($rows)
                    ->pluck('email')->contains('admin@whmis.local'))
                ->where('roles', fn ($roles) => collect($roles)->contains('Super Admin')));
    }

    public function test_admin_cannot_assign_the_super_admin_role_when_creating_a_user(): void
    {
        $this->actingAs($this->admin)
            ->post(route('users.store'), [
                'name' => 'Sneaky',
                'email' => 'sneaky@whmis.local',
                'password' => 'password1234',
                'password_confirmation' => 'password1234',
                'roles' => ['Super Admin'],
            ])
            ->assertRedirect()
            ->assertSessionHas('error');

        $created = User::where('email', 'sneaky@whmis.local')->first();
        // Either not created, or created without the Super Admin role — never elevated.
        $this->assertTrue($created === null || ! $created->hasRole('Super Admin'));
    }

    public function test_super_admin_can_assign_the_super_admin_role(): void
    {
        $this->actingAs($this->superAdmin)
            ->post(route('users.store'), [
                'name' => 'New Super',
                'email' => 'newsuper@whmis.local',
                'password' => 'password1234',
                'password_confirmation' => 'password1234',
                'roles' => ['Super Admin'],
            ])
            ->assertRedirect()
            ->assertSessionHas('success');

        $this->assertTrue(
            User::where('email', 'newsuper@whmis.local')->firstOrFail()->hasRole('Super Admin')
        );
    }

    public function test_admin_cannot_act_on_a_super_admin_account_by_id(): void
    {
        $this->actingAs($this->admin);

        $this->put(route('users.update', $this->superAdmin), [
            'name' => 'Hacked', 'email' => $this->superAdmin->email, 'roles' => ['Admin'],
        ])->assertForbidden();

        $this->post(route('users.toggle', $this->superAdmin))->assertForbidden();
        $this->delete(route('users.destroy', $this->superAdmin))->assertForbidden();
        $this->put(route('users.password', $this->superAdmin), [
            'password' => 'password1234', 'password_confirmation' => 'password1234',
        ])->assertForbidden();

        // The Super Admin is untouched.
        $this->assertSame('Super Admin', $this->superAdmin->fresh()->name);
    }
}
