<?php

namespace Tests\Feature;

use App\Models\Company;
use App\Models\Customer;
use App\Models\Product;
use App\Models\PurchaseInvoice;
use App\Models\SalesInvoice;
use App\Models\SalesInvoiceItem;
use App\Models\User;
use App\Services\InvoicePostingService;
use App\Services\NumberSeriesService;
use App\Services\ReportService;
use App\Services\ReturnService;
use Database\Seeders\SystemSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ReportNettingTest extends TestCase
{
    use RefreshDatabase;

    private Company $company;

    private Customer $customer;

    private Product $product;

    private SalesInvoice $sale;

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

        // Sale: 20 @ 100, no disc/gst → revenue 2000, cost 1600, profit 400.
        $sale = SalesInvoice::create([
            'invoice_number' => app(NumberSeriesService::class)->next('sales_invoice'),
            'customer_id' => $this->customer->id, 'warehouse_id' => 1,
            'invoice_date' => now()->toDateString(), 'sale_type' => 'credit',
        ]);
        $sale->items()->create([
            'product_id' => $this->product->id, 'quantity' => 20,
            'trade_price' => 100, 'discount_percent' => 0, 'gst_percent' => 0,
        ]);
        $this->sale = $posting->postSale($sale->refresh());
    }

    private function range(): array
    {
        return ['from' => now()->toDateString(), 'to' => now()->toDateString()];
    }

    private function returnFive(): \App\Models\SalesReturn
    {
        $item = $this->sale->items->first();

        return app(ReturnService::class)->createSalesReturn(
            $this->sale, [['sales_invoice_item_id' => $item->id, 'quantity' => 5]], now()->toDateString(),
        );
    }

    public function test_product_sales_nets_returns(): void
    {
        $this->returnFive(); // 5 @ 100 = 500 revenue, cost 400.

        $report = app(ReportService::class)->build('product-sales', $this->range());
        $row = $report['rows'][0];

        // 5 returned @ 100 → returns 500, cost 400.
        $this->assertEqualsWithDelta(20.0, $row['qty'], 0.01);
        $this->assertEqualsWithDelta(5.0, $row['returned_qty'], 0.01);
        $this->assertEqualsWithDelta(15.0, $row['net_qty'], 0.01);
        $this->assertEqualsWithDelta(2000.0, $row['revenue'], 0.01);
        $this->assertEqualsWithDelta(500.0, $row['returns'], 0.01);
        $this->assertEqualsWithDelta(1500.0, $row['net_revenue'], 0.01);
        $this->assertEqualsWithDelta(1200.0, $row['net_cost'], 0.01);
        $this->assertEqualsWithDelta(300.0, $row['net_profit'], 0.01); // 400 − (500 − 400)
    }

    public function test_customer_sales_nets_returns(): void
    {
        $this->returnFive();

        $report = app(ReportService::class)->build('customer-sales', $this->range());
        $row = $report['rows'][0];

        $this->assertEqualsWithDelta(2000.0, $row['revenue'], 0.01);
        $this->assertEqualsWithDelta(500.0, $row['returns'], 0.01);
        $this->assertEqualsWithDelta(1500.0, $row['net_revenue'], 0.01);
        $this->assertEqualsWithDelta(300.0, $row['net_profit'], 0.01);
    }

    public function test_profit_by_month_nets_returns(): void
    {
        $this->returnFive();

        $report = app(ReportService::class)->profitByMonth();
        $current = collect($report['rows'])->firstWhere('month', now()->format('M Y'));

        $this->assertEqualsWithDelta(2000.0, $current['sales'], 0.01);
        $this->assertEqualsWithDelta(500.0, $current['returns'], 0.01);
        $this->assertEqualsWithDelta(1500.0, $current['net_sales'], 0.01);
        $this->assertEqualsWithDelta(300.0, $current['profit'], 0.01);
    }

    public function test_cancelled_return_does_not_affect_reports(): void
    {
        $return = $this->returnFive();
        app(ReturnService::class)->cancelSalesReturn($return);

        $report = app(ReportService::class)->build('product-sales', $this->range());
        $row = $report['rows'][0];

        // Cancelled return is ignored — everything back to gross.
        $this->assertEqualsWithDelta(0.0, $row['returned_qty'], 0.01);
        $this->assertEqualsWithDelta(0.0, $row['returns'], 0.01);
        $this->assertEqualsWithDelta(2000.0, $row['net_revenue'], 0.01);
        $this->assertEqualsWithDelta(400.0, $row['net_profit'], 0.01);
    }
}
