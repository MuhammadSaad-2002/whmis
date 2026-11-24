<?php

namespace Tests\Feature;

use App\Models\Batch;
use App\Models\Company;
use App\Models\Customer;
use App\Models\Payment;
use App\Models\Product;
use App\Models\PurchaseInvoice;
use App\Models\SalesInvoice;
use App\Models\User;
use App\Services\CustomerReceiptReport;
use App\Services\InvoicePostingService;
use App\Services\InventoryService;
use App\Services\NumberSeriesService;
use App\Services\PaymentService;
use App\Services\ReportService;
use App\Services\ReportVisualizationService;
use App\Services\ReturnService;
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
                ->has('catalog.Loans')
                ->has('catalog.Financial'));
    }

    public function test_report_exposes_default_dates_separately_from_applied_dates(): void
    {
        $this->travelTo(now()->startOfMonth()->addDays(14));

        $this->get(route('reports.show', ['key' => 'product-sales', 'from' => now()->subDays(7)->toDateString()]))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->where('filterValues.from', now()->subDays(7)->toDateString())
                ->where('filterValues.to', now()->toDateString())
                ->where('defaultDates.from', now()->startOfMonth()->toDateString())
                ->where('defaultDates.to', now()->toDateString()));
    }

    public function test_actual_receipts_follow_payment_date_without_changing_sales_or_profit(): void
    {
        $this->travelTo(\Illuminate\Support\Carbon::parse('2026-11-24 12:00', 'Asia/Karachi'));
        $sale = SalesInvoice::firstOrFail();
        $sale->update(['invoice_date' => '2026-10-31']);
        $payment = app(PaymentService::class);
        $receipt = $payment->recordManual($this->customer, ['method' => 'online', 'amount' => 750, 'payment_date' => '2026-11-24'],
            [['invoice_type' => 'sales_invoice', 'invoice_id' => $sale->id, 'amount' => 600]]);
        $payment->recordManual($this->customer, ['method' => 'adjustment', 'amount' => 100, 'payment_date' => '2026-11-24'],
            [['invoice_type' => 'sales_invoice', 'invoice_id' => $sale->id, 'amount' => 100]]);
        $other = Customer::create(['name' => 'Another pharmacy']);
        $payment->recordManual($other, ['method' => 'cash', 'amount' => 80, 'payment_date' => '2026-11-24'], []);
        Payment::create([
            'payment_number' => 'RCV-PENDING-REPORT', 'party_type' => 'customer', 'party_id' => $this->customer->id,
            'direction' => 'in', 'method' => 'cheque', 'amount' => 200, 'payment_date' => '2026-11-24', 'status' => 'pending',
        ]);

        $november = ['from' => '2026-11-01', 'to' => '2026-11-24'];
        $october = ['from' => '2026-10-01', 'to' => '2026-10-31'];
        $reports = app(ReportService::class);
        $this->get(route('reports.show', ['key' => CustomerReceiptReport::KEY, 'customer_id' => $this->customer->id] + $november))
            ->assertOk()->assertInertia(fn (Assert $page) => $page->has('rows', 1)->where('rows.0.payment_number', $receipt->payment_number)
                ->where('rows.0.received', 750)->where('totals.received', 750));
        $this->get(route('reports.show', ['key' => CustomerReceiptReport::KEY, 'format' => 'pdf'] + $november))
            ->assertOk()->assertHeader('content-type', 'application/pdf');
        $this->get(route('reports.show', ['key' => CustomerReceiptReport::KEY, 'format' => 'xlsx'] + $november))
            ->assertOk()->assertDownload('customer-receipts-2026-11-24.xlsx');
        $this->assertEquals(830, $reports->build(CustomerReceiptReport::KEY, $november)['totals']['received']);
        $this->assertEquals(0, $reports->build(CustomerReceiptReport::KEY, $october)['totals']['received']);
        $this->assertEquals(0, $reports->build('sales-register', $november)['totals']['net_amount']);
        $octoberSales = $reports->build('sales-register', $october)['totals'];
        $this->assertEquals(600, $octoberSales['received']);
        $this->assertEquals(1300, $octoberSales['outstanding']);
        $this->assertEquals(2000, $octoberSales['net_amount']);
        $this->assertEquals(240, $octoberSales['net_profit']);
        $this->assertEquals(600, $reports->build('booker-sales', $november)['totals']['received']);
        $customers = collect($reports->build('customer-sales', $november)['rows'])->keyBy('customer');
        $this->assertEquals(750, $customers['City Pharmacy']['received']);
        $this->assertEquals(0, $customers['City Pharmacy']['net_revenue']);
        $this->assertEquals(80, $customers['Another pharmacy']['received']);
        $month = collect($reports->profitByMonth()['rows'])->firstWhere('month', 'Nov 2026');
        $this->assertEquals(830, $month['received']);
        $this->assertEquals(0, $month['net_sales']);
        $this->assertEquals(830, $reports->salesProfitTrend(now('Asia/Karachi')->startOfDay(), now('Asia/Karachi')->endOfDay())[0]['received']);

        $payment->cancel($receipt);
        $this->assertEquals(80, $reports->build(CustomerReceiptReport::KEY, $november)['totals']['received']);
        $this->assertEquals(0, $reports->build('sales-register', $october)['totals']['received']);
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
            ->where('rows.0.net_cost', 1760)
            ->where('rows.0.net_profit', 240)
            ->where('totals.revenue', 2000)
            ->where('visualization.labelKey', 'product')
            ->where('visualization.metrics.0.key', 'net_revenue'));
    }

    public function test_all_time_product_cogs_report_has_lifetime_rows_and_grand_totals(): void
    {
        SalesInvoice::where('status', 'posted')->update([
            'invoice_date' => now()->subYears(2)->toDateString(),
        ]);

        $this->get(route('reports.show', 'all-time-product-cogs'))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('reports/show')
                ->where('report.filters', ['supplier'])
                ->where('rows.0.product', 'Panadol 500mg')
                ->where('rows.0.qty_sold', 20)
                ->where('rows.0.bonus_given', 2)
                ->where('rows.0.net_qty_sold', 20)
                ->where('rows.0.gross_cogs', 1760)
                ->where('rows.0.return_cogs', 0)
                ->where('rows.0.net_cogs', 1760)
                ->where('totals.qty_sold', 20)
                ->where('totals.bonus_given', 2)
                ->where('totals.net_cogs', 1760));
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

    public function test_all_time_purchases_stock_distinguishes_drafts_reservations_and_live_stock(): void
    {
        $sale = SalesInvoice::where('status', 'posted')->firstOrFail();
        $sale->update(['invoice_date' => now()->subYears(2)->toDateString()]);
        $purchase = PurchaseInvoice::create([
            'invoice_number' => 'PI-OLDER', 'company_id' => $this->product->company_id,
            'warehouse_id' => 1, 'invoice_date' => now()->subYears(2)->toDateString(), 'purchase_type' => 'credit',
        ]);
        $purchase->items()->create([
            'product_id' => $this->product->id, 'batch_number' => 'B2', 'quantity' => 10,
            'bonus_quantity' => 2, 'purchase_rate' => 80, 'trade_price' => 100,
        ]);
        app(InvoicePostingService::class)->postPurchase($purchase);
        $returnedPurchaseItem = $purchase->items()->firstOrFail();
        $date = now()->toDateString();
        app(ReturnService::class)->createPurchaseReturn($purchase->refresh(), [
            ['purchase_invoice_item_id' => $returnedPurchaseItem->id, 'quantity' => 3],
        ], $date);
        app(ReturnService::class)->createSalesReturn($sale, [
            ['sales_invoice_item_id' => $sale->items()->firstOrFail()->id, 'quantity' => 4],
        ], $date);

        $batch = Batch::where('batch_number', 'B1')->firstOrFail();
        foreach (['reserved' => 7, 'unreserved' => 6, 'cancelled' => 50] as $kind => $units) {
            $draft = SalesInvoice::create([
                'invoice_number' => 'SI-'.$kind, 'customer_id' => $this->customer->id, 'warehouse_id' => 1,
                'invoice_date' => $date, 'sale_type' => 'credit', 'status' => $kind === 'cancelled' ? 'cancelled' : 'draft',
                'stock_reserved' => $kind === 'reserved',
            ]);
            $draft->items()->create([
                'product_id' => $this->product->id, 'quantity' => $units, 'bonus_quantity' => $kind === 'reserved' ? 1 : 0,
                'trade_price' => 100, 'batch_id' => $kind === 'reserved' ? $batch->id : null,
            ]);
            if ($kind === 'reserved') {
                app(InventoryService::class)->reserve($batch, 8, $draft);
            }
        }

        // Special stock stays outside the saleable inventory figures.
        foreach (['is_sample', 'is_loan'] as $flag) {
            Batch::create(['product_id' => $this->product->id, 'warehouse_id' => 1,
                'batch_number' => $flag, 'qty_available' => 100, $flag => true]);
        }
        $other = Product::create(['name' => 'Stock-only product', 'company_id' => Company::create(['name' => 'Other Supplier'])->id]);
        Batch::create(['product_id' => $other->id, 'warehouse_id' => 1, 'batch_number' => 'OPENING', 'qty_available' => 10]);

        $url = route('reports.show', ['key' => 'all-time-purchases-stock', 'company_id' => $this->product->company_id, 'from' => $date, 'to' => $date]);
        $this->get($url)->assertOk()->assertInertia(fn (Assert $page) => $page
            ->component('reports/show')
            ->where('report.filters', ['supplier'])
            ->has('columns', 6)
            ->has('rows', 1)
            ->where('rows.0.product', 'Panadol 500mg')
            ->missing('rows.0.supplier')->missing('rows.0.qty_returned')
            ->where('rows.0.purchased', 109)
            ->where('rows.0.sold', 18)
            ->where('rows.0.on_hold', 14)
            ->where('rows.0.on_hand', 91)
            ->where('rows.0.available', 83)
            ->where('totals.available', 83));

        $this->get($url.'&format=xlsx')->assertOk()->assertHeader('content-type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        $this->get($url.'&format=pdf')->assertOk()->assertHeader('content-type', 'application/pdf');

        $this->get(route('reports.show', 'all-time-purchases-stock'))->assertInertia(fn (Assert $page) => $page
            ->has('rows', 2)->where('rows.1.purchased', 0)->where('rows.1.available', 10)->where('totals.available', 93));
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

    public function test_pdf_visualizations_are_generated_from_report_rows(): void
    {
        $reports = app(ReportService::class);
        $visualizations = app(ReportVisualizationService::class);

        $ranked = $visualizations->pdfCharts('product-sales', $reports->build('product-sales', [
            'from' => now()->toDateString(),
            'to' => now()->toDateString(),
        ]));
        $this->assertCount(1, $ranked);
        $this->assertSame('Top 10 by Net Revenue', $ranked[0]['title']);
        $this->assertStringStartsWith('data:image/svg+xml;base64,', $ranked[0]['image']);
        $rankedSvg = base64_decode(substr($ranked[0]['image'], 26));
        $this->assertStringContainsString('fill="#234968"', $rankedSvg);
        $this->assertStringNotContainsString('<text ', $rankedSvg);
        $this->assertSame('#263b4d', $ranked[0]['labels'][0]['color']);

        $trend = $visualizations->pdfCharts('profit-by-month', $reports->build('profit-by-month', []));
        $this->assertCount(1, $trend);
        $this->assertSame('Sales and Profit Trend', $trend[0]['title']);
        $trendSvg = base64_decode(substr($trend[0]['image'], 26));
        $this->assertStringContainsString('stroke="#234968"', $trendSvg);
        $this->assertStringContainsString('stroke="#087568"', $trendSvg);
        $this->assertStringContainsString('stroke-dasharray="6 4"', $trendSvg);
        $this->assertStringNotContainsString('<text ', $trendSvg);
        $this->assertContains('Net Sales', array_column($trend[0]['labels'], 'text'));
        $this->assertNotNull($trend[0]['labels'][5]['width']);
    }

    public function test_negative_ranked_values_keep_the_alert_color_in_pdf_charts(): void
    {
        $charts = app(ReportVisualizationService::class)->pdfCharts('product-sales', [
            'rows' => [['product' => 'Returned item', 'net_revenue' => -10]],
        ]);

        $svg = base64_decode(substr($charts[0]['image'], 26));
        $this->assertStringContainsString('fill="#b4232a"', $svg);
        $this->assertSame('Rs -10.00', $charts[0]['labels'][1]['text']);
        $this->assertSame('#b4232a', $charts[0]['labels'][1]['color']);
    }

    public function test_pdf_chart_images_preserve_their_intrinsic_aspect_ratio(): void
    {
        $html = view('pdf.report', [
            'title' => 'Chart Test',
            'filters' => [],
            'columns' => [],
            'rows' => [],
            'totals' => [],
            'groupBy' => null,
            'charts' => [[
                'title' => 'Ranked Chart',
                'subtitle' => 'Aspect ratio test',
                'image' => 'data:image/svg+xml;base64,'.base64_encode('<svg xmlns="http://www.w3.org/2000/svg" width="760" height="340"></svg>'),
            ]],
        ])->render();

        $this->assertStringContainsString('.report-chart img { display: block; width: 100%; height: auto; }', $html);
        $this->assertStringNotContainsString('max-height:', $html);
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
