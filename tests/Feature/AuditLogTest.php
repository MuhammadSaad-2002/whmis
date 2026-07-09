<?php

namespace Tests\Feature;

use App\Models\Company;
use App\Models\Customer;
use App\Models\Product;
use App\Models\User;
use App\Support\AuditReferenceResolver;
use Database\Seeders\RolePermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Collection;
use Tests\TestCase;

class AuditLogTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolePermissionSeeder::class);
        // Tests run in "console"; enable console auditing so automatic model
        // audits fire here the same way they do over HTTP.
        config(['audit.console' => true]);
    }

    private function admin(): User
    {
        $admin = User::factory()->create();
        $admin->assignRole('Super Admin');

        return $admin;
    }

    public function test_audit_page_requires_audit_view(): void
    {
        $this->actingAs(User::factory()->create());
        $this->get('/audit-log')->assertForbidden();
    }

    public function test_model_changes_are_audited(): void
    {
        $this->actingAs($this->admin());

        $company = Company::create(['name' => 'Getz Pharma']);
        Product::create(['name' => 'Panadol', 'company_id' => $company->id, 'trade_price' => 100]);

        $this->assertDatabaseHas('audits', [
            'auditable_type' => 'product',
            'event' => 'created',
        ]);
    }

    public function test_successful_login_is_audited(): void
    {
        $user = User::factory()->create(['password' => 'secret-pass', 'is_active' => true]);

        $this->post('/login', ['email' => $user->email, 'password' => 'secret-pass']);

        $this->assertDatabaseHas('audits', [
            'user_id' => $user->id,
            'event' => 'login',
            'tags' => 'auth',
        ]);
    }

    public function test_audit_index_lists_and_filters_by_event(): void
    {
        $admin = $this->admin();
        $this->actingAs($admin);

        $company = Company::create(['name' => 'Getz Pharma']);
        $product = Product::create(['name' => 'Panadol', 'company_id' => $company->id, 'trade_price' => 100]);
        $product->update(['trade_price' => 120]); // an 'updated' audit

        $this->get('/audit-log')->assertOk();
        $this->get('/audit-log?event=updated')
            ->assertOk()
            ->assertInertia(fn ($page) => $page->component('admin/audit/index'));
    }

    public function test_reference_resolver_replaces_ids_with_names(): void
    {
        $customer = Customer::create(['name' => 'City Pharmacy']);
        $creator = User::factory()->create(['name' => 'Ahmed Raza']);

        $audits = new Collection([
            (object) [
                'old_values' => [],
                'new_values' => ['customer_id' => $customer->id, 'created_by' => $creator->id, 'gst_percent' => 17],
            ],
        ]);

        $resolver = new AuditReferenceResolver($audits);
        $resolved = $resolver->apply($audits->first()->new_values);

        $this->assertSame('City Pharmacy', $resolved['customer_id']);
        $this->assertSame('Ahmed Raza', $resolved['created_by']);
        $this->assertSame(17, $resolved['gst_percent']); // non-reference field untouched
    }

    public function test_reference_resolver_falls_back_for_missing_records(): void
    {
        $audits = new Collection([
            (object) ['old_values' => [], 'new_values' => ['customer_id' => 999]],
        ]);

        $resolver = new AuditReferenceResolver($audits);

        $this->assertSame('#999', $resolver->apply(['customer_id' => 999])['customer_id']);
    }
}
