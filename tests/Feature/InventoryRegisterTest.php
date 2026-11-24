<?php

namespace Tests\Feature;

use App\Models\{Batch, Company, Product, User, Warehouse};
use Database\Seeders\{RolePermissionSeeder, SystemSeeder};
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

class InventoryRegisterTest extends TestCase
{
    use RefreshDatabase;

    public function test_register_uses_available_reserved_and_cost_totals_for_the_filtered_products(): void
    {
        $this->seed([RolePermissionSeeder::class, SystemSeeder::class]);
        $this->actingAs(User::factory()->create()->assignRole('Super Admin'));
        $warehouse = Warehouse::default()->id;
        $supplier = Company::create(['name' => 'Fixture supplier']);
        $other = Company::create(['name' => 'Other supplier']);
        $product = fn ($company, $name, $level) => Product::create([
            'name' => $name, 'generic_name' => 'Stock fixture', 'company_id' => $company->id, 'reorder_level' => $level,
        ]);
        $threshold = $product($supplier, 'At reorder point', 5);
        $none = $product($supplier, 'No batches', 3);
        $product($supplier, 'No threshold', 0);
        $healthy = $product($supplier, 'Above reorder point', 5);
        $batch = fn ($product, $number, $available, $reserved, $cost, $sample = false) => Batch::create([
            'product_id' => $product->id, 'warehouse_id' => $warehouse, 'batch_number' => $number,
            'qty_available' => $available, 'qty_reserved' => $reserved, 'effective_cost' => $cost, 'is_sample' => $sample,
        ]);
        $batch($threshold, 'PAID', 4, 2, 20);
        $batch($threshold, 'SAMPLE', 1, .25, 0, true);
        $batch($healthy, 'HEALTHY', 10.5, 1.25, 3);
        $batch($product($other, 'Outside filter', 0), 'OTHER', 7, 3, 100);
        $matches = fn ($expected) => fn ($value) => (float) $value === (float) $expected;

        $filters = ['company_id' => $supplier->id, 'search' => 'Stock fixture', 'per_page' => 10, 'sort' => 'available', 'direction' => 'desc'];
        $this->get(route('inventory.index', $filters))->assertOk()->assertInertia(fn (Assert $page) => $page
            ->component('inventory/index')->where('products.per_page', 10)->where('products.total', 4)
            ->where('products.data.0.id', $healthy->id)->where('products.data.1.id', $threshold->id)
            ->where('products.data.1.stock', $matches(5))->where('products.data.1.reserved', $matches(2.25))
            ->where('products.data.1.stock_value', $matches(80))->where('products.data.1.is_low_stock', $matches(1))
            ->where('summary.all', 4)->where('summary.low', 2)->where('summary.available', $matches(15.5))
            ->where('summary.reserved', $matches(3.5))->where('summary.stock_value', $matches(111.5))
            ->where('totals.inventory_value', $matches(811.5)));

        $this->get(route('inventory.index', $filters + ['low_stock' => 1]))->assertOk()->assertInertia(fn (Assert $page) => $page
            ->where('filters.low_stock', true)->where('products.total', 2)->where('products.data.0.id', $threshold->id)->where('products.data.1.id', $none->id)
            ->where('summary.all', 4)->where('summary.low', 2)->where('summary.available', $matches(5))
            ->where('summary.reserved', $matches(2.25))->where('summary.stock_value', $matches(80))
            ->where('totals.inventory_value', $matches(811.5)));

        $this->assertDatabaseCount('stock_movements', 0);
    }
}
