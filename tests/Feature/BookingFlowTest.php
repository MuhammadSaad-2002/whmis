<?php

namespace Tests\Feature;

use App\Models\Booking;
use App\Models\Company;
use App\Models\Customer;
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
