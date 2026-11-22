<?php

namespace Tests\Feature;

use App\Models\{Batch, Booking, BookerVisit, CollectionFollowUp, Company, Customer, Dispatch, DispatchEvent, LedgerEntry, Payment, Product, SalesInvoice, SalesReturn, StockMovement, User};
use App\Services\{DispatchService, PaymentService, SystemHealthService};
use Database\Seeders\{RolePermissionSeeder, SystemSeeder};
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Inertia\Testing\AssertableInertia as Assert;
use Spatie\Permission\Models\{Permission, Role};
use Tests\TestCase;

class DistributionOperationsTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;
    private User $booker;
    private Customer $customer;
    private Product $product;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed([RolePermissionSeeder::class, SystemSeeder::class]);
        $this->admin = User::where('email', 'admin@whmis.local')->firstOrFail();
        $this->booker = User::factory()->create(); $this->booker->assignRole('Booker');
        $this->customer = Customer::create(['name' => 'Assigned Pharmacy', 'booker_id' => $this->booker->id]);
        $company = Company::create(['name' => 'Supplier']);
        $this->product = Product::create(['name' => 'Medicine', 'company_id' => $company->id, 'trade_price' => 100, 'retail_price' => 120]);
        $this->actingAs($this->admin);
    }

    private function sale(array $attributes = []): SalesInvoice
    {
        $sale = SalesInvoice::create($attributes + ['invoice_number' => 'SI-'.Str::random(8), 'customer_id' => $this->customer->id,
            'warehouse_id' => 1, 'invoice_date' => now()->subDays(10)->toDateString(), 'due_date' => now()->subDay()->toDateString(),
            'status' => 'posted', 'total_amount' => 1000, 'booker_id' => $this->booker->id]);
        $sale->items()->create(['product_id' => $this->product->id, 'quantity' => 10, 'bonus_quantity' => 2, 'trade_price' => 100]);
        return $sale;
    }

    private function action(SalesInvoice $sale, string $action, array $data = [])
    {
        return $this->post(route('dispatch.record', $sale), $data + ['action' => $action, 'request_key' => (string) Str::uuid(), 'assigned_to' => $this->admin->id]);
    }

    private function ship(SalesInvoice $sale): void
    {
        foreach (['picking', 'packed', 'dispatched'] as $action) $this->action($sale, $action)->assertRedirect()->assertSessionHasNoErrors();
    }

    public function test_dispatch_partial_delivery_retry_and_correction_do_not_touch_stock_or_money(): void
    {
        $sale = $this->sale(); $line = $sale->items()->firstOrFail();
        $batch = Batch::create(['product_id' => $this->product->id, 'warehouse_id' => 1, 'batch_number' => 'B1', 'qty_available' => 30]);
        $this->ship($sale);
        $key = (string) Str::uuid();
        $payload = ['request_key' => $key, 'receiver_name' => 'Pharmacy staff', 'items' => [['sales_invoice_item_id' => $line->id, 'quantity' => 5]]];
        $this->action($sale, 'delivered', $payload)->assertRedirect()->assertSessionHasNoErrors();
        $this->action($sale, 'delivered', $payload)->assertRedirect()->assertSessionHasNoErrors();
        $this->assertEquals(4, DispatchEvent::count());
        $this->assertSame('partial', Dispatch::first()->status);
        $this->assertEquals(7, app(DispatchService::class)->progress($sale)[0]['remaining']);
        $this->action($sale, 'delivered', ['receiver_name' => 'Pharmacy staff', 'items' => [['sales_invoice_item_id' => $line->id, 'quantity' => 7]]])->assertSessionHasNoErrors();
        $this->assertSame('delivered', Dispatch::first()->status);
        $this->action($sale, 'correct_delivery', ['notes' => 'One unit was entered by mistake', 'items' => [['sales_invoice_item_id' => $line->id, 'quantity' => 1]]])->assertSessionHasNoErrors();
        $this->assertSame('partial', Dispatch::first()->status);
        $this->assertEquals(11, app(DispatchService::class)->progress($sale)[0]['delivered']);
        $this->assertEquals(30, $batch->refresh()->qty_available);
        $this->assertSame(0, StockMovement::count()); $this->assertSame(0, LedgerEntry::count()); $this->assertSame(0, Payment::count());
    }

    public function test_delivery_rejects_invalid_states_cross_invoice_items_and_overdelivery(): void
    {
        $sale = $this->sale(); $other = $this->sale();
        $this->action($sale, 'dispatched')->assertSessionHasErrors('action');
        $this->assertSame(0, Dispatch::count());
        $this->ship($sale);
        $this->action($sale, 'delivered', ['receiver_name' => 'Staff', 'items' => [['sales_invoice_item_id' => $other->items()->first()->id, 'quantity' => 1]]])->assertSessionHasErrors('action');
        $this->action($sale, 'delivered', ['receiver_name' => 'Staff', 'items' => [['sales_invoice_item_id' => $sale->items()->first()->id, 'quantity' => 13]]])->assertSessionHasErrors('action');
        $this->assertSame(3, DispatchEvent::count());
        $sale->update(['status' => 'cancelled']);
        $this->action($sale, 'failed', ['notes' => 'No delivery'])->assertSessionHasErrors('action');
    }

    public function test_historical_invoices_are_untracked_until_activity_is_recorded(): void
    {
        $this->sale();
        $this->get(route('dispatch.index', ['status' => 'untracked']))->assertOk()->assertInertia(fn (Assert $p) => $p
            ->has('invoices.data', 1)->where('invoices.data.0.dispatch_status', 'untracked'));
        $this->assertSame(0, Dispatch::count());
    }

    public function test_posted_returns_reduce_delivery_balance_and_cancelled_returns_do_not(): void
    {
        $sale = $this->sale(); $item = $sale->items()->firstOrFail();
        $return = SalesReturn::create(['return_number' => 'SR-1', 'sales_invoice_id' => $sale->id, 'customer_id' => $this->customer->id,
            'warehouse_id' => 1, 'return_date' => now(), 'status' => 'posted', 'total_amount' => 300]);
        $return->items()->create(['sales_invoice_item_id' => $item->id, 'product_id' => $this->product->id, 'quantity' => 3]);
        $this->assertEquals(9, app(DispatchService::class)->progress($sale)[0]['remaining']);
        $return->update(['status' => 'cancelled']);
        $this->assertEquals(12, app(DispatchService::class)->progress($sale)[0]['remaining']);
    }

    public function test_return_settled_deliveries_close_without_fabricating_received_goods(): void
    {
        $sale = $this->sale(); $sale->items()->update(['bonus_quantity' => 0]);
        $this->action($sale, 'close_returned', ['notes' => 'All goods returned'])->assertSessionHasErrors('action');
        $return = SalesReturn::create(['return_number' => 'SR-1', 'sales_invoice_id' => $sale->id, 'customer_id' => $this->customer->id,
            'warehouse_id' => 1, 'return_date' => now(), 'status' => 'posted', 'total_amount' => 1000]);
        $return->items()->create(['sales_invoice_item_id' => $sale->items()->first()->id, 'product_id' => $this->product->id, 'quantity' => 10]);
        $this->action($sale, 'close_returned', ['notes' => 'All goods covered by posted return'])->assertSessionHasNoErrors();
        $this->assertSame('closed', Dispatch::first()->status);
        $this->assertEquals(0, app(DispatchService::class)->progress($sale)[0]['delivered']);
    }

    public function test_employee_profile_explains_missing_sales_booker_setting(): void
    {
        $employee = \App\Models\Employee::create(['name' => 'Field staff', 'employee_number' => 'EMP-1', 'user_id' => $this->booker->id,
            'joining_date' => now(), 'weekly_off_days' => [0], 'is_booker' => false]);
        $this->get(route('hr.employee', $employee))->assertOk()->assertInertia(fn (Assert $p) => $p
            ->where('customerOptions', null)->where('customerAssignmentIssue', fn ($message) => str_contains($message, 'Enable Sales Booker')));
        $employee->update(['is_booker' => true]);
        $this->get(route('hr.employee', $employee))->assertInertia(fn (Assert $p) => $p->where('customerAssignmentIssue', null)->has('customerOptions', 1));
    }

    public function test_collection_balances_match_payment_lookup_and_settled_invoices_disappear(): void
    {
        $sale = $this->sale();
        app(PaymentService::class)->record($this->customer, ['method' => 'cash', 'amount' => 200, 'payment_date' => now()->toDateString()],
            [['invoice_type' => 'sales_invoice', 'invoice_id' => $sale->id, 'amount' => 200]]);
        $return = SalesReturn::create(['return_number' => 'SR-1', 'sales_invoice_id' => $sale->id, 'customer_id' => $this->customer->id,
            'warehouse_id' => 1, 'return_date' => now(), 'status' => 'posted', 'total_amount' => 300]);
        $this->get(route('collections.index'))->assertOk()->assertInertia(fn (Assert $p) => $p
            ->has('invoices.data', 1)->where('invoices.data.0.outstanding', 500)->where('invoices.data.0.paid_amount', 200)
            ->where('invoices.data.0.return_credit', 300)->missing('invoices.data.0.total_cost'));
        $this->assertEquals(500, app(PaymentService::class)->openInvoices($this->customer)[0]['outstanding']);
        $return->update(['total_amount' => 800]);
        $this->get(route('collections.index'))->assertInertia(fn (Assert $p) => $p->has('invoices.data', 0));
    }

    public function test_collection_promises_are_audited_follow_ups_not_receipts(): void
    {
        $sale = $this->sale();
        $data = ['outcome' => 'promised', 'assigned_to' => $this->admin->id, 'promised_date' => now()->addDay()->toDateString(),
            'promised_amount' => 800, 'next_follow_up' => now()->addDays(2)->toDateString(), 'notes' => 'Customer agreed to pay tomorrow'];
        $this->post(route('collections.follow-up', $sale), $data)->assertSessionHasNoErrors();
        $this->assertSame(1, CollectionFollowUp::count()); $this->assertSame(0, Payment::count()); $this->assertSame(0, LedgerEntry::count());
        $this->post(route('collections.follow-up', $sale), array_replace($data, ['promised_amount' => 1001]))->assertSessionHasErrors('promised_amount');
        $this->post(route('collections.follow-up', $sale), array_replace($data, ['assigned_to' => $this->booker->id]))->assertSessionHasErrors('assigned_to');
        $this->get(route('collections.show', $sale))->assertOk()->assertInertia(fn (Assert $p) => $p->has('history', 1));
        $this->assertSame(1, DB::table('audits')->where('event', 'collection_follow_up')->count());
    }

    public function test_follow_up_filter_uses_latest_follow_up_only(): void
    {
        $sale = $this->sale();
        CollectionFollowUp::create(['sales_invoice_id' => $sale->id, 'outcome' => 'contacted', 'next_follow_up' => now()->subDay(), 'notes' => 'Old', 'created_by' => $this->admin->id]);
        CollectionFollowUp::create(['sales_invoice_id' => $sale->id, 'outcome' => 'contacted', 'next_follow_up' => now()->addDay(), 'notes' => 'New', 'created_by' => $this->admin->id]);
        $this->get(route('collections.index', ['bucket' => 'follow_up']))->assertInertia(fn (Assert $p) => $p->has('invoices.data', 0));
        $this->get(route('collections.index', ['bucket' => 'overdue']))->assertInertia(fn (Assert $p) => $p->has('invoices.data', 1));
    }

    public function test_follow_up_dates_use_pakistan_day_across_utc_midnight(): void
    {
        $this->travelTo(\Illuminate\Support\Carbon::parse('2026-11-15 20:00:00', 'UTC'));
        $sale = $this->sale();
        $this->post(route('collections.follow-up', $sale), ['outcome' => 'contacted', 'next_follow_up' => '2026-11-15', 'notes' => 'Past Pakistan day'])
            ->assertSessionHasErrors('next_follow_up');
        $this->post(route('collections.follow-up', $sale), ['outcome' => 'contacted', 'next_follow_up' => '2026-11-16', 'notes' => 'Current Pakistan day'])
            ->assertSessionHasNoErrors();
        $this->get(route('collections.index', ['bucket' => 'follow_up']))->assertInertia(fn (Assert $p) => $p->has('invoices.data', 1));
        $this->travelBack();
    }

    public function test_booker_workday_and_visit_updates_are_customer_scoped(): void
    {
        $other = Customer::create(['name' => 'Other pharmacy']);
        $this->actingAs($this->booker)->get(route('booker.workday'))->assertOk()->assertInertia(fn (Assert $p) => $p
            ->has('customers.data', 1)->where('customers.data.0.id', $this->customer->id)->missing('customers.data.0.credit_limit'));
        $payload = ['visit_date' => now('Asia/Karachi')->toDateString(), 'outcome' => 'visited', 'notes' => 'Discussed order'];
        $this->put(route('booker.visit', $other), $payload)->assertForbidden();
        $this->put(route('booker.visit', $this->customer), $payload)->assertSessionHasNoErrors();
        $this->put(route('booker.visit', $this->customer), array_replace($payload, ['outcome' => 'no_order']))->assertSessionHasNoErrors();
        $this->assertSame(1, BookerVisit::count());
        $this->assertSame('no_order', BookerVisit::first()->outcome);
        $this->put(route('booker.visit', $this->customer), array_replace($payload, ['visit_date' => now()->addDays(2)->toDateString()]))->assertSessionHasErrors('visit_date');
    }

    public function test_repeat_booking_uses_current_prices_resets_promotions_and_checks_ownership(): void
    {
        $booking = Booking::create(['booking_number' => 'BK-1', 'customer_id' => $this->customer->id, 'booker_id' => $this->booker->id,
            'warehouse_id' => 1, 'booking_date' => now(), 'status' => 'converted']);
        $booking->items()->create(['product_id' => $this->product->id, 'quantity' => 3, 'requested_bonus' => 2, 'trade_price' => 50, 'discount_percent' => 10]);
        $this->actingAs($this->booker)->get(route('bookings.create', ['repeat_booking_id' => $booking->id]))->assertOk()->assertInertia(fn (Assert $p) => $p
            ->where('booking', null)->where('bookingPrefill.customer_id', $this->customer->id)
            ->where('bookingPrefill.items.0.trade_price', '100.00')->where('bookingPrefill.items.0.quantity', '3')
            ->where('bookingPrefill.items.0.requested_bonus', '0')->has('bookingPrefill.items.0.incentives', 0));
        $this->assertSame(1, Booking::count());
        $other = User::factory()->create(); $other->assignRole('Booker');
        $this->actingAs($other)->get(route('bookings.create', ['repeat_booking_id' => $booking->id]))->assertForbidden();
    }

    public function test_new_routes_enforce_permissions_and_read_only_roles_cannot_change_deliveries(): void
    {
        $sale = $this->sale();
        foreach (['dispatch.index', 'collections.index', 'system.health'] as $route) $this->actingAs($this->booker)->get(route($route))->assertForbidden();
        $accountant = User::factory()->create(); $accountant->assignRole('Accountant');
        $this->actingAs($accountant)->get(route('dispatch.show', $sale))->assertOk();
        $this->action($sale, 'picking')->assertForbidden();
        $this->actingAs($this->admin)->get(route('dispatch.index'))->assertOk();
        $this->get(route('system.health'))->assertOk();
    }

    public function test_provisioning_preserves_custom_roles_and_doctor_reports_missing_permission(): void
    {
        $extra = Permission::findOrCreate('custom.permission', 'web');
        $role = Role::findByName('Admin'); $role->givePermissionTo($extra);
        $this->artisan('whmis:provision')->assertSuccessful();
        $this->assertTrue($role->refresh()->hasPermissionTo('custom.permission'));
        $schema = collect(app(SystemHealthService::class)->checks())->firstWhere('name', 'Workflow schema');
        $this->assertTrue($schema['ok']);
        Role::findByName('Super Admin')->revokePermissionTo('dispatch.manage');
        $check = collect(app(SystemHealthService::class)->checks())->firstWhere('name', 'Operations permissions');
        $this->assertFalse($check['ok']);
    }
}
