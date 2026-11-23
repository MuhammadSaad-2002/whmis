<?php

namespace Tests\Feature;

use App\Models\Company;
use App\Models\Customer;
use App\Models\Product;
use App\Models\PurchaseInvoice;
use App\Models\User;
use App\Services\InvoicePostingService;
use App\Services\LedgerService;
use App\Services\NumberSeriesService;
use Database\Seeders\RolePermissionSeeder;
use Database\Seeders\SystemSeeder;
use DOMDocument;
use DOMXPath;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
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

    public function test_statement_pdf_totals_exclude_opening_balance_and_sum_period_entries(): void
    {
        $ledger = app(LedgerService::class);
        $from = Carbon::parse('2026-11-01');
        $to = Carbon::parse('2026-11-30');
        $customer = Customer::create(['name' => 'Statement Pharmacy']);

        foreach ([
            [$this->company, 'Supplier', 'ledger.supplier.pdf', '90.25', '142.75'],
            [$customer, 'Customer', 'ledger.customer.pdf', '142.75', '90.25'],
        ] as [$party, $label, $route, $expectedDebit, $expectedCredit]) {
            $post = fn ($type, $date, $charge, $settlement) => $ledger->post(
                $party, $type, $date, $label === 'Customer' ? $charge : $settlement, $label === 'Customer' ? $settlement : $charge,
            );
            $post('opening', '2026-10-31', 400, 0);
            $post($label === 'Customer' ? 'receipt' : 'payment', '2026-11-01', 0, 90.25);
            $post('adjustment', '2026-11-15', 90.25, 0);
            $post($label === 'Customer' ? 'sale' : 'purchase', '2026-11-30', 52.50, 0);
            $post('adjustment', '2026-12-01', 0, 12);

            $statement = $ledger->statement($party, $from, $to);
            $html = view('pdf.statement', [
                'party' => $party, 'partyLabel' => $label, 'statement' => $statement,
                'aging' => $ledger->aging($party), 'from' => $from, 'to' => $to,
            ])->render();

            $document = new DOMDocument;
            $document->loadHTML($html, LIBXML_NOERROR | LIBXML_NOWARNING);
            $xpath = new DOMXPath($document);
            $totals = $xpath->query('//tr[td/strong="Period Totals"]/td');
            $this->assertCount(4, $totals);
            $this->assertSame($expectedDebit, trim($totals->item(1)->textContent));
            $this->assertSame($expectedCredit, trim($totals->item(2)->textContent));
            $this->assertSame('452.50', $xpath->evaluate('string(//tr[td/strong="Closing Balance"]/td[2]/strong)'));

            $this->get(route($route, [$party, 'from' => $from->toDateString(), 'to' => $to->toDateString()]))
                ->assertOk()->assertHeader('content-type', 'application/pdf');
        }
    }
}
