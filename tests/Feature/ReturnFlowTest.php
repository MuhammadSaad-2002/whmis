<?php

namespace Tests\Feature;

use App\Models\Batch;
use App\Models\Company;
use App\Models\Customer;
use App\Models\Product;
use App\Models\PurchaseInvoice;
use App\Models\SalesInvoice;
use App\Models\User;
use App\Services\InvoicePostingService;
use App\Services\LedgerService;
use App\Services\NumberSeriesService;
use App\Services\ReturnService;
use Database\Seeders\SystemSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use RuntimeException;
use Tests\TestCase;

class ReturnFlowTest extends TestCase
{
    use RefreshDatabase;

    private Company $company;

    private Customer $customer;

    private Product $product;

    private PurchaseInvoice $purchase;

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

    /** Post a purchase (100 qty @ 80, no disc/gst) and a sale (20 @ 100, 10% disc). */
    private function postPurchaseAndSale(): SalesInvoice
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
        $this->purchase = $purchase->refresh();

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

    public function test_sales_return_restores_stock_and_credits_proportional_refund(): void
    {
        $sale = $this->postPurchaseAndSale();
        $item = $sale->items->first();
        $ledger = app(LedgerService::class);

        // Sale: 20 × 100 − 10% = 1800 net → unit refund 90.
        $this->assertEqualsWithDelta(1800.0, $ledger->outstanding($this->customer), 0.01);
        $this->assertEqualsWithDelta(80.0, (float) Batch::firstOrFail()->qty_available, 0.001);

        $return = app(ReturnService::class)->createSalesReturn(
            $sale,
            [['sales_invoice_item_id' => $item->id, 'quantity' => 5]],
            now()->toDateString(),
            'Damaged in transit',
        );

        $this->assertStringStartsWith('SR-', $return->return_number);
        $this->assertEqualsWithDelta(450.0, (float) $return->total_amount, 0.01); // 5 × 90
        $this->assertEqualsWithDelta(400.0, (float) $return->total_cost, 0.01);   // 5 × 80

        $this->assertEqualsWithDelta(85.0, (float) Batch::firstOrFail()->qty_available, 0.001);
        $this->assertEqualsWithDelta(1350.0, $ledger->outstanding($this->customer), 0.01); // 1800 − 450

        $entry = $this->customer->ledgerEntries()->where('entry_type', 'credit_note')->first();
        $this->assertNotNull($entry);
        $this->assertEqualsWithDelta(450.0, (float) $entry->credit, 0.01);
    }

    public function test_over_return_is_blocked_across_multiple_returns(): void
    {
        $sale = $this->postPurchaseAndSale();
        $item = $sale->items->first();
        $service = app(ReturnService::class);

        $service->createSalesReturn($sale, [['sales_invoice_item_id' => $item->id, 'quantity' => 15]], now()->toDateString());

        $this->expectException(RuntimeException::class);
        $this->expectExceptionMessageMatches('/only 5 returnable/');

        $service->createSalesReturn($sale, [['sales_invoice_item_id' => $item->id, 'quantity' => 6]], now()->toDateString());
    }

    public function test_sales_return_requires_posted_invoice(): void
    {
        $draft = SalesInvoice::create([
            'invoice_number' => 'SI-DRAFT', 'customer_id' => $this->customer->id,
            'warehouse_id' => 1, 'invoice_date' => now()->toDateString(), 'sale_type' => 'credit',
        ]);

        $this->expectException(RuntimeException::class);
        app(ReturnService::class)->createSalesReturn($draft, [], now()->toDateString());
    }

    public function test_purchase_return_reduces_batch_and_debits_supplier(): void
    {
        $this->postPurchaseAndSale(); // supplier owed 8000 (100 × 80)
        $batch = Batch::firstOrFail();
        $ledger = app(LedgerService::class);
        $item = $this->purchase->items->first();

        $this->assertEqualsWithDelta(8000.0, $ledger->outstanding($this->company), 0.01);

        $return = app(ReturnService::class)->createPurchaseReturn(
            $this->purchase,
            [['purchase_invoice_item_id' => $item->id, 'quantity' => 10]],
            now()->toDateString(),
            'Near expiry',
        );

        $this->assertStringStartsWith('PR-', $return->return_number);
        $this->assertEqualsWithDelta(800.0, (float) $return->total_amount, 0.01); // 10 × purchase rate 80
        $this->assertSame($this->purchase->id, (int) $return->purchase_invoice_id);
        $this->assertSame($item->id, (int) $return->items->first()->purchase_invoice_item_id);
        $this->assertEqualsWithDelta(70.0, (float) $batch->refresh()->qty_available, 0.001); // 80 − 10
        $this->assertEqualsWithDelta(7200.0, $ledger->outstanding($this->company), 0.01);

        $entry = $this->company->ledgerEntries()->where('entry_type', 'debit_note')->first();
        $this->assertNotNull($entry);
        $this->assertEqualsWithDelta(800.0, (float) $entry->debit, 0.01);
    }

    public function test_purchase_return_capped_by_stock_and_received_quantity(): void
    {
        $this->postPurchaseAndSale();
        $batch = Batch::firstOrFail(); // 80 available, 100 received
        $item = $this->purchase->items->first();
        $service = app(ReturnService::class);

        // Can't withdraw more than is physically in the batch (20 already sold).
        try {
            $service->createPurchaseReturn($this->purchase, [['purchase_invoice_item_id' => $item->id, 'quantity' => 90]], now()->toDateString());
            $this->fail('Expected negative-stock guard.');
        } catch (RuntimeException $e) {
            $this->assertStringContainsString('negative', $e->getMessage());
        }

        // Drain the batch (80), then a further 30 exceeds the received quantity.
        $service->createPurchaseReturn($this->purchase, [['purchase_invoice_item_id' => $item->id, 'quantity' => 80]], now()->toDateString());
        $this->assertEqualsWithDelta(0.0, (float) $batch->refresh()->qty_available, 0.001);

        $this->expectException(RuntimeException::class);
        $this->expectExceptionMessageMatches('/only 20 returnable/');
        $service->createPurchaseReturn($this->purchase, [['purchase_invoice_item_id' => $item->id, 'quantity' => 30]], now()->toDateString());
    }
}
