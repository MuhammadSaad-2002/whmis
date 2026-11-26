<?php

namespace Tests\Feature\Auth;

use App\Models\User;
use Database\Seeders\RolePermissionSeeder;
use Database\Seeders\SystemSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AuthenticationTest extends TestCase
{
    use RefreshDatabase;

    public function test_login_screen_can_be_rendered()
    {
        $response = $this->get('/login');

        $response->assertStatus(200);
    }

    public function test_login_displays_tradentra_on_an_existing_installation(): void
    {
        config(['app.name' => 'Legacy WHMIS Installation']);

        $response = $this->get('/login')
            ->assertOk()
            ->assertSee('<title inertia>Tradentra</title>', false)
            ->assertSee('The Complete Business Management Platform')
            ->assertSee('branding/tradentra-mark.svg');

        $this->assertSame('Tradentra', $response->inertiaProps('name'));
    }

    public function test_users_can_authenticate_using_the_login_screen()
    {
        $user = User::factory()->create();

        $response = $this->post('/login', [
            'email' => $user->email,
            'password' => 'password',
        ]);

        $this->assertAuthenticated();
        $response->assertRedirect(route('workspace', absolute: false));
    }

    public function test_users_can_not_authenticate_with_invalid_password()
    {
        $user = User::factory()->create();

        $this->post('/login', [
            'email' => $user->email,
            'password' => 'wrong-password',
        ]);

        $this->assertGuest();
    }

    public function test_signed_in_salesman_reopening_login_is_sent_to_workspace(): void
    {
        $this->seed(RolePermissionSeeder::class);
        $salesman = User::factory()->create();
        $salesman->assignRole('Salesman');

        $this->actingAs($salesman)->get('/dashboard')->assertForbidden();
        $this->get('/login')->assertRedirectToRoute('workspace');
        $this->post('/login', ['email' => $salesman->email, 'password' => 'password'])
            ->assertRedirectToRoute('workspace');
        $this->get('/workspace')->assertOk();
        $this->assertAuthenticatedAs($salesman);
    }

    public function test_users_can_logout()
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user)->post('/logout');

        $this->assertGuest();
        $response->assertRedirect('/');
    }

    public function test_workspace_tab_scope_changes_on_relogin_and_when_access_changes(): void
    {
        $this->seed([RolePermissionSeeder::class, SystemSeeder::class]);
        $user = User::factory()->create();
        $user->assignRole('Booker');
        $credentials = ['email' => $user->email, 'password' => 'password'];
        $sessionCookie = config('session.cookie');

        $login = $this->post('/login', $credentials)->assertRedirect(route('workspace', absolute: false));
        $this->withCookie($sessionCookie, $login->getCookie($sessionCookie)->getValue());
        $firstScope = $this->get('/workspace')->assertOk()->inertiaProps('tabScope');
        $this->assertMatchesRegularExpression('/\A[a-f0-9]{64}\z/', $firstScope);
        $this->assertNotSame(session()->getId(), $firstScope);
        $this->assertSame($firstScope, $this->get('/workspace')->assertOk()->inertiaProps('tabScope'));

        $logout = $this->post('/logout')->assertRedirect('/');
        $this->assertGuest();
        $this->withCookie($sessionCookie, $logout->getCookie($sessionCookie)->getValue());
        $login = $this->post('/login', $credentials)->assertRedirect(route('workspace', absolute: false));
        $this->withCookie($sessionCookie, $login->getCookie($sessionCookie)->getValue());
        $secondScope = $this->get('/workspace')->assertOk()->inertiaProps('tabScope');
        $this->assertNotSame($firstScope, $secondScope);

        $user->givePermissionTo('reports.view');
        auth()->forgetGuards();
        $this->assertNotSame($secondScope, $this->get('/workspace')->assertOk()->inertiaProps('tabScope'));
    }
}
