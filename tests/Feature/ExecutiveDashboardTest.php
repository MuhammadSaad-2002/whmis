<?php

namespace Tests\Feature;

use App\Http\Middleware\HandleInertiaRequests;
use App\Models\Batch;
use App\Models\Company;
use App\Models\Customer;
use App\Models\LedgerEntry;
use App\Models\Product;
use App\Models\PurchaseInvoice;
use App\Models\PurchaseReturn;
use App\Models\SalesInvoice;
use App\Models\SalesReturn;
use App\Models\User;
use App\Services\LedgerService;
use Database\Seeders\RolePermissionSeeder;
use Database\Seeders\SystemSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Inertia\Support\Header;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

class ExecutiveDashboardTest extends TestCase
{
    use RefreshDatabase;

    private User $superAdmin;

    private User $admin;

    private User $accountant;

    private User $booker;

    private Customer $customer;

    private Company $company;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed([RolePermissionSeeder::class, SystemSeeder::class]);

        // Seeded admin@whmis.local is the Super Admin (holds every permission).
        $this->superAdmin = User::where('email', 'admin@whmis.local')->firstOrFail();

        $this->admin = User::factory()->create(['name' => 'Aisha Admin']);
        $this->admin->assignRole('Admin');

        $this->accountant = User::factory()->create(['name' => 'Adnan Accountant']);
        $this->accountant->assignRole('Accountant');

        $this->booker = User::factory()->create(['name' => 'Bilal Booker']);
        $this->booker->assignRole('Booker');

        $this->company = Company::create(['name' => 'Getz Pharma', 'city' => 'Karachi']);
        $this->customer = Customer::create(['name' => 'City Pharmacy', 'city' => 'Lahore']);
    }

    /** Post a sale for a given date without running the stock/posting machinery. */
    private function postedSale(string $date, float $total, float $profit = 0.0): SalesInvoice
    {
        return SalesInvoice::create([
            'invoice_number' => 'SI-'.uniqid(),
            'customer_id' => $this->customer->id,
            'warehouse_id' => 1,
            'invoice_date' => $date,
            'sale_type' => 'credit',
            'status' => 'posted',
            'total_amount' => $total,
            'total_profit' => $profit,
        ]);
    }

    public function test_admin_and_super_admin_get_the_executive_dashboard(): void
    {
        foreach ([$this->superAdmin, $this->admin] as $user) {
            $this->actingAs($user);
            $this->get('/dashboard')
                ->assertOk()
                ->assertInertia(fn (Assert $page) => $page
                    ->component('dashboard')
                    ->where('scope', 'executive')
                    ->has('kpis.sales')
                    ->has('kpis.margin_pct')
                    ->has('financials.net_position')
                    ->has('aging', 4)
                    ->has('topProducts')
                    ->has('monthlyTrend')
                    ->has('filterValues.period'));
        }
    }

    public function test_accountant_keeps_the_current_full_dashboard(): void
    {
        $this->actingAs($this->accountant);
        $this->get('/dashboard')
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('dashboard')
                ->missing('scope')
                ->missing('financials')
                ->missing('aging')
                ->has('kpis.month_profit')
                ->has('recentSales'));
    }

    public function test_booker_still_gets_the_booker_dashboard(): void
    {
        $this->actingAs($this->booker);
        $this->get('/dashboard')
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('dashboard')
                ->where('scope', 'booker'));
    }

    public function test_period_selector_rescopes_period_kpis(): void
    {
        $this->postedSale(now()->toDateString(), 1000, 100);
        $this->postedSale(now()->subDays(60)->toDateString(), 5000, 500);

        $this->actingAs($this->admin);

        // This-month window excludes the 60-day-old sale.
        $this->get('/dashboard?period=this_month')
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->where('kpis.sales', fn ($v) => (float) $v === 1000.0)
                ->where('monthlyTrend', fn ($rows) => (float) collect($rows)->sum('sales') === 1000.0)
                ->where('monthlyTrend', fn ($rows) => (float) collect($rows)->sum('profit') === 100.0));

        // Last-12-months window includes both.
        $this->get('/dashboard?period=last_12')
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->where('kpis.sales', fn ($v) => (float) $v === 6000.0)
                ->where('monthlyTrend', fn ($rows) => (float) collect($rows)->sum('sales') === 6000.0)
                ->where('monthlyTrend', fn ($rows) => (float) collect($rows)->sum('profit') === 600.0));
    }

    /** Same request the workspace sends when a period is picked. */
    private function partialHeaders(array $props): array
    {
        return [
            Header::INERTIA => 'true',
            Header::VERSION => app(HandleInertiaRequests::class)->version(Request::create('/dashboard')),
            Header::PARTIAL_COMPONENT => 'dashboard',
            Header::PARTIAL_ONLY => implode(',', $props),
        ];
    }

    public function test_period_partial_update_does_not_query_or_return_the_current_snapshot(): void
    {
        $date = now('Asia/Karachi')->toDateString();
        $this->postedSale($date, 500, 100);
        $this->actingAs($this->admin);
        $props = ['filterValues', 'kpis', 'hr', 'monthlyTrend', 'topProducts', 'salesBySupplier', 'topCustomers', 'rankingTotals'];

        DB::enableQueryLog();
        try {
            $response = $this->get('/dashboard?period=today', $this->partialHeaders($props));
            $queries = strtolower(implode("\n", array_column(DB::getQueryLog(), 'query')));
        } finally {
            DB::disableQueryLog();
            DB::flushQueryLog();
        }

        $response->assertOk()->assertHeader(Header::INERTIA, 'true')
            ->assertJsonPath('props.filterValues.days', 1)
            ->assertJsonPath('props.kpis.sales', 500)
            ->assertJsonPath('props.monthlyTrend.0.profit', 100)
            ->assertJsonMissingPath('props.asOf')
            ->assertJsonMissingPath('props.financials')
            ->assertJsonMissingPath('props.aging')
            ->assertJsonMissingPath('props.recentSales');
        $this->assertStringNotContainsString('ledger_entries', $queries);
        $this->assertStringNotContainsString('batches', $queries);
        $this->assertStringNotContainsString('stock_loans', $queries);
    }

    public function test_executive_partial_request_discards_old_view_if_permissions_changed(): void
    {
        $this->actingAs($this->accountant);
        $this->get('/dashboard?period=today', $this->partialHeaders(['filterValues', 'kpis']))
            ->assertStatus(409)->assertHeader(Header::LOCATION, '/dashboard');
    }

    public function test_batched_aging_matches_single_account_aging_with_same_day_charges_and_receipts(): void
    {
        $asOf = Carbon::parse('2026-11-23');
        $other = Customer::create(['name' => 'Other Pharmacy']);
        $ledger = app(LedgerService::class);
        $ledger->post($this->customer, 'sale', '2026-06-01', 100, 0);
        $ledger->post($this->customer, 'sale', '2026-06-01', 200, 0);
        $ledger->post($this->customer, 'sale', '2026-11-20', 300, 0);
        $ledger->post($this->customer, 'receipt', '2026-11-22', 0, 180);
        $ledger->post($other, 'sale', '2026-10-10', 900, 0);
        $aged = $ledger->customerAging([$this->customer->id, $other->id], $asOf);

        $this->assertSame($ledger->aging($this->customer, $asOf), $aged[$this->customer->id]);
        $this->assertSame($ledger->aging($other, $asOf), $aged[$other->id]);
        $this->assertSame(120.0, $aged[$this->customer->id]['over_90']);
        $this->assertSame(300.0, $aged[$this->customer->id]['current']);
    }

    public function test_pdf_export_is_gated_to_admins(): void
    {
        $this->actingAs($this->admin);
        $response = $this->get(route('dashboard.executive.pdf', ['period' => 'custom', 'from' => '2026-11-01', 'to' => '2026-11-24']));
        $response->assertOk();
        $this->assertStringContainsString('application/pdf', $response->headers->get('content-type'));
        $this->assertStringStartsWith('%PDF', $response->getContent());
        $this->assertGreaterThanOrEqual(2, preg_match_all('/\/Type\s*\/Page\b/', $response->getContent()));

        $this->actingAs($this->accountant);
        $this->get(route('dashboard.executive.pdf'))->assertForbidden();

        $this->actingAs($this->booker);
        $this->get(route('dashboard.executive.pdf'))->assertForbidden();
    }

    public function test_quick_ranges_use_pakistan_business_dates_and_calendar_boundaries(): void
    {
        $this->travelTo(Carbon::parse('2026-12-31 20:05:00', 'UTC'));
        $this->postedSale('2026-03-31', 200);
        $this->postedSale('2026-04-02', 400);
        $this->postedSale('2026-12-01', 1000);
        $this->postedSale('2026-12-31', 2000);
        $this->postedSale('2027-01-01', 4000);
        $this->actingAs($this->admin);

        foreach ([
            ['today', '2027-01-01', '2027-01-01', 4000],
            ['yesterday', '2026-12-31', '2026-12-31', 2000],
            ['this_month', '2027-01-01', '2027-01-01', 4000],
            ['last_month', '2026-12-01', '2026-12-31', 3000],
            ['last_9', '2026-04-02', '2027-01-01', 7400],
        ] as [$period, $from, $to, $sales]) {
            $this->get('/dashboard?period='.$period)->assertOk()->assertInertia(fn (Assert $page) => $page
                ->where('filterValues.period', $period)
                ->where('filterValues.from', $from)
                ->where('filterValues.to', $to)
                ->where('kpis.sales', $sales)
                ->where('monthlyTrend', fn ($rows) => collect($rows)->sum('sales') === $sales));
        }
    }

    public function test_custom_range_is_inclusive_and_rejects_invalid_dates(): void
    {
        $this->postedSale('2026-09-07', 100);
        $this->postedSale('2026-09-08', 200);
        $this->postedSale('2026-09-10', 400);
        $this->postedSale('2026-09-11', 800);
        $this->actingAs($this->admin);

        $this->get('/dashboard?period=custom&from=2026-09-08&to=2026-09-10')->assertOk()->assertInertia(fn (Assert $page) => $page
            ->where('filterValues.period', 'custom')
            ->where('filterValues.from', '2026-09-08')
            ->where('filterValues.to', '2026-09-10')
            ->where('kpis.sales', 600)
            ->has('monthlyTrend', 3));

        $this->getJson('/dashboard?period=custom&from=2026-09-10&to=2026-09-08')
            ->assertUnprocessable()->assertJsonValidationErrors('to');
        $this->getJson('/dashboard?period=custom&from=2026-09-31&to=2026-10-01')
            ->assertUnprocessable()->assertJsonValidationErrors('from');
    }

    public function test_default_and_ytd_windows_report_real_invoice_and_stock_activity(): void
    {
        $this->travelTo(Carbon::parse('2026-11-23 12:00:00'));
        $sale = $this->postedSale('2026-08-22', 1000, 300);
        $sale->update(['total_cost' => 700]);
        $this->postedSale('2025-12-08', 200, 100);
        PurchaseInvoice::create([
            'invoice_number' => 'PI-DASH-1', 'company_id' => $this->company->id, 'warehouse_id' => 1,
            'invoice_date' => '2026-08-22', 'status' => 'posted', 'total_amount' => 800,
        ]);
        PurchaseReturn::create([
            'return_number' => 'PR-DASH-1', 'company_id' => $this->company->id, 'warehouse_id' => 1,
            'return_date' => '2026-08-25', 'total_amount' => 100,
        ]);
        SalesReturn::create([
            'return_number' => 'SR-DASH-TREND', 'sales_invoice_id' => $sale->id, 'customer_id' => $this->customer->id,
            'warehouse_id' => 1, 'return_date' => '2026-09-02', 'status' => 'posted', 'total_amount' => 100, 'total_cost' => 70,
        ]);

        $this->actingAs($this->admin);
        $this->get('/dashboard')->assertOk()->assertInertia(fn (Assert $page) => $page
            ->where('filterValues.period', 'last_12')
            ->where('filterValues.from', '2025-11-24')
            ->where('kpis.invoice_count', 2));
        $this->get('/dashboard?period=ytd')->assertOk()->assertInertia(fn (Assert $page) => $page
            ->where('filterValues.period', 'ytd')
            ->where('filterValues.from', '2026-01-01')
            ->where('filterValues.to', '2026-11-23')
            ->where('kpis.invoice_count', 1)
            ->where('kpis.average_invoice', 1000)
            ->where('kpis.sales', 900)
            ->where('kpis.purchases', 700)
            ->where('kpis.cogs', 630)
            ->where('monthlyTrend', function ($rows) {
                $aug = collect($rows)->firstWhere('label', 'Aug 2026');
                $sep = collect($rows)->firstWhere('label', 'Sep 2026');

                return $aug['purchases'] === 700 && $aug['invoice_count'] === 1
                    && $aug['cogs'] === 700 && $sep['cogs'] === -70 && $sep['sales'] === -100;
            }));
    }

    public function test_operations_snapshot_ignores_period_and_separates_expiring_from_expired(): void
    {
        $this->travelTo(Carbon::parse('2026-11-23 12:00:00'));
        $draft = $this->postedSale('2026-11-23', 420);
        $draft->update(['status' => 'draft']);
        LedgerEntry::create([
            'party_type' => 'customer', 'party_id' => $this->customer->id, 'entry_date' => '2026-05-02',
            'entry_type' => 'sale', 'debit' => 150, 'credit' => 0,
        ]);
        $product = Product::create(['name' => 'Expiry test', 'company_id' => $this->company->id]);
        foreach (['2026-11-22', '2026-11-23', '2027-01-02', '2027-04-02'] as $index => $expiry) {
            Batch::create([
                'batch_number' => 'EXP-'.$index, 'warehouse_id' => 1, 'product_id' => $product->id,
                'expiry_date' => $expiry, 'qty_available' => 1,
            ]);
        }

        $this->actingAs($this->admin);
        foreach (['last_3', 'ytd'] as $period) {
            $this->get('/dashboard?period='.$period)->assertOk()->assertInertia(fn (Assert $page) => $page
                ->where('attention.draft_sales', 1)
                ->where('attention.draft_sales_total', 420)
                ->where('attention.overdue_accounts', 1)
                ->where('attention.overdue_amount', 150)
                ->where('attention.expiring_90', 2)
                ->has('expiringSoon', 2)
                ->where('expiringSoon.0.batch_number', 'EXP-1')
                ->where('kpis.sales', 0)
                ->where('kpis.purchases', 0)
                ->where('kpis.cogs', 0));
        }
    }

    public function test_net_position_is_receivable_minus_payable(): void
    {
        // Customer receivable 1500.
        LedgerEntry::create([
            'party_type' => 'customer', 'party_id' => $this->customer->id,
            'entry_date' => now()->toDateString(), 'entry_type' => 'sale', 'debit' => 1500, 'credit' => 0,
        ]);
        // Supplier payable 5000.
        LedgerEntry::create([
            'party_type' => 'company', 'party_id' => $this->company->id,
            'entry_date' => now()->toDateString(), 'entry_type' => 'purchase', 'debit' => 0, 'credit' => 5000,
        ]);

        $this->actingAs($this->admin);
        $this->get('/dashboard')
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->where('financials.receivable', fn ($v) => (float) $v === 1500.0)
                ->where('financials.payable', fn ($v) => (float) $v === 5000.0)
                ->where('financials.net_position', fn ($v) => (float) $v === -3500.0));
    }

    public function test_period_sales_profit_and_top_customers_deduct_credit_notes(): void
    {
        $sale = $this->postedSale(now()->toDateString(), 2000, 400);
        $sale->update(['total_cost' => 1600]);

        SalesReturn::create([
            'return_number' => 'SR-DASH-1',
            'sales_invoice_id' => $sale->id,
            'customer_id' => $this->customer->id,
            'warehouse_id' => 1,
            'return_date' => now()->toDateString(),
            'status' => SalesReturn::STATUS_POSTED,
            'total_amount' => 500,
            'total_cost' => 400,
        ]);

        $this->actingAs($this->admin);
        $this->get('/dashboard?period=this_month')
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->where('kpis.sales', fn ($v) => (float) $v === 1500.0)
                ->where('kpis.profit', fn ($v) => (float) $v === 300.0)
                ->where('monthlyTrend', fn ($rows) => (float) collect($rows)->sum('sales') === 1500.0)
                ->where('monthlyTrend', fn ($rows) => (float) collect($rows)->sum('profit') === 300.0)
                ->where('topCustomers.0.total', fn ($v) => (float) $v === 1500.0)
                ->where('topCustomers.0.profit', fn ($v) => (float) $v === 300.0));
    }
}
