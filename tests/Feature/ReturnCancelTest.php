<?php

namespace Tests\Feature;

use App\Models\Batch;
use App\Models\Company;
use App\Models\Customer;
use App\Models\Product;
use App\Models\PurchaseInvoice;
use App\Models\SalesInvoice;
use App\Models\SalesReturn;
use App\Models\StockMovement;
use App\Models\User;
use App\Services\InvoicePostingService;
use App\Services\LedgerService;
use App\Services\NumberSeriesService;
use App\Services\ReturnService;
use Database\Seeders\SystemSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use RuntimeException;
use Tests\TestCase;

class ReturnCancelTest extends TestCase
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

    /** Purchase 100 @ 80; sale 20 @ 100 − 10% → net 1800, unit refund 90. */
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

    public function test_cancel_reverses_stock_and_ledger_and_sets_status(): void
    {
        $sale = $this->postSale();
        $item = $sale->items->first();
        $ledger = app(LedgerService::class);
        $service = app(ReturnService::class);

        $return = $service->createSalesReturn(
            $sale, [['sales_invoice_item_id' => $item->id, 'quantity' => 5]], now()->toDateString(),
        );

        // After the return: stock restored (80 → 85), receivable lowered (1800 → 1350).
        $this->assertEqualsWithDelta(85.0, (float) Batch::firstOrFail()->qty_available, 0.001);
        $this->assertEqualsWithDelta(1350.0, $ledger->outstanding($this->customer), 0.01);

        $service->cancelSalesReturn($return);
        $return->refresh();

        // Stock withdrawn again and receivable restored.
        $this->assertEqualsWithDelta(80.0, (float) Batch::firstOrFail()->qty_available, 0.001);
        $this->assertEqualsWithDelta(1800.0, $ledger->outstanding($this->customer), 0.01);

        // Status lifecycle.
        $this->assertSame(SalesReturn::STATUS_CANCELLED, $return->status);
        $this->assertNotNull($return->cancelled_at);
        $this->assertNotNull($return->cancelled_by);

        // Reversal ledger entry + negative stock movement recorded.
        $debit = $this->customer->ledgerEntries()->where('entry_type', 'debit_note')->first();
        $this->assertNotNull($debit);
        $this->assertEqualsWithDelta(450.0, (float) $debit->debit, 0.01);

        $movement = StockMovement::where('type', 'sale_return_cancel')->first();
        $this->assertNotNull($movement);
        $this->assertEqualsWithDelta(-5.0, (float) $movement->quantity, 0.001);
    }

    public function test_cancel_frees_returnable_capacity(): void
    {
        $sale = $this->postSale();
        $item = $sale->items->first();
        $service = app(ReturnService::class);

        // Return all 20, then cancel — the whole line becomes returnable again.
        $return = $service->createSalesReturn(
            $sale, [['sales_invoice_item_id' => $item->id, 'quantity' => 20]], now()->toDateString(),
        );
        $service->cancelSalesReturn($return);

        $again = $service->createSalesReturn(
            $sale, [['sales_invoice_item_id' => $item->id, 'quantity' => 20]], now()->toDateString(),
        );

        $this->assertSame(SalesReturn::STATUS_POSTED, $again->status);
        $this->assertEqualsWithDelta(1800.0, (float) $again->total_amount, 0.01);
    }

    public function test_cancelling_twice_is_blocked(): void
    {
        $sale = $this->postSale();
        $item = $sale->items->first();
        $service = app(ReturnService::class);

        $return = $service->createSalesReturn(
            $sale, [['sales_invoice_item_id' => $item->id, 'quantity' => 5]], now()->toDateString(),
        );
        $service->cancelSalesReturn($return);

        $this->expectException(RuntimeException::class);
        $service->cancelSalesReturn($return->refresh());
    }
}
