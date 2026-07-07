<?php

namespace Tests\Feature;

use App\Models\Batch;
use App\Models\Company;
use App\Models\Customer;
use App\Models\Product;
use App\Models\SalesInvoice;
use App\Models\User;
use App\Models\Warehouse;
use Database\Seeders\RolePermissionSeeder;
use Database\Seeders\SystemSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class SalesBatchValidationTest extends TestCase
{
    use RefreshDatabase;

    private Warehouse $warehouse;

    private Product $product;

    private Batch $batch;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolePermissionSeeder::class);
        $this->seed(SystemSeeder::class);

        $user = User::factory()->create();
        $user->assignRole('Super Admin');
        $this->actingAs($user);

        $this->warehouse = Warehouse::where('is_default', true)->firstOrFail();
        $company = Company::create(['name' => 'Getz Pharma']);
        $this->product = Product::create([
            'name' => 'Panadol 500mg',
            'company_id' => $company->id,
            'trade_price' => 100,
            'purchase_price' => 80,
            'tax_percent' => 0,
        ]);
        $this->batch = $this->makeBatch($this->product);

        Customer::create(['name' => 'City Pharmacy', 'credit_limit' => 100000]);
    }

    private function makeBatch(Product $product, string $number = 'B-001'): Batch
    {
        return Batch::create([
            'product_id' => $product->id,
            'warehouse_id' => $this->warehouse->id,
            'batch_number' => $number,
            'expiry_date' => now()->addYear()->toDateString(),
            'purchase_rate' => 80,
            'effective_cost' => 80,
            'trade_price' => 100,
            'retail_price' => 120,
            'qty_purchased' => 100,
            'qty_available' => 100,
        ]);
    }

    private function payload(array $itemOverrides = []): array
    {
        return [
            'customer_id' => Customer::first()->id,
            'warehouse_id' => $this->warehouse->id,
            'invoice_date' => now()->toDateString(),
            'sale_type' => 'credit',
            'items' => [array_merge([
                'product_id' => $this->product->id,
                'batch_id' => $this->batch->id,
                'quantity' => 10,
                'trade_price' => 100,
            ], $itemOverrides)],
        ];
    }

    public function test_batch_is_required_on_a_sales_line(): void
    {
        $response = $this->post(route('sales.store'), $this->payload(['batch_id' => null]));

        $response->assertSessionHasErrors('items.0.batch_id');
        $this->assertSame(0, SalesInvoice::count());
    }

    public function test_valid_batch_creates_the_draft_with_that_batch(): void
    {
        $response = $this->post(route('sales.store'), $this->payload());

        $response->assertRedirect();
        $sale = SalesInvoice::firstOrFail();
        $this->assertDatabaseHas('sales_invoice_items', [
            'sales_invoice_id' => $sale->id,
            'product_id' => $this->product->id,
            'batch_id' => $this->batch->id,
        ]);
    }

    public function test_batch_from_another_product_is_rejected(): void
    {
        $other = Product::create([
            'name' => 'Brufen 400mg',
            'company_id' => $this->product->company_id,
            'trade_price' => 50,
            'purchase_price' => 40,
            'tax_percent' => 0,
        ]);
        $otherBatch = $this->makeBatch($other, 'B-999');

        // Line is for $this->product but references the other product's batch.
        $response = $this->post(route('sales.store'), $this->payload(['batch_id' => $otherBatch->id]));

        $response->assertSessionHas('error');
        $this->assertSame(0, SalesInvoice::count());
    }
}
