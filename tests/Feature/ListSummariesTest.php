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
use App\Services\ReturnService;
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
}
