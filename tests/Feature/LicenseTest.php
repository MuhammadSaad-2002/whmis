<?php

namespace Tests\Feature;

use App\Models\License;
use App\Models\User;
use App\Services\LicenseService;
use Database\Seeders\RolePermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

class LicenseTest extends TestCase
{
    use RefreshDatabase;

    private User $superAdmin;

    private User $admin;

    private User $booker;

    protected function setUp(): void
    {
        parent::setUp();
        // The base TestCase seeds a default license; clear it so this suite starts
        // from the genuinely unlicensed state it needs to exercise.
        License::query()->delete();
        $this->seed(RolePermissionSeeder::class);

        $this->superAdmin = User::where('email', 'admin@whmis.local')->firstOrFail();

        $this->admin = User::factory()->create(['name' => 'Ordinary Admin']);
        $this->admin->assignRole('Admin');

        $this->booker = User::factory()->create(['name' => 'Booker Bob']);
        $this->booker->assignRole('Booker');
    }

    private function activateFor(Carbon $expiresAt): License
    {
        return app(LicenseService::class)->activate($expiresAt, $this->superAdmin);
    }

    public function test_expired_or_missing_license_locks_out_non_super_admins(): void
    {
        $this->actingAs($this->admin)
            ->get(route('workspace'))
            ->assertRedirect(route('license.locked'));

        $this->actingAs($this->booker)
            ->get(route('dashboard'))
            ->assertRedirect(route('license.locked'));
    }

    public function test_super_admin_is_never_locked_out(): void
    {
        $this->actingAs($this->superAdmin)
            ->get(route('workspace'))
            ->assertOk();
    }

    public function test_valid_license_lets_every_role_through(): void
    {
        $this->activateFor(now()->addMonth());

        $this->actingAs($this->admin)->get(route('workspace'))->assertOk();
        $this->actingAs($this->booker)->get(route('dashboard'))->assertOk();
    }

    public function test_locked_page_is_reachable_while_locked(): void
    {
        $this->actingAs($this->admin)
            ->get(route('license.locked'))
            ->assertOk();
    }

    public function test_super_admin_can_activate_a_license(): void
    {
        $this->actingAs($this->superAdmin)
            ->post(route('license.store'), ['expires_at' => now()->addMonths(2)->toDateString()])
            ->assertRedirect()
            ->assertSessionHas('success');

        $license = License::latest('id')->firstOrFail();
        $this->assertNotEmpty($license->key);
        $this->assertTrue(app(LicenseService::class)->isValid());
    }

    public function test_activation_defaults_to_one_month(): void
    {
        $this->actingAs($this->superAdmin)
            ->post(route('license.store'), [])
            ->assertRedirect();

        $license = License::latest('id')->firstOrFail();
        $this->assertTrue($license->expires_at->between(now()->addDays(27), now()->addDays(32)));
    }

    public function test_admin_cannot_access_license_management(): void
    {
        // Give the Admin a valid license so it's the permission gate (not the
        // license gate) that blocks them.
        $this->activateFor(now()->addMonth());

        $this->actingAs($this->admin)->get(route('license.index'))->assertForbidden();
        $this->actingAs($this->admin)->post(route('license.store'), [])->assertForbidden();
    }

    public function test_warning_banner_prop_is_admin_only_within_five_days(): void
    {
        $this->activateFor(now()->addDays(3));

        // Admin within the window → banner on.
        $this->actingAs($this->admin)
            ->get(route('workspace'))
            ->assertInertia(fn (Assert $page) => $page->where('license.show_warning', true));

        // Super Admin never sees the countdown banner.
        $this->actingAs($this->superAdmin)
            ->get(route('workspace'))
            ->assertInertia(fn (Assert $page) => $page->where('license.show_warning', false));
    }

    public function test_no_warning_banner_when_more_than_five_days_remain(): void
    {
        $this->activateFor(now()->addDays(20));

        $this->actingAs($this->admin)
            ->get(route('workspace'))
            ->assertInertia(fn (Assert $page) => $page->where('license.show_warning', false));
    }
}
