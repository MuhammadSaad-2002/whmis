<?php

namespace Tests\Feature\Settings;

use App\Models\User;
use Database\Seeders\RolePermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

class BookerAccountAccessTest extends TestCase
{
    use RefreshDatabase;

    public function test_booker_can_change_appearance_but_cannot_manage_their_account(): void
    {
        $this->seed(RolePermissionSeeder::class);
        $booker = User::factory()->create()->assignRole('Booker');
        $this->actingAs($booker);

        $this->get('/settings')->assertRedirect(route('appearance'));
        $this->get('/settings/appearance')->assertOk()->assertInertia(fn (Assert $page) => $page
            ->component('settings/appearance')
            ->where('auth.canManageOwnAccount', false));
        $this->get('/settings/profile')->assertForbidden();
        $this->get('/settings/password')->assertForbidden();
        $this->patch('/settings/profile', ['name' => 'Changed Booker', 'email' => 'changed@example.test'])->assertForbidden();
        $this->put('/settings/password', [
            'current_password' => 'password',
            'password' => 'new-password',
            'password_confirmation' => 'new-password',
        ])->assertForbidden();
        $this->delete('/settings/profile', ['password' => 'password'])->assertForbidden();

        $this->assertAuthenticatedAs($booker);
        $this->assertDatabaseHas('users', ['id' => $booker->id, 'name' => $booker->name, 'email' => $booker->email]);
        $this->assertTrue(Hash::check('password', $booker->fresh()->password));
    }

    public function test_extra_user_management_permission_does_not_allow_booker_self_service(): void
    {
        $this->seed(RolePermissionSeeder::class);
        $booker = User::factory()->create()->assignRole('Booker')->givePermissionTo('users.manage');
        $id = $booker->id;
        $this->actingAs($booker);

        $this->patch("/users/{$id}", ['name' => 'Changed Booker', 'email' => $booker->email])->assertForbidden();
        $this->put("/users/{$id}/password", [
            'password' => 'new-password',
            'password_confirmation' => 'new-password',
        ])->assertForbidden();
        $this->post("/users/{$id}/toggle")->assertForbidden();
        $this->delete("/users/{$id}")->assertForbidden();

        $this->assertDatabaseHas('users', ['id' => $id, 'name' => $booker->name, 'is_active' => true]);
        $this->assertTrue(Hash::check('password', $booker->fresh()->password));
    }

    public function test_admin_can_manage_a_booker_account(): void
    {
        $this->seed(RolePermissionSeeder::class);
        $admin = User::factory()->create()->assignRole('Admin');
        $booker = User::factory()->create()->assignRole('Booker');
        $this->actingAs($admin);

        $this->get('/settings/profile')->assertOk()->assertInertia(fn (Assert $page) => $page->where('auth.canManageOwnAccount', true));
        $this->patch("/users/{$booker->id}", [
            'name' => 'Updated by Admin',
            'email' => $booker->email,
            'roles' => ['Booker'],
        ])->assertRedirect()->assertSessionHas('success', 'User updated.');

        $this->assertSame('Updated by Admin', $booker->fresh()->name);
        $this->assertTrue($booker->fresh()->hasRole('Booker'));
    }
}
