<?php

namespace Tests\Feature;

use App\Models\Booking;
use App\Models\Company;
use App\Models\Customer;
use App\Models\IncentiveRule;
use App\Models\Product;
use App\Models\PurchaseInvoice;
use App\Models\SalesInvoice;
use App\Models\User;
use App\Services\InvoicePostingService;
use Database\Seeders\RolePermissionSeeder;
use Database\Seeders\SystemSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

class BookingFlowTest extends TestCase
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
        $this->booker = User::factory()->create(['name' => 'Booker Bob']);
        $this->booker->assignRole('Booker');

        $company = Company::create(['name' => 'Getz Pharma']);
        $this->customer = Customer::create(['name' => 'City Pharmacy', 'booker_id' => $this->booker->id]);
        $this->product = Product::create([
            'name' => 'Panadol 500mg', 'company_id' => $company->id, 'trade_price' => 100,
        ]);
    }

    public function test_booking_lifecycle_records_distinct_server_timestamps(): void
    {
        $this->travelTo(now()->startOfSecond());
        $booking = $this->createBooking();
        $created = $booking->created_at->copy();
        $this->assertNull($booking->submitted_at);
        $this->assertNull($booking->last_edited_at);
        $this->travel(5)->minutes();
        $this->put(route('bookings.update', $booking), [
            'customer_id' => $this->customer->id, 'warehouse_id' => 1,
            'booking_date' => now()->toDateString(),
            'items' => [['product_id' => $this->product->id, 'quantity' => 20, 'trade_price' => 100]],
        ])->assertRedirect()->assertSessionHasNoErrors();
        $edited = now()->copy();
        $this->assertTrue($booking->refresh()->last_edited_at->equalTo($edited));
        $this->travel(5)->minutes();
        $this->post(route('bookings.submit', $booking))->assertRedirect();
        $submitted = now()->copy();
        $this->assertTrue($booking->refresh()->submitted_at->equalTo($submitted));
        $this->travel(5)->minutes();
        $this->actingAs($this->admin)->post(route('bookings.approve', $booking))->assertRedirect();
        $approved = now()->copy();
        $this->assertTrue($booking->refresh()->approved_at->equalTo($approved));
        $this->travel(5)->minutes();
        $this->post(route('bookings.convert', $booking))->assertRedirect();
        $this->assertTrue($booking->refresh()->converted_at->equalTo(now()));
        $this->assertTrue($booking->created_at->equalTo($created));
        $this->assertTrue($booking->last_edited_at->equalTo($edited));
        $this->assertTrue($booking->submitted_at->equalTo($submitted));
        $this->assertTrue($booking->approved_at->equalTo($approved));
        $this->actingAs($this->booker)->get(route('bookings.edit', $booking))
            ->assertInertia(fn (Assert $page) => $page->where('booking.created_at', $created->toJSON())
                ->where('booking.submitted_at', $submitted->toJSON()));
        $this->travelBack();
    }

    public function test_rejection_and_cancellation_keep_their_own_timestamps(): void
    {
        $this->travelTo(now()->startOfSecond());
        $booking = $this->createBooking();
        $this->post(route('bookings.submit', $booking))->assertRedirect();
        $this->actingAs($this->admin)->post(route('bookings.reject', $booking))->assertRedirect();
        $rejected = now()->copy();
        $this->assertTrue($booking->refresh()->rejected_at->equalTo($rejected));
        $this->travel(10)->minutes();
        $this->post(route('bookings.cancel', $booking))->assertRedirect();
        $this->assertTrue($booking->refresh()->cancelled_at->equalTo(now()));
        $this->assertTrue($booking->rejected_at->equalTo($rejected));
        $this->travelBack();
    }

    private function createBooking(): Booking
    {
        $this->actingAs($this->booker);
        $this->post(route('bookings.store'), [
            'customer_id' => $this->customer->id,
            'warehouse_id' => 1,
            'booking_date' => now()->toDateString(),
            'items' => [[
                'product_id' => $this->product->id,
                'quantity' => 20,
                'requested_bonus' => 2,
                'trade_price' => 100,
                'discount_percent' => 5,
                'gst_percent' => 0,
            ]],
        ])->assertRedirect();

        return Booking::latest('id')->firstOrFail();
    }

    public function test_saved_booking_loads_supplier_retail_and_live_warehouse_stock_for_admin_and_booker(): void
    {
        $this->product->update(['retail_price'=>120, 'purchase_price'=>80]);
        $batch = \App\Models\Batch::create(['product_id'=>$this->product->id,'warehouse_id'=>1,'batch_number'=>'BOOKING-1','qty_available'=>35]);
        \App\Models\Batch::create(['product_id'=>$this->product->id,'warehouse_id'=>1,'batch_number'=>'BOOKING-2','qty_available'=>7]);
        $other = \App\Models\Warehouse::create(['code'=>'OTHER','name'=>'Other Warehouse']);
        \App\Models\Batch::create(['product_id'=>$this->product->id,'warehouse_id'=>$other->id,'batch_number'=>'OTHER-1','qty_available'=>99]);
        $booking = $this->createBooking();
        // Current catalogue prices must not replace the saved booking's price.
        $this->product->update(['trade_price'=>150]);
        foreach ([$this->admin, $this->booker] as $viewer) {
            $this->actingAs($viewer)->get(route('bookings.edit',$booking))->assertOk()->assertInertia(fn (Assert $page) => $page
                ->where('booking.items.0.product.company.name','Getz Pharma')
                ->where('booking.items.0.product.retail_price','120.00')
                ->where('booking.items.0.product.stock',fn ($stock) => (float)$stock === 42.0)
                ->where('booking.items.0.trade_price','100.00')
                ->where('booking.items.0.quantity','20.00')
                ->where('booking.items.0.requested_bonus','2.00')
                ->where('booking.items.0.discount_percent','5.00')
                ->missing('booking.items.0.product.purchase_price'));
        }
        $batch->update(['qty_available'=>30]);
        $booking->update(['status'=>'pending']);
        $this->actingAs($this->admin)->get(route('bookings.edit',$booking))->assertInertia(fn (Assert $page) => $page
            ->where('booking.status','pending')
            ->where('booking.items.0.product.stock',fn ($stock) => (float)$stock === 37.0));
    }

    public function test_booker_creates_and_submits_booking_with_computed_totals(): void
    {
        $booking = $this->createBooking();

        $this->assertStringStartsWith('BK-', $booking->booking_number);
        $this->assertSame('draft', $booking->status);
        $this->assertSame($this->booker->id, $booking->booker_id);
        // 20 × 100 − 5% = 1900
        $this->assertEqualsWithDelta(1900.0, (float) $booking->total_amount, 0.01);

        $this->post(route('bookings.submit', $booking))->assertSessionHas('success');
        $this->assertSame('pending', $booking->refresh()->status);
    }

    public function test_booker_cannot_approve_but_admin_can(): void
    {
        $booking = $this->createBooking();
        $this->post(route('bookings.submit', $booking));

        $this->post(route('bookings.approve', $booking))->assertForbidden();

        $this->actingAs($this->admin);
        $this->post(route('bookings.approve', $booking))->assertSessionHas('success');

        $booking->refresh();
        $this->assertSame('approved', $booking->status);
        $this->assertSame($this->admin->id, $booking->approved_by);
    }

    public function test_conversion_creates_linked_draft_sale_and_blocks_reconversion(): void
    {
        $booking = $this->createBooking();
        $this->post(route('bookings.submit', $booking));

        $this->actingAs($this->admin);
        $this->post(route('bookings.approve', $booking));
        $this->post(route('bookings.convert', $booking))->assertRedirect();

        $booking->refresh();
        $invoice = SalesInvoice::firstOrFail();

        $this->assertSame('converted', $booking->status);
        $this->assertSame($invoice->id, $booking->sales_invoice_id);
        $this->assertSame($booking->id, (int) $invoice->booking_id);
        $this->assertSame('booking', $invoice->sale_type);
        $this->assertSame('draft', $invoice->status);

        $item = $invoice->items->firstOrFail();
        $this->assertEqualsWithDelta(20.0, (float) $item->quantity, 0.001);
        $this->assertEqualsWithDelta(2.0, (float) $item->bonus_quantity, 0.001);
        $this->assertEqualsWithDelta(1900.0, (float) $invoice->total_amount, 0.01);

        // A second convert is blocked.
        $this->post(route('bookings.convert', $booking))->assertSessionHas('error');
        $this->assertSame(1, SalesInvoice::count());
    }

    public function test_converted_sale_posts_through_normal_fifo_flow(): void
    {
        // Stock first: 30 units.
        $this->actingAs($this->admin);
        $purchase = PurchaseInvoice::create([
            'invoice_number' => 'PI-T-1', 'company_id' => Company::first()->id, 'warehouse_id' => 1,
            'invoice_date' => now()->toDateString(), 'purchase_type' => 'credit',
        ]);
        $purchase->items()->create([
            'product_id' => $this->product->id, 'batch_number' => 'B1',
            'quantity' => 30, 'purchase_rate' => 80, 'trade_price' => 100,
        ]);
        app(InvoicePostingService::class)->postPurchase($purchase->refresh());

        $booking = $this->createBooking();
        $this->post(route('bookings.submit', $booking));

        $this->actingAs($this->admin);
        $this->post(route('bookings.approve', $booking));
        $this->post(route('bookings.convert', $booking));

        $invoice = SalesInvoice::firstOrFail();
        $this->post(route('sales.post', $invoice))->assertSessionHas('success');

        $this->assertSame('posted', $invoice->refresh()->status);
        // 30 − (20 + 2 bonus) = 8 left
        $this->assertEqualsWithDelta(8.0, $this->product->availableStock(), 0.001);

        // The invoice PDF renders with booking details + per-line supplier loaded.
        $this->get(route('sales.print', $invoice))
            ->assertOk()
            ->assertHeader('content-type', 'application/pdf');
    }

    public function test_rejected_booking_cannot_convert(): void
    {
        $booking = $this->createBooking();
        $this->post(route('bookings.submit', $booking));

        $this->actingAs($this->admin);
        $this->post(route('bookings.reject', $booking));
        $this->assertSame('rejected', $booking->refresh()->status);

        $this->post(route('bookings.convert', $booking))->assertSessionHas('error');
        $this->assertSame(0, SalesInvoice::count());
    }

    public function test_booker_sees_only_own_bookings_and_no_sales_module(): void
    {
        $booking = $this->createBooking();

        $otherBooker = User::factory()->create();
        $otherBooker->assignRole('Booker');
        Booking::create([
            'booking_number' => 'BK-OTHER-1', 'customer_id' => $this->customer->id,
            'booker_id' => $otherBooker->id, 'warehouse_id' => 1,
            'booking_date' => now()->toDateString(), 'status' => 'pending',
        ]);

        $this->actingAs($this->booker);
        $this->get(route('bookings.index'))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('bookings/index')
                ->has('bookings.data', 1)
                ->where('bookings.data.0.id', $booking->id));

        $this->get(route('sales.index'))->assertForbidden();
        $this->get(route('bookings.edit', 'BK-OTHER-1' ? Booking::where('booking_number', 'BK-OTHER-1')->first() : null))
            ->assertForbidden();

        // Admin sees both.
        $this->actingAs($this->admin);
        $this->get(route('bookings.index'))
            ->assertInertia(fn (Assert $page) => $page->has('bookings.data', 2));
    }

    public function test_rules_lookup_returns_applicable_rules_for_grid(): void
    {
        \App\Models\IncentiveRule::create([
            'name' => '10+2 Panadol', 'rule_type' => 'qty_bonus',
            'product_id' => $this->product->id, 'base_qty' => 10, 'bonus_qty' => 2, 'active' => true,
        ]);

        $this->actingAs($this->booker);
        $this->getJson(route('lookup.rules', [
            'product_id' => $this->product->id,
            'customer_id' => $this->customer->id,
            'qty' => 25,
        ]))
            ->assertOk()
            ->assertJsonPath('0.name', '10+2 Panadol')
            ->assertJsonPath('0.effect.bonus_qty', 4);
    }

    public function test_stacking_rules_on_a_booking_line_folds_discount_bonus_and_records_child_rows(): void
    {
        $percent = IncentiveRule::create([
            'name' => '10% off', 'rule_type' => 'percent_discount', 'value' => 10,
            'product_id' => $this->product->id, 'active' => true,
        ]);
        $bonus = IncentiveRule::create([
            'name' => '10+2', 'rule_type' => 'qty_bonus', 'base_qty' => 10, 'bonus_qty' => 2,
            'product_id' => $this->product->id, 'active' => true,
        ]);

        $this->actingAs($this->booker);
        $this->post(route('bookings.store'), [
            'customer_id' => $this->customer->id,
            'warehouse_id' => 1,
            'booking_date' => now()->toDateString(),
            'items' => [[
                'product_id' => $this->product->id,
                'quantity' => 20,
                'trade_price' => 100,
                'discount_percent' => 0,
                'incentive_rule_ids' => [$percent->id, $bonus->id],
            ]],
        ])->assertRedirect()->assertSessionHas('success');

        $item = Booking::latest('id')->firstOrFail()->items()->firstOrFail();

        // 20 @ 100 = gross 2000. 10% discount = 200. Bonus: 20/10*2 = 4.
        $this->assertEqualsWithDelta(200.0, (float) $item->incentive_discount, 0.001);
        $this->assertEqualsWithDelta(200.0, (float) $item->discount_amount, 0.001);
        $this->assertEqualsWithDelta(1800.0, (float) $item->net_amount, 0.001);
        $this->assertEqualsWithDelta(4.0, (float) $item->requested_bonus, 0.001);

        $this->assertSame(2, $item->incentives()->count());
        $bonusRow = $item->incentives()->where('rule_type', 'qty_bonus')->firstOrFail();
        $this->assertEqualsWithDelta(400.0, (float) $bonusRow->value_given, 0.001); // 4 * 100
    }

    public function test_conversion_carries_stacked_incentives_onto_the_sale(): void
    {
        $percent = IncentiveRule::create([
            'name' => '10% off', 'rule_type' => 'percent_discount', 'value' => 10,
            'product_id' => $this->product->id, 'active' => true,
        ]);
        $bonus = IncentiveRule::create([
            'name' => '10+2', 'rule_type' => 'qty_bonus', 'base_qty' => 10, 'bonus_qty' => 2,
            'product_id' => $this->product->id, 'active' => true,
        ]);

        $this->actingAs($this->booker);
        $this->post(route('bookings.store'), [
            'customer_id' => $this->customer->id,
            'warehouse_id' => 1,
            'booking_date' => now()->toDateString(),
            'items' => [[
                'product_id' => $this->product->id,
                'quantity' => 20,
                'trade_price' => 100,
                'discount_percent' => 0,
                'incentive_rule_ids' => [$percent->id, $bonus->id],
            ]],
        ]);
        $booking = Booking::latest('id')->firstOrFail();
        $this->post(route('bookings.submit', $booking));

        $this->actingAs($this->admin);
        $this->post(route('bookings.approve', $booking));
        $this->post(route('bookings.convert', $booking))->assertRedirect();

        $invoice = SalesInvoice::firstOrFail();
        $line = $invoice->items()->firstOrFail();

        $this->assertSame(2, $line->incentives()->count());
        $this->assertEqualsWithDelta(200.0, (float) $line->incentive_discount, 0.001);
        $this->assertEqualsWithDelta(4.0, (float) $line->bonus_quantity, 0.001);
        $this->assertEqualsWithDelta(1800.0, (float) $invoice->total_amount, 0.01);
    }

    public function test_duplicate_product_on_one_booking_is_rejected(): void
    {
        $this->actingAs($this->booker);
        $this->post(route('bookings.store'), [
            'customer_id' => $this->customer->id,
            'warehouse_id' => 1,
            'booking_date' => now()->toDateString(),
            'items' => [
                ['product_id' => $this->product->id, 'quantity' => 10, 'trade_price' => 100],
                ['product_id' => $this->product->id, 'quantity' => 5, 'trade_price' => 100],
            ],
        ])->assertRedirect()->assertSessionHas('error');

        $this->assertSame(0, Booking::count());
    }
}
