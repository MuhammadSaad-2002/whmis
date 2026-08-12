<?php

namespace Tests\Feature;

use App\Models\Company;
use App\Models\Customer;
use App\Models\Product;
use App\Models\PurchaseInvoice;
use App\Models\SalesInvoice;
use App\Models\User;
use App\Services\InvoicePostingService;
use App\Services\LedgerService;
use App\Services\NumberSeriesService;
use App\Services\PaymentService;
use Database\Seeders\RolePermissionSeeder;
use Database\Seeders\SystemSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

class FinancialPositionTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    private Company $company;

    private Customer $customer;

    private Product $product;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed([RolePermissionSeeder::class, SystemSeeder::class]);
        $this->admin = User::where('email', 'admin@whmis.local')->firstOrFail();
        $this->actingAs($this->admin);

        $this->company = Company::create(['name' => 'Getz Pharma', 'city' => 'Karachi']);
        $this->customer = Customer::create(['name' => 'City Pharmacy', 'city' => 'Lahore']);
        $this->product = Product::create([
            'name' => 'Panadol 500mg', 'company_id' => $this->company->id, 'trade_price' => 100,
        ]);
    }

    /**
     * Build a receivable (credit sale 2000, receipt 500 → balance 1500) and a
     * payable (credit purchase 8000, payment 3000 → balance 5000).
     */
    private function seedMoney(): void
    {
        $posting = app(InvoicePostingService::class);
        $payments = app(PaymentService::class);
        $today = now()->toDateString();

        // Purchase 100 @ 80 credit → payable 8000.
        $purchase = PurchaseInvoice::create([
            'invoice_number' => app(NumberSeriesService::class)->next('purchase_invoice'),
            'company_id' => $this->company->id, 'warehouse_id' => 1,
            'invoice_date' => $today, 'purchase_type' => 'credit',
        ]);
        $purchase->items()->create([
            'product_id' => $this->product->id, 'batch_number' => 'B1',
            'quantity' => 100, 'purchase_rate' => 80, 'trade_price' => 100,
        ]);
        $posting->postPurchase($purchase->refresh());
        $payments->record($this->company, ['method' => 'cash', 'amount' => 3000, 'payment_date' => $today]);

        // Sale 20 @ 100 credit, no disc/gst → receivable 2000.
        $sale = SalesInvoice::create([
            'invoice_number' => app(NumberSeriesService::class)->next('sales_invoice'),
            'customer_id' => $this->customer->id, 'warehouse_id' => 1,
            'invoice_date' => $today, 'sale_type' => 'credit',
        ]);
        $sale->items()->create([
            'product_id' => $this->product->id, 'quantity' => 20,
            'trade_price' => 100, 'discount_percent' => 0, 'gst_percent' => 0,
        ]);
        $posting->postSale($sale->refresh());
        $payments->record($this->customer, ['method' => 'cash', 'amount' => 500, 'payment_date' => $today]);
    }

    public function test_financial_position_totals_and_per_party(): void
    {
        // A second customer with no activity must be excluded (zero balance).
        Customer::create(['name' => 'Idle Pharmacy']);

        $this->seedMoney();

        $from = Carbon::now()->startOfMonth();
        $to = Carbon::now();
        $data = app(LedgerService::class)->financialPosition($from, $to);

        // Totals.
        $this->assertEqualsWithDelta(1500.0, $data['totals']['total_receivable'], 0.01);
        $this->assertEqualsWithDelta(5000.0, $data['totals']['total_payable'], 0.01);
        $this->assertEqualsWithDelta(-3500.0, $data['totals']['net'], 0.01);
        $this->assertEqualsWithDelta(500.0, $data['totals']['received'], 0.01);
        $this->assertEqualsWithDelta(3000.0, $data['totals']['paid'], 0.01);

        // Zero-balance customer excluded.
        $this->assertCount(1, $data['receivables']);
        $this->assertSame(1, $data['totals']['customer_count']);
        $this->assertCount(1, $data['payables']);

        // Per-party balances + paid-in-period.
        $rec = $data['receivables'][0];
        $this->assertSame('City Pharmacy', $rec['name']);
        $this->assertEqualsWithDelta(1500.0, $rec['balance'], 0.01);
        $this->assertEqualsWithDelta(500.0, $rec['paid'], 0.01);
        $this->assertEqualsWithDelta(1500.0, $rec['aging']['total'], 0.01);

        $pay = $data['payables'][0];
        $this->assertSame('Getz Pharma', $pay['name']);
        $this->assertEqualsWithDelta(5000.0, $pay['balance'], 0.01);
        $this->assertEqualsWithDelta(3000.0, $pay['paid'], 0.01);
    }

    /** Sale then full receipt in the period → balance 0, paid = full. */
    private function settleCustomer(Customer $customer, float $qty = 10): void
    {
        $today = now()->toDateString();
        $sale = SalesInvoice::create([
            'invoice_number' => app(NumberSeriesService::class)->next('sales_invoice'),
            'customer_id' => $customer->id, 'warehouse_id' => 1,
            'invoice_date' => $today, 'sale_type' => 'credit',
        ]);
        $sale->items()->create([
            'product_id' => $this->product->id, 'quantity' => $qty,
            'trade_price' => 100, 'discount_percent' => 0, 'gst_percent' => 0,
        ]);
        app(InvoicePostingService::class)->postSale($sale->refresh());
        app(PaymentService::class)->record($customer, [
            'method' => 'cash', 'amount' => $qty * 100, 'payment_date' => $today,
        ]);
    }

    public function test_settled_party_active_in_period_is_shown_but_counted_separately(): void
    {
        $this->seedMoney(); // City Pharmacy outstanding 1500; Getz payable 5000.

        $settled = Customer::create(['name' => 'Paid Off Pharmacy']);
        $this->settleCustomer($settled); // sale 1000, receipt 1000 → balance 0.

        $data = app(LedgerService::class)->financialPosition(Carbon::now()->startOfMonth(), Carbon::now());

        // Both customers listed: one outstanding, one settled.
        $this->assertCount(2, $data['receivables']);

        // Counts split outstanding vs settled.
        $this->assertSame(1, $data['totals']['customer_count']);
        $this->assertSame(1, $data['totals']['settled_customer_count']);

        // Settled row: zero balance, full paid-in-period, no aging, sorted last.
        $settledRow = collect($data['receivables'])->firstWhere('name', 'Paid Off Pharmacy');
        $this->assertEqualsWithDelta(0.0, $settledRow['balance'], 0.01);
        $this->assertEqualsWithDelta(1000.0, $settledRow['paid'], 0.01);
        $this->assertNull($settledRow['aging']);
        $this->assertSame('Paid Off Pharmacy', $data['receivables'][1]['name']);

        // total_receivable unaffected by the settled row.
        $this->assertEqualsWithDelta(1500.0, $data['totals']['total_receivable'], 0.01);
    }

    public function test_party_settled_before_the_period_is_excluded(): void
    {
        $settled = Customer::create(['name' => 'Paid Off Pharmacy']);
        // Give it stock to sell, then settle today.
        $purchase = PurchaseInvoice::create([
            'invoice_number' => app(NumberSeriesService::class)->next('purchase_invoice'),
            'company_id' => $this->company->id, 'warehouse_id' => 1,
            'invoice_date' => now()->toDateString(), 'purchase_type' => 'cash',
        ]);
        $purchase->items()->create([
            'product_id' => $this->product->id, 'batch_number' => 'B1',
            'quantity' => 100, 'purchase_rate' => 80, 'trade_price' => 100,
        ]);
        app(InvoicePostingService::class)->postPurchase($purchase->refresh());
        $this->settleCustomer($settled);

        // Filter to next month: no payment in window, balance already 0 → excluded.
        $from = Carbon::now()->addMonth()->startOfMonth();
        $to = Carbon::now()->addMonth()->endOfMonth();
        $data = app(LedgerService::class)->financialPosition($from, $to);

        $this->assertCount(0, $data['receivables']);
        $this->assertSame(0, $data['totals']['settled_customer_count']);
    }

    public function test_payments_log_lists_both_directions(): void
    {
        $this->seedMoney();

        $data = app(LedgerService::class)->financialPosition(Carbon::now()->startOfMonth(), Carbon::now());

        $this->assertCount(2, $data['payments']);

        $in = collect($data['payments'])->firstWhere('direction', 'in');
        $out = collect($data['payments'])->firstWhere('direction', 'out');

        $this->assertSame('customer', $in['party_type']);
        $this->assertSame('City Pharmacy', $in['party_name']);
        $this->assertEqualsWithDelta(500.0, $in['amount'], 0.01);

        $this->assertSame('company', $out['party_type']);
        $this->assertSame('Getz Pharma', $out['party_name']);
        $this->assertEqualsWithDelta(3000.0, $out['amount'], 0.01);
    }

    public function test_page_renders_with_permission(): void
    {
        $this->seedMoney();

        $this->get(route('ledger.position'))
            ->assertOk()
            ->assertInertia(fn ($page) => $page
                ->component('ledger/position')
                ->has('data.receivables', 1)
                ->has('data.payables', 1)
                ->where('data.totals.net', -3500)
            );
    }

    public function test_page_forbidden_without_permission(): void
    {
        $booker = User::factory()->create();
        $booker->assignRole('Booker'); // no ledger.view
        $this->actingAs($booker);

        $this->get(route('ledger.position'))->assertForbidden();
    }

    public function test_pdf_streams(): void
    {
        $this->seedMoney();

        $response = $this->get(route('ledger.position.pdf'));
        $response->assertOk();
        $this->assertSame('application/pdf', $response->headers->get('content-type'));
    }
}
