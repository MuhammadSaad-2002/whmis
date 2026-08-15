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
use App\Services\ReturnService;
use Database\Seeders\RolePermissionSeeder;
use Database\Seeders\SystemSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ReportProductSalesDailyTest extends TestCase
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

    private function postSale(int $qty, Batch $batch, array $ruleIds = []): SalesInvoice
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

        $sale = SalesInvoice::latest('id')->firstOrFail();
        $this->post(route('sales.post', $sale))->assertRedirect()->assertSessionHas('success');

        return $sale->refresh();
    }

    private function report(array $filters = []): array
    {
        return app(ReportService::class)->build('product-sales-daily', $filters + [
            'from' => now()->subDay()->toDateString(),
            'to' => now()->addDay()->toDateString(),
        ]);
    }

    public function test_bonus_cogs_is_included_so_daily_profit_is_true(): void
    {
        // Receive 10 + 2 bonus @ 80 → net 800 over 12 units → effective cost 66.6667.
        $batch = $this->receivePurchase(10, 2);
        $effectiveCost = (float) $batch->effective_cost;

        // Sell 10 with a 10+2 bonus rule → 2 free bonus units, 12 units leave stock.
        $rule = IncentiveRule::create([
            'name' => '10+2', 'rule_type' => 'qty_bonus', 'base_qty' => 10, 'bonus_qty' => 2,
            'active' => true, 'product_id' => $this->product->id,
        ]);
        $this->postSale(10, $batch, [$rule->id]);

        $rows = $this->report()['rows'];
        $this->assertCount(1, $rows);
        $row = $rows[0];

        $this->assertSame(now()->toDateString(), $row['date']);
        $this->assertSame('Panadol 500mg', $row['product']);
        $this->assertEqualsWithDelta(10.0, $row['qty'], 0.001);   // billed only
        $this->assertEqualsWithDelta(2.0, $row['bonus'], 0.001);  // free units
        $this->assertEqualsWithDelta(1000.0, $row['revenue'], 0.01); // 10 × 100, no discount

        // COGS must cover all 12 units shipped, not just the 10 billed.
        $this->assertEqualsWithDelta(12 * $effectiveCost, $row['cost'], 0.01);
        $this->assertGreaterThan(11 * $effectiveCost, $row['cost'], 'Bonus units must be costed');

        // Profit = revenue − full COGS, and margin follows.
        $this->assertEqualsWithDelta($row['revenue'] - $row['cost'], $row['profit'], 0.01);
        $this->assertEqualsWithDelta(round($row['profit'] / $row['revenue'] * 100, 2), $row['margin_pct'], 0.01);
    }

    public function test_returns_are_netted_into_the_day(): void
    {
        $batch = $this->receivePurchase(100, 0); // effective cost 80

        $sale = $this->postSale(20, $batch); // 20 × 100 = 2000 net, cost 1600
        $item = $sale->items()->firstOrFail();

        // Return 5 units today → nets the same product×day bucket.
        app(ReturnService::class)->createSalesReturn(
            $sale,
            [['sales_invoice_item_id' => $item->id, 'quantity' => 5]],
            now()->toDateString(),
            'Damaged',
        );

        $row = $this->report()['rows'][0];
        $this->assertEqualsWithDelta(15.0, $row['qty'], 0.001);      // 20 − 5
        $this->assertEqualsWithDelta(1500.0, $row['revenue'], 0.01); // 2000 − 500
        $this->assertEqualsWithDelta(1200.0, $row['cost'], 0.01);    // 1600 − 400
        $this->assertEqualsWithDelta(300.0, $row['profit'], 0.01);   // 400 − (500 − 400)
    }

    public function test_product_filter_excludes_other_products(): void
    {
        $batch = $this->receivePurchase(50, 0);
        $this->postSale(10, $batch);

        $other = Product::create([
            'name' => 'Brufen 400mg', 'company_id' => $this->company->id,
            'trade_price' => 50, 'purchase_price' => 40, 'tax_percent' => 0,
        ]);

        $this->assertCount(0, $this->report(['product_id' => $other->id])['rows']);

        $mine = $this->report(['product_id' => $this->product->id])['rows'];
        $this->assertCount(1, $mine);
        $this->assertSame('Panadol 500mg', $mine[0]['product']);
    }
}
