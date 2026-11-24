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
use App\Services\PaymentService;
use App\Services\ReportPdfRenderer;
use App\Services\ReturnService;
use Barryvdh\DomPDF\Facade\Pdf;
use Closure;
use Database\Seeders\RolePermissionSeeder;
use Database\Seeders\SystemSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

/**
 * The list pages carry a `summary` prop that nets the whole filtered set
 * (not just the visible page). This drives the trading loop, then asserts the
 * five index screens report the right gross / returns / net figures.
 */
class ListSummariesTest extends TestCase
{
    use RefreshDatabase;

    private Company $company;

    private Customer $customer;

    private Product $product;

    private SalesInvoice $sale;

    private PurchaseInvoice $purchase;

    /** Numeric equality that ignores int/float JSON round-trip (450 vs 450.0). */
    private function eq(float $expected): Closure
    {
        return fn ($actual) => abs((float) $actual - $expected) < 0.001;
    }

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed([RolePermissionSeeder::class, SystemSeeder::class]);
        $this->actingAs(User::where('email', 'admin@whmis.local')->firstOrFail());

        $this->company = Company::create(['name' => 'Getz Pharma']);
        $this->customer = Customer::create(['name' => 'City Pharmacy']);
        $this->product = Product::create([
            'name' => 'Panadol 500mg', 'company_id' => $this->company->id, 'trade_price' => 100,
        ]);

        $posting = app(InvoicePostingService::class);
        $numbers = app(NumberSeriesService::class);

        // Purchase 100 @ 80 → gross purchases 8000.
        $this->purchase = PurchaseInvoice::create([
            'invoice_number' => $numbers->next('purchase_invoice'),
            'company_id' => $this->company->id, 'warehouse_id' => 1,
            'invoice_date' => now()->toDateString(), 'purchase_type' => 'credit',
        ]);
        $this->purchase->items()->create([
            'product_id' => $this->product->id, 'batch_number' => 'B1',
            'quantity' => 100, 'purchase_rate' => 80, 'trade_price' => 100,
        ]);
        $posting->postPurchase($this->purchase->refresh());
        $this->purchase->refresh();

        // Sale 20 @ 100 − 10% disc, gst 0 → net 1800.
        $this->sale = SalesInvoice::create([
            'invoice_number' => $numbers->next('sales_invoice'),
            'customer_id' => $this->customer->id, 'warehouse_id' => 1,
            'invoice_date' => now()->toDateString(), 'sale_type' => 'credit',
        ]);
        $this->sale->items()->create([
            'product_id' => $this->product->id, 'quantity' => 20,
            'trade_price' => 100, 'discount_percent' => 10, 'gst_percent' => 0,
        ]);
        $this->sale = $posting->postSale($this->sale->refresh());
    }

    public function test_sales_and_purchase_lists_net_out_posted_returns(): void
    {
        $returns = app(ReturnService::class);

        // Sales return 5 units → refund 5 × 90 = 450; net sales 1350.
        $saleReturn = $returns->createSalesReturn(
            $this->sale,
            [['sales_invoice_item_id' => $this->sale->items->first()->id, 'quantity' => 5]],
            now()->toDateString(),
        );
        $grossProfit = round((float) $this->sale->total_profit, 2);
        $returnProfit = round((float) $saleReturn->total_amount - (float) $saleReturn->total_cost, 2);
        $netProfit = round($grossProfit - $returnProfit, 2);

        // Purchase return 10 @ 80 = 800; net purchases 8000 − 800 = 7200.
        $returns->createPurchaseReturn(
            $this->purchase,
            [['purchase_invoice_item_id' => $this->purchase->items->first()->id, 'quantity' => 10]],
            now()->toDateString(),
        );

        $this->get(route('sales.index'))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->where('summary.gross', $this->eq(1800.0))
                ->where('summary.returns', $this->eq(450.0))
                ->where('summary.net', $this->eq(1350.0))
                ->where('summary.gross_profit', $this->eq($grossProfit))
                ->where('summary.net_profit', $this->eq($netProfit)));

        $this->get(route('purchases.index'))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->where('summary.gross', $this->eq(8000.0))
                ->where('summary.returns', $this->eq(800.0))
                ->where('summary.net', $this->eq(7200.0)));
    }

    public function test_returns_lists_report_posted_credit_and_debit_totals(): void
    {
        $returns = app(ReturnService::class);

        $returns->createSalesReturn(
            $this->sale,
            [['sales_invoice_item_id' => $this->sale->items->first()->id, 'quantity' => 5]],
            now()->toDateString(),
        );
        $returns->createPurchaseReturn(
            $this->purchase,
            [['purchase_invoice_item_id' => $this->purchase->items->first()->id, 'quantity' => 10]],
            now()->toDateString(),
        );

        $this->get(route('returns.sales.index'))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->where('summary.total', $this->eq(450.0))
                ->where('summary.count', $this->eq(1)));

        $this->get(route('returns.purchases.index'))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->where('summary.total', $this->eq(800.0))
                ->where('summary.count', $this->eq(1)));
    }

    public function test_sales_list_tabs_and_exports_share_the_filtered_net_amounts(): void
    {
        app(ReturnService::class)->createSalesReturn($this->sale, [
            ['sales_invoice_item_id' => $this->sale->items->first()->id, 'quantity' => 5],
        ], now()->toDateString());
        $draft = SalesInvoice::create([
            'invoice_number' => 'SI-BOOKING', 'warehouse_id' => 1, 'customer_id' => $this->customer->id,
            'invoice_date' => now()->toDateString(), 'sale_type' => 'booking', 'total_amount' => 120,
        ]);

        $filter = ['search' => 'City Pharmacy', 'status' => 'returned', 'sort' => 'net', 'per_page' => 10];
        $this->get(route('sales.index', $filter))
            ->assertOk()->assertInertia(fn (Assert $page) => $page
                ->has('invoices.data', 1)->where('invoices.per_page', 10)
                ->where('invoices.data.0.id', $this->sale->id)
                ->where('invoices.data.0.net_amount', $this->eq(1350))
                ->where('invoices.data.0.return_status', 'partially_returned')
                ->where('counts.all', 2)->where('counts.returned', 1)->where('counts.draft', 1)
                ->where('summary.net', $this->eq(1350)));
        $csv = $this->get(route('sales.export', $filter))->assertOk()->streamedContent();
        $this->assertStringContainsString('1800.00,450.00,1350.00', $csv);
        $this->assertStringNotContainsString($draft->invoice_number, $csv);
        $csv = $this->get(route('sales.export', ['ids' => [$draft->id]]))->assertOk()->streamedContent();
        $this->assertStringContainsString($draft->invoice_number, $csv);
        $this->assertStringNotContainsString($this->sale->invoice_number, $csv);

        $renderer = app(ReportPdfRenderer::class);
        $this->mock(ReportPdfRenderer::class)->shouldReceive('render')->once()->withArgs(function ($data) use ($draft) {
            $this->assertSame([$this->sale->invoice_number], array_column($data['rows'], 'invoice'));
            $this->assertNotContains($draft->invoice_number, array_column($data['rows'], 'invoice'));
            $this->assertEquals(1350, $data['totals']['net']);

            return true;
        })->andReturnUsing(fn ($data) => $renderer->render($data));
        $pdf = $this->get(route('sales.list.pdf', $filter + ['ids' => [$this->sale->id, $draft->id]]));
        $pdf->assertOk()->assertHeader('Content-Type', 'application/pdf');
        $this->assertStringStartsWith('%PDF', $pdf->getContent());
        $this->actingAs(User::factory()->create()->assignRole('Booker'))->get(route('sales.list.pdf'))->assertForbidden();
    }

    public function test_purchase_register_filters_sorts_and_counts_all_matching_statuses(): void
    {
        $this->purchase->update(['supplier_invoice_number' => 'GETZ-100']);
        $cash = PurchaseInvoice::create([
            'invoice_number' => 'PI-CASH-DRAFT', 'supplier_invoice_number' => 'GETZ-101', 'company_id' => $this->company->id,
            'warehouse_id' => 1, 'invoice_date' => $this->purchase->invoice_date, 'purchase_type' => 'cash', 'total_amount' => 9000,
        ]);
        PurchaseInvoice::create([
            'invoice_number' => 'PI-OTHER-DRAFT', 'company_id' => Company::create(['name' => 'Other Supplier'])->id,
            'warehouse_id' => 1, 'invoice_date' => $this->purchase->invoice_date, 'purchase_type' => 'credit', 'total_amount' => 200,
        ]);

        $this->get(route('purchases.index', ['search' => 'Getz Pharma', 'sort' => 'total', 'direction' => 'desc', 'per_page' => 10]))
            ->assertOk()->assertInertia(fn (Assert $page) => $page
                ->has('invoices.data', 2)->where('invoices.per_page', 10)->where('invoices.data.0.id', $cash->id)
                ->where('counts.all', 2)->where('counts.draft', 1)->where('counts.posted', 1)->where('counts.cancelled', 0)
                ->where('summary.drafts_total', $this->eq(9000))->where('summary.gross', $this->eq(17000)));

        $this->get(route('purchases.index', ['company_id' => $this->company->id, 'status' => 'posted', 'sort' => 'supplier']))
            ->assertOk()->assertInertia(fn (Assert $page) => $page
                ->has('invoices.data', 1)->where('invoices.data.0.id', $this->purchase->id)
                ->where('counts.all', 2)->where('counts.draft', 1)->where('summary.gross', $this->eq(8000)));

        $this->get(route('purchases.index', ['search' => 'GETZ-101', 'purchase_type' => 'cash']))
            ->assertOk()->assertInertia(fn (Assert $page) => $page
                ->has('invoices.data', 1)->where('invoices.data.0.id', $cash->id)->where('counts.posted', 0));
    }

    public function test_invoice_documents_share_print_typography_margins_and_one_numbered_footer_per_page(): void
    {
        config(['branding.footer' => 'Invoice Footer Check']);
        $encode = fn (string $value) => mb_convert_encoding($value, 'UTF-16BE', 'UTF-8');

        foreach ([['sales.print', $this->sale, 'Sales Invoice'], ['purchases.print', $this->purchase, 'Purchase Invoice'],
            ['sales.net-position', $this->sale, 'Net / Final Position']] as [$route, $invoice, $title]) {
            $this->app->forgetInstance('dompdf.wrapper');
            $document = app('dompdf.wrapper');
            Pdf::swap($document);
            $this->get(route($route, $invoice))->assertOk()->assertHeader('Content-Type', 'application/pdf');
            $dompdf = $document->getDomPDF();
            $canvas = $dompdf->getCanvas();
            $this->assertGreaterThan($canvas->get_width(), $canvas->get_height());
            $style = $dompdf->getCss()->get_page_styles()['base'];
            $this->assertEquals(ReportPdfRenderer::TOP_MARGIN, $style->margin_top);
            $this->assertEquals(ReportPdfRenderer::SIDE_MARGIN, $style->margin_left);
            $this->assertEquals(ReportPdfRenderer::SIDE_MARGIN, $style->margin_right);
            $this->assertEquals(ReportPdfRenderer::BOTTOM_MARGIN, $style->margin_bottom);
            $pdf = $document->output(['compress' => false]);
            $this->assertStringContainsString($encode($invoice->invoice_number), $pdf);
            $this->assertStringContainsString($encode($title), $pdf);
            $this->assertStringContainsString('/InstrumentSans-Regular', $pdf);
            $pages = $canvas->get_page_count();
            $this->assertSame($pages, substr_count($pdf, $encode('Invoice Footer Check')));
            for ($page = 1; $page <= $pages; $page++) {
                $this->assertSame(1, substr_count($pdf, $encode("Page {$page} / {$pages}")));
            }
        }
    }

    public function test_sales_preview_shows_real_items_and_completed_allocations(): void
    {
        app(PaymentService::class)->record($this->customer, [
            'method' => 'cash', 'amount' => 300, 'payment_date' => now()->toDateString(),
        ], [['invoice_type' => 'sales_invoice', 'invoice_id' => $this->sale->id, 'amount' => 300]]);
        $this->getJson(route('sales.preview', $this->sale))->assertOk()
            ->assertJsonPath('items.0.product', $this->product->name)
            ->assertJsonPath('paid', 300)
            ->assertJsonPath('outstanding', 1500);
        $this->get(route('returns.sales.create', ['invoice_id' => $this->sale->id]))->assertOk()
            ->assertInertia(fn (Assert $page) => $page->where('initialInvoiceId', $this->sale->id));
    }

    public function test_bulk_post_uses_the_existing_posting_rules_and_permissions(): void
    {
        $draft = fn ($number) => SalesInvoice::create([
            'invoice_number' => $number, 'warehouse_id' => 1, 'customer_id' => $this->customer->id,
            'invoice_date' => now()->toDateString(), 'sale_type' => 'credit',
        ]);
        $valid = $draft('SI-VALID');
        $empty = $draft('SI-EMPTY');
        $valid->items()->create(['product_id' => $this->product->id, 'quantity' => 1, 'trade_price' => 100]);
        $payload = ['ids' => [$valid->id, $empty->id]];
        $admin = auth()->user();
        $accountant = User::factory()->create();
        $accountant->assignRole('Accountant');
        $this->actingAs($accountant)->post(route('sales.post-selected'), $payload)->assertForbidden();
        $this->assertTrue($valid->refresh()->isDraft());

        $this->actingAs($admin)->from(route('sales.index'))->post(route('sales.post-selected'), $payload)
            ->assertRedirect(route('sales.index'))->assertSessionHas('error', fn ($message) => str_contains($message, '1 posted; 1 not posted'));
        $this->assertTrue($valid->refresh()->isPosted());
        $this->assertTrue($empty->refresh()->isDraft());
    }

    public function test_cancelled_sales_return_is_excluded_from_summaries(): void
    {
        $returns = app(ReturnService::class);

        // One posted (5) plus one that we cancel (3): only 450 should count.
        $returns->createSalesReturn(
            $this->sale,
            [['sales_invoice_item_id' => $this->sale->items->first()->id, 'quantity' => 5]],
            now()->toDateString(),
        );
        $toCancel = $returns->createSalesReturn(
            $this->sale,
            [['sales_invoice_item_id' => $this->sale->items->first()->id, 'quantity' => 3]],
            now()->toDateString(),
        );
        $returns->cancelSalesReturn($toCancel);

        $this->assertSame('cancelled', $toCancel->refresh()->status);

        $this->get(route('sales.index'))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->where('summary.returns', $this->eq(450.0))
                ->where('summary.net', $this->eq(1350.0)));

        $this->get(route('returns.sales.index'))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->where('summary.total', $this->eq(450.0))
                ->where('summary.count', $this->eq(1)));
    }

    public function test_payments_summary_nets_receipts_against_payments_and_respects_date_filter(): void
    {
        $payments = app(PaymentService::class);

        // Customer receipt (money in).
        $payments->record($this->customer, [
            'method' => 'bank', 'amount' => 1000, 'payment_date' => '2026-06-01',
        ]);
        // Supplier payment on an older date (money out).
        $payments->record($this->company, [
            'method' => 'bank', 'amount' => 600, 'payment_date' => '2026-01-01',
        ]);

        // Full set: receipts 1000, payments 600, net 400.
        $this->get(route('payments.index'))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->where('summary.receipts', $this->eq(1000.0))
                ->where('summary.payments', $this->eq(600.0))
                ->where('summary.net', $this->eq(400.0)));

        // From 2026-03-01 excludes the January supplier payment.
        $this->get(route('payments.index', ['from' => '2026-03-01']))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->where('summary.receipts', $this->eq(1000.0))
                ->where('summary.payments', $this->eq(0.0))
                ->where('summary.net', $this->eq(1000.0)));
    }

    public function test_payment_register_rounds_the_exact_net_only_after_subtracting_payments(): void
    {
        $payments = app(PaymentService::class);
        $payments->record($this->customer, [
            'method' => 'bank', 'amount' => '10.51', 'payment_date' => '2026-06-01',
        ]);
        $payments->record($this->company, [
            'method' => 'bank', 'amount' => '10.49', 'payment_date' => '2026-06-01',
        ]);

        $this->get(route('payments.index'))->assertOk()->assertInertia(fn (Assert $page) => $page
            ->where('summary.receipts', $this->eq(11.0))
            ->where('summary.payments', $this->eq(10.0))
            ->where('summary.net', $this->eq(0.0)));
    }
}
