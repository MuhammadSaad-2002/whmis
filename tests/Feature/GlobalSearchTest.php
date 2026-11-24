<?php

namespace Tests\Feature;

use App\Models\User;
use Database\Seeders\RolePermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Inertia\Testing\AssertableInertia as Assert;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;
use Tests\TestCase;

class GlobalSearchTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolePermissionSeeder::class);
    }

    public function test_search_is_a_separate_role_permission(): void
    {
        $this->assertTrue(Role::findByName('Super Admin')->hasPermissionTo('global-search.use'));
        $this->assertTrue(Role::findByName('Admin')->hasPermissionTo('global-search.use'));
        $this->assertFalse(Role::findByName('Booker')->hasPermissionTo('global-search.use'));

        $user = User::factory()->create()->givePermissionTo('reports.view');
        $this->actingAs($user)->get('/workspace')->assertInertia(fn (Assert $page) => $page
            ->component('workspace/index')
            ->where('auth.permissions', ['reports.view'])
            ->where('searchableReports', []));
    }

    public function test_pending_search_migration_uses_existing_permission_even_with_stale_cache(): void
    {
        $role = Role::findByName('Super Admin', 'web');
        $actor = User::factory()->create()->assignRole($role);
        $existing = Permission::findByName('global-search.use', 'web')->getAttributes();
        DB::table('permissions')->where('id', $existing['id'])->delete();
        app(PermissionRegistrar::class)->forgetCachedPermissions();
        $this->assertFalse($actor->can('global-search.use'));

        // A manual import adds the grant but does not register the migration or reset cache.
        DB::table('permissions')->insert($existing);
        DB::table('role_has_permissions')->insert(['permission_id' => $existing['id'], 'role_id' => $role->id]);
        $this->assertFalse($actor->can('global-search.use'));

        $migration = require database_path('migrations/2026_11_24_000200_add_global_search_permission.php');
        $migration->up();

        $this->assertSame($existing['id'], Permission::findByName('global-search.use', 'web')->id);
        $this->assertTrue($actor->can('global-search.use'));
        $this->assertTrue(Role::findByName('Admin', 'web')->hasPermissionTo('global-search.use'));
        $this->assertFalse(Role::findByName('Booker', 'web')->hasPermissionTo('global-search.use'));
    }

    public function test_individual_report_results_require_the_same_permissions_as_the_report(): void
    {
        $user = User::factory()->create()->givePermissionTo('global-search.use');
        $this->actingAs($user)->get('/workspace')->assertInertia(fn (Assert $page) => $page->where('searchableReports', []));
        $this->get('/reports/sales-register')->assertForbidden();

        $user->givePermissionTo('reports.view');
        $this->get('/workspace')->assertInertia(fn (Assert $page) => $page->where('searchableReports',
            fn (Collection $reports) => $reports->contains('url', '/reports/sales-register')
                && ! $reports->contains('url', '/reports/hr-payroll')));
        $this->get('/reports/hr-payroll')->assertForbidden();

        $user->givePermissionTo('hr.reports.view');
        $this->get('/workspace')->assertInertia(fn (Assert $page) => $page->where('searchableReports',
            fn (Collection $reports) => $reports->contains('url', '/reports/hr-payroll')));
        $this->get('/reports/hr-payroll')->assertOk();
    }

    public function test_field_booker_can_be_granted_search_without_exposing_supplier_pages(): void
    {
        $booker = User::factory()->create()->assignRole('Booker')
            ->givePermissionTo(['global-search.use', 'reports.view', 'suppliers.view']);

        $this->actingAs($booker)->get('/workspace')->assertInertia(fn (Assert $page) => $page
            ->where('auth.permissions', fn (Collection $permissions) => $permissions->contains('global-search.use')
                && $permissions->contains('bookings.view') && ! $permissions->contains('suppliers.view'))
            ->where('auth.canManageOwnAccount', false)
            ->where('searchableReports', []));
        $this->get('/suppliers')->assertForbidden();
        $this->get('/reports')->assertForbidden();
    }
}
