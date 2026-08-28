<?php

namespace Tests\Feature;

use App\Models\Booking;
use App\Models\Company;
use App\Models\Customer;
use App\Models\LedgerEntry;
use App\Models\Product;
use App\Models\SalesInvoice;
use App\Models\User;
use Database\Seeders\RolePermissionSeeder;
use Database\Seeders\SystemSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
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
        $this->postedSale(now()->toDateString(), 1000);
        $this->postedSale(now()->subDays(60)->toDateString(), 5000);

        $this->actingAs($this->admin);

        // This-month window excludes the 60-day-old sale.
        $this->get('/dashboard?period=this_month')
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page->where('kpis.sales', fn ($v) => (float) $v === 1000.0));

        // Last-12-months window includes both.
        $this->get('/dashboard?period=last_12')
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page->where('kpis.sales', fn ($v) => (float) $v === 6000.0));
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
}
