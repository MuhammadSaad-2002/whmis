<?php

namespace Tests\Feature;

use App\Models\User;
use Database\Seeders\RolePermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class DashboardTest extends TestCase
{
    use RefreshDatabase;

    public function test_guests_are_redirected_to_the_login_page()
    {
        $this->get('/dashboard')->assertRedirect('/login');
    }

    public function test_users_without_a_role_cannot_visit_the_dashboard()
    {
        $this->seed(RolePermissionSeeder::class);
        $this->actingAs(User::factory()->create());

        $this->get('/dashboard')->assertForbidden();
    }

    public function test_authorized_users_can_visit_the_dashboard()
    {
        $this->seed(RolePermissionSeeder::class);
        $user = User::factory()->create();
        $user->assignRole('Admin');
        $this->actingAs($user);

        $this->get('/dashboard')->assertOk();
    }
}
