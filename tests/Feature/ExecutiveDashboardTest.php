<?php

namespace Tests\Feature;

use App\Models\Booking;
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
use Database\Seeders\RolePermissionSeeder;
use Database\Seeders\SystemSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
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

    public function test_pdf_export_is_gated_to_admins(): void
    {
        $this->actingAs($this->admin);
        $response = $this->get(route('dashboard.executive.pdf'));
        $response->assertOk();
        $this->assertStringContainsString('application/pdf', $response->headers->get('content-type'));

        $this->actingAs($this->accountant);
        $this->get(route('dashboard.executive.pdf'))->assertForbidden();

        $this->actingAs($this->booker);
        $this->get(route('dashboard.executive.pdf'))->assertForbidden();
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
                ->where('workingCapital.cash_cycle', null));
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
