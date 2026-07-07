<?php

namespace Tests\Feature;

use App\Models\Booking;
use App\Models\Company;
use App\Models\Customer;
use App\Models\IncentiveRule;
use App\Models\Payment;
use App\Models\Product;
use App\Models\PurchaseInvoice;
use App\Models\PurchaseReturn;
use App\Models\SalesInvoice;
use App\Models\SalesReturn;
use App\Models\StockAdjustment;
use App\Models\User;
use Database\Seeders\RolePermissionSeeder;
use Database\Seeders\SystemSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The morph map is enforced (AppServiceProvider), so every audited or
 * polymorphic model must resolve a morph alias — otherwise real HTTP writes
 * (e.g. the audit trail) throw ClassMorphViolationException. Auditing is off
 * under the test runner, so getMorphClass() is the guard that catches an
 * unregistered model here rather than in production.
 */
class MorphMapTest extends TestCase
{
    use RefreshDatabase;

    public function test_every_audited_model_has_a_morph_alias(): void
    {
        $audited = [
            Product::class, Company::class, Customer::class, Booking::class,
            IncentiveRule::class, Payment::class, PurchaseInvoice::class,
            PurchaseReturn::class, SalesInvoice::class, SalesReturn::class,
            StockAdjustment::class,
        ];

        foreach ($audited as $model) {
            $alias = (new $model)->getMorphClass();
            $this->assertIsString($alias, "{$model} must resolve a morph alias");
            $this->assertStringNotContainsString('\\', $alias, "{$model} should map to a short alias, not a class name");
        }
    }

    public function test_product_can_be_created_over_http_without_morph_error(): void
    {
        $this->seed([RolePermissionSeeder::class, SystemSeeder::class]);
        $admin = User::where('email', 'admin@whmis.local')->firstOrFail();
        $company = Company::create(['name' => 'Getz Pharma']);

        $this->actingAs($admin)
            ->post(route('products.store'), [
                'name' => 'Panadol 500mg',
                'company_id' => $company->id,
                'status' => 'active',
                'purchase_price' => 80,
                'trade_price' => 100,
                'retail_price' => 120,
                'mrp' => 130,
                'tax_percent' => 0,
            ])
            ->assertRedirect()
            ->assertSessionHas('success');

        $this->assertDatabaseHas('products', ['name' => 'Panadol 500mg']);
    }
}
