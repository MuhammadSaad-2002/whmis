<?php

namespace Tests\Feature;

use App\Models\{Company, Customer, Product, PurchaseInvoice, SalesInvoice, User};
use App\Services\{InvoicePostingService, ReportService, ReturnService, SupplierPurchaseValueReport};
use Database\Seeders\{RolePermissionSeeder, SystemSeeder};
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Inertia\Testing\AssertableInertia as Assert;
use PhpOffice\PhpSpreadsheet\IOFactory;
use Tests\TestCase;

class SupplierPurchaseValueReportTest extends TestCase
{
    use RefreshDatabase;

    private Company $supplier;
    private Company $otherSupplier;
    private Product $product;
    private Product $otherProduct;
    private SalesInvoice $sale;

    protected function setUp(): void
    {
        parent::setUp();
        $this->travelTo(Carbon::parse('2026-11-24 01:30:00', 'Asia/Karachi'));
        $this->seed([RolePermissionSeeder::class, SystemSeeder::class]);
        $this->actingAs(User::where('email', 'admin@whmis.local')->firstOrFail());
        $this->supplier = Company::create(['name' => 'Alpha Supplier']);
        $this->otherSupplier = Company::create(['name' => 'Beta Supplier']);
        $this->product = $this->receiveProduct($this->supplier, 'Alpha Product', 30);
        $this->otherProduct = $this->receiveProduct($this->otherSupplier, 'Beta Product', 50);
        $customer = Customer::create(['name' => 'City Pharmacy']);
        $this->sale = SalesInvoice::create([
            'invoice_number' => 'SI-MIXED', 'customer_id' => $customer->id, 'warehouse_id' => 1,
            'invoice_date' => '2023-09-10', 'sale_type' => 'credit', 'discount_percent' => 10, 'gst_percent' => 10,
        ]);
        $this->sale->items()->create([
            'product_id' => $this->product->id, 'quantity' => 3, 'bonus_quantity' => 1,
            'trade_price' => 100, 'discount_percent' => 10,
        ]);
        $this->sale->items()->create([
            'product_id' => $this->otherProduct->id, 'quantity' => 2, 'bonus_quantity' => 1, 'trade_price' => 150,
        ]);
        $this->sale = app(InvoicePostingService::class)->postSale($this->sale);
    }

    public function test_supplier_cost_includes_bonus_and_nets_only_eligible_returns(): void
    {
        $returns = app(ReturnService::class);
        $line = ['sales_invoice_item_id' => $this->sale->items()->where('product_id', $this->product->id)->firstOrFail()->id, 'quantity' => 1];
        $returns->createSalesReturn($this->sale, [$line], '2026-11-24');
        $cancelled = $returns->createSalesReturn($this->sale, [$line], '2026-11-24');
        $returns->cancelSalesReturn($cancelled);
        $returns->createSalesReturn($this->sale, [$line], '2026-11-25');

        foreach (['draft' => '2026-11-24', 'cancelled' => '2026-11-24', 'posted' => '2026-11-25'] as $status => $date) {
            $excluded = SalesInvoice::create([
                'invoice_number' => 'SI-EXCLUDE-'.$status, 'customer_id' => $this->sale->customer_id,
                'warehouse_id' => 1, 'invoice_date' => $date, 'status' => $status, 'total_amount' => 999,
            ]);
            $excluded->items()->create(['product_id' => $this->product->id, 'quantity' => 1, 'cost_amount' => 500]);
        }

        // Repricing or archiving catalog records does not drop or reprice sales history.
        $this->product->update(['purchase_price' => 900]);
        $this->product->delete();
        $this->supplier->delete();
        $this->get(route('reports.show', ['key' => SupplierPurchaseValueReport::KEY, 'company_id' => $this->supplier->id]))
            ->assertOk()->assertInertia(fn (Assert $page) => $page
                ->has('rows', 1)->where('rows.0.product', 'Alpha Product')
                ->where('columns.1.key', 'qty_sold')->where('sections.0.columns.3.key', 'purchase_value')
                ->where('rows.0.qty_sold', 3)->where('rows.0.bonus_qty', 1)
                ->where('rows.0.returned_qty', 1)->where('rows.0.net_units', 3)
                ->where('totals.purchase_value', 90)
                ->has('sections.0.rows', 1)
                ->where('sections.0.rows.0.customer', 'City Pharmacy')
                ->where('sections.0.rows.0.invoice_number', 'SI-MIXED')
                ->where('sections.0.rows.0.invoice_date', '2023-09-10')
                ->where('sections.0.rows.0.invoice_total', 564.3)
                ->where('sections.0.totals.purchase_value', 90)
                ->where('sections.0.totals.net_sale_value', 177.3)
                ->where('sections.1.title', 'Summary')
                ->where('sections.1.rows.0.amount', 90)
                ->where('sections.1.rows.1.amount', 177.3)
                ->where('sections.1.rows.2.metric', 'Gross Profit')
                ->where('sections.1.rows.2.amount', 87.3)
                ->missing('sections.0.totals.invoice_total'));

        $all = app(ReportService::class)->build(SupplierPurchaseValueReport::KEY, []);
        $this->assertCount(2, $all['sections'][0]['rows']);
        $this->assertContains('supplier', array_column($all['columns'], 'key'));
        $this->assertContains('supplier', array_column($all['sections'][0]['columns'], 'key'));
        $this->assertEquals(240, $all['totals']['purchase_value']);
        $this->assertEquals(240, $all['sections'][0]['totals']['purchase_value']);
        $this->assertEquals(474.30, $all['sections'][0]['totals']['net_sale_value']);
        $this->assertEquals(234.30, $all['sections'][1]['rows'][2]['amount']);
    }

    public function test_purchase_value_rounds_once_for_both_sections_and_totals_reconcile(): void
    {
        $product = Product::create(['name' => 'Alpha Tiny Product', 'company_id' => $this->supplier->id]);
        $invoice = SalesInvoice::create([
            'invoice_number' => 'SI-FRACTIONAL', 'customer_id' => $this->sale->customer_id,
            'warehouse_id' => 1, 'invoice_date' => '2026-11-24', 'status' => 'posted', 'total_amount' => 0.01,
        ]);
        foreach ([$this->product, $product] as $item) {
            $invoice->items()->create([
                'product_id' => $item->id, 'quantity' => 1, 'net_amount' => 5, 'cost_amount' => 10.005,
            ]);
        }
        $data = app(SupplierPurchaseValueReport::class)->build($this->supplier->id);
        $this->assertEquals(140.01, $data['totals']['purchase_value']);
        $this->assertEquals(140.01, array_sum(array_column($data['rows'], 'purchase_value')));
        $this->assertEquals($data['totals']['purchase_value'], $data['sections'][0]['totals']['purchase_value']);
        $this->assertEquals(20.01, $data['sections'][0]['rows'][1]['purchase_value']);
        $this->assertEquals(0.01, $data['sections'][0]['rows'][1]['net_sale_value']);
    }

    public function test_exports_render_the_invoice_totals_and_end_with_the_profit_summary(): void
    {
        $params = ['key' => SupplierPurchaseValueReport::KEY, 'company_id' => $this->supplier->id];
        $this->get(route('reports.show', $params + ['format' => 'pdf']))->assertOk()->assertHeader('content-type', 'application/pdf');
        $response = $this->get(route('reports.show', $params + ['format' => 'xlsx']))
            ->assertOk()->assertHeader('content-type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        $sheet = IOFactory::load($response->baseResponse->getFile()->getPathname())->getActiveSheet();
        $values = $sheet->toArray(formatData: false);
        $labels = array_column($values, 0);
        $this->assertContains('Products by Supplier', $labels);
        $this->assertContains('Sales Invoices by Supplier', $labels);
        $this->assertContains('SI-MIXED', $labels);
        $this->assertNotContains('Supplier', array_merge(...$values));
        $this->assertSame('Summary', $values[count($values) - 5][0]);
        $lastRows = array_slice($values, -3);
        $this->assertSame(['Total Purchase Value', 'Total Net Sale Value', 'Gross Profit'], array_column($lastRows, 0));
        $this->assertEquals([120, 267.3, 147.3], array_column($lastRows, 1));
    }

    private function receiveProduct(Company $company, string $name, float $cost): Product
    {
        $product = Product::create(['name' => $name, 'company_id' => $company->id]);
        $purchase = PurchaseInvoice::create([
            'invoice_number' => 'PI-'.$company->id, 'company_id' => $company->id, 'warehouse_id' => 1,
            'invoice_date' => '2023-09-01', 'purchase_type' => 'credit',
        ]);
        $purchase->items()->create(['product_id' => $product->id, 'batch_number' => 'B1', 'quantity' => 30, 'purchase_rate' => $cost]);
        app(InvoicePostingService::class)->postPurchase($purchase);

        return $product;
    }
}
