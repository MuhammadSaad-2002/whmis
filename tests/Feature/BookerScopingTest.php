<?php

namespace Tests\Feature;

use App\Models\BookerAssignmentLog;
use App\Models\Booking;
use App\Models\Company;
use App\Models\Customer;
use App\Models\Product;
use App\Models\User;
use Database\Seeders\RolePermissionSeeder;
use Database\Seeders\SystemSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

class BookerScopingTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    private User $booker;

    private Product $product;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed([RolePermissionSeeder::class, SystemSeeder::class]);

        $this->admin = User::where('email', 'admin@whmis.local')->firstOrFail();
        $this->booker = User::factory()->create(['name' => 'Booker Bob']);
        $this->booker->assignRole('Booker');

        $company = Company::create(['name' => 'Getz Pharma']);
        $this->product = Product::create([
            'name' => 'Panadol 500mg', 'company_id' => $company->id,
            'purchase_price' => 80, 'trade_price' => 100, 'retail_price' => 120,
        ]);
    }

    public function test_booker_dashboard_is_scoped_with_no_financial_keys(): void
    {
        $customer = Customer::create(['name' => 'City Pharmacy', 'booker_id' => $this->booker->id]);
        Booking::create([
            'booking_number' => 'BK-1', 'customer_id' => $customer->id,
            'booker_id' => $this->booker->id, 'warehouse_id' => 1,
            'booking_date' => now()->toDateString(), 'status' => 'pending',
        ]);

        $this->actingAs($this->booker);
        $this->get('/dashboard')
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('dashboard')
                ->where('scope', 'booker')
                ->where('kpis.assigned_pharmacies', 1)
                ->where('kpis.orders_total', 1)
                ->where('kpis.orders_pending', 1)
                ->has('recentBookings', 1)
                ->missing('kpis.month_profit')
                ->missing('kpis.receivable')
                ->missing('topCustomers')
                ->missing('recentSales'));
    }

    public function test_admin_dashboard_is_the_full_financial_view(): void
    {
        $this->actingAs($this->admin);
        $this->get('/dashboard')
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('dashboard')
                ->missing('scope')
                ->has('kpis.month_profit')
                ->has('kpis.receivable')
                ->has('topCustomers'));
    }

    public function test_lookup_products_hides_purchase_price_from_booker(): void
    {
        $this->actingAs($this->booker);
        $this->getJson(route('lookup.products'))
            ->assertOk()
            ->assertJsonPath('0.trade_price', 100)
            ->assertJsonPath('0.retail_price', 120)
            ->assertJsonMissingPath('0.purchase_price');
    }

    public function test_lookup_products_includes_purchase_price_for_admin(): void
    {
        $this->actingAs($this->admin);
        $this->getJson(route('lookup.products'))
            ->assertOk()
            ->assertJsonPath('0.purchase_price', 80);
    }

    public function test_assigning_and_unassigning_bookers_writes_pivot_and_audit_log(): void
    {
        $otherBooker = User::factory()->create(['name' => 'Booker Cara']);
        $otherBooker->assignRole('Booker');

        $this->actingAs($this->admin);

        // Create with two bookers assigned.
        $this->post(route('customers.store'), [
            'name' => 'City Pharmacy',
            'status' => 'active',
            'booker_ids' => [$this->booker->id, $otherBooker->id],
        ])->assertRedirect();

        $customer = Customer::where('name', 'City Pharmacy')->firstOrFail();
        $this->assertSame(2, $customer->bookers()->count());
        $this->assertSame(2, BookerAssignmentLog::where('action', 'assigned')->count());

        // Update: drop one booker.
        $this->put(route('customers.update', $customer), [
            'name' => 'City Pharmacy',
            'status' => 'active',
            'booker_ids' => [$this->booker->id],
        ])->assertRedirect();

        $this->assertSame(1, $customer->bookers()->count());
        $this->assertSame(1, BookerAssignmentLog::where('action', 'unassigned')
            ->where('booker_id', $otherBooker->id)->count());
    }

    public function test_booking_customer_options_are_scoped_to_the_booker(): void
    {
        // Primary-booker customer.
        $mine = Customer::create(['name' => 'Mine Pharmacy', 'booker_id' => $this->booker->id]);
        // Pivot-assigned customer (different primary).
        $shared = Customer::create(['name' => 'Shared Pharmacy']);
        $shared->bookers()->attach($this->booker->id, ['assigned_by' => $this->admin->id]);
        // Unrelated customer the booker must not see.
        Customer::create(['name' => 'Other Pharmacy']);

        $this->actingAs($this->booker);
        $this->get(route('bookings.create'))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('bookings/form')
                ->has('customers', 2)
                ->where('customers.0.name', 'Mine Pharmacy')
                ->where('customers.1.name', 'Shared Pharmacy'));
    }

    public function test_customer_list_is_scoped_to_the_bookers_own_pharmacies(): void
    {
        $mine = Customer::create(['name' => 'Mine Pharmacy', 'booker_id' => $this->booker->id]);
        $shared = Customer::create(['name' => 'Shared Pharmacy']);
        $shared->bookers()->attach($this->booker->id, ['assigned_by' => $this->admin->id]);
        Customer::create(['name' => 'Other Pharmacy']);

        $this->actingAs($this->booker);
        $this->get(route('customers.index'))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('customers/index')
                ->has('customers.data', 2));

        // Admin sees all three.
        $this->actingAs($this->admin);
        $this->get(route('customers.index'))
            ->assertInertia(fn (Assert $page) => $page->has('customers.data', 3));
    }

    public function test_booker_assignment_audit_screen_requires_audit_permission(): void
    {
        $this->actingAs($this->booker);
        $this->get('/booker-assignments')->assertForbidden();

        $this->actingAs($this->admin);
        $this->get('/booker-assignments')
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page->component('admin/booker-assignments/index'));
    }
}
