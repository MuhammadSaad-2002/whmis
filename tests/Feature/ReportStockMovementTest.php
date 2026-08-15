<?php

namespace Tests\Feature;

use App\Models\Batch;
use App\Models\Company;
use App\Models\Customer;
use App\Models\IncentiveRule;
use App\Models\Product;
use App\Models\PurchaseInvoice;
use App\Models\SalesInvoice;
use App\Models\User;
use App\Models\Warehouse;
use App\Services\InvoicePostingService;
use App\Services\NumberSeriesService;
use App\Services\ReportService;
use Database\Seeders\RolePermissionSeeder;
use Database\Seeders\SystemSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ReportStockMovementTest extends TestCase
{
    use RefreshDatabase;

    private Warehouse $warehouse;

    private Company $company;

    private Product $product;

    private Customer $customer;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolePermissionSeeder::class);
        $this->seed(SystemSeeder::class);

        $user = User::factory()->create();
        $user->assignRole('Super Admin');
        $this->actingAs($user);

        $this->warehouse = Warehouse::where('is_default', true)->firstOrFail();
        $this->company = Company::create(['name' => 'Getz Pharma']);
        $this->product = Product::create([
            'name' => 'Panadol 500mg', 'company_id' => $this->company->id,
            'trade_price' => 100, 'purchase_price' => 80, 'tax_percent' => 0,
        ]);
        $this->customer = Customer::create(['name' => 'City Pharmacy', 'credit_limit' => 100000000]);
    }

    /** Post a purchase of $qty + $bonus for the test product; returns the created batch. */
    private function receivePurchase(int $qty, int $bonus): Batch
    {
        $invoice = PurchaseInvoice::create([
            'invoice_number' => app(NumberSeriesService::class)->next('purchase_invoice'),
            'company_id' => $this->company->id, 'warehouse_id' => $this->warehouse->id,
            'invoice_date' => now()->toDateString(), 'purchase_type' => 'credit',
        ]);
        $invoice->items()->create([
            'product_id' => $this->product->id, 'batch_number' => 'B1',
            'quantity' => $qty, 'bonus_quantity' => $bonus, 'purchase_rate' => 80, 'trade_price' => 100,
        ]);
        app(InvoicePostingService::class)->postPurchase($invoice->refresh());

        return Batch::where('product_id', $this->product->id)->firstOrFail();
    }

    /** Store a draft credit sale for $qty units on $batch, optionally granting incentive rules. */
    private function storeSale(int $qty, Batch $batch, array $ruleIds = []): SalesInvoice
    {
        $this->post(route('sales.store'), [
            'customer_id' => $this->customer->id,
            'warehouse_id' => $this->warehouse->id,
            'invoice_date' => now()->toDateString(),
            'sale_type' => 'credit',
            'items' => [[
                'product_id' => $this->product->id, 'batch_id' => $batch->id,
                'quantity' => $qty, 'trade_price' => 100,
                'incentive_rule_ids' => $ruleIds,
            ]],
        ])->assertRedirect()->assertSessionHas('success');

        return SalesInvoice::latest('id')->firstOrFail();
    }

    private function report(array $filters = []): array
    {
        return app(ReportService::class)->build('stock-movement', $filters + [
            'from' => now()->subDay()->toDateString(),
            'to' => now()->addDay()->toDateString(),
        ]);
    }

    public function test_bonus_units_are_deducted_from_stock_and_broken_out(): void
    {
        // Receive 10 + 2 bonus → batch of 12 on hand.
        $batch = $this->receivePurchase(10, 2);
        $this->assertEqualsWithDelta(12.0, (float) $batch->qty_available, 0.001);

        // Sell 10 with a 10+2 bonus rule → 2 bonus, 12 units leave stock.
        $bonusRule = IncentiveRule::create([
            'name' => '10+2', 'rule_type' => 'qty_bonus', 'base_qty' => 10, 'bonus_qty' => 2,
            'active' => true, 'product_id' => $this->product->id,
        ]);
        $sale = $this->storeSale(10, $batch, [$bonusRule->id]);
        $this->post(route('sales.post', $sale))->assertRedirect()->assertSessionHas('success');

        $this->assertEqualsWithDelta(0.0, (float) $batch->refresh()->qty_available, 0.001);

        $report = $this->report();
        $this->assertCount(1, $report['rows']);
        $row = $report['rows'][0];

        $this->assertSame('Panadol 500mg', $row['product']);
        $this->assertSame('Getz Pharma', $row['supplier']);
        $this->assertEqualsWithDelta(0.0, $row['opening'], 0.001);
        $this->assertEqualsWithDelta(12.0, $row['purchased'], 0.001);
        $this->assertEqualsWithDelta(2.0, $row['bonus_in'], 0.001);
        $this->assertEqualsWithDelta(12.0, $row['sold'], 0.001);
        $this->assertEqualsWithDelta(2.0, $row['bonus_out'], 0.001);
        $this->assertEqualsWithDelta(0.0, $row['closing'], 0.001);
        // Billed units the customer paid for = sold − bonus out.
        $this->assertEqualsWithDelta(10.0, $row['sold'] - $row['bonus_out'], 0.001);
        // Everything left the batch, so on-hand value at cost is zero.
        $this->assertEqualsWithDelta(0.0, $row['value'], 0.001);
    }

    public function test_product_filter_scopes_to_a_single_product(): void
    {
        $this->receivePurchase(10, 2);

        $other = Product::create([
            'name' => 'Brufen 400mg', 'company_id' => $this->company->id,
            'trade_price' => 50, 'purchase_price' => 40, 'tax_percent' => 0,
        ]);

        $report = $this->report(['product_id' => $other->id]);
        $this->assertCount(0, $report['rows'], 'A product with no movement must not appear');

        $mine = $this->report(['product_id' => $this->product->id]);
        $this->assertCount(1, $mine['rows']);
        $this->assertSame('Panadol 500mg', $mine['rows'][0]['product']);
    }

    public function test_cancelled_sale_leaves_no_net_movement(): void
    {
        $batch = $this->receivePurchase(100, 0);

        $sale = $this->storeSale(10, $batch);
        $this->post(route('sales.post', $sale))->assertRedirect();
        $this->post(route('sales.cancel', $sale))->assertRedirect();

        // Stock is fully restored: sale + its reversal net to zero.
        $this->assertEqualsWithDelta(100.0, (float) $batch->refresh()->qty_available, 0.001);

        $row = $this->report()['rows'][0];
        $this->assertEqualsWithDelta(100.0, $row['purchased'], 0.001);
        $this->assertEqualsWithDelta(10.0, $row['sold'], 0.001);
        // The cancellation counter-entry lands in adjustments and offsets the sale
        // so closing still foots to the 100 units on hand.
        $this->assertEqualsWithDelta(100.0, $row['closing'], 0.001);
    }
}
