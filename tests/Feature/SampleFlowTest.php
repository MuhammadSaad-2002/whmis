<?php

namespace Tests\Feature;

use App\Models\Batch;
use App\Models\Company;
use App\Models\Customer;
use App\Models\LedgerEntry;
use App\Models\Product;
use App\Models\PurchaseInvoice;
use App\Models\SampleIssue;
use App\Models\SampleReceipt;
use App\Models\StockMovement;
use App\Models\User;
use App\Models\Warehouse;
use App\Services\InvoicePostingService;
use App\Services\NumberSeriesService;
use App\Services\SamplePostingService;
use Database\Seeders\SystemSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use RuntimeException;
use Tests\TestCase;

class SampleFlowTest extends TestCase
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

    private function makeReceipt(float $quantity = 50, array $itemOverrides = []): SampleReceipt
    {
        $receipt = SampleReceipt::create([
            'receipt_number' => app(NumberSeriesService::class)->next('sample_receipt'),
            'company_id' => $this->company->id,
            'warehouse_id' => $this->warehouse->id,
            'receipt_date' => now()->toDateString(),
            'status' => SampleReceipt::STATUS_DRAFT,
        ]);

        $receipt->items()->create(array_merge([
            'product_id' => $this->product->id,
            'batch_number' => 'SMP-A',
            'expiry_date' => now()->addYear()->toDateString(),
            'quantity' => $quantity,
            'sort_order' => 0,
        ], $itemOverrides));

        return $receipt->refresh();
    }

    private function makeIssue(float $quantity = 10, array $itemOverrides = []): SampleIssue
    {
        $issue = SampleIssue::create([
            'issue_number' => app(NumberSeriesService::class)->next('sample_issue'),
            'customer_id' => $this->customer->id,
            'warehouse_id' => $this->warehouse->id,
            'issue_date' => now()->toDateString(),
            'recipient_name' => 'Dr. Ahmed',
            'representative_name' => 'MR Bilal',
            'status' => SampleIssue::STATUS_DRAFT,
        ]);

        $issue->items()->create(array_merge([
            'product_id' => $this->product->id,
            'quantity' => $quantity,
            'sort_order' => 0,
        ], $itemOverrides));

        return $issue->refresh();
    }

    private function makeNormalStock(float $quantity = 100, array $itemOverrides = []): PurchaseInvoice
    {
        $invoice = PurchaseInvoice::create([
            'invoice_number' => app(NumberSeriesService::class)->next('purchase_invoice'),
            'company_id' => $this->company->id,
            'warehouse_id' => $this->warehouse->id,
            'invoice_date' => now()->toDateString(),
            'purchase_type' => 'credit',
        ]);

        $invoice->items()->create(array_merge([
            'product_id' => $this->product->id,
            'batch_number' => 'NORMAL-1',
            'expiry_date' => now()->addYears(2)->toDateString(),
            'quantity' => $quantity,
            'bonus_quantity' => 0,
            'purchase_rate' => 80,
            'trade_price' => 100,
            'discount_percent' => 0,
            'gst_percent' => 0,
        ], $itemOverrides));

        app(InvoicePostingService::class)->postPurchase($invoice->refresh());

        return $invoice;
    }

    public function test_posting_receipt_creates_zero_cost_sample_batch(): void
    {
        $receipt = app(SamplePostingService::class)->postReceipt($this->makeReceipt(50));

        $this->assertSame(SampleReceipt::STATUS_POSTED, $receipt->status);

        $batch = Batch::firstOrFail();
        $this->assertTrue((bool) $batch->is_sample);
        $this->assertEqualsWithDelta(50.0, (float) $batch->qty_available, 0.001);
        $this->assertEqualsWithDelta(0.0, (float) $batch->effective_cost, 0.001);

        $movement = StockMovement::firstOrFail();
        $this->assertSame('sample_in', $movement->type);
        $this->assertEqualsWithDelta(50.0, (float) $movement->quantity, 0.001);
    }

    public function test_issue_drains_sample_stock_before_normal(): void
    {
        $posting = app(SamplePostingService::class);
        $posting->postReceipt($this->makeReceipt(50));
        $this->makeNormalStock(100);

        $posting->postIssue($this->makeIssue(10));

        $sample = Batch::samples()->firstOrFail();
        $normal = Batch::normal()->firstOrFail();

        $this->assertEqualsWithDelta(40.0, (float) $sample->qty_available, 0.001);
        $this->assertEqualsWithDelta(100.0, (float) $normal->qty_available, 0.001); // untouched
    }

    public function test_issue_exceeding_sample_falls_back_to_normal_at_real_cost(): void
    {
        $posting = app(SamplePostingService::class);
        $posting->postReceipt($this->makeReceipt(5));
        $this->makeNormalStock(100); // effective_cost 80

        $issue = $posting->postIssue($this->makeIssue(8)); // 5 sample (cost 0) + 3 normal (cost 240)

        $sample = Batch::samples()->firstOrFail();
        $normal = Batch::normal()->firstOrFail();
        $this->assertEqualsWithDelta(0.0, (float) $sample->qty_available, 0.001);
        $this->assertEqualsWithDelta(97.0, (float) $normal->qty_available, 0.001);

        // COGS = 0 (sample) + 3 * 80 = 240
        $this->assertEqualsWithDelta(240.0, (float) $issue->total_cost, 0.01);
        $this->assertEqualsWithDelta(240.0, (float) $issue->items->first()->cost_amount, 0.01);
    }

    public function test_normal_sale_never_consumes_sample_stock(): void
    {
        $posting = app(SamplePostingService::class);
        $posting->postReceipt($this->makeReceipt(50));

        // Only sample stock exists; a normal sale must find no stock.
        $invoice = \App\Models\SalesInvoice::create([
            'invoice_number' => app(NumberSeriesService::class)->next('sales_invoice'),
            'customer_id' => $this->customer->id,
            'warehouse_id' => $this->warehouse->id,
            'invoice_date' => now()->toDateString(),
            'sale_type' => 'credit',
        ]);
        $invoice->items()->create([
            'product_id' => $this->product->id,
            'quantity' => 10,
            'bonus_quantity' => 0,
            'trade_price' => 100,
            'discount_percent' => 0,
            'gst_percent' => 0,
        ]);

        $this->expectException(RuntimeException::class);
        $this->expectExceptionMessageMatches('/Insufficient stock/');

        app(InvoicePostingService::class)->postSale($invoice->refresh());
    }

    public function test_issue_creates_no_ledger_entry(): void
    {
        $posting = app(SamplePostingService::class);
        $posting->postReceipt($this->makeReceipt(50));

        $before = LedgerEntry::count();
        $posting->postIssue($this->makeIssue(10));

        $this->assertSame($before, LedgerEntry::count());
    }

    public function test_cancelling_issue_restores_exact_batches(): void
    {
        $posting = app(SamplePostingService::class);
        $posting->postReceipt($this->makeReceipt(5));
        $this->makeNormalStock(100);

        $issue = $posting->postIssue($this->makeIssue(8));
        $posting->cancelIssue($issue);

        $this->assertSame(SampleIssue::STATUS_CANCELLED, $issue->refresh()->status);
        $this->assertEqualsWithDelta(5.0, (float) Batch::samples()->firstOrFail()->qty_available, 0.001);
        $this->assertEqualsWithDelta(100.0, (float) Batch::normal()->firstOrFail()->qty_available, 0.001);
    }

    public function test_cancelling_receipt_reverses_and_blocks_if_already_issued(): void
    {
        $posting = app(SamplePostingService::class);
        $receipt = $posting->postReceipt($this->makeReceipt(50));

        // Nothing issued yet → cancel reverses the stock.
        $posting->cancelReceipt($receipt);
        $this->assertSame(SampleReceipt::STATUS_CANCELLED, $receipt->refresh()->status);
        $this->assertEqualsWithDelta(0.0, (float) Batch::firstOrFail()->qty_available, 0.001);

        // A second receipt, partly issued, cannot be cancelled.
        $receipt2 = $posting->postReceipt($this->makeReceipt(50, ['batch_number' => 'SMP-B']));
        $posting->postIssue($this->makeIssue(10));

        $this->expectException(RuntimeException::class);
        $posting->cancelReceipt($receipt2);
    }
}
