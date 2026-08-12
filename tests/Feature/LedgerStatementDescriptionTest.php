<?php

namespace Tests\Feature;

use App\Models\Company;
use App\Models\Product;
use App\Models\PurchaseInvoice;
use App\Models\User;
use App\Services\InvoicePostingService;
use App\Services\LedgerService;
use App\Services\NumberSeriesService;
use Database\Seeders\RolePermissionSeeder;
use Database\Seeders\SystemSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * On the supplier ledger a purchase row should read the supplier's own invoice
 * number (the reference we entered), not our internal PI- number.
 */
class LedgerStatementDescriptionTest extends TestCase
{
    use RefreshDatabase;

    private Company $company;

    private Product $product;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed([RolePermissionSeeder::class, SystemSeeder::class]);
        $this->actingAs(User::where('email', 'admin@whmis.local')->firstOrFail());

        $this->company = Company::create(['name' => 'Getz Pharma', 'city' => 'Karachi']);
        $this->product = Product::create([
            'name' => 'Panadol 500mg', 'company_id' => $this->company->id, 'trade_price' => 100,
        ]);
    }

    private function postPurchase(?string $supplierInvoiceNumber): PurchaseInvoice
    {
        $purchase = PurchaseInvoice::create([
            'invoice_number' => app(NumberSeriesService::class)->next('purchase_invoice'),
            'supplier_invoice_number' => $supplierInvoiceNumber,
            'company_id' => $this->company->id, 'warehouse_id' => 1,
            'invoice_date' => now()->toDateString(), 'purchase_type' => 'credit',
        ]);
        $purchase->items()->create([
            'product_id' => $this->product->id, 'batch_number' => 'B1',
            'quantity' => 100, 'purchase_rate' => 80, 'trade_price' => 100,
        ]);

        return app(InvoicePostingService::class)->postPurchase($purchase->refresh());
    }

    public function test_purchase_row_shows_supplier_invoice_number(): void
    {
        $purchase = $this->postPurchase('SUP-123');

        $statement = app(LedgerService::class)->statement($this->company);
        $row = collect($statement['rows'])->firstWhere('type', 'purchase');

        $this->assertNotNull($row);
        $this->assertStringContainsString('SUP-123', $row['description']);
        $this->assertStringNotContainsString($purchase->invoice_number, $row['description']);
    }

    public function test_purchase_without_supplier_number_falls_back_to_system_description(): void
    {
        $purchase = $this->postPurchase(null);

        $statement = app(LedgerService::class)->statement($this->company);
        $row = collect($statement['rows'])->firstWhere('type', 'purchase');

        $this->assertNotNull($row);
        $this->assertSame("Purchase Invoice {$purchase->invoice_number}", $row['description']);
    }
}
