<?php

namespace Tests\Feature;

use App\Models\{Booking, Company, Customer, Dispatch, Employee, Payment, Product, PurchaseInvoice, SalesInvoice, User};
use App\Services\{BookingService, DeliveryCollectionService, DeliveryPlanningService, DispatchService, FinanceApprovalService, InvoiceBalanceService, InvoicePostingService, PaymentService, ReturnService};
use Database\Seeders\{RolePermissionSeeder, SystemSeeder};
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

class IntegratedDistributionTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;
    private User $reviewer;
    private User $salesman;
    private Employee $employee;
    private Customer $customer;
    private Product $product;
    private string $date;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed([RolePermissionSeeder::class, SystemSeeder::class]);
        $this->date = now('Asia/Karachi')->toDateString();
        $this->admin = User::factory()->create()->assignRole('Admin');
        $this->reviewer = User::factory()->create()->assignRole('Super Admin');
        $this->salesman = User::factory()->create(['is_active' => true])->assignRole(['Booker','Salesman']);
        $this->employee = Employee::create(['employee_number' => 'EMP-T', 'name' => 'Field employee', 'user_id' => $this->salesman->id,
            'joining_date' => $this->date, 'employment_type' => 'permanent', 'weekly_off_days' => [0]]);
        $supplier = Company::create(['name' => 'Fixture supplier']);
        $this->customer = Customer::create(['name' => 'Fixture customer', 'booker_id' => $this->salesman->id]);
        $this->product = Product::create(['name' => 'Fixture product', 'company_id' => $supplier->id, 'trade_price' => 1000]);
        app(DeliveryPlanningService::class)->save($this->customer, ['delivery_days' => [1,2,3,4,5,6,7], 'salesman_id' => $this->salesman->id]);
        $this->actingAs($this->admin);
        $purchase = PurchaseInvoice::create(['invoice_number' => 'PI-TEST', 'company_id' => $supplier->id, 'warehouse_id' => 1, 'invoice_date' => $this->date]);
        foreach ([['one',50],['two',100]] as [$batch, $quantity]) {
            $purchase->items()->create(['product_id' => $this->product->id, 'batch_number' => $batch, 'quantity' => $quantity, 'purchase_rate' => 500, 'expiry_date' => '2029-11-30']);
        }
        app(InvoicePostingService::class)->postPurchase($purchase);
    }

    private function booking(float $quantity = 100): Booking
    {
        $booking = Booking::create(['booking_number' => 'BK-'.Str::random(6), 'customer_id' => $this->customer->id, 'booker_id' => $this->salesman->id,
            'warehouse_id' => 1, 'booking_date' => $this->date, 'status' => 'approved', 'total_amount' => $quantity * 1000]);
        $booking->items()->create(['product_id' => $this->product->id, 'quantity' => $quantity, 'trade_price' => 1000, 'net_amount' => $quantity * 1000]);
        return $booking;
    }

    private function opening(): int
    {
        $approvals = app(FinanceApprovalService::class);
        $account = $approvals->saveAccount($this->admin, ['name' => 'Office till', 'kind' => 'cash', 'opening' => 1000, 'opening_reference' => 'Verified count']);
        $ticket = $approvals->request($this->admin, 'opening', ['request_key' => (string) Str::uuid(), 'date' => $this->date, 'notes' => 'Count complete'], 'private-fixture.pdf');
        $approvals->approve($ticket->id, $this->reviewer, 'Opening count checked', true);
        $approvals->post($ticket->id, $this->admin, null);
        return $account->id;
    }

    private function action(SalesInvoice $invoice, string $action, array $data = [], ?User $actor = null): void
    {
        $actor ??= $this->salesman;
        $this->actingAs($actor);
        app(DispatchService::class)->record($invoice, ['request_key' => (string) Str::uuid(), 'action' => $action] + $data, $actor);
    }

    private function deliver(SalesInvoice $invoice): void
    {
        $service = app(DispatchService::class);
        $this->action($invoice, 'pickup', ['pickup_lines' => collect($service->pickupProgress($invoice))->map(
            fn ($line) => ['id' => $line->id, 'quantity' => $line->remaining])->all()]);
        $this->action($invoice, 'confirm_pickup');
        $this->action($invoice, 'dispatched');
        $this->action($invoice, 'delivered', ['receiver_name' => 'Customer representative', 'items' => [[
            'sales_invoice_item_id' => $invoice->items()->first()->id, 'quantity' => (float) $invoice->items()->first()->quantity,
        ]]]);
    }

    private function pay(SalesInvoice $invoice, int $account, int $amount): Payment
    {
        $this->actingAs($this->admin);
        return app(PaymentService::class)->recordManual($this->customer, ['method' => 'cash', 'payment_date' => $this->date,
            'financial_account_id' => $account, 'amount' => $amount], [['invoice_type' => 'sales_invoice', 'invoice_id' => $invoice->id, 'amount' => $amount]]);
    }

    private function expectFinanceError(callable $callback, string $fragment): void
    {
        try {
            $callback();
            $this->fail('Expected an error');
        } catch (ValidationException $e) {
            $this->assertStringContainsString($fragment, implode(' ', array_merge(...array_values($e->errors()))));
        }
    }

    public function test_split_respects_quantity_holds_and_posting_records_exact_fifo_batches(): void
    {
        $booking = $this->booking();
        $line = $booking->items()->first();
        $service = app(BookingService::class);
        $first = $service->convertToSale($booking, [['id' => $line->id, 'quantity' => 60, 'bonus_quantity' => 0]]);
        $this->assertSame('partially_invoiced', $booking->refresh()->status);
        $this->assertEquals(150, $this->product->availableStock());
        $this->assertEquals(40, $service->quantities($booking)[$line->id]['remaining']);
        $this->post(route('bookings.convert', $booking), ['lines' => [['id' => $line->id, 'quantity' => 41, 'bonus_quantity' => 0]]])->assertSessionHas('error');
        $second = $service->convertToSale($booking);
        $this->assertSame('converted', $booking->refresh()->status);
        app(InvoicePostingService::class)->cancelSale($second);
        $this->assertSame('partially_invoiced', $booking->refresh()->status);
        $first = app(InvoicePostingService::class)->postSale($first);
        $this->assertEquals(90, $this->product->availableStock());
        $lines = app(DispatchService::class)->pickupProgress($first);
        $this->assertEquals([50, 10], array_column($lines, 'quantity'));
        $this->assertSame(['2029-11-30', '2029-11-30'], array_column($lines, 'expiry'));
        $this->expectFinanceError(fn () => $this->action($first, 'confirm_pickup'), 'Pick every required batch');
        $this->action($first, 'pickup', ['pickup_lines' => [['id' => $lines[0]->id, 'quantity' => 30]]]);
        $this->assertEquals(20, app(DispatchService::class)->pickupProgress($first)[0]->remaining);
        $this->deliver($first);
        $this->assertEquals(90, $this->product->availableStock());
        $this->expectFinanceError(fn () => $this->action($first, 'pickup'), 'Pickup is locked');
        $this->assertDatabaseHas('delivery_collections', ['sales_invoice_id' => $first->id, 'reported_paisa' => 0]);
    }

    public function test_workday_collection_actions_and_summary_follow_assignment_and_delivery_status(): void
    {
        $invoice = app(InvoicePostingService::class)->postSale(app(BookingService::class)->convertToSale($this->booking(2)));
        $this->actingAs($this->salesman)->get(route('booker.workday'))->assertInertia(fn (Assert $page) => $page
            ->where('deliveries.data.0.id', $invoice->id)->where('deliveries.data.0.can_collect', false)
            ->where('pendingDeliveries', 1)->where('collections.entryCount', 0));
        $this->deliver($invoice);
        $this->post('/dispatch/'.$invoice->id.'/collection', ['amount' => 250, 'method' => 'cash', 'request_key' => (string) Str::uuid()])
            ->assertSessionHasNoErrors();
        $this->get(route('booker.workday'))->assertInertia(fn (Assert $page) => $page
            ->where('deliveries.data.0.can_collect', true)->where('deliveries.data.0.pending_paisa', 25000)
            ->where('deliveries.data.0.collectible_paisa', 175000)
            ->where('deliveries.data.0.outstanding', fn ($amount) => (float) $amount === 2000.0)
            ->where('pendingDeliveries', 0)->where('collections.pending', 1)->where('collections.cash', 25000)
            ->where('collections.entryCount', 1)->where('collections.entries.0.invoice_number', $invoice->invoice_number));
        $this->assertDatabaseCount('payments', 0);
    }

    public function test_default_salesman_is_assigned_without_weekdays_and_saving_a_schedule_assigns_waiting_invoices(): void
    {
        $planning = app(DeliveryPlanningService::class);
        $bookings = app(BookingService::class);
        $posting = app(InvoicePostingService::class);
        $planning->save($this->customer, ['salesman_id' => null, 'delivery_days' => []]);
        $waiting = $posting->postSale($bookings->convertToSale($this->booking(2)));
        $this->assertDatabaseHas('dispatches', ['sales_invoice_id' => $waiting->id, 'assigned_to' => null, 'status' => 'pending']);

        $planning->save($this->customer, ['salesman_id' => $this->salesman->id, 'delivery_days' => []]);
        $this->assertDatabaseHas('dispatches', ['sales_invoice_id' => $waiting->id, 'assigned_to' => $this->salesman->id, 'planned_date' => $this->date]);
        $inactive = User::factory()->create(['is_active' => false])->assignRole('Salesman');
        $draft = $bookings->convertToSale($this->booking(2));
        $draft->update(['planned_salesman_id' => $inactive->id]);
        $new = $posting->postSale($draft);
        $this->assertDatabaseHas('dispatches', ['sales_invoice_id' => $new->id, 'assigned_to' => $this->salesman->id,
            'planned_date' => $this->date, 'status' => 'pending']);
        $unposted = $bookings->convertToSale($this->booking(2));
        $different = User::factory()->create(['is_active' => true])->assignRole('Salesman');
        $planning->save($this->customer, ['salesman_id' => $different->id, 'delivery_days' => [1]]);
        $this->assertDatabaseHas('dispatches', ['sales_invoice_id' => $waiting->id, 'assigned_to' => $this->salesman->id]);
        $posting->postSale($unposted);
        $this->assertDatabaseHas('dispatches', ['sales_invoice_id' => $unposted->id, 'assigned_to' => $different->id,
            'planned_date' => now('Asia/Karachi')->startOfDay()->addDays((8 - now('Asia/Karachi')->isoWeekday()) % 7)->toDateString()]);
    }

    public function test_admin_board_preserves_pickup_checks_and_attributes_delivery_to_the_salesman(): void
    {
        $this->actingAs($this->admin->refresh());
        $till = $this->opening();
        $this->post('/commissions/rules', ['source' => 'booking', 'role' => 'salesman', 'basis' => 'invoice',
            'mode' => 'percent', 'rate' => 1, 'effective_from' => $this->date])->assertSessionHasNoErrors();
        $invoice = app(InvoicePostingService::class)->postSale(app(BookingService::class)->convertToSale($this->booking(2)));
        $options = route('dispatch.move-options', $invoice);
        $this->getJson($options)->assertOk()->assertJsonPath('status', 'pending')->assertJsonFragment(['stage' => 'picking', 'action' => 'pickup', 'verify' => true]);
        $move = fn ($action, $status, $data = []) => $this->from(route('dispatch.index'))->post(route('dispatch.record', $invoice), $data + [
            'action' => $action, 'expected_status' => $status, 'request_key' => (string) Str::uuid(),
            'admin_verified' => true, 'verified_salesman_id' => $this->salesman->id,
        ]);
        $this->actingAs($this->salesman)->getJson($options)->assertForbidden();
        $move('pickup', 'pending')->assertForbidden();
        $this->actingAs($this->admin);
        $move('confirm_pickup', 'pending')->assertSessionHasErrors('action');
        $move('pickup', 'pending', ['verified_salesman_id' => $this->admin->id])->assertSessionHasErrors('action');
        $move('pickup', 'pending', ['pickup_lines' => []])->assertSessionHasErrors('action');
        $line = app(DispatchService::class)->pickupProgress($invoice)[0];
        $move('pickup', 'pending', ['pickup_lines' => [['id' => $line->id, 'quantity' => 1]]])->assertSessionHasNoErrors();
        $this->assertDatabaseHas('dispatches', ['sales_invoice_id' => $invoice->id, 'status' => 'picking', 'custodian_id' => $this->salesman->id]);
        $move('confirm_pickup', 'picking')->assertSessionHasErrors('action');
        $move('pickup', 'pending', ['pickup_lines' => [['id' => $line->id, 'quantity' => 1]]])->assertSessionHasErrors('action');
        $move('pickup', 'picking', ['pickup_lines' => [['id' => $line->id, 'quantity' => 1]]])->assertSessionHasNoErrors();
        $this->getJson($options)->assertJsonFragment(['stage' => 'packed', 'action' => 'confirm_pickup', 'verify' => true]);
        $move('confirm_pickup', 'picking')->assertSessionHasNoErrors();
        $move('dispatched', 'packed')->assertSessionHasNoErrors();
        $move('failed', 'dispatched')->assertSessionHasErrors('action');
        $move('failed', 'dispatched', ['notes' => 'Pharmacy was closed'])->assertSessionHasNoErrors();
        $move('dispatched', 'failed')->assertSessionHasNoErrors();

        $items = ['items' => [['sales_invoice_item_id' => $invoice->items()->first()->id, 'quantity' => 1]]];
        $move('delivered', 'dispatched', $items)->assertSessionHasErrors('action');
        $move('delivered', 'dispatched', $items + ['receiver_name' => 'Counter staff'])->assertSessionHasNoErrors();
        $this->assertDatabaseHas('dispatches', ['sales_invoice_id' => $invoice->id, 'status' => 'partial']);
        $move('delivered', 'partial', $items + ['receiver_name' => 'Counter staff'])->assertSessionHasNoErrors();
        $this->assertDatabaseHas('dispatch_events', ['action' => 'delivered', 'receiver_name' => 'Counter staff',
            'created_by' => $this->admin->id, 'assigned_to' => $this->salesman->id]);
        $this->assertDatabaseCount('delivery_collections', 0);
        $this->assertDatabaseCount('payments', 0);
        $this->assertEquals(148, $this->product->availableStock());
        $this->pay($invoice, $till, 2000);
        $this->assertDatabaseHas('commission_awards', ['sales_invoice_id' => $invoice->id, 'employee_id' => $this->employee->id,
            'role' => 'salesman', 'earned_paisa' => 2000]);
    }

    public function test_full_report_hides_collection_until_finance_reopens_an_actual_balance(): void
    {
        $till = $this->opening();
        $invoice = app(InvoicePostingService::class)->postSale(app(BookingService::class)->convertToSale($this->booking(2)));
        $this->deliver($invoice);
        $report = route('distribution.report', $invoice);
        $show = route('dispatch.show', $invoice);
        $first = ['amount' => 250, 'method' => 'cash', 'request_key' => (string) Str::uuid()];
        $this->post($report, $first)->assertSessionHasNoErrors();
        // A report from an earlier collection day still covers part of the invoice.
        DB::table('collection_days')->where('salesman_id', $this->salesman->id)
            ->update(['business_date' => now('Asia/Karachi')->subDay()->toDateString(), 'submitted_at' => now()]);
        $this->get($show)->assertInertia(fn (Assert $page) => $page->where('canReportCollection', true)->where('collectiblePaisa', 175000));
        $last = ['amount' => 1750, 'method' => 'cash', 'request_key' => (string) Str::uuid()];
        $this->post($report, array_replace($last, ['amount' => 1750.01]))->assertSessionHasErrors('finance');
        $this->post($report, $last)->assertSessionHasNoErrors();
        $this->post($report, $last)->assertSessionHasNoErrors(); // Idempotent retry, even at zero capacity.
        $this->post($report, array_replace($last, ['amount' => 0.01, 'request_key' => (string) Str::uuid()]))->assertSessionHasErrors('finance');
        $this->get($show)->assertInertia(fn (Assert $page) => $page->where('canReportCollection', false)->where('collectiblePaisa', 0));
        $this->get(route('booker.workday'))->assertInertia(fn (Assert $page) => $page
            ->where('deliveries.data.0.can_collect', false)->where('deliveries.data.0.collectible_paisa', 0)
            ->where('deliveries.data.0.pending_paisa', 200000)->where('collections.cash', 175000)
            ->where('deliveries.data.0.outstanding', fn ($amount) => (float) $amount === 2000.0));
        $this->assertDatabaseCount('payments', 0);
        $this->assertSame(2, DB::table('delivery_collections')->where('sales_invoice_id', $invoice->id)->where('reported_paisa', '>', 0)->count());

        $collections = app(DeliveryCollectionService::class);
        $row = DB::table('delivery_collections')->where('request_key', $last['request_key'])->first();
        $collections->submit($row->collection_day_id, $this->salesman);
        $this->actingAs($this->admin);
        $collections->countCash($row->collection_day_id, $this->admin, 170000);
        $collections->record($row->id, $this->admin, ['amount' => 1700, 'account_id' => $till, 'notes' => 'Confirmed PKR 50 is still due from customer.']);
        $this->actingAs($this->salesman)->get($show)->assertInertia(fn (Assert $page) => $page
            ->where('canReportCollection', true)->where('collectiblePaisa', 5000));

        $olderRow = DB::table('delivery_collections')->where('request_key', $first['request_key'])->first();
        $this->actingAs($this->admin);
        $collections->countCash($olderRow->collection_day_id, $this->admin, 25000);
        $collections->record($olderRow->id, $this->admin, ['amount' => 250, 'account_id' => $till]);
        $this->pay($invoice, $till, 50);
        $this->actingAs($this->salesman)->get($show)->assertInertia(fn (Assert $page) => $page
            ->where('canReportCollection', false)->where('collectiblePaisa', 0));
    }

    public function test_delivery_can_continue_without_collection_when_a_partial_delivery_reported_the_full_balance(): void
    {
        $invoice = app(InvoicePostingService::class)->postSale(app(BookingService::class)->convertToSale($this->booking(2)));
        $this->action($invoice, 'pickup', ['pickup_lines' => collect(app(DispatchService::class)->pickupProgress($invoice))->map(
            fn ($line) => ['id' => $line->id, 'quantity' => $line->remaining])->all()]);
        $this->action($invoice, 'confirm_pickup');
        $this->action($invoice, 'dispatched');
        $details = ['receiver_name' => 'Customer representative', 'items' => [['sales_invoice_item_id' => $invoice->items()->first()->id, 'quantity' => 1]]];
        $cash = ['method' => 'cash', 'amount' => 1200.01, 'request_key' => (string) Str::uuid()];
        $bank = ['method' => 'online', 'amount' => 800, 'reference' => 'Bank fixture', 'request_key' => (string) Str::uuid()];
        $this->expectFinanceError(fn () => $this->action($invoice, 'delivered', $details + ['collections' => [$cash, $bank]]), 'exceeds the remaining amount');
        $this->assertDatabaseCount('delivery_collections', 0);
        $this->assertDatabaseHas('dispatches', ['sales_invoice_id' => $invoice->id, 'status' => 'dispatched']);

        $cash['amount'] = 1200;
        $this->action($invoice, 'delivered', $details + ['collections' => [$cash, $bank]]);
        $this->assertDatabaseHas('dispatches', ['sales_invoice_id' => $invoice->id, 'status' => 'partial']);
        $this->get(route('dispatch.show', $invoice))->assertInertia(fn (Assert $page) => $page
            ->where('canReportCollection', false)->where('collectiblePaisa', 0));
        $this->action($invoice, 'delivered', $details);
        $this->assertDatabaseHas('dispatches', ['sales_invoice_id' => $invoice->id, 'status' => 'delivered']);
        $this->assertDatabaseCount('payments', 0);
    }

    public function test_verified_cash_variance_and_same_employee_commissions_wait_for_both_gates(): void
    {
        $account = $this->opening();
        foreach (['booker' => 1, 'salesman' => .5] as $role => $rate) {
            $this->post('/commissions/rules', ['source' => 'booking', 'role' => $role, 'basis' => 'invoice',
                'mode' => 'percent', 'rate' => $rate, 'effective_from' => $this->date])->assertSessionHas('success');
        }
        $invoice = app(BookingService::class)->convertToSale($this->booking());
        $invoice = app(InvoicePostingService::class)->postSale($invoice);
        $this->pay($invoice, $account, 60000);
        $this->assertEquals(0, DB::table('commission_awards')->sum('earned_paisa'));
        $this->deliver($invoice);
        $collections = app(DeliveryCollectionService::class);
        $collections->report($invoice, $this->salesman, ['method' => 'cash', 'amount' => 40000, 'request_key' => (string) Str::uuid()]);
        $row = DB::table('delivery_collections')->where('method', 'cash')->first();
        $this->assertEquals(40000, app(InvoiceBalanceService::class)->sales()->whereKey($invoice->id)->value('outstanding'));
        $collections->submit($row->collection_day_id, $this->salesman);
        $this->actingAs($this->admin);
        $collections->countCash($row->collection_day_id, $this->admin, 3950000);
        $this->expectFinanceError(fn () => $collections->record($row->id, $this->admin, ['amount' => 40000, 'account_id' => $account]), 'cannot exceed');
        $collections->record($row->id, $this->admin, ['amount' => 39500, 'account_id' => $account, 'notes' => 'Count short by 500']);
        $collections->record($row->id, $this->admin, ['amount' => 39500, 'account_id' => $account]);
        $this->assertEquals(500, app(InvoiceBalanceService::class)->sales()->whereKey($invoice->id)->value('outstanding'));
        $this->assertEquals(0, DB::table('commission_entries')->sum('payable_paisa'));
        $this->pay($invoice, $account, 500);
        $this->assertDatabaseHas('commission_awards', ['sales_invoice_id' => $invoice->id, 'employee_id' => $this->employee->id, 'role' => 'booker', 'earned_paisa' => 100000]);
        $this->assertDatabaseHas('commission_awards', ['sales_invoice_id' => $invoice->id, 'employee_id' => $this->employee->id, 'role' => 'salesman', 'earned_paisa' => 50000]);
        $this->assertEquals(10100000, DB::table('treasury_entries')->where('account_id', $account)->sum('paisa'));
        $this->assertEquals(3, Payment::count());
    }

    public function test_counting_cash_does_not_pay_invoices_and_matching_cash_posts_individual_receipts_once(): void
    {
        $till = $this->opening();
        $first = app(InvoicePostingService::class)->postSale(app(BookingService::class)->convertToSale($this->booking(1)));
        $second = app(InvoicePostingService::class)->postSale(app(BookingService::class)->convertToSale($this->booking(2)));
        $collections = app(DeliveryCollectionService::class);
        foreach ([[$first, 1000], [$second, 500]] as [$invoice, $amount]) {
            $this->deliver($invoice);
            $collections->report($invoice, $this->salesman, ['method' => 'cash', 'amount' => $amount, 'request_key' => (string) Str::uuid()]);
        }
        $collections->report($second, $this->salesman, ['method' => 'online', 'amount' => 100, 'reference' => 'Separate bank report', 'request_key' => (string) Str::uuid()]);
        $day = DB::table('collection_days')->value('id');
        $ids = DB::table('delivery_collections')->where('method', 'cash')->pluck('id')->all();
        $collections->submit($day, $this->salesman);
        $batch = route('distribution.post-matching-cash', $day);
        $this->post($batch, ['account_id' => $till, 'collection_ids' => $ids])->assertForbidden();
        $this->actingAs($this->admin);
        $this->post("/daily-reconciliation/{$day}/count", ['amount' => 1400, 'breakdown' => [1000 => 1, 500 => 1, 'coins' => 0]])->assertSessionHasErrors('finance');
        $this->post("/daily-reconciliation/{$day}/count", ['amount' => 1400])->assertSessionHasNoErrors();
        $this->post($batch, ['account_id' => $till, 'collection_ids' => $ids])->assertSessionHasErrors('finance');
        $this->post("/daily-reconciliation/{$day}/count", ['amount' => 1500, 'breakdown' => [1000 => 1, 500 => 1, 'coins' => 0]])->assertSessionHasNoErrors();
        $this->assertDatabaseHas('collection_days', ['id' => $day, 'counted_cash_paisa' => 150000]);
        $audit = json_decode(DB::table('finance_work_events')->where('action', 'cash_counted')->latest('id')->value('data'), true);
        $this->assertSame(1, $audit['breakdown'][1000]);
        $this->post($batch, ['account_id' => $till, 'collection_ids' => [$ids[0]]])->assertSessionHasErrors('finance');
        $this->assertDatabaseCount('payments', 0);
        $balance = fn (SalesInvoice $invoice) => app(InvoiceBalanceService::class)->sales()->whereKey($invoice->id)->value('outstanding');
        $this->assertEquals(1000, $balance($first));
        $this->assertEquals(2000, $balance($second));

        $this->post($batch, ['account_id' => $till, 'collection_ids' => $ids])->assertSessionHasNoErrors();
        $this->post($batch, ['account_id' => $till, 'collection_ids' => $ids])->assertSessionHasNoErrors();
        $this->assertDatabaseCount('payments', 2);
        $this->assertEquals(0, $balance($first));
        $this->assertEquals(1500, $balance($second));
        $this->assertEquals(1500, app(\App\Services\LedgerService::class)->outstanding($this->customer));
        foreach ([[$first, 1000], [$second, 500]] as [$invoice, $amount]) {
            $this->assertDatabaseHas('payment_allocations', ['invoice_type' => $invoice->getMorphClass(), 'invoice_id' => $invoice->id, 'amount' => $amount]);
            $this->assertDatabaseHas('delivery_collections', ['sales_invoice_id' => $invoice->id, 'method' => 'cash', 'verified_paisa' => $amount * 100, 'reviewer_id' => $this->admin->id]);
        }
        $this->assertDatabaseHas('delivery_collections', ['sales_invoice_id' => $second->id, 'method' => 'online', 'recorded_at' => null, 'payment_id' => null]);
        $this->get(route('distribution.reconcile', ['date' => $this->date, 'salesman_id' => $this->salesman->id]))->assertInertia(fn (Assert $page) => $page
            ->component('operations/daily-collections')->where('cashNotes.0', 5000)->where('salesmanId', $this->salesman->id)
            ->where('rows.1.posted_on_date_paisa', 100000)->where('rows.3.posted_on_date_paisa', 50000));
    }

    public function test_matching_cash_never_partially_posts_when_one_invoice_balance_changes(): void
    {
        $till = $this->opening();
        $first = app(InvoicePostingService::class)->postSale(app(BookingService::class)->convertToSale($this->booking(1)));
        $second = app(InvoicePostingService::class)->postSale(app(BookingService::class)->convertToSale($this->booking(1)));
        $collections = app(DeliveryCollectionService::class);
        foreach ([$first, $second] as $invoice) {
            $this->deliver($invoice);
            $collections->report($invoice, $this->salesman, ['method' => 'cash', 'amount' => 500, 'request_key' => (string) Str::uuid()]);
        }
        $day = DB::table('collection_days')->value('id');
        $collections->submit($day, $this->salesman);
        $this->pay($second, $till, 600);
        $collections->countCash($day, $this->admin, 100000);
        $this->post(route('distribution.post-matching-cash', $day), ['account_id' => $till, 'collection_ids' => DB::table('delivery_collections')->where('method', 'cash')->pluck('id')->all()])->assertSessionHasErrors('finance');
        $this->assertDatabaseCount('payments', 1);
        $this->assertEquals(2, DB::table('delivery_collections')->where('method', 'cash')->whereNull('recorded_at')->count());
    }

    public function test_collection_report_pdfs_follow_the_business_date_and_salesman_scope(): void
    {
        $invoice = app(InvoicePostingService::class)->postSale(app(BookingService::class)->convertToSale($this->booking(1)));
        $this->deliver($invoice);
        $other = User::factory()->create()->assignRole('Salesman');
        DB::table('collection_days')->insert(['salesman_id' => $other->id, 'business_date' => $this->date, 'revision' => 1]);
        $renderer = app(\App\Services\ReportPdfRenderer::class);
        $this->mock(\App\Services\ReportPdfRenderer::class)->shouldReceive('render')->twice()->withArgs(function ($data) {
            $this->assertSame([$this->salesman->name], array_column($data['rows'], 'day'));
            $this->assertCount(1, $data['sections']);
            $this->assertCount(1, $data['sections'][0]['rows']);

            return true;
        })->andReturnUsing(fn ($data) => $renderer->render($data));
        $this->actingAs($this->salesman)->get(route('distribution.reconcile', ['format' => 'pdf']))->assertForbidden();
        $personal = $this->get(route('distribution.my-collections', ['date' => $this->date, 'format' => 'pdf', 'salesman_id' => $other->id]))
            ->assertOk()->assertHeader('Content-Type', 'application/pdf');
        $this->assertStringStartsWith('%PDF', $personal->getContent());
        $finance = $this->actingAs($this->admin)->get(route('distribution.reconcile', ['date' => $this->date, 'format' => 'pdf', 'salesman_id' => $this->salesman->id]))
            ->assertOk()->assertHeader('Content-Type', 'application/pdf');
        $this->assertStringStartsWith('%PDF', $finance->getContent());
        $this->assertDatabaseCount('payments', 0);
    }

    public function test_posting_four_units_from_ten_leaves_six_through_pickup_and_delivery(): void
    {
        $product = Product::create(['name' => 'Ten-unit stock fixture', 'company_id' => $this->product->company_id, 'trade_price' => 1000]);
        $purchase = PurchaseInvoice::create(['invoice_number' => 'PI-TEN', 'company_id' => $product->company_id, 'warehouse_id' => 1, 'invoice_date' => $this->date]);
        $purchase->items()->create(['product_id' => $product->id, 'batch_number' => 'TEN', 'quantity' => 10, 'purchase_rate' => 500, 'expiry_date' => '2029-11-30']);
        app(InvoicePostingService::class)->postPurchase($purchase);
        $booking = $this->booking(4);
        $booking->items()->update(['product_id' => $product->id]);
        $this->assertEquals(10, $product->availableStock());
        $invoice = app(InvoicePostingService::class)->postSale(app(BookingService::class)->convertToSale($booking));
        $this->assertEquals(6, $product->availableStock());
        $line = app(DispatchService::class)->pickupProgress($invoice)[0];
        $this->action($invoice, 'pickup', ['pickup_lines' => [['id' => $line->id, 'quantity' => 2]]]);
        $this->assertEquals(6, $product->availableStock());
        $this->deliver($invoice);
        $this->assertEquals(6, $product->availableStock());
        $movements = DB::table('stock_movements')->where('product_id', $product->id)->where('quantity', '<', 0)->get();
        $this->assertCount(1, $movements);
        $this->assertEquals(-4, $movements->first()->quantity);
    }

    public function test_paid_commission_recovery_offsets_future_due_without_new_cash_and_refund_dependencies_are_blocked(): void
    {
        $till = $this->opening();
        $this->post('/commissions/rules', ['source' => 'booking', 'role' => 'booker', 'basis' => 'invoice',
            'mode' => 'percent', 'rate' => 1, 'effective_from' => $this->date])->assertSessionHas('success');
        $invoice = app(InvoicePostingService::class)->postSale(app(BookingService::class)->convertToSale($this->booking()));
        $payment = $this->pay($invoice, $till, 100000);
        $this->assertEquals(0, DB::table('commission_entries')->sum('payable_paisa'));
        $this->deliver($invoice);
        $finance = app(FinanceApprovalService::class);
        $ticket = $finance->request($this->admin, 'commission_payout', ['request_key' => (string) Str::uuid(), 'date' => $this->date,
            'employee_id' => $this->employee->id, 'account_id' => $till, 'amount' => 1000, 'notes' => 'Commission payout'], null);
        $this->actingAs($this->admin)->post("/finance-approvals/{$ticket->id}/approve", ['approve' => true, 'note' => 'Self approval'])->assertForbidden();
        $finance->approve($ticket->id, $this->reviewer, 'Reviewed', true);
        $finance->post($ticket->id, $this->admin, 'Payout-1');
        $return = app(ReturnService::class)->createSalesReturn($invoice, [['sales_invoice_item_id' => $invoice->items()->first()->id,
            'quantity' => 30]], $this->date, 'Received goods returned');
        $this->assertEquals(30000, DB::table('commission_entries')->sum('recovery_paisa'));
        $this->assertEquals(0, DB::table('commission_entries')->sum('payable_paisa'));
        $refund = $finance->request($this->admin, 'refund', ['request_key' => (string) Str::uuid(), 'date' => $this->date,
            'invoice_id' => $invoice->id, 'account_id' => $till, 'amount' => 10000, 'notes' => 'Partial refund'], null);
        $finance->approve($refund->id, $this->reviewer, 'Reviewed', true);
        $finance->post($refund->id, $this->admin, 'Refund-1');
        $this->expectFinanceError(fn () => app(PaymentService::class)->cancel($payment), 'dependent refunds');
        $this->expectFinanceError(fn () => app(ReturnService::class)->cancelSalesReturn($return), 'dependent refunds');
        $this->assertEquals(2000000, $finance->refundable($invoice));
        // 70 units are available: compare a PKR 70,000 order with the prior PKR 300 recovery.
        $next = app(InvoicePostingService::class)->postSale(app(BookingService::class)->convertToSale($this->booking(70)));
        $this->deliver($next);
        $this->pay($next, $till, 70000);
        $this->assertEquals(0, DB::table('commission_entries')->sum('recovery_paisa'));
        $this->assertEquals(40000, DB::table('commission_entries')->sum('payable_paisa'));
        $this->assertDatabaseMissing('treasury_entries', ['kind' => 'offset_recovery']);
    }

    public function test_confirmed_stock_handover_does_not_double_count_pickup_and_locks_original_salesman(): void
    {
        $invoice = app(InvoicePostingService::class)->postSale(app(BookingService::class)->convertToSale($this->booking(20)));
        $service = app(DispatchService::class);
        $lines = $service->pickupProgress($invoice);
        $this->action($invoice, 'pickup', ['pickup_lines' => [['id' => $lines[0]->id, 'quantity' => 20]]]);
        $this->action($invoice, 'confirm_pickup');
        $target = User::factory()->create(['is_active' => true])->assignRole('Salesman');
        $this->action($invoice, 'request_handover', ['assigned_to' => $target->id, 'notes' => 'Route changed'], $this->admin);
        $this->action($invoice, 'accept_handover', [], $target);
        $dispatch = Dispatch::where('sales_invoice_id', $invoice->id)->first();
        $this->assertEquals($this->salesman->id, $dispatch->original_assignee_id);
        $this->assertEquals($target->id, $dispatch->assigned_to);
        $this->assertEquals(20, $service->pickupProgress($invoice)[0]->picked);
        $this->actingAs($this->salesman)->get("/dispatch/{$invoice->id}")->assertNotFound();
        $this->action($invoice, 'dispatched', [], $target);
        $this->action($invoice, 'delivered', ['receiver_name' => 'Receiver', 'items' => [[
            'sales_invoice_item_id' => $invoice->items()->first()->id, 'quantity' => 20,
        ]]], $target);
        $this->assertDatabaseHas('dispatch_events', ['dispatch_id' => $dispatch->id, 'action' => 'delivered', 'created_by' => $target->id]);
    }

    public function test_fixed_cap_is_one_order_entitlement_and_only_releases_when_both_splits_are_complete(): void
    {
        $till = $this->opening();
        $this->post('/commissions/rules', ['source' => 'booking', 'role' => 'booker', 'basis' => 'invoice',
            'mode' => 'full_fixed', 'rate' => 1000, 'effective_from' => $this->date])->assertSessionHas('success');
        $bookings = app(BookingService::class);
        $posting = app(InvoicePostingService::class);
        $booking = $this->booking();
        $first = $posting->postSale($bookings->convertToSale($booking, [['id' => $booking->items()->first()->id, 'quantity' => 60, 'bonus_quantity' => 0]]));
        $this->deliver($first);
        $this->pay($first, $till, 60000);
        $this->assertEquals(0, DB::table('commission_entries')->sum('payable_paisa'));
        $second = $posting->postSale($bookings->convertToSale($booking));
        $this->pay($second, $till, 40000);
        $this->assertEquals(0, DB::table('commission_entries')->sum('payable_paisa'));
        $this->deliver($second);
        $this->assertEquals(100000, DB::table('commission_entries')->sum('payable_paisa'));
        $this->assertDatabaseHas('commission_awards', ['sales_invoice_id'=>$first->id,'earned_paisa'=>60000]);
        $this->assertDatabaseHas('commission_awards', ['sales_invoice_id'=>$second->id,'earned_paisa'=>40000]);
    }

    public function test_approved_shortage_settles_proven_receipt_without_fictitious_cash(): void
    {
        $till = $this->opening();
        $sale = app(InvoicePostingService::class)->postSale(app(BookingService::class)->convertToSale($this->booking(20)));
        $this->deliver($sale);
        $collections = app(DeliveryCollectionService::class);
        $collections->report($sale, $this->salesman, ['method' => 'cash', 'amount' => 20000, 'request_key' => (string) Str::uuid()]);
        $row = DB::table('delivery_collections')->where('method', 'cash')->first();
        $collections->submit($row->collection_day_id, $this->salesman);
        $this->actingAs($this->admin);
        $collections->countCash($row->collection_day_id, $this->admin, 1950000);
        $finance = app(FinanceApprovalService::class);
        $approval = $finance->request($this->admin, 'shortage', ['request_key'=>(string) Str::uuid(),'date'=>$this->date,'amount'=>500,
            'collection_id'=>$row->id,'notes'=>'Customer remittance proof'], 'fixture.pdf');
        $finance->approve($approval->id, $this->reviewer, 'Proof confirmed independently.', true);
        $collections->record($row->id, $this->admin, ['amount'=>19500,'account_id'=>$till,'notes'=>'PKR 500 approved shortage','shortage_approval_id'=>$approval->id]);
        $this->assertEquals(0, app(InvoiceBalanceService::class)->sales()->whereKey($sale->id)->value('outstanding'));
        $this->assertEquals(500, app(\App\Services\TreasuryService::class)->shortageReceivable());
        $this->assertEquals(2050000, DB::table('treasury_entries')->sum('paisa'));
        $reverse = $finance->request($this->admin,'shortage_receipt_reverse',['date'=>$this->date,'request_key'=>(string) Str::uuid(),
            'collection_id'=>$row->id,'notes'=>'Verified receipt was entered against the wrong invoice'],'proof.pdf');
        $finance->approve($reverse->id, $this->reviewer, 'Checked the source receipt', true);
        $finance->post($reverse->id, $this->admin, 'Reverse-verified');
        $this->assertEquals(20000, app(InvoiceBalanceService::class)->sales()->whereKey($sale->id)->value('outstanding'));
        $this->assertEquals(0, app(\App\Services\TreasuryService::class)->shortageReceivable());
        $this->assertEquals(100000, DB::table('treasury_entries')->sum('paisa'));
    }

    public function test_opening_commission_and_collection_import_do_not_replay_historical_cash(): void
    {
        $older = now('Asia/Karachi')->subDay()->toDateString();
        $sale = app(InvoicePostingService::class)->postSale(app(BookingService::class)->convertToSale($this->booking(10)));
        $sale->update(['invoice_date' => $older]);
        $receipt = app(PaymentService::class)->recordManual($this->customer, ['method'=>'cash','amount'=>10000,'payment_date'=>$older],
            [['invoice_type'=>'sales_invoice','invoice_id'=>$sale->id,'amount'=>10000]]);
        $finance = app(FinanceApprovalService::class);
        $till = $finance->saveAccount($this->admin, ['name'=>'Opening till','kind'=>'cash','opening'=>10000,'opening_reference'=>'Reconciled till']);
        $common = ['date'=>$older,'invoice_id'=>$sale->id,'salesman_id'=>null,'method'=>null,'payment_id'=>null,
            'included_in_opening'=>null,'employee_id'=>null,'role'=>null];
        $open = $finance->request($this->admin, 'opening', ['request_key'=>(string) Str::uuid(),'date'=>$this->date,'notes'=>'Historical receipts checked','imports'=>[
            ['type'=>'commission_due','reference'=>'HR-EXISTING','amount'=>100,'employee_id'=>$this->employee->id,'role'=>'booker'] + $common,
            ['type'=>'collection','reference'=>'OLD-CASH','amount'=>10000,'salesman_id'=>$this->salesman->id,'method'=>'cash','payment_id'=>$receipt->id,'included_in_opening'=>'yes','opening_account_id'=>$till->id] + $common,
        ]], 'opening-evidence.pdf');
        $finance->approve($open->id, $this->reviewer, 'Checked', true);
        $finance->post($open->id, $this->admin, null);
        $row = DB::table('delivery_collections')->where('payment_id',$receipt->id)->first();
        $collections = app(DeliveryCollectionService::class);
        $collections->countCash($row->collection_day_id, $this->admin, 1000000);
        $collections->record($row->id, $this->admin, ['amount'=>10000,'account_id'=>$till->id]);
        $this->assertEquals(1, Payment::count());
        $this->assertEquals(1, DB::table('treasury_entries')->count());
        $this->assertEquals(1000000, DB::table('treasury_entries')->sum('paisa'));
        $this->assertEquals(10000, DB::table('commission_entries')->sum('payable_paisa'));
        $this->assertEquals(0, DB::table('commission_entries')->sum('expense_paisa'));
    }

    public function test_linked_credit_allocation_releases_without_duplicate_cash_or_ledger_entries(): void
    {
        $account = $this->opening();
        $service = app(BookingService::class);
        $posting = app(InvoicePostingService::class);
        $source = $posting->postSale($service->convertToSale($this->booking(20)));
        $target = $posting->postSale($service->convertToSale($this->booking(10)));
        $receipt = $this->pay($source, $account, 20000);
        app(ReturnService::class)->createSalesReturn($source, [['sales_invoice_item_id'=>$source->items()->first()->id,'quantity'=>5]], $this->date);
        $finance = app(FinanceApprovalService::class);
        $base = ['date'=>$this->date,'notes'=>'Apply available credit'];
        $credit = $finance->request($this->admin,'credit_apply',
            ['request_key'=>(string) Str::uuid(),'invoice_id'=>$source->id,'target_id'=>$target->id,'amount'=>5000] + $base,null);
        $finance->approve($credit->id,$this->reviewer,'Reviewed',true);
        $cashRows = DB::table('treasury_entries')->count();
        $ledgerRows = DB::table('ledger_entries')->count();
        $finance->post($credit->id,$this->admin,null);
        $this->assertEquals(5000, app(InvoiceBalanceService::class)->sales()->whereKey($target->id)->value('outstanding'));
        $this->assertEquals(0, $finance->refundable($source));
        $this->expectFinanceError(fn () => app(PaymentService::class)->cancel($receipt),'dependent refunds or credit');
        $release = $finance->request($this->admin,'credit_release',['request_key'=>(string) Str::uuid(),'credit_id'=>$credit->id]+$base,null);
        $finance->approve($release->id,$this->reviewer,'Reviewed',true);
        $finance->post($release->id,$this->admin,null);
        $this->assertEquals(10000, app(InvoiceBalanceService::class)->sales()->whereKey($target->id)->value('outstanding'));
        $this->assertEquals(500000,$finance->refundable($source));
        $this->assertEquals($cashRows,DB::table('treasury_entries')->count());
        $this->assertEquals($ledgerRows,DB::table('ledger_entries')->count());
    }
}
