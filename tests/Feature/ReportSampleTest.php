<?php

namespace Tests\Feature;

use App\Models\Company;
use App\Models\Customer;
use App\Models\Product;
use App\Models\PurchaseInvoice;
use App\Models\SampleIssue;
use App\Models\SampleReceipt;
use App\Models\User;
use App\Models\Warehouse;
use App\Services\InvoicePostingService;
use App\Services\NumberSeriesService;
use App\Services\ReportService;
use App\Services\SamplePostingService;
use Database\Seeders\SystemSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ReportSampleTest extends TestCase
{
    use RefreshDatabase;

    private Warehouse $warehouse;

    private Company $company;

    private Customer $customer;

    private Product $product;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(SystemSeeder::class);
        $this->actingAs(User::factory()->create());

        $this->warehouse = Warehouse::where('is_default', true)->firstOrFail();
        $this->company = Company::create(['name' => 'Getz Pharma']);
        $this->customer = Customer::create(['name' => 'Dr. Ahmed Clinic', 'credit_limit' => 100000]);
        $this->product = Product::create([
            'name' => 'Panadol 500mg',
            'company_id' => $this->company->id,
            'trade_price' => 100,
            'purchase_price' => 80,
            'tax_percent' => 0,
        ]);
    }

    private function seedSamples(): void
    {
        $posting = app(SamplePostingService::class);

        $receipt = SampleReceipt::create([
            'receipt_number' => app(NumberSeriesService::class)->next('sample_receipt'),
            'company_id' => $this->company->id,
            'warehouse_id' => $this->warehouse->id,
            'receipt_date' => now()->toDateString(),
            'status' => SampleReceipt::STATUS_DRAFT,
        ]);
        $receipt->items()->create([
            'product_id' => $this->product->id,
            'batch_number' => 'SMP-A',
            'expiry_date' => now()->addYear()->toDateString(),
            'quantity' => 50,
            'sort_order' => 0,
        ]);
        $posting->postReceipt($receipt->refresh());

        $issue = SampleIssue::create([
            'issue_number' => app(NumberSeriesService::class)->next('sample_issue'),
            'customer_id' => $this->customer->id,
            'warehouse_id' => $this->warehouse->id,
            'issue_date' => now()->toDateString(),
            'recipient_name' => 'Dr. Ahmed',
            'status' => SampleIssue::STATUS_DRAFT,
        ]);
        $issue->items()->create([
            'product_id' => $this->product->id,
            'quantity' => 20,
            'sort_order' => 0,
        ]);
        $posting->postIssue($issue->refresh());
    }

    private function makeNormalStock(float $quantity = 100): void
    {
        $invoice = PurchaseInvoice::create([
            'invoice_number' => app(NumberSeriesService::class)->next('purchase_invoice'),
            'company_id' => $this->company->id,
            'warehouse_id' => $this->warehouse->id,
            'invoice_date' => now()->toDateString(),
            'purchase_type' => 'credit',
        ]);
        $invoice->items()->create([
            'product_id' => $this->product->id,
            'batch_number' => 'NORMAL-1',
            'expiry_date' => now()->addYears(2)->toDateString(),
            'quantity' => $quantity,
            'bonus_quantity' => 0,
            'purchase_rate' => 80,
            'trade_price' => 100,
            'discount_percent' => 0,
            'gst_percent' => 0,
        ]);
        app(InvoicePostingService::class)->postPurchase($invoice->refresh());
    }

    private function build(string $key, array $filters = []): array
    {
        return app(ReportService::class)->build($key, $filters + [
            'from' => now()->startOfMonth()->toDateString(),
            'to' => now()->endOfMonth()->toDateString(),
        ]);
    }

    public function test_sample_stock_report_shows_remaining_sample_qty(): void
    {
        $this->seedSamples(); // 50 received, 20 issued → 30 left

        $report = $this->build('sample-stock');

        $this->assertCount(1, $report['rows']);
        $this->assertEqualsWithDelta(30.0, (float) $report['rows'][0]['qty'], 0.001);
        $this->assertEqualsWithDelta(30.0, (float) $report['totals']['qty'], 0.001);
    }

    public function test_sample_movement_report_foots(): void
    {
        $this->seedSamples();

        $report = $this->build('sample-movement');

        $row = $report['rows'][0];
        $this->assertEqualsWithDelta(0.0, (float) $row['opening'], 0.001);
        $this->assertEqualsWithDelta(50.0, (float) $row['received'], 0.001);
        $this->assertEqualsWithDelta(20.0, (float) $row['issued'], 0.001);
        $this->assertEqualsWithDelta(30.0, (float) $row['closing'], 0.001);
    }

    public function test_sample_issue_by_product_report(): void
    {
        $this->seedSamples();

        $report = $this->build('sample-issue-product');

        $this->assertCount(1, $report['rows']);
        $this->assertEqualsWithDelta(20.0, (float) $report['rows'][0]['qty'], 0.001);
        $this->assertEqualsWithDelta(0.0, (float) $report['rows'][0]['cost'], 0.001); // all from sample stock
    }

    public function test_sample_issue_by_recipient_report(): void
    {
        $this->seedSamples();

        $report = $this->build('sample-issue-recipient');

        $this->assertCount(1, $report['rows']);
        $this->assertSame('Dr. Ahmed', $report['rows'][0]['recipient']);
        $this->assertEqualsWithDelta(20.0, (float) $report['rows'][0]['qty'], 0.001);
        $this->assertSame(1, (int) $report['rows'][0]['issues']);
    }

    public function test_normal_stock_reports_exclude_sample_stock(): void
    {
        $this->seedSamples();  // 30 sample units on hand
        $this->makeNormalStock(100);

        // Stock position must count only the 100 normal units.
        $position = $this->build('stock-position');
        $row = collect($position['rows'])->firstWhere('product', 'Panadol 500mg');
        $this->assertEqualsWithDelta(100.0, (float) $row['stock'], 0.001);

        // Stock movement (actual) must not see sample_in / sample_out.
        $movement = $this->build('stock-movement');
        $mrow = collect($movement['rows'])->firstWhere('product', 'Panadol 500mg');
        $this->assertEqualsWithDelta(100.0, (float) $mrow['closing'], 0.001);
        $this->assertEqualsWithDelta(0.0, (float) $mrow['opening'], 0.001);
    }
}
