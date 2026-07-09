<?php

namespace Tests\Feature;

use App\Models\User;
use Database\Seeders\RolePermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class UserManagementTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolePermissionSeeder::class);
    }

    private function admin(): User
    {
        $admin = User::factory()->create();
        $admin->assignRole('Super Admin');

        return $admin;
    }

    public function test_users_page_requires_the_users_manage_permission(): void
    {
        $this->actingAs(User::factory()->create()); // no roles

        $this->get('/users')->assertForbidden();
    }

    public function test_admin_can_create_a_user_with_a_role(): void
    {
        $this->actingAs($this->admin());

        $this->post('/users', [
            'name' => 'Jane Booker',
            'email' => 'jane@whmis.local',
            'password' => 'password123',
            'password_confirmation' => 'password123',
            'is_active' => true,
            'roles' => ['Booker'],
        ])->assertRedirect();

        $user = User::where('email', 'jane@whmis.local')->firstOrFail();
        $this->assertTrue($user->hasRole('Booker'));
        $this->assertTrue($user->is_active);
    }

    public function test_admin_can_reset_a_user_password(): void
    {
        $this->actingAs($this->admin());
        $user = User::factory()->create();

        $this->put("/users/{$user->id}/password", [
            'password' => 'brand-new-pass',
            'password_confirmation' => 'brand-new-pass',
        ])->assertRedirect();

        $this->assertTrue(Hash::check('brand-new-pass', $user->fresh()->password));
    }

    public function test_deactivated_user_cannot_log_in(): void
    {
        $user = User::factory()->create([
            'password' => 'secret-pass',
            'is_active' => false,
        ]);

        $this->post('/login', ['email' => $user->email, 'password' => 'secret-pass'])
            ->assertSessionHasErrors('email');
        $this->assertGuest();
    }

    public function test_reactivated_user_can_log_in(): void
    {
        $user = User::factory()->create(['password' => 'secret-pass', 'is_active' => true]);

        $this->post('/login', ['email' => $user->email, 'password' => 'secret-pass']);
        $this->assertAuthenticatedAs($user);
    }

    public function test_cannot_delete_your_own_account(): void
    {
        $admin = $this->admin();
        $this->actingAs($admin);

        $this->delete("/users/{$admin->id}")->assertSessionHas('error');
        $this->assertDatabaseHas('users', ['id' => $admin->id]);
    }

    public function test_cannot_delete_the_last_super_admin(): void
    {
        // Clear any seeded Super Admins so we control the count exactly.
        User::role('Super Admin')->get()->each(fn (User $u) => $u->removeRole('Super Admin'));

        // A manager who can manage users but is not a Super Admin themselves.
        $manager = User::factory()->create();
        $manager->givePermissionTo('users.manage');
        $this->actingAs($manager);

        $superAdmin = User::factory()->create();
        $superAdmin->assignRole('Super Admin'); // now the only Super Admin

        $this->delete("/users/{$superAdmin->id}")->assertSessionHas('error');
        $this->assertDatabaseHas('users', ['id' => $superAdmin->id]);
    }
}
