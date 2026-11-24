<?php

namespace Tests\Feature;

use App\Models\{Batch, Booking, BookerVisit, CollectionFollowUp, Company, Customer, Dispatch, DispatchEvent, LedgerEntry, Payment, Product, SalesInvoice, SalesReturn, StockMovement, User};
use App\Services\{DeliveryPlanningService, DispatchService, PaymentService, ReportPdfRenderer, SystemHealthService};
use Barryvdh\DomPDF\Facade\Pdf;
use Database\Seeders\{RolePermissionSeeder, SystemSeeder};
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Inertia\Testing\AssertableInertia as Assert;
use Spatie\Permission\Models\{Permission, Role};
use Spatie\Permission\PermissionRegistrar;
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

    public function test_salesman_role_can_be_combined_with_booker_and_is_scoped_to_assigned_dispatches(): void
    {
        $this->booker->assignRole('Salesman');
        $assigned = $this->sale();
        $other = $this->sale();
        $this->action($assigned, 'assign', ['assigned_to' => $this->booker->id, 'planned_date' => '2026-11-23'])
            ->assertSessionHasNoErrors();
        $this->action($other, 'assign')->assertSessionHasNoErrors();
        $this->get(route('dispatch.show', $assigned))->assertOk()->assertInertia(fn (Assert $p) => $p
            ->where('scoped', false)->where('canManage', true)->where('canViewInvoice', true));
        $this->actingAs($this->booker->refresh());
        $this->get(route('booker.workday'))->assertOk();
        $this->get(route('dispatch.index', ['assignee_id' => $this->admin->id]))->assertOk()->assertInertia(fn (Assert $p) => $p
            ->where('scoped', true)->where('canPlan', false)->has('invoices.data', 1)->where('invoices.data.0.id', $assigned->id));
        $this->get(route('dispatch.show', $other))->assertNotFound();
        $this->get(route('dispatch.picking-pdf', $other))->assertNotFound();
        $pickPdf = $this->get(route('dispatch.picking-pdf', $assigned))->assertOk()->assertHeader('Content-Type', 'application/pdf');
        $this->assertStringStartsWith('%PDF', $pickPdf->getContent());
        $this->get(route('dispatch.show', $assigned))->assertOk()->assertInertia(fn (Assert $p) => $p
            ->where('scoped', true)->where('canManage', false)->where('canViewInvoice', false)
            ->has('staff', 0)->where('dispatch.planned_date', '2026-11-23'));
        $this->get(route('dispatch.schedules'))->assertForbidden();
        $this->get(route('dispatch.sheet', ['date' => '2026-11-23', 'assignee_id' => $this->booker->id]))->assertForbidden();

        $record = fn ($sale, $action, $data = []) => $this->post(route('dispatch.record', $sale), $data + [
            'action' => $action, 'request_key' => (string) Str::uuid(),
        ]);
        $record($other, 'picking')->assertNotFound();
        $record($assigned, 'assign')->assertForbidden();
        $record($assigned, 'picking', ['planned_date' => '2026-11-25'])->assertForbidden();
        $record($assigned, 'picking', ['assigned_to' => $this->admin->id])->assertForbidden();
        foreach (['picking', 'packed', 'dispatched'] as $action) {
            $record($assigned, $action)->assertSessionHasNoErrors();
        }
        $record($assigned, 'delivered', [
            'receiver_name' => 'Warehouse receiver',
            'items' => [['sales_invoice_item_id' => $assigned->items()->first()->id, 'quantity' => 12]],
        ])->assertSessionHasNoErrors();
        $this->assertDatabaseHas('dispatches', ['sales_invoice_id' => $assigned->id, 'assigned_to' => $this->booker->id, 'status' => 'delivered']);
        $record($assigned, 'correct_delivery', ['notes' => 'Invalid correction'])->assertForbidden();
    }

    public function test_weekday_planner_generates_visits_and_new_posted_deliveries_without_overwriting_manual_work(): void
    {
        $this->travelTo(Carbon::parse('2026-11-23 07:00:00', 'Asia/Karachi'));
        $salesman = User::factory()->create();
        $salesman->assignRole('Salesman');
        $secondary = User::factory()->create();
        $secondary->assignRole('Booker');
        $this->customer->bookers()->attach($secondary->id);
        $old = $this->sale(['posted_at' => now()->subDay()]);
        $this->put(route('dispatch.schedules.update', $this->customer), [
            'booking_days' => [1], 'delivery_days' => [5], 'salesman_id' => $salesman->id,
        ])->assertSessionHasNoErrors();
        $this->travel(1)->minutes();
        $new = $this->sale(['posted_at' => now()]);
        $draft = $this->sale(['status' => 'draft']);
        $manual = $this->sale(['posted_at' => now()]);
        $this->action($manual, 'assign', ['planned_date' => '2026-11-24'])->assertSessionHasNoErrors();
        $this->artisan('whmis:generate-delivery-plan')->expectsOutput('Planned 2 booking visit(s) and 1 delivery task(s).')->assertSuccessful();

        $this->assertDatabaseCount('bookings', 0);
        $this->assertDatabaseCount('booker_visits', 2);
        $this->assertDatabaseHas('booker_visits', ['booker_id' => $secondary->id, 'customer_id' => $this->customer->id, 'outcome' => 'planned']);
        $this->assertDatabaseHas('dispatches', ['sales_invoice_id' => $new->id, 'assigned_to' => $salesman->id, 'planned_date' => '2026-11-27', 'status' => 'pending']);
        $this->assertDatabaseHas('dispatches', ['sales_invoice_id' => $manual->id, 'assigned_to' => $this->admin->id, 'planned_date' => '2026-11-24']);
        $this->assertDatabaseMissing('dispatches', ['sales_invoice_id' => $old->id]);
        $this->assertDatabaseMissing('dispatches', ['sales_invoice_id' => $draft->id]);
        BookerVisit::where('booker_id', $this->booker->id)->update(['outcome' => 'visited']);
        $this->assertSame(['visits' => 0, 'dispatches' => 0], app(DeliveryPlanningService::class)->generate());
        $this->assertDatabaseHas('booker_visits', ['booker_id' => $this->booker->id, 'outcome' => 'visited']);
        $this->assertDatabaseCount('stock_movements', 0);
        $this->assertDatabaseCount('ledger_entries', 0);
        Customer::create(['name' => 'Unscheduled Pharmacy', 'booker_id' => $this->booker->id]);
        $this->actingAs($this->booker)->get(route('booker.workday', ['date' => '2026-11-23', 'planned' => 1]))
            ->assertOk()->assertInertia(fn (Assert $p) => $p->has('customers.data', 1)->where('customers.data.0.id', $this->customer->id));
    }

    public function test_admin_can_print_a_one_page_daily_delivery_sheet_and_schedule_requires_a_salesman(): void
    {
        $this->put(route('dispatch.schedules.update', $this->customer), [
            'booking_days' => [], 'delivery_days' => [1], 'salesman_id' => $this->booker->id,
        ])->assertSessionHasErrors('salesman_id');
        $this->booker->assignRole('Salesman');
        $this->put(route('dispatch.schedules.update', $this->customer), [
            'booking_days' => [], 'delivery_days' => [1], 'salesman_id' => $this->booker->id,
        ])->assertSessionHasNoErrors();
        $first = $this->sale();
        $second = $this->sale();
        $excluded = $this->sale();
        foreach ([$first, $second] as $sale) {
            $this->action($sale, 'assign', ['assigned_to' => $this->booker->id, 'planned_date' => '2026-11-23'])->assertSessionHasNoErrors();
        }
        $this->action($excluded, 'assign', ['assigned_to' => $this->booker->id, 'planned_date' => '2026-11-24'])->assertSessionHasNoErrors();
        $pdf = $this->get(route('dispatch.sheet', ['date' => '2026-11-23', 'assignee_id' => $this->booker->id]))
            ->assertOk()->assertHeader('content-type', 'application/pdf');
        $this->assertSame(1, preg_match_all('/\/Type\s*\/Page\b/', $pdf->getContent()));
        $this->get(route('dispatch.index', ['date' => '2026-11-23', 'assignee_id' => $this->booker->id]))
            ->assertInertia(fn (Assert $p) => $p->has('invoices.data', 2));
    }

    public function test_schedule_batch_validates_atomically_and_history_requires_schedule_permission(): void
    {
        $salesman = User::factory()->create(['is_active' => true])->assignRole('Salesman');
        $other = Customer::create(['name' => 'Second Pharmacy']);
        $changes = [
            ['customer_id' => $this->customer->id, 'booking_days' => [1], 'delivery_days' => [2], 'salesman_id' => $salesman->id],
            ['customer_id' => $other->id, 'booking_days' => [1], 'delivery_days' => [2], 'salesman_id' => $this->booker->id],
        ];
        $route = route('dispatch.schedules.bulk-update');
        $this->put($route, ['schedules' => $changes])->assertSessionHasErrors('schedules.1.salesman_id');
        $this->assertDatabaseCount('customer_delivery_schedules', 0);
        $this->assertDatabaseCount('customer_salesman_history', 0);

        $changes[1]['salesman_id'] = $salesman->id;
        $this->put($route, ['schedules' => $changes])->assertSessionHasNoErrors();
        $this->assertDatabaseCount('customer_delivery_schedules', 2);
        $this->assertDatabaseCount('customer_salesman_history', 2);
        $this->get(route('dispatch.schedules'))->assertInertia(fn (Assert $p) => $p
            ->component('operations/delivery-schedules')->has('customers', 2)->where('customers.0.bookers.0', $this->booker->name));
        $this->actingAs($salesman)->getJson(route('dispatch.schedules.history', $other))->assertForbidden();
        $this->put($route, ['schedules' => $changes])->assertForbidden();
    }

    public function test_daily_sheet_prints_separate_invoice_rows_and_only_verified_route_collections(): void
    {
        $day = '2026-11-23';
        $this->booker->assignRole('Salesman');
        $this->customer->update([
            'name' => 'Route Pharmacy', 'address' => '111 Delivery Avenue, RAWALPINDI', 'city' => 'Rawalpindi',
            'contact_person' => 'Office Contact', 'phone' => '03009990000',
        ]);
        $first = $this->sale(['invoice_number' => 'SI-2026-0111', 'total_amount' => 5123.45]);
        $second = $this->sale(['invoice_number' => 'SI-2026-0222', 'total_amount' => 8787.55]);
        foreach ([$first, $second] as $sale) {
            $this->action($sale, 'assign', ['assigned_to' => $this->booker->id, 'planned_date' => $day])->assertSessionHasNoErrors();
        }
        $dispatch = Dispatch::where('sales_invoice_id', $first->id)->sole();
        $dispatch->events()->create([
            'action' => 'delivered', 'request_key' => (string) Str::uuid(), 'created_by' => $this->booker->id,
            'assigned_to' => $this->booker->id, 'receiver_name' => 'Counter Receiver', 'notes' => 'Internal note',
        ]);
        foreach ([
            [$day, 43221, 43221, 'completed'],
            [$day, 76420, null, null],
            [$day, 17099, 17099, 'cancelled'],
            ['2026-11-22', 98765, 98765, 'completed'],
        ] as $index => [$date, $reported, $verified, $status]) {
            $collectionDay = DB::table('collection_days')->insertGetId(['salesman_id' => $this->booker->id, 'business_date' => $date, 'revision' => $index + 1]);
            $payment = $status === null ? null : Payment::create([
                'payment_number' => 'PAY-ROUTE-'.$index, 'party_type' => 'customer', 'party_id' => $this->customer->id,
                'direction' => 'in', 'method' => 'cash', 'amount' => $verified / 100, 'payment_date' => $date, 'status' => $status,
            ]);
            DB::table('delivery_collections')->insert([
                'collection_day_id' => $collectionDay, 'sales_invoice_id' => $first->id, 'reporter_id' => $this->booker->id,
                'request_key' => (string) Str::uuid(), 'method' => 'cash', 'reported_paisa' => $reported, 'previous_paid_paisa' => 0,
                'verified_paisa' => $verified, 'payment_id' => $payment?->id, 'recorded_at' => $verified === null ? null : now(),
            ]);
        }
        $document = app('dompdf.wrapper');
        Pdf::swap($document);
        $this->get(route('dispatch.sheet', ['date' => $day, 'assignee_id' => $this->booker->id]))
            ->assertOk()->assertHeader('content-type', 'application/pdf');
        $pdf = $document->output(['compress' => false]);
        $dompdf = $document->getDomPDF();
        $canvas = $dompdf->getCanvas();
        $this->assertEqualsWithDelta(841.89, $canvas->get_width(), 0.1);
        $this->assertEqualsWithDelta(595.28, $canvas->get_height(), 0.1);
        $margin = $dompdf->getCss()->get_page_styles()['base'];
        $this->assertEquals(ReportPdfRenderer::TOP_MARGIN, $margin->margin_top);
        $this->assertEquals(ReportPdfRenderer::SIDE_MARGIN, $margin->margin_left);
        $this->assertEquals(ReportPdfRenderer::SIDE_MARGIN, $margin->margin_right);
        $this->assertEquals(ReportPdfRenderer::BOTTOM_MARGIN, $margin->margin_bottom);
        preg_match_all('~\bBT [\d.]+ [\d.]+ Td /F\d+ ([\d.]+) Tf[^\r\n]*?\[\((.*?)\)\] TJ ET~', $pdf, $lines);
        $textRuns = array_map(fn (string $line) => mb_convert_encoding($line, 'UTF-8', 'UTF-16BE'), $lines[2]);
        $printed = implode(' ', $textRuns);
        foreach (['Amounts in PKR', 'SALES INV #', 'CUSTOMER NAME', 'CUSTOMER ADDRESS', 'TOTAL AMOUNT', 'RECEIVER / REMARKS', 'PAYMENT RECEIVED',
            'SI-2026-0111', 'SI-2026-0222', 'Route Pharmacy', '111 Delivery Avenue', '5,123.45', '8,787.55', 'Counter Receiver', '432.21'] as $text) {
            $this->assertStringContainsString($text, $printed);
        }
        foreach (['764.20', '170.99', '987.65', 'Internal note', 'Pending', 'Office Contact', '03009990000', 'RAWALPINDI · Rawalpindi'] as $text) {
            $this->assertStringNotContainsString($text, $printed);
        }
        $this->assertContains('10.0', $lines[1]);
        $this->assertContains('8.5', $lines[1]);
    }

    public function test_long_daily_delivery_sheet_repeats_column_headings_without_omitting_invoices(): void
    {
        $day = '2026-11-23';
        $this->booker->assignRole('Salesman');
        $this->customer->update(['address' => 'Delivery Avenue North Gate Warehouse District', 'city' => 'Rawalpindi']);
        foreach (range(1, 40) as $index) {
            $sale = $this->sale(['invoice_number' => 'SI-2026-'.str_pad($index, 4, '0', STR_PAD_LEFT)]);
            Dispatch::create(['sales_invoice_id' => $sale->id, 'assigned_to' => $this->booker->id, 'planned_date' => $day]);
        }
        $document = app('dompdf.wrapper');
        Pdf::swap($document);
        $this->get(route('dispatch.sheet', ['date' => $day, 'assignee_id' => $this->booker->id]))->assertOk();
        $pdf = $document->output(['compress' => false]);
        $encode = fn (string $text) => mb_convert_encoding($text, 'UTF-16BE', 'UTF-8');
        $pages = preg_match_all('/\/Type\s*\/Page\b/', $pdf);
        $this->assertGreaterThan(1, $pages);
        $this->assertSame($pages, substr_count($pdf, $encode('SALES INV #')));
        for ($page = 1; $page <= $pages; $page++) {
            $this->assertSame(1, substr_count($pdf, $encode("Page {$page} / {$pages}")));
        }
        foreach (range(1, 40) as $index) {
            $this->assertSame(1, substr_count($pdf, $encode('SI-2026-'.str_pad($index, 4, '0', STR_PAD_LEFT))), 'Missing or repeated invoice '.$index);
        }
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

    public function test_imported_historical_delivery_is_delivered_and_read_only_without_recording_activity(): void
    {
        $legacy = $this->sale(['invoice_number' => 'SI-2026-0028']);
        $cutoff = $this->sale(['invoice_number' => 'SI-2026-0029']);
        DB::table('dispatches')->insert([
            'sales_invoice_id' => $legacy->id, 'status' => 'delivered', 'custody_required' => false,
            'created_at' => null, 'updated_at' => null,
        ]);
        $this->get(route('dispatch.index', ['status' => 'delivered']))->assertOk()
            ->assertInertia(fn (Assert $page) => $page->has('invoices.data', 1)->where('invoices.data.0.id', $legacy->id));
        $this->get(route('dispatch.show', $legacy))->assertOk()->assertInertia(fn (Assert $page) => $page
            ->where('historicalDelivery', true)->where('dispatch.status', 'delivered')->where('dispatch.planned_date', null)
            ->has('items', 0)->has('managerActions', 0)->where('canReportCollection', false));
        $this->get(route('dispatch.picking-pdf', $legacy))->assertNotFound();
        $this->action($legacy, 'correct_delivery', ['notes' => 'Test'])->assertSessionHasErrors('action');
        $this->get(route('dispatch.show', $cutoff))->assertOk()
            ->assertInertia(fn (Assert $page) => $page->where('historicalDelivery', false)->where('dispatch', null));
        $this->assertDatabaseCount('dispatch_events', 0);
        $this->assertDatabaseCount('payments', 0);
        $this->assertDatabaseCount('stock_movements', 0);
        $this->assertDatabaseCount('commission_awards', 0);
    }

    public function test_backfill_finishes_older_assignments_without_touching_cutoff_or_real_custody(): void
    {
        $this->booker->assignRole('Salesman');
        $today = now('Asia/Karachi')->toDateString();
        $archived = [];
        foreach ([22 => 'picking', 23 => 'pending', 25 => 'pending', 26 => 'pending'] as $number => $status) {
            $sale = $this->sale(['invoice_number' => sprintf('SI-2026-%04d', $number)]);
            $dispatch = Dispatch::create(['sales_invoice_id' => $sale->id, 'status' => $status,
                'assigned_to' => $this->booker->id, 'original_assignee_id' => $this->booker->id, 'planned_date' => $today]);
            $dispatch->events()->create(['action' => 'assign', 'request_key' => (string) Str::uuid(), 'created_by' => $this->admin->id]);
            if ($status === 'picking') {
                $dispatch->events()->create(['action' => 'picking', 'request_key' => (string) Str::uuid(), 'created_by' => $this->admin->id]);
            }
            $archived[] = $dispatch;
        }
        $untracked = $this->sale(['invoice_number' => 'SI-2026-0001']);
        $draft = $this->sale(['invoice_number' => 'SI-2026-0015', 'status' => 'draft']);
        $cutoff = $this->sale(['invoice_number' => 'SI-2026-0029']);
        $custody = $this->sale(['invoice_number' => 'SI-2026-0024']);
        $cutoffDispatch = Dispatch::create(['sales_invoice_id' => $cutoff->id, 'status' => 'pending']);
        $held = Dispatch::create(['sales_invoice_id' => $custody->id, 'status' => 'picking', 'custody_required' => true,
            'assigned_to' => $this->booker->id, 'custodian_id' => $this->booker->id]);
        $migration = require database_path('migrations/2026_11_24_000900_finish_untracked_legacy_dispatches.php');
        $migration->up();
        $migration->up();

        foreach ($archived as $dispatch) {
            $after = $dispatch->fresh();
            $this->assertTrue($after->isHistoricalDelivery());
            foreach (['assigned_to', 'original_assignee_id', 'planned_date', 'created_at', 'updated_at'] as $field) {
                $this->assertEquals($dispatch->$field, $after->$field);
            }
        }
        $this->assertDatabaseHas('dispatches', ['sales_invoice_id' => $untracked->id, 'status' => 'delivered']);
        $this->assertDatabaseMissing('dispatches', ['sales_invoice_id' => $draft->id]);
        $this->assertEquals($cutoffDispatch->fresh()->status, 'pending');
        $this->assertEquals($held->fresh()->status, 'picking');
        $this->assertDatabaseCount('dispatch_events', 5);
        $this->assertDatabaseCount('delivery_collections', 0);
        $this->assertDatabaseCount('stock_movements', 0);

        $id = $archived[0]->sales_invoice_id;
        $this->actingAs($this->booker->fresh())->get(route('booker.workday'))->assertInertia(fn (Assert $page) => $page
            ->where('activeDeliveries', 1)->where('deliveries.data.1.is_complete', true)->where('deliveries.data.1.can_collect', false));
        $this->get(route('dispatch.show', $id))->assertInertia(fn (Assert $page) => $page
            ->where('historicalDelivery', true)->where('canReportCollection', false));
        $this->postJson(route('distribution.report', $id), ['request_key' => (string) Str::uuid(), 'method' => 'cash', 'amount' => 1])
            ->assertUnprocessable();
    }

    public function test_admin_dispatch_pipeline_uses_live_counts_and_pages_each_view(): void
    {
        $low = $this->sale(['total_amount' => 250]);
        $high = $this->sale(['total_amount' => 2750]);
        foreach (range(1, 9) as $i) $this->sale();
        $closed = $this->sale();
        $this->sale(['status' => 'draft']);
        $this->sale(['status' => 'cancelled']);
        $yesterday = now('Asia/Karachi')->subDay()->toDateString();
        foreach ([[$low, 'partial'], [$high, 'dispatched'], [$closed, 'closed']] as [$invoice, $status]) {
            Dispatch::create(['sales_invoice_id' => $invoice->id, 'assigned_to' => $this->admin->id, 'status' => $status, 'planned_date' => $yesterday]);
        }
        $this->get(route('dispatch.index'))->assertOk()->assertInertia(fn (Assert $page) => $page
            ->where('pipeline.untracked.count', 9)->where('pipeline.dispatched.count', 2)
            ->where('pipeline.dispatched.value', fn ($value) => (float) $value === 3000.0)
            ->where('pipeline.dispatched.overdue', 2)->where('pipeline.failed.overdue', 0)
            ->where('pipeline.failed.count', 1)->where('board.untracked.total', 9)->has('board.untracked.data', 8)
            ->has('board.dispatched.data', 2)->where('invoices.total', 12));
        $this->get(route('dispatch.index', ['view' => 'list', 'stage' => 'dispatched', 'sort' => 'value', 'dir' => 'asc']))
            ->assertOk()->assertInertia(fn (Assert $page) => $page
                ->has('board', 0)->where('invoices.total', 2)->where('invoices.data.0.id', $low->id)
                ->where('invoices.data.0.items_count', 1)->where('invoices.data.1.id', $high->id));
        $this->get(route('dispatch.index', ['assignee_id' => $this->admin->id, 'date' => $yesterday]))->assertOk()
            ->assertInertia(fn (Assert $page) => $page->where('pipeline.untracked.count', 0)->where('invoices.total', 3));
        $this->assertDatabaseCount('dispatches', 3);
        $this->assertDatabaseCount('dispatch_events', 0);
    }

    public function test_admin_dispatch_preview_and_pick_list_are_read_only_and_permission_scoped(): void
    {
        $sale = $this->sale();
        $draft = $this->sale(['status' => 'draft']);
        $this->action($sale, 'assign', ['assigned_to' => $this->admin->id])->assertSessionHasNoErrors();
        $this->getJson(route('dispatch.preview', $sale))->assertOk()->assertJsonPath('events.0.action', 'assign')
            ->assertJsonPath('events.0.by', $this->admin->name);
        $this->getJson(route('dispatch.preview', $draft))->assertNotFound();
        $response = $this->get(route('dispatch.pick-list', ['ids' => [$sale->id, $draft->id]]));
        $response->assertOk()->assertHeader('Content-Type', 'application/pdf');
        $this->assertStringStartsWith('%PDF', $response->getContent());
        $this->booker->assignRole('Salesman');
        $this->actingAs($this->booker->refresh())->getJson(route('dispatch.preview', $sale))->assertForbidden();
        $this->get(route('dispatch.pick-list'))->assertForbidden();
        $this->assertDatabaseCount('dispatch_events', 1);
        $this->assertDatabaseCount('stock_movements', 0);
    }

    public function test_dropping_an_untracked_invoice_into_pending_offers_the_default_salesman_and_upcoming_day(): void
    {
        $this->travelTo(Carbon::parse('2026-11-23 07:00:00', 'Asia/Karachi'));
        $this->booker->assignRole('Salesman');
        $sale = $this->sale(['posted_at' => now()->subDay()]);
        app(DeliveryPlanningService::class)->save($this->customer, ['salesman_id' => $this->booker->id, 'delivery_days' => [5]]);
        $this->assertDatabaseMissing('dispatches', ['sales_invoice_id' => $sale->id]);
        $this->getJson(route('dispatch.move-options', $sale))->assertOk()->assertJsonPath('status', 'untracked')
            ->assertJsonPath('assigned_to', $this->booker->id)->assertJsonPath('planned_date', '2026-11-27')
            ->assertJsonFragment(['action' => 'assign', 'stage' => 'pending', 'verify' => false]);
        $data = ['action' => 'assign', 'expected_status' => 'untracked', 'request_key' => (string) Str::uuid()];
        $this->post(route('dispatch.record', $sale), $data)->assertSessionHasErrors(['assigned_to', 'planned_date']);
        $this->post(route('dispatch.record', $sale), $data + ['assigned_to' => $this->booker->id, 'planned_date' => '2026-11-27'])
            ->assertSessionHasNoErrors();
        $this->assertDatabaseHas('dispatches', ['sales_invoice_id' => $sale->id, 'assigned_to' => $this->booker->id, 'planned_date' => '2026-11-27', 'status' => 'pending']);
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
        CollectionFollowUp::create(['sales_invoice_id' => $sale->id, 'outcome' => 'contacted', 'next_follow_up' => now('Asia/Karachi')->subDay()->toDateString(), 'notes' => 'Old', 'created_by' => $this->admin->id]);
        CollectionFollowUp::create(['sales_invoice_id' => $sale->id, 'outcome' => 'contacted', 'next_follow_up' => now('Asia/Karachi')->addDay()->toDateString(), 'notes' => 'New', 'created_by' => $this->admin->id]);
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

    public function test_workday_directory_filters_and_totals_include_later_pages_without_exposing_other_customers(): void
    {
        $date = now('Asia/Karachi')->toDateString();
        $later = Customer::create(['name' => 'Zebra Pharmacy', 'city' => 'Rawalpindi', 'booker_id' => $this->booker->id]);
        foreach (range(1, 12) as $number) {
            Customer::create(['name' => 'Clinic '.$number, 'booker_id' => $this->booker->id]);
        }
        $private = Customer::create(['name' => 'Private Pharmacy', 'city' => 'Rawalpindi']);
        $ledger = app(\App\Services\LedgerService::class);
        $ledger->post($later, 'adjustment', $date, 250, 0);
        $ledger->post($private, 'adjustment', $date, 9999, 0);
        $booking = Booking::create(['booking_number' => 'BK-WORKDAY', 'customer_id' => $later->id, 'booker_id' => $this->booker->id, 'warehouse_id' => 1, 'booking_date' => $date]);
        BookerVisit::create(['booker_id' => $this->booker->id, 'customer_id' => $this->customer->id, 'visit_date' => $date, 'outcome' => 'planned']);
        BookerVisit::create(['booker_id' => $this->booker->id, 'customer_id' => $private->id, 'visit_date' => $date, 'outcome' => 'planned']);

        $this->actingAs($this->booker)->get(route('booker.workday', ['date' => $date]))->assertInertia(fn (Assert $page) => $page
            ->where('customers.total', 14)->has('customers.data', 12)->where('bookerStats.all', 14)
            ->where('bookerStats.due', 1)->where('bookerStats.dueAmount', fn ($amount) => (float) $amount === 250.0)
            ->where('bookerStats.ordered', 1)->where('bookerStats.orders', 1)->where('bookerStats.none', 13)
            ->where('visits.total', 1)->where('visits.data.0.customer.id', $this->customer->id)->where('collections', null));
        $this->get(route('booker.workday', ['date' => $date, 'search' => 'Rawalpindi', 'filter' => 'due', 'sort' => 'balance']))
            ->assertInertia(fn (Assert $page) => $page->where('customers.total', 1)->where('customers.data.0.id', $later->id)
                ->where('customers.data.0.last_booking.id', $booking->id)->where('visits.total', 1)->where('bookerStats.all', 14));
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

    public function test_dispatch_repairs_stale_permission_cache_after_manual_grant_import(): void
    {
        $registrar = app(PermissionRegistrar::class);
        $grant = [
            'permission_id' => Permission::findByName('dispatch.view', 'web')->id,
            'role_id' => Role::findByName('Super Admin', 'web')->id,
        ];

        DB::table('role_has_permissions')->where($grant)->delete();
        $registrar->forgetCachedPermissions();
        $this->get(route('dispatch.index'))->assertForbidden();

        // Raw SQL has the same effect as a phpMyAdmin import. It skips the
        // permission model's cache invalidation events.
        DB::table('role_has_permissions')->insert($grant);
        $admin = $this->admin->fresh();
        $this->assertTrue($admin->getAllPermissions()->contains('name', 'dispatch.view'));
        $this->assertFalse($admin->can('dispatch.view'));

        $this->actingAs($this->booker)->get(route('dispatch.index'))->assertForbidden();
        $this->assertFalse($admin->can('dispatch.view'), 'A denial without a database grant must leave the cache alone.');
        $this->actingAs($admin)->get(route('dispatch.index'))->assertOk();
        $this->assertTrue($admin->can('dispatch.view'));
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
