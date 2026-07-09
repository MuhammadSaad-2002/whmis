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

class SalesReservationTest extends TestCase
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
            'name' => 'Panadol 500mg', 'company_id' => $company->id,
            'trade_price' => 100, 'purchase_price' => 80, 'tax_percent' => 0,
        ]);
        $this->batch = Batch::create([
            'product_id' => $this->product->id, 'warehouse_id' => $this->warehouse->id,
            'batch_number' => 'B1', 'expiry_date' => now()->addYear()->toDateString(),
            'purchase_rate' => 80, 'effective_cost' => 80, 'trade_price' => 100, 'retail_price' => 120,
            'qty_purchased' => 100, 'qty_available' => 100,
        ]);

        Customer::create(['name' => 'City Pharmacy', 'credit_limit' => 1000000]);
    }

    private function storeSale(int $quantity): \Illuminate\Testing\TestResponse
    {
        return $this->post(route('sales.store'), [
            'customer_id' => Customer::first()->id,
            'warehouse_id' => $this->warehouse->id,
            'invoice_date' => now()->toDateString(),
            'sale_type' => 'credit',
            'items' => [[
                'product_id' => $this->product->id, 'batch_id' => $this->batch->id,
                'quantity' => $quantity, 'trade_price' => 100,
            ]],
        ]);
    }

    public function test_saving_a_draft_reserves_the_batch_stock(): void
    {
        $this->storeSale(30)->assertRedirect()->assertSessionHas('success');

        $this->batch->refresh();
        $this->assertEqualsWithDelta(70.0, (float) $this->batch->qty_available, 0.001);
        $this->assertEqualsWithDelta(30.0, (float) $this->batch->qty_reserved, 0.001);
        $this->assertTrue(SalesInvoice::firstOrFail()->stock_reserved);
    }

    public function test_a_second_draft_cannot_reserve_beyond_remaining_available(): void
    {
        $this->storeSale(30)->assertRedirect(); // 70 left

        $this->storeSale(80)->assertRedirect()->assertSessionHas('error');

        $this->assertSame(1, SalesInvoice::count(), 'The over-reserving draft must roll back');
        $this->assertEqualsWithDelta(70.0, (float) $this->batch->refresh()->qty_available, 0.001);
    }

    public function test_deleting_a_draft_releases_the_reservation(): void
    {
        $this->storeSale(30)->assertRedirect();
        $sale = SalesInvoice::firstOrFail();

        $this->delete(route('sales.destroy', $sale))->assertRedirect()->assertSessionHas('success');

        $this->batch->refresh();
        $this->assertEqualsWithDelta(100.0, (float) $this->batch->qty_available, 0.001);
        $this->assertEqualsWithDelta(0.0, (float) $this->batch->qty_reserved, 0.001);
    }

    public function test_editing_a_draft_re_reserves_the_difference(): void
    {
        $this->storeSale(30)->assertRedirect();
        $sale = SalesInvoice::firstOrFail();

        $this->put(route('sales.update', $sale), [
            'customer_id' => Customer::first()->id,
            'warehouse_id' => $this->warehouse->id,
            'invoice_date' => now()->toDateString(),
            'sale_type' => 'credit',
            'items' => [[
                'product_id' => $this->product->id, 'batch_id' => $this->batch->id,
                'quantity' => 10, 'trade_price' => 100,
            ]],
        ])->assertRedirect()->assertSessionHas('success');

        $this->batch->refresh();
        $this->assertEqualsWithDelta(90.0, (float) $this->batch->qty_available, 0.001);
        $this->assertEqualsWithDelta(10.0, (float) $this->batch->qty_reserved, 0.001);
    }

    public function test_posting_converts_the_reservation_into_a_sale(): void
    {
        $this->storeSale(30)->assertRedirect();
        $sale = SalesInvoice::firstOrFail();

        $this->post(route('sales.post', $sale))->assertRedirect()->assertSessionHas('success');

        $this->batch->refresh();
        $this->assertEqualsWithDelta(70.0, (float) $this->batch->qty_available, 0.001);
        $this->assertEqualsWithDelta(0.0, (float) $this->batch->qty_reserved, 0.001);
        $this->assertEqualsWithDelta(30.0, (float) $this->batch->qty_sold, 0.001);
        $this->assertSame('posted', $sale->refresh()->status);
        $this->assertFalse((bool) $sale->stock_reserved);
    }
}
