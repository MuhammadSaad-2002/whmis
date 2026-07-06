<?php

namespace Tests\Feature;

use App\Models\Company;
use App\Models\Customer;
use App\Models\Product;
use App\Models\PurchaseInvoice;
use App\Models\SalesInvoice;
use App\Models\User;
use App\Services\InvoicePostingService;
use App\Services\NumberSeriesService;
use Database\Seeders\RolePermissionSeeder;
use Database\Seeders\SystemSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

class ReportTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    private Customer $customer;

    private Product $product;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed([RolePermissionSeeder::class, SystemSeeder::class]);
        $this->admin = User::where('email', 'admin@whmis.local')->firstOrFail();
        $this->actingAs($this->admin);

        $company = Company::create(['name' => 'Getz Pharma']);
        $booker = User::factory()->create(['name' => 'Booker Bob']);
        $booker->assignRole('Booker');
        $this->customer = Customer::create(['name' => 'City Pharmacy', 'booker_id' => $booker->id]);
        $this->product = Product::create([
            'name' => 'Panadol 500mg', 'company_id' => $company->id, 'trade_price' => 100,
        ]);

        $posting = app(InvoicePostingService::class);

        $purchase = PurchaseInvoice::create([
            'invoice_number' => app(NumberSeriesService::class)->next('purchase_invoice'),
            'company_id' => $company->id, 'warehouse_id' => 1,
            'invoice_date' => now()->toDateString(), 'purchase_type' => 'credit',
        ]);
        $purchase->items()->create([
            'product_id' => $this->product->id, 'batch_number' => 'B1',
            'quantity' => 100, 'purchase_rate' => 80, 'trade_price' => 100,
        ]);
        $posting->postPurchase($purchase->refresh());

        // Sale: 20 @ 100 with 2 bonus → net 2000, cost 22×80=1760, profit 240.
        $sale = SalesInvoice::create([
            'invoice_number' => app(NumberSeriesService::class)->next('sales_invoice'),
            'customer_id' => $this->customer->id, 'warehouse_id' => 1,
            'invoice_date' => now()->toDateString(), 'sale_type' => 'credit',
        ]);
        $sale->items()->create([
            'product_id' => $this->product->id, 'quantity' => 20, 'bonus_quantity' => 2,
            'trade_price' => 100, 'discount_percent' => 0, 'gst_percent' => 0,
        ]);
        $posting->postSale($sale->refresh());
    }

    public function test_reports_hub_lists_catalog(): void
    {
        $this->get(route('reports.index'))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('reports/index')
                ->has('catalog.Sales')
                ->has('catalog.Financial'));
    }

    public function test_product_sales_report_aggregates_qty_bonus_revenue_profit(): void
    {
        $response = $this->get(route('reports.show', 'product-sales'));

        $response->assertOk()->assertInertia(fn (Assert $page) => $page
            ->component('reports/show')
            ->where('rows.0.product', 'Panadol 500mg')
            ->where('rows.0.qty', 20)
            ->where('rows.0.bonus', 2)
            ->where('rows.0.revenue', 2000)
            ->where('rows.0.cost', 1760)
            ->where('rows.0.profit', 240)
            ->where('totals.revenue', 2000));
    }

    public function test_date_filter_constrains_rows(): void
    {
        $this->get(route('reports.show', ['key' => 'sales-register',
            'from' => now()->subYear()->toDateString(), 'to' => now()->subYear()->toDateString()]))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page->has('rows', 0));

        $this->get(route('reports.show', ['key' => 'sales-register',
            'from' => now()->toDateString(), 'to' => now()->toDateString()]))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page->has('rows', 1));
    }

    public function test_booker_sales_groups_by_assigned_booker(): void
    {
        $this->get(route('reports.show', 'booker-sales'))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->where('rows.0.booker', 'Booker Bob')
                ->where('rows.0.revenue', 2000));
    }

    public function test_xlsx_and_pdf_exports_stream(): void
    {
        $this->get(route('reports.show', ['key' => 'product-sales', 'format' => 'xlsx']))
            ->assertOk()
            ->assertHeader('content-type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

        $this->get(route('reports.show', ['key' => 'product-sales', 'format' => 'pdf']))
            ->assertOk()
            ->assertHeader('content-type', 'application/pdf');
    }

    public function test_unknown_report_404s_and_permission_enforced(): void
    {
        $this->get(route('reports.show', 'nonsense'))->assertNotFound();

        $booker = User::factory()->create();
        $booker->assignRole('Booker'); // no reports.view
        $this->actingAs($booker);
        $this->get(route('reports.index'))->assertForbidden();
    }
}
