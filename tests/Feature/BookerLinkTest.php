<?php

namespace Tests\Feature;

use App\Models\Batch;
use App\Models\Booking;
use App\Models\Company;
use App\Models\Customer;
use App\Models\Product;
use App\Models\PurchaseInvoice;
use App\Models\SalesInvoice;
use App\Models\User;
use App\Services\InvoicePostingService;
use App\Services\NumberSeriesService;
use App\Services\ReportService;
use Database\Seeders\RolePermissionSeeder;
use Database\Seeders\SystemSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Optional booker link on bookings & sales invoices: an admin/manager may credit
 * an order to a field booker, but must not change anything else.
 */
class BookerLinkTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    private User $bookerA; // the customer's primary booker

    private User $bookerB; // a different booker, to test overrides

    private Customer $customer;

    private Product $product;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed([RolePermissionSeeder::class, SystemSeeder::class]);

        $this->admin = User::where('email', 'admin@whmis.local')->firstOrFail();

        $this->bookerA = User::factory()->create(['name' => 'Booker A']);
        $this->bookerA->assignRole('Booker');
        $this->bookerB = User::factory()->create(['name' => 'Booker B']);
        $this->bookerB->assignRole('Booker');

        $company = Company::create(['name' => 'Getz Pharma']);
        $this->customer = Customer::create(['name' => 'City Pharmacy', 'booker_id' => $this->bookerA->id]);
        $this->product = Product::create([
            'name' => 'Panadol 500mg', 'company_id' => $company->id, 'trade_price' => 100,
        ]);

        // Stock so sales drafts have a real batch to reserve.
        $this->actingAs($this->admin);
        $purchase = PurchaseInvoice::create([
            'invoice_number' => app(NumberSeriesService::class)->next('purchase_invoice'),
            'company_id' => $company->id, 'warehouse_id' => 1,
            'invoice_date' => now()->toDateString(), 'purchase_type' => 'credit',
        ]);
        $purchase->items()->create([
            'product_id' => $this->product->id, 'batch_number' => 'B1',
            'quantity' => 100, 'purchase_rate' => 80, 'trade_price' => 100,
        ]);
        app(InvoicePostingService::class)->postPurchase($purchase->refresh());
    }

    private function batchId(): int
    {
        return Batch::where('product_id', $this->product->id)->firstOrFail()->id;
    }

    private function postBooking(User $actor, array $overrides = []): Booking
    {
        $this->actingAs($actor)
            ->post(route('bookings.store'), array_merge([
                'customer_id' => $this->customer->id,
                'warehouse_id' => 1,
                'booking_date' => now()->toDateString(),
                'items' => [[
                    'product_id' => $this->product->id, 'quantity' => 20, 'trade_price' => 100,
                ]],
            ], $overrides))
            ->assertRedirect();

        return Booking::latest('id')->firstOrFail();
    }

    private function postSale(User $actor, array $overrides = []): SalesInvoice
    {
        $this->actingAs($actor)
            ->post(route('sales.store'), array_merge([
                'customer_id' => $this->customer->id,
                'warehouse_id' => 1,
                'invoice_date' => now()->toDateString(),
                'sale_type' => 'credit',
                'items' => [[
                    'product_id' => $this->product->id, 'batch_id' => $this->batchId(),
                    'quantity' => 5, 'trade_price' => 100,
                ]],
            ], $overrides))
            ->assertRedirect();

        return SalesInvoice::latest('id')->firstOrFail();
    }

    public function test_admin_can_credit_a_booking_to_a_booker(): void
    {
        $booking = $this->postBooking($this->admin, ['booker_id' => $this->bookerB->id]);

        $this->assertSame($this->bookerB->id, $booking->booker_id);
    }

    public function test_admin_booking_without_booker_defaults_to_creator(): void
    {
        $booking = $this->postBooking($this->admin);

        $this->assertSame($this->admin->id, $booking->booker_id);
    }

    public function test_field_booker_cannot_spoof_the_booker(): void
    {
        // A plain Booker (no bookings.approve) submits someone else's id → ignored.
        $booking = $this->postBooking($this->bookerA, ['booker_id' => $this->bookerB->id]);

        $this->assertSame($this->bookerA->id, $booking->booker_id);
    }

    public function test_admin_can_re_attribute_a_draft_booking_on_update(): void
    {
        $booking = $this->postBooking($this->admin, ['booker_id' => $this->bookerA->id]);

        $this->actingAs($this->admin)
            ->put(route('bookings.update', $booking), [
                'customer_id' => $this->customer->id,
                'warehouse_id' => 1,
                'booking_date' => now()->toDateString(),
                'booker_id' => $this->bookerB->id,
                'items' => [[
                    'product_id' => $this->product->id, 'quantity' => 20, 'trade_price' => 100,
                ]],
            ])->assertSessionHas('success');

        $this->assertSame($this->bookerB->id, $booking->refresh()->booker_id);
    }

    public function test_sales_invoice_stores_optional_booker(): void
    {
        $withBooker = $this->postSale($this->admin, ['booker_id' => $this->bookerB->id]);
        $this->assertSame($this->bookerB->id, $withBooker->booker_id);
        // Totals still compute as usual (5 @ 100 = 500).
        $this->assertEqualsWithDelta(500.0, (float) $withBooker->total_amount, 0.01);

        $withoutBooker = $this->postSale($this->admin);
        $this->assertNull($withoutBooker->booker_id);
    }

    public function test_conversion_copies_booking_booker_onto_the_sale(): void
    {
        $booking = $this->postBooking($this->admin, ['booker_id' => $this->bookerB->id]);
        $this->post(route('bookings.submit', $booking));
        $this->post(route('bookings.approve', $booking));
        $this->post(route('bookings.convert', $booking))->assertRedirect();

        $invoice = SalesInvoice::where('booking_id', $booking->id)->firstOrFail();
        $this->assertSame($this->bookerB->id, $invoice->booker_id);
    }

    public function test_booker_sales_report_credits_the_invoice_booker_over_the_customer_booker(): void
    {
        // Customer's primary booker is A, but this sale is credited to B.
        $sale = SalesInvoice::create([
            'invoice_number' => app(NumberSeriesService::class)->next('sales_invoice'),
            'customer_id' => $this->customer->id, 'booker_id' => $this->bookerB->id,
            'warehouse_id' => 1, 'invoice_date' => now()->toDateString(), 'sale_type' => 'credit',
        ]);
        $sale->items()->create([
            'product_id' => $this->product->id, 'quantity' => 10,
            'trade_price' => 100, 'discount_percent' => 0, 'gst_percent' => 0,
        ]);
        app(InvoicePostingService::class)->postSale($sale->refresh());

        $report = app(ReportService::class)->build('booker-sales', []);
        $bookers = collect($report['rows'])->pluck('booker');

        $this->assertTrue($bookers->contains('Booker B'), 'Sale should be credited to its own booker.');
        $this->assertFalse($bookers->contains('Booker A'), 'It must not fall back to the customer booker.');
    }
}
