<?php

namespace Tests\Feature;

use App\Models\Batch;
use App\Models\Company;
use App\Models\Product;
use App\Models\PurchaseInvoice;
use App\Models\User;
use App\Services\InvoicePostingService;
use App\Services\NumberSeriesService;
use Database\Seeders\SystemSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use RuntimeException;
use Tests\TestCase;

class PurchaseRestockTest extends TestCase
{
    use RefreshDatabase;

    private Company $company;

    private Product $product;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(SystemSeeder::class);
        $this->actingAs(User::factory()->create());

        $this->company = Company::create(['name' => 'Getz Pharma']);
        $this->product = Product::create([
            'name' => 'Panadol 500mg', 'company_id' => $this->company->id, 'trade_price' => 100,
        ]);
    }

    private function makePurchase(array $itemOverrides = []): PurchaseInvoice
    {
        $invoice = PurchaseInvoice::create([
            'invoice_number' => app(NumberSeriesService::class)->next('purchase_invoice'),
            'company_id' => $this->company->id, 'warehouse_id' => 1,
            'invoice_date' => now()->toDateString(), 'purchase_type' => 'credit',
        ]);
        $invoice->items()->create(array_merge([
            'product_id' => $this->product->id, 'batch_number' => 'B1',
            'quantity' => 100, 'bonus_quantity' => 0, 'purchase_rate' => 80, 'trade_price' => 100,
        ], $itemOverrides));

        return $invoice->refresh();
    }

    public function test_restock_adds_to_existing_batch_with_weighted_average_cost(): void
    {
        $posting = app(InvoicePostingService::class);

        // First purchase: 100 @ 80 → new batch, effective cost 80.
        $posting->postPurchase($this->makePurchase());
        $batch = Batch::firstOrFail();
        $this->assertEqualsWithDelta(100.0, (float) $batch->qty_available, 0.001);
        $this->assertEqualsWithDelta(80.0, (float) $batch->effective_cost, 0.001);

        // Restock the same batch with 100 @ 100 → available 200, avg cost 90.
        $restock = $this->makePurchase(['batch_number' => 'B1', 'purchase_rate' => 100, 'quantity' => 100]);
        $restock->items->first()->update(['batch_id' => $batch->id]);
        $posting->postPurchase($restock->refresh());

        $batch->refresh();
        $this->assertEqualsWithDelta(200.0, (float) $batch->qty_available, 0.001);
        $this->assertEqualsWithDelta(90.0, (float) $batch->effective_cost, 0.001); // (100*80 + 100*100)/200
        $this->assertSame(1, Batch::count(), 'Restock must not create a second batch');
        $this->assertSame($batch->id, (int) $restock->items->first()->batch_id);
    }

    public function test_new_batch_number_still_creates_a_separate_batch(): void
    {
        $posting = app(InvoicePostingService::class);
        $posting->postPurchase($this->makePurchase(['batch_number' => 'B1']));
        $posting->postPurchase($this->makePurchase(['batch_number' => 'B2']));

        $this->assertSame(2, Batch::count());
    }

    public function test_cancelling_a_restock_removes_only_that_receipt(): void
    {
        $posting = app(InvoicePostingService::class);

        $posting->postPurchase($this->makePurchase()); // 100 @ 80
        $batch = Batch::firstOrFail();

        $restock = $this->makePurchase(['purchase_rate' => 100, 'quantity' => 100]); // +100 @ 100
        $restock->items->first()->update(['batch_id' => $batch->id]);
        $posting->postPurchase($restock->refresh()); // avail 200, cost 90

        // Cancel the restock → back to 100 available at cost 80.
        $posting->cancelPurchase($restock->refresh());
        $batch->refresh();
        $this->assertEqualsWithDelta(100.0, (float) $batch->qty_available, 0.001);
        $this->assertEqualsWithDelta(80.0, (float) $batch->effective_cost, 0.001);
        $this->assertSame('cancelled', $restock->refresh()->status);
    }

    public function test_cancel_blocked_when_restocked_units_already_sold(): void
    {
        $posting = app(InvoicePostingService::class);

        $posting->postPurchase($this->makePurchase()); // 100
        $batch = Batch::firstOrFail();

        $restock = $this->makePurchase(['quantity' => 100]); // +100 → 200
        $restock->items->first()->update(['batch_id' => $batch->id]);
        $posting->postPurchase($restock->refresh());

        // Sell 150 → only 50 left, less than the restock's 100 units.
        $this->product->refresh();
        app(\App\Services\InventoryService::class)->consumeFifo($this->product->id, 1, 150, $restock);

        $this->expectException(RuntimeException::class);
        $posting->cancelPurchase($restock->refresh());
    }
}
