<?php

namespace Tests\Feature;

use App\Models\Batch;
use App\Models\Company;
use App\Models\Customer;
use App\Models\Product;
use App\Models\PurchaseInvoice;
use App\Models\SalesInvoice;
use App\Models\User;
use App\Models\Warehouse;
use App\Services\InvoicePostingService;
use App\Services\LedgerService;
use App\Services\NumberSeriesService;
use App\Services\PaymentService;
use Database\Seeders\SystemSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use RuntimeException;
use Tests\TestCase;

class CoreTradingFlowTest extends TestCase
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
        $this->customer = Customer::create(['name' => 'City Pharmacy', 'credit_limit' => 100000]);
        $this->product = Product::create([
            'name' => 'Panadol 500mg',
            'company_id' => $this->company->id,
            'trade_price' => 100,
            'purchase_price' => 80,
            'tax_percent' => 0,
        ]);
    }

    private function makePurchase(array $itemOverrides = [], array $headerOverrides = []): PurchaseInvoice
    {
        $invoice = PurchaseInvoice::create(array_merge([
            'invoice_number' => app(NumberSeriesService::class)->next('purchase_invoice'),
            'company_id' => $this->company->id,
            'warehouse_id' => $this->warehouse->id,
            'invoice_date' => now()->toDateString(),
            'purchase_type' => 'credit',
        ], $headerOverrides));

        $invoice->items()->create(array_merge([
            'product_id' => $this->product->id,
            'batch_number' => 'B-001',
            'expiry_date' => now()->addYear()->toDateString(),
            'quantity' => 100,
            'bonus_quantity' => 10,
            'purchase_rate' => 80,
            'trade_price' => 100,
            'discount_percent' => 5,
            'gst_percent' => 17,
        ], $itemOverrides));

        return $invoice->refresh();
    }

    private function makeSale(array $itemOverrides = [], array $headerOverrides = []): SalesInvoice
    {
        $invoice = SalesInvoice::create(array_merge([
            'invoice_number' => app(NumberSeriesService::class)->next('sales_invoice'),
            'customer_id' => $this->customer->id,
            'warehouse_id' => $this->warehouse->id,
            'invoice_date' => now()->toDateString(),
            'sale_type' => 'credit',
        ], $headerOverrides));

        $invoice->items()->create(array_merge([
            'product_id' => $this->product->id,
            'quantity' => 20,
            'bonus_quantity' => 0,
            'trade_price' => 100,
            'discount_percent' => 0,
            'gst_percent' => 0,
        ], $itemOverrides));

        return $invoice->refresh();
    }

    public function test_posting_purchase_creates_batch_with_bonus_diluted_cost_and_supplier_credit(): void
    {
        $invoice = app(InvoicePostingService::class)->postPurchase($this->makePurchase());

        // gross 8000, disc 400, gst 17% of 7600 = 1292, net 8892
        $this->assertSame('posted', $invoice->status);
        $this->assertEqualsWithDelta(8892.0, (float) $invoice->total_amount, 0.01);
        // margin = 100 * 110 - 8892 = 2108
        $this->assertEqualsWithDelta(2108.0, (float) $invoice->total_margin, 0.01);

        $batch = Batch::firstOrFail();
        $this->assertEqualsWithDelta(110.0, (float) $batch->qty_available, 0.001);
        // effective cost = 8892 / 110
        $this->assertEqualsWithDelta(80.8364, (float) $batch->effective_cost, 0.001);

        $this->assertEqualsWithDelta(
            8892.0,
            app(LedgerService::class)->outstanding($this->company),
            0.01,
        );
    }

    public function test_posting_sale_consumes_fifo_by_earliest_expiry_and_computes_profit(): void
    {
        $posting = app(InvoicePostingService::class);

        // Later expiry arrives first; earlier expiry second. FIFO must pick the earlier expiry.
        $posting->postPurchase($this->makePurchase([
            'batch_number' => 'LATE', 'expiry_date' => now()->addYears(2)->toDateString(),
        ]));
        $posting->postPurchase($this->makePurchase([
            'batch_number' => 'EARLY', 'expiry_date' => now()->addMonths(6)->toDateString(),
        ]));

        $sale = $posting->postSale($this->makeSale());

        $early = Batch::where('batch_number', 'EARLY')->firstOrFail();
        $late = Batch::where('batch_number', 'LATE')->firstOrFail();
        $this->assertEqualsWithDelta(90.0, (float) $early->qty_available, 0.001);
        $this->assertEqualsWithDelta(110.0, (float) $late->qty_available, 0.001);

        // net 2000, cost 20 * 80.8364 = 1616.73, profit = 383.27
        $item = $sale->items->first();
        $this->assertEqualsWithDelta(2000.0, (float) $item->net_amount, 0.01);
        $this->assertEqualsWithDelta(1616.73, (float) $item->cost_amount, 0.01);
        $this->assertEqualsWithDelta(383.27, (float) $sale->total_profit, 0.01);

        $this->assertEqualsWithDelta(
            2000.0,
            app(LedgerService::class)->outstanding($this->customer),
            0.01,
        );
    }

    public function test_bonus_units_given_to_customer_consume_stock_without_revenue(): void
    {
        $posting = app(InvoicePostingService::class);
        $posting->postPurchase($this->makePurchase());

        $sale = $posting->postSale($this->makeSale(['quantity' => 10, 'bonus_quantity' => 2]));

        $batch = Batch::firstOrFail();
        $this->assertEqualsWithDelta(98.0, (float) $batch->qty_available, 0.001); // 110 - 12

        $item = $sale->items->first();
        $this->assertEqualsWithDelta(1000.0, (float) $item->net_amount, 0.01); // only 10 billed
        $this->assertEqualsWithDelta(12 * 80.8364, (float) $item->cost_amount, 0.01);
    }

    public function test_sale_fails_when_stock_is_insufficient(): void
    {
        $posting = app(InvoicePostingService::class);
        $posting->postPurchase($this->makePurchase(['quantity' => 5, 'bonus_quantity' => 0]));

        $this->expectException(RuntimeException::class);
        $this->expectExceptionMessageMatches('/Insufficient stock/');

        $posting->postSale($this->makeSale(['quantity' => 20]));
    }

    public function test_cancelling_posted_sale_restores_stock_and_reverses_ledger(): void
    {
        $posting = app(InvoicePostingService::class);
        $posting->postPurchase($this->makePurchase());
        $sale = $posting->postSale($this->makeSale());

        $posting->cancelSale($sale);

        $this->assertEqualsWithDelta(110.0, (float) Batch::firstOrFail()->qty_available, 0.001);
        $this->assertEqualsWithDelta(0.0, app(LedgerService::class)->outstanding($this->customer), 0.01);
    }

    public function test_cancelling_purchase_blocked_once_stock_sold_but_allowed_before(): void
    {
        $posting = app(InvoicePostingService::class);

        $first = $posting->postPurchase($this->makePurchase());
        $posting->postSale($this->makeSale(['quantity' => 1]));

        try {
            $posting->cancelPurchase($first);
            $this->fail('Expected cancellation to be blocked.');
        } catch (RuntimeException $e) {
            $this->assertStringContainsString('already been sold', $e->getMessage());
        }

        $second = $posting->postPurchase($this->makePurchase(['batch_number' => 'B-002']));
        $posting->cancelPurchase($second);

        $this->assertSame('cancelled', $second->refresh()->status);
        $this->assertEqualsWithDelta(
            0.0,
            (float) Batch::where('batch_number', 'B-002')->firstOrFail()->qty_available,
            0.001,
        );
    }

    public function test_cash_sale_settles_itself_leaving_no_outstanding(): void
    {
        $posting = app(InvoicePostingService::class);
        $posting->postPurchase($this->makePurchase());

        $sale = $posting->postSale($this->makeSale([], ['sale_type' => 'cash']));

        $ledger = app(LedgerService::class);
        $this->assertEqualsWithDelta(0.0, $ledger->outstanding($this->customer), 0.01);

        // Cancelling reverses both the sale and its auto-receipt.
        $posting->cancelSale($sale);
        $this->assertEqualsWithDelta(0.0, $ledger->outstanding($this->customer), 0.01);
    }

    public function test_manual_receipt_reduces_outstanding_and_ages_correctly(): void
    {
        $posting = app(InvoicePostingService::class);
        $posting->postPurchase($this->makePurchase());
        $posting->postSale($this->makeSale()); // 2000 receivable

        $ledger = app(LedgerService::class);
        app(PaymentService::class)->record($this->customer, [
            'method' => 'bank',
            'amount' => 500,
            'payment_date' => now()->toDateString(),
        ]);

        $this->assertEqualsWithDelta(1500.0, $ledger->outstanding($this->customer), 0.01);

        $aging = $ledger->aging($this->customer);
        $this->assertEqualsWithDelta(1500.0, $aging['current'], 0.01);
        $this->assertEqualsWithDelta(1500.0, $aging['total'], 0.01);
    }

    public function test_number_series_is_sequential_and_unique(): void
    {
        $service = app(NumberSeriesService::class);
        $numbers = collect(range(1, 5))->map(fn () => $service->next('sales_invoice'));

        $this->assertCount(5, $numbers->unique());
        $this->assertStringEndsWith('0001', $numbers->first());
        $this->assertStringEndsWith('0005', $numbers->last());
    }

    public function test_credit_limit_blocks_credit_sale_but_not_cash(): void
    {
        $posting = app(InvoicePostingService::class);
        $posting->postPurchase($this->makePurchase());

        $this->customer->update(['credit_limit' => 1500]); // sale below is 2000

        try {
            $posting->postSale($this->makeSale());
            $this->fail('Expected credit-limit block.');
        } catch (RuntimeException $e) {
            $this->assertStringContainsString('Credit limit exceeded', $e->getMessage());
        }

        // Cash sale is exempt.
        $cash = $posting->postSale($this->makeSale([], ['sale_type' => 'cash']));
        $this->assertSame('posted', $cash->status);

        // Raising the limit lets the credit sale through.
        $this->customer->update(['credit_limit' => 10000]);
        $credit = $posting->postSale($this->makeSale());
        $this->assertSame('posted', $credit->status);
    }

    public function test_ledger_statement_produces_running_balance(): void
    {
        $posting = app(InvoicePostingService::class);
        $posting->postPurchase($this->makePurchase());
        $posting->postSale($this->makeSale()); // +2000
        app(PaymentService::class)->record($this->customer, [
            'method' => 'cash',
            'amount' => 800,
            'payment_date' => now()->toDateString(),
        ]);

        $statement = app(LedgerService::class)->statement($this->customer);

        $this->assertCount(2, $statement['rows']);
        $this->assertEqualsWithDelta(2000.0, $statement['rows'][0]['balance'], 0.01);
        $this->assertEqualsWithDelta(1200.0, $statement['closing_balance'], 0.01);
    }
}
