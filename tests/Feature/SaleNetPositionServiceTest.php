<?php

namespace Tests\Feature;

use App\Models\Batch;
use App\Models\Company;
use App\Models\Customer;
use App\Models\Product;
use App\Models\PurchaseInvoice;
use App\Models\SalesInvoice;
use App\Models\SalesReturn;
use App\Models\User;
use App\Services\InvoicePostingService;
use App\Services\NumberSeriesService;
use App\Services\ReportService;
use App\Services\ReturnService;
use App\Services\SaleNetPositionService;
use Database\Seeders\RolePermissionSeeder;
use Database\Seeders\SystemSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

class SaleNetPositionServiceTest extends TestCase
{
    use RefreshDatabase;

    private Company $company;

    private Customer $customer;

    private Product $product;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(SystemSeeder::class);
        $this->actingAs(User::factory()->create());

        $this->company = Company::create(['name' => 'Getz Pharma']);
        $this->customer = Customer::create(['name' => 'City Pharmacy']);
        $this->product = Product::create([
            'name' => 'Panadol 500mg', 'company_id' => $this->company->id, 'trade_price' => 100,
        ]);
    }

    /** Purchase 100 @ 80; sale 20 @ 100 − 10% disc → net 1800, cost 1600, disc 200. */
    private function postSale(int $quantity = 20, int $bonus = 0): SalesInvoice
    {
        $posting = app(InvoicePostingService::class);

        $purchase = PurchaseInvoice::create([
            'invoice_number' => app(NumberSeriesService::class)->next('purchase_invoice'),
            'company_id' => $this->company->id, 'warehouse_id' => 1,
            'invoice_date' => now()->toDateString(), 'purchase_type' => 'credit',
        ]);
        $purchase->items()->create([
            'product_id' => $this->product->id, 'batch_number' => 'B1',
            'quantity' => 100, 'purchase_rate' => 80, 'trade_price' => 100,
        ]);
        $posting->postPurchase($purchase->refresh());

        $sale = SalesInvoice::create([
            'invoice_number' => app(NumberSeriesService::class)->next('sales_invoice'),
            'customer_id' => $this->customer->id, 'warehouse_id' => 1,
            'invoice_date' => now()->toDateString(), 'sale_type' => 'credit',
        ]);
        $sale->items()->create([
            'product_id' => $this->product->id, 'quantity' => $quantity, 'bonus_quantity' => $bonus,
            'trade_price' => 100, 'discount_percent' => 10, 'gst_percent' => 0,
        ]);

        return $posting->postSale($sale->refresh());
    }

    public function test_no_returns_net_equals_original(): void
    {
        $sale = $this->postSale();
        $position = app(SaleNetPositionService::class)->positionFor($sale);

        $this->assertSame('posted_no_returns', $position['status']);
        $this->assertEmpty($position['returns']);
        $this->assertEqualsWithDelta(1800.0, $position['original']['amount'], 0.01);
        $this->assertEqualsWithDelta(20.0, $position['original']['qty'], 0.01);
        $this->assertEqualsWithDelta(200.0, $position['original']['discount'], 0.01);

        foreach ($position['original'] as $key => $value) {
            $this->assertEqualsWithDelta($value, $position['net'][$key], 0.01, "net.$key");
            $this->assertEqualsWithDelta(0.0, $position['returned'][$key], 0.01, "returned.$key");
        }

        $this->assertEqualsWithDelta(1800.0, $position['final_outstanding'], 0.01);
        $this->assertEqualsWithDelta(0.0, $position['refund_due'], 0.01);
    }

    public function test_partial_return_nets_amount_qty_discount(): void
    {
        $sale = $this->postSale();
        $item = $sale->items->first();

        app(ReturnService::class)->createSalesReturn(
            $sale, [['sales_invoice_item_id' => $item->id, 'quantity' => 5]], now()->toDateString(),
        );

        $position = app(SaleNetPositionService::class)->positionFor($sale->refresh());

        $this->assertSame('partially_returned', $position['status']);
        $this->assertCount(1, $position['returns']);

        // Returned: 5 × 90 = 450 refund, qty 5, discount 200 × (5/20) = 50.
        $this->assertEqualsWithDelta(450.0, $position['returned']['amount'], 0.01);
        $this->assertEqualsWithDelta(5.0, $position['returned']['qty'], 0.01);
        $this->assertEqualsWithDelta(50.0, $position['returned']['discount'], 0.01);

        $this->assertEqualsWithDelta(1350.0, $position['net']['amount'], 0.01);
        $this->assertEqualsWithDelta(15.0, $position['net']['qty'], 0.01);
        $this->assertEqualsWithDelta(150.0, $position['net']['discount'], 0.01);
        $this->assertEqualsWithDelta(1350.0, $position['net']['receivable'], 0.01);
        $this->assertEqualsWithDelta(1350.0, $position['final_outstanding'], 0.01);
    }

    public function test_full_return_marks_fully_returned_and_zero_receivable(): void
    {
        $sale = $this->postSale();
        $item = $sale->items->first();

        app(ReturnService::class)->createSalesReturn(
            $sale, [['sales_invoice_item_id' => $item->id, 'quantity' => 20]], now()->toDateString(),
        );

        $position = app(SaleNetPositionService::class)->positionFor($sale->refresh());

        $this->assertSame('fully_returned', $position['status']);
        $this->assertEqualsWithDelta(0.0, $position['net']['receivable'], 0.01);
        $this->assertEqualsWithDelta(0.0, $position['net']['qty'], 0.01);
        $this->assertEqualsWithDelta(0.0, $position['final_outstanding'], 0.01);
    }

    public function test_cancelled_return_excluded_from_net(): void
    {
        $sale = $this->postSale();
        $item = $sale->items->first();
        $service = app(ReturnService::class);

        $return = $service->createSalesReturn(
            $sale, [['sales_invoice_item_id' => $item->id, 'quantity' => 5]], now()->toDateString(),
        );
        $service->cancelSalesReturn($return);

        $position = app(SaleNetPositionService::class)->positionFor($sale->refresh());

        // Status back to no-returns; net equals original; the cancelled return is
        // still listed (for history) but contributes nothing to the sums.
        $this->assertSame('posted_no_returns', $position['status']);
        $this->assertCount(1, $position['returns']);
        $this->assertSame('cancelled', $position['returns'][0]['status']);

        $this->assertEqualsWithDelta(0.0, $position['returned']['amount'], 0.01);
        $this->assertEqualsWithDelta(0.0, $position['returned']['qty'], 0.01);
        $this->assertEqualsWithDelta(1800.0, $position['net']['receivable'], 0.01);
        $this->assertEqualsWithDelta(1800.0, $position['final_outstanding'], 0.01);
    }

    public function test_summary_keeps_bonus_units_out_after_all_billed_units_are_returned(): void
    {
        $this->seed(RolePermissionSeeder::class);
        $this->actingAs(User::where('email', 'admin@whmis.local')->firstOrFail());
        $sale = $this->postSale(quantity: 17, bonus: 3);

        $item = $sale->items->first();
        app(ReturnService::class)->createSalesReturn(
            $sale, [['sales_invoice_item_id' => $item->id, 'quantity' => 17]], now()->toDateString(),
        );

        $this->get(route('sales.summary', $sale))->assertOk()->assertInertia(fn (Assert $page) => $page
            ->component('sales/summary')
            ->where('position.status', 'partially_returned')
            ->where('position.original.qty', 20)->where('position.returned.qty', 17)->where('position.net.qty', 3)
            ->where('position.original.cost', 1600)->where('position.returned.cost', 1360)->where('position.net.cost', 240)
            ->where('position.final_outstanding', 0));

        $this->get(route('sales.net-position', $sale))->assertOk()->assertHeader('content-type', 'application/pdf');

        $this->getJson(route('returns.lookup.returnable', $sale))->assertOk()
            ->assertJsonPath('lines.0.returnable', 0)->assertJsonPath('lines.0.bonus_returnable', 3);

        $payload = ['sales_invoice_id' => $sale->id, 'return_date' => now()->toDateString(),
            'lines' => [['sales_invoice_item_id' => $item->id, 'quantity' => 0, 'bonus_quantity' => 3]]];
        $this->post(route('returns.sales.store'), $payload)->assertRedirect(route('returns.sales.index'));

        $bonusReturn = $sale->returns()->reorder('id', 'desc')->firstOrFail();
        $this->assertSame('0.00', $bonusReturn->total_amount);
        $this->assertSame('240.00', $bonusReturn->total_cost);
        $this->assertSame('3.00', $bonusReturn->items()->firstOrFail()->bonus_quantity);
        $this->assertSame('100.00', $item->batch->fresh()->qty_available);
        $this->assertDatabaseMissing('ledger_entries', ['reference_type' => $bonusReturn->getMorphClass(), 'reference_id' => $bonusReturn->id]);

        $this->get(route('sales.summary', $sale))->assertOk()->assertInertia(fn (Assert $page) => $page
            ->component('sales/summary')->where('position.status', 'fully_returned')
            ->where('position.returned.qty', 20)->where('position.net.qty', 0)
            ->where('position.net.cost', 0)->where('position.returns.1.discount', 0)
            ->where('position.final_outstanding', 0));
        $this->post(route('returns.sales.store'), $payload)->assertSessionHas('error');
        $this->post(route('sales.cancel', $sale))->assertSessionHas('error');
        $this->assertSame(SalesInvoice::STATUS_POSTED, $sale->fresh()->status);

        $reports = app(ReportService::class);
        $cogs = $reports->build('all-time-product-cogs', [])['totals'];
        $this->assertEquals(17, $cogs['qty_returned']);
        $this->assertEquals(3, $cogs['bonus_returned']);
        $this->assertEquals(0, $cogs['net_qty_sold']);
        $this->assertEquals(0, $cogs['net_cogs']);
        $this->assertEquals(0, $reports->build('all-time-purchases-stock', [])['totals']['sold']);

        $this->post(route('returns.sales.cancel', $bonusReturn))->assertSessionHas('success');
        $this->assertSame(SalesReturn::STATUS_CANCELLED, $bonusReturn->fresh()->status);
        $this->assertSame('97.00', Batch::firstOrFail()->qty_available);
        $this->assertDatabaseMissing('ledger_entries', ['reference_type' => $bonusReturn->getMorphClass(), 'reference_id' => $bonusReturn->id]);
        $this->getJson(route('returns.lookup.returnable', $sale))->assertJsonPath('lines.0.bonus_returnable', 3);
    }
}
