<?php

namespace Tests\Feature;

use App\Models\Booking;
use App\Models\Company;
use App\Models\Customer;
use App\Models\Employee;
use App\Models\Payment;
use App\Models\Product;
use App\Models\SalesInvoice;
use App\Models\User;
use Carbon\CarbonImmutable;
use Database\Seeders\RolePermissionSeeder;
use Database\Seeders\SystemSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Inertia\Testing\AssertableInertia as Assert;
use Spatie\Permission\Models\Permission;
use Tests\TestCase;

class StaffDailyActivityTest extends TestCase
{
    use RefreshDatabase;

    private const DATE = '2026-11-24';

    protected function setUp(): void
    {
        parent::setUp();
        config(['app.timezone' => 'UTC']);
        $this->travelTo(CarbonImmutable::parse('2026-11-25 00:10:00', 'Asia/Karachi'));
        $this->seed([RolePermissionSeeder::class, SystemSeeder::class]);
    }

    public function test_report_and_its_navigation_flag_are_super_admin_only(): void
    {
        $url = route('staff-activity.index');
        $this->get($url)->assertRedirect(route('login'));
        $extra = Permission::findOrCreate('view-staff-daily-activity', 'web');
        foreach (['Admin', 'Booker', 'Salesman'] as $role) {
            $user = User::factory()->create()->assignRole($role)->givePermissionTo($extra);
            $this->actingAs($user)->get($url)->assertForbidden();
            $this->assertNotContains($extra->name, $this->get(route('workspace'))->assertOk()->inertiaProps('auth.permissions'));
        }

        $this->actingAs(User::factory()->create()->assignRole('Super Admin'));
        $this->get($url)->assertOk()->assertInertia(fn (Assert $page) => $page
            ->component('operations/staff-activity')->where('date', '2026-11-25')->where('today', '2026-11-25')->has('staff', 2));
        $this->assertContains($extra->name, $this->get(route('workspace'))->assertOk()->inertiaProps('auth.permissions'));
        $this->getJson($url.'?date=2026-11-26')->assertUnprocessable()->assertJsonValidationErrors('date');
    }

    public function test_it_distinguishes_business_dates_and_individual_lifecycle_amounts(): void
    {
        $admin = User::factory()->create()->assignRole('Super Admin');
        $staff = User::factory()->create(['name' => 'Login for Ali', 'is_active' => true])->assignRole(['Booker', 'Salesman']);
        $nextSalesman = User::factory()->create(['name' => 'Bilal', 'is_active' => true])->assignRole('Salesman');
        User::factory()->create(['is_active' => false])->assignRole('Booker');
        $employee = Employee::create(['employee_number' => 'EMP-01', 'name' => 'Ali', 'user_id' => $staff->id,
            'joining_date' => self::DATE, 'employment_type' => 'permanent', 'weekly_off_days' => [0]]);
        $customer = Customer::create(['name' => 'Fixture customer']);
        $warehouse = DB::table('warehouses')->value('id');
        $company = Company::create(['name' => 'Fixture supplier']);
        $product = Product::create(['name' => 'Fixture product', 'company_id' => $company->id]);

        // 19:00 UTC is midnight in Pakistan. The business invoice and booking dates deliberately differ.
        foreach ([['2026-11-23 19:00:00', 'converted', '850.25'], ['2026-11-23 19:30:00', 'draft', '149.75'],
            ['2026-11-23 18:59:59', 'approved', 900], ['2026-11-24 19:00:00', 'approved', 900],
            ['2026-11-24 18:59:59', 'cancelled', 900], ['2026-11-24 18:59:59', 'rejected', 900]] as $index => [$created, $status, $total]) {
            Booking::create(['booking_number' => 'BK-TEST-'.$index, 'customer_id' => $customer->id, 'warehouse_id' => $warehouse,
                'booker_id' => $staff->id, 'booking_date' => '2026-11-22', 'status' => $status, 'total_amount' => $total, 'created_at' => $created]);
        }
        $sale = SalesInvoice::create(['invoice_number' => 'SI-TEST-1', 'customer_id' => $customer->id, 'warehouse_id' => $warehouse,
            'invoice_date' => '2026-11-22', 'booker_id' => $staff->id, 'planned_salesman_id' => $nextSalesman->id,
            'status' => 'posted', 'posted_at' => '2026-11-24 10:00:00', 'total_amount' => 800]);
        SalesInvoice::create(['invoice_number' => 'SI-TEST-2', 'customer_id' => $customer->id, 'warehouse_id' => $warehouse,
            'invoice_date' => self::DATE, 'booker_id' => $staff->id, 'status' => 'draft', 'total_amount' => 1000]);
        $oldSale = SalesInvoice::create(['invoice_number' => 'SI-TEST-3', 'customer_id' => $customer->id, 'warehouse_id' => $warehouse,
            'invoice_date' => self::DATE, 'booker_id' => $staff->id, 'status' => 'posted', 'posted_at' => '2026-11-23 18:59:59', 'total_amount' => 250]);
        $line = $sale->items()->create(['product_id' => $product->id, 'quantity' => 6, 'bonus_quantity' => 1]);
        $dispatch = DB::table('dispatches')->insertGetId(['sales_invoice_id' => $sale->id, 'custody_required' => true,
            'original_assignee_id' => $staff->id, 'assigned_to' => $nextSalesman->id, 'status' => 'partial']);
        DB::table('dispatches')->insert(['sales_invoice_id' => $oldSale->id, 'assigned_to' => $staff->id, 'status' => 'delivered']);
        foreach ([['delivered', 3, '2026-11-24 10:15:00'], ['delivered', 1, '2026-11-24 18:59:59'],
            ['correct_delivery', -1, '2026-11-24 18:59:59'], ['delivered', 2, '2026-11-24 19:00:00']] as [$action, $qty, $created]) {
            $event = DB::table('dispatch_events')->insertGetId(['dispatch_id' => $dispatch, 'action' => $action, 'request_key' => Str::uuid(),
                'assigned_to' => $nextSalesman->id, 'created_by' => $admin->id, 'created_at' => $created]);
            DB::table('dispatch_event_items')->insert(['dispatch_event_id' => $event, 'sales_invoice_item_id' => $line->id, 'quantity' => $qty]);
        }

        foreach ([['2026-11-23', '2026-11-24 06:30:00', 20000, 'completed', 18000],
            [self::DATE, '2026-11-24 19:00:00', 41000, null, null],
            [self::DATE, '2026-11-24 16:00:00', 4000, 'cancelled', 4000]] as $index => [$businessDate, $submitted, $reported, $paymentStatus, $verified]) {
            $day = DB::table('collection_days')->insertGetId(['salesman_id' => $staff->id, 'business_date' => $businessDate, 'revision' => $index + 1, 'submitted_at' => $submitted]);
            $payment = $paymentStatus ? Payment::create(['payment_number' => 'RCV-TEST-'.$index, 'party_type' => 'customer', 'party_id' => $customer->id,
                'amount' => $verified / 100, 'payment_date' => self::DATE, 'direction' => 'in', 'method' => 'cash', 'status' => $paymentStatus]) : null;
            DB::table('delivery_collections')->insert(['collection_day_id' => $day, 'sales_invoice_id' => $sale->id,
                'reporter_id' => $staff->id, 'request_key' => Str::uuid(), 'method' => 'cash', 'reported_paisa' => $reported,
                'previous_paid_paisa' => 0, 'payment_id' => $payment?->id, 'verified_paisa' => $verified, 'recorded_at' => $payment ? '2026-11-24 18:00:00' : null]);
        }

        $scope = DB::table('commission_scopes')->insertGetId(['source_key' => 'sale:'.$sale->id, 'booker_id' => $staff->id,
            'original_salesman_id' => $staff->id, 'original_paisa' => 80000, 'rules' => '{}', 'snapshots' => '{}']);
        foreach (['booker' => 800, 'salesman' => 400] as $role => $calculated) {
            DB::table('commission_awards')->insert(['commission_scope_id' => $scope, 'sales_invoice_id' => $sale->id,
                'employee_id' => $employee->id, 'role' => $role, 'calculated_paisa' => $calculated, 'state' => 'pending']);
        }
        foreach ([['2026-11-23', 'entitlement', 1000, 1000, 0], ['2026-11-23', 'commission_payout', 0, -100, 100],
            [self::DATE, 'entitlement', 500, 500, 0], [self::DATE, 'recovery_created', -50, 0, 0],
            [self::DATE, 'entitlement', -50, -50, 0], [self::DATE, 'recovery_waiver', 50, 0, 0], [self::DATE, 'commission_payout', 0, -200, 200],
            ['2026-11-25', 'commission_payout', 0, -300, 300]] as [$day, $kind, $expense, $payable, $cashOut]) {
            DB::table('commission_entries')->insert(['employee_id' => $employee->id, 'kind' => $kind, 'expense_paisa' => $expense,
                'payable_paisa' => $payable, 'cash_out_paisa' => $cashOut, 'business_date' => $day, 'reason' => 'Fixture']);
        }

        $this->actingAs($admin)->get(route('staff-activity.index', ['date' => self::DATE]))->assertOk()->assertInertia(fn (Assert $page) => $page
            ->where('date', self::DATE)->has('staff', 2)
            ->where('staff.0.id', $staff->id)->where('staff.0.roles', ['Booker', 'Salesman'])
            ->where('staff.0.name', 'Ali')->where('staff.0.login_name', 'Login for Ali')
            ->where('staff.0.booking_count', 2)->where('staff.0.booking_paisa', 100000)
            ->where('staff.0.sale_count', 1)->where('staff.0.sale_paisa', 80000)
            ->where('staff.0.delivery_count', 0)->where('staff.0.reported_paisa', 45000)
            ->where('staff.0.submitted_paisa', 24000)->where('staff.0.verified_paisa', 18000)
            ->where('staff.0.commission', ['calculated_paisa' => 1200, 'earned_paisa' => 400,
                'paid_paisa' => 200, 'paid_to_date_paisa' => 300, 'payout_due_paisa' => 1150])
            ->where('staff.1.id', $nextSalesman->id)->where('staff.1.sale_count', 0)
            ->where('staff.1.delivery_count', 1)->where('staff.1.delivered_units', 4)->where('staff.1.corrected_units', 1)->where('staff.1.commission', null));

        $nextSalesman->update(['is_active' => false]);

        $this->get(route('staff-activity.index', ['date' => self::DATE]))->assertOk()->assertInertia(fn (Assert $page) => $page
            ->has('staff', 1)->where('staff.0.id', $staff->id));
        $this->assertDatabaseHas('dispatch_events', ['dispatch_id' => $dispatch, 'assigned_to' => $nextSalesman->id]);
    }

    public function test_summary_deduplicates_shared_invoices_in_each_filter_scope(): void
    {
        $admin = User::factory()->create()->assignRole('Super Admin');
        $booker = User::factory()->create(['name' => 'Ali'])->assignRole('Booker');
        $salesman = User::factory()->create(['name' => 'Bilal'])->assignRole('Salesman');
        $hidden = User::factory()->create(['name' => 'Hidden', 'is_active' => false])->assignRole('Salesman');
        $customer = Customer::create(['name' => 'Fixture customer']);
        $company = Company::create(['name' => 'Fixture supplier']);
        $product = Product::create(['name' => 'Fixture product', 'company_id' => $company->id]);
        $sale = SalesInvoice::create(['invoice_number' => 'SI-SHARED', 'customer_id' => $customer->id, 'warehouse_id' => 1,
            'invoice_date' => self::DATE, 'booker_id' => $booker->id, 'status' => 'posted', 'posted_at' => '2026-11-24 10:00:00', 'total_amount' => '875.40']);
        // A second, distinct invoice with exactly the same amount must still count.
        SalesInvoice::create(['invoice_number' => 'SI-SAME-AMOUNT', 'customer_id' => $customer->id, 'warehouse_id' => 1,
            'invoice_date' => self::DATE, 'booker_id' => $booker->id, 'status' => 'posted', 'posted_at' => '2026-11-24 10:10:00', 'total_amount' => '875.40']);
        $dispatch = DB::table('dispatches')->insertGetId(['sales_invoice_id' => $sale->id, 'original_assignee_id' => $salesman->id,
            'assigned_to' => $salesman->id, 'status' => 'delivered']);
        $line = $sale->items()->create(['product_id' => $product->id, 'quantity' => 6]);
        foreach ([$booker, $salesman, $hidden] as $actor) {
            $event = DB::table('dispatch_events')->insertGetId(['dispatch_id' => $dispatch, 'action' => 'delivered', 'request_key' => Str::uuid(),
                'assigned_to' => $actor->id, 'created_by' => $admin->id, 'created_at' => '2026-11-24 12:00:00']);
            DB::table('dispatch_event_items')->insert(['dispatch_event_id' => $event, 'sales_invoice_item_id' => $line->id, 'quantity' => 2]);
        }

        $this->actingAs($admin);
        $this->get(route('staff-activity.index', ['date' => self::DATE]))->assertOk()->assertInertia(fn (Assert $page) => $page
            ->has('staffOptions', 2)->has('staff', 2)
            ->where('staff.0.sale_count', 2)->where('staff.1.sale_count', 1)
            ->where('staff.0.delivery_count', 1)->where('staff.1.delivery_count', 1)
            ->where('invoiceTotals', ['sale_count' => 2, 'sale_paisa' => 175080, 'delivery_count' => 1]));

        $this->get(route('staff-activity.index', ['date' => self::DATE, 'role' => 'Salesman', 'staff_id' => $salesman->id]))->assertOk()
            ->assertInertia(fn (Assert $page) => $page->has('staffOptions', 1)->has('staff', 1)->where('staff.0.id', $salesman->id)
                ->where('filters', ['role' => 'Salesman', 'staff_id' => $salesman->id])
                ->where('invoiceTotals', ['sale_count' => 1, 'sale_paisa' => 87540, 'delivery_count' => 1]));

        $this->get(route('staff-activity.index', ['date' => self::DATE, 'staff_id' => $hidden->id]))->assertOk()
            ->assertInertia(fn (Assert $page) => $page->has('staffOptions', 2)->has('staff', 2)->where('filters.staff_id', null));
    }
}
