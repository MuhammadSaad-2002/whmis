<?php

namespace Tests\Feature;

use App\Models\FinanceWorkItem;
use App\Models\User;
use Database\Seeders\RolePermissionSeeder;
use Database\Seeders\SystemSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Inertia\Testing\AssertableInertia as Assert;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

class EmployeeCommissionAccessTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed([RolePermissionSeeder::class, SystemSeeder::class]);
    }

    public function test_field_roles_have_no_default_commission_access_and_legacy_grants_do_not_reopen_it(): void
    {
        $legacy = Permission::findOrCreate('commission.self', 'web');
        foreach ([['Booker'], ['Salesman'], ['Booker', 'Salesman']] as $roles) {
            $user = User::factory()->create()->assignRole($roles);
            $this->assertEmpty($user->getAllPermissions()->pluck('name')->intersect(['commission.self', 'commission.manage', 'commission.waive']));

            $user->givePermissionTo($legacy, 'commission.manage', 'commission.waive', 'global-search.use');
            $this->actingAs($user)->get(route('commissions.index'))->assertForbidden();
            $this->post('/commissions/rules')->assertForbidden();
            $permissions = $this->get(route('workspace'))->assertOk()->inertiaProps('auth.permissions');
            $this->assertContains('global-search.use', $permissions);
            foreach (['commission.self', 'commission.manage', 'commission.waive'] as $permission) {
                $this->assertNotContains($permission, $permissions);
            }
        }
    }

    public function test_authorized_admins_keep_access_even_with_field_roles(): void
    {
        foreach (['Admin', 'Super Admin'] as $role) {
            $user = User::factory()->create()->assignRole([$role, 'Booker', 'Salesman']);
            $this->actingAs($user)->get(route('commissions.index'))->assertOk()
                ->assertInertia(fn (Assert $page) => $page->component('operations/commissions')->where('manage', true)->has('rules'));
            $this->assertContains('commission.manage', $this->get(route('workspace'))->assertOk()->inertiaProps('auth.permissions'));
        }
    }

    public function test_commission_requests_stay_private_even_with_extra_field_grants(): void
    {
        $admin = User::factory()->create()->assignRole('Admin');
        $salesman = User::factory()->create()->assignRole('Salesman')
            ->givePermissionTo('finance.review', 'finance.request', 'commission.manage');
        $request = FinanceWorkItem::create([
            'kind' => 'commission_payout', 'request_key' => (string) Str::uuid(), 'created_by' => $admin->id,
            'amount_paisa' => 1000, 'payload' => ['date' => now()->toDateString(), 'notes' => 'Private commission'],
        ]);

        $this->actingAs($salesman)->get(route('finance.approvals'))->assertOk()
            ->assertInertia(fn (Assert $page) => $page->has('items.data', 0)
                ->where('kinds', fn ($kinds) => ! collect($kinds)->contains('commission_payout')));
        $this->get("/finance-approvals/{$request->id}/evidence")->assertNotFound();
        $this->post('/finance-approvals', [
            'kind' => 'commission_payout', 'request_key' => (string) Str::uuid(),
            'date' => now()->toDateString(), 'notes' => 'Unauthorized request',
        ])->assertForbidden();
    }

    public function test_upgrade_removes_only_field_role_commission_grants(): void
    {
        $legacy = Permission::findOrCreate('commission.self', 'web');
        $booker = Role::findByName('Booker')->givePermissionTo($legacy);
        $salesman = Role::findByName('Salesman')->givePermissionTo([$legacy, 'commission.manage']);
        $admin = Role::findByName('Admin');

        $migration = require database_path('migrations/2026_11_24_000600_restrict_field_commission_permissions.php');
        $migration->up();
        $migration->up();

        $this->assertFalse($booker->refresh()->hasPermissionTo($legacy));
        $this->assertTrue($booker->hasPermissionTo('bookings.create'));
        $this->assertFalse($salesman->refresh()->hasPermissionTo($legacy));
        $this->assertFalse($salesman->hasPermissionTo('commission.manage'));
        $this->assertTrue($salesman->hasPermissionTo('dispatch.assigned'));
        $this->assertTrue($admin->refresh()->hasPermissionTo('commission.manage'));
    }
}
