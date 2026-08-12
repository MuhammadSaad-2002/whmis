<?php

namespace Tests\Feature;

use App\Models\Company;
use App\Models\Customer;
use App\Models\Product;
use App\Models\PurchaseInvoice;
use App\Models\SalesInvoice;
use App\Models\User;
use App\Services\InvoicePostingService;
use App\Services\NumberSeriesService;
use App\Services\ReturnService;
use App\Services\SaleNetPositionService;
use Database\Seeders\SystemSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
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
    private function postSale(): SalesInvoice
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
            'product_id' => $this->product->id, 'quantity' => 20,
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
}
