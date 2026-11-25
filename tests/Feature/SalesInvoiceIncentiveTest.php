<?php

namespace Tests\Feature;

use App\Models\Batch;
use App\Models\Booking;
use App\Models\Company;
use App\Models\Customer;
use App\Models\IncentiveRule;
use App\Models\Product;
use App\Models\SalesInvoice;
use App\Models\SalesInvoiceItemIncentive;
use App\Models\User;
use App\Models\Warehouse;
use App\Services\ReportService;
use Database\Seeders\RolePermissionSeeder;
use Database\Seeders\SystemSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

class SalesInvoiceIncentiveTest extends TestCase
{
    use RefreshDatabase;

    private Warehouse $warehouse;

    private Product $product;

    private Batch $batch;

    private Customer $customer;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolePermissionSeeder::class);
        $this->seed(SystemSeeder::class);

        $user = User::factory()->create();
        $user->assignRole('Super Admin');
        $this->actingAs($user);

        $this->warehouse = Warehouse::where('is_default', true)->firstOrFail();
        $company = Company::create(['name' => 'Getz Pharma']);
        $this->product = Product::create([
            'name' => 'Panadol 500mg', 'company_id' => $company->id,
            'trade_price' => 100, 'purchase_price' => 80, 'tax_percent' => 0,
        ]);
        $this->batch = Batch::create([
            'product_id' => $this->product->id, 'warehouse_id' => $this->warehouse->id,
            'batch_number' => 'B1', 'expiry_date' => now()->addYear()->toDateString(),
            'purchase_rate' => 80, 'effective_cost' => 80, 'trade_price' => 100, 'retail_price' => 120,
            'qty_purchased' => 1000, 'qty_available' => 1000,
        ]);
        $this->customer = Customer::create(['name' => 'City Pharmacy', 'credit_limit' => 100000000]);
    }

    private function rule(array $attributes): IncentiveRule
    {
        return IncentiveRule::create($attributes + ['name' => 'Rule', 'active' => true, 'product_id' => $this->product->id]);
    }

    private function storeSale(array $ruleIds): \Illuminate\Testing\TestResponse
    {
        return $this->post(route('sales.store'), [
            'customer_id' => $this->customer->id,
            'warehouse_id' => $this->warehouse->id,
            'invoice_date' => now()->toDateString(),
            'sale_type' => 'credit',
            'items' => [[
                'product_id' => $this->product->id, 'batch_id' => $this->batch->id,
                'quantity' => 20, 'trade_price' => 100,
                'incentive_rule_ids' => $ruleIds,
            ]],
        ]);
    }

    public function test_stacking_rules_folds_discount_bonus_and_records_child_rows(): void
    {
        $percent = $this->rule(['name' => '10% off', 'rule_type' => 'percent_discount', 'value' => 10]);
        $bonus = $this->rule(['name' => '10+2', 'rule_type' => 'qty_bonus', 'base_qty' => 10, 'bonus_qty' => 2]);
        $fixed = $this->rule(['name' => 'Rs 150 off', 'rule_type' => 'fixed_discount', 'value' => 150]);

        $this->storeSale([$percent->id, $bonus->id, $fixed->id])
            ->assertRedirect()->assertSessionHas('success');

        $item = SalesInvoice::firstOrFail()->items()->firstOrFail();

        // 20 @ 100 = gross 2000. Discounts: 10% (200) + fixed 150 = 350 (the fixed
        // discount was previously a no-op). Bonus: 20/10*2 = 4.
        $this->assertEqualsWithDelta(350.0, (float) $item->incentive_discount, 0.001);
        $this->assertEqualsWithDelta(350.0, (float) $item->discount_amount, 0.001);
        $this->assertEqualsWithDelta(1650.0, (float) $item->net_amount, 0.001);
        $this->assertEqualsWithDelta(4.0, (float) $item->bonus_quantity, 0.001);

        $this->assertSame(3, $item->incentives()->count());
        $bonusRow = $item->incentives()->where('rule_type', 'qty_bonus')->firstOrFail();
        $this->assertEqualsWithDelta(400.0, (float) $bonusRow->value_given, 0.001); // 4 * 100
    }

    public function test_posting_freezes_the_incentive_record(): void
    {
        $percent = $this->rule(['name' => '10% off', 'rule_type' => 'percent_discount', 'value' => 10]);

        $this->storeSale([$percent->id])->assertRedirect();
        $sale = SalesInvoice::firstOrFail();

        $this->post(route('sales.post', $sale))->assertRedirect()->assertSessionHas('success');

        $this->assertSame('posted', $sale->refresh()->status);
        $row = SalesInvoiceItemIncentive::firstOrFail();
        $this->assertEqualsWithDelta(200.0, (float) $row->value_given, 0.001);
        $this->assertEqualsWithDelta(200.0, (float) $row->discount_amount, 0.001);
    }

    public function test_editing_a_converted_invoice_saves_its_incentives_without_changing_the_booking(): void
    {
        $fixed = $this->rule(['name' => 'Booked discount', 'rule_type' => 'fixed_discount', 'value' => 150]);
        $percent = $this->rule(['name' => 'Invoice discount', 'rule_type' => 'percent_discount', 'value' => 10]);
        $bonus = $this->rule(['name' => 'Extra bonus', 'rule_type' => 'qty_bonus', 'base_qty' => 5, 'bonus_qty' => 1]);
        $header = ['customer_id' => $this->customer->id, 'warehouse_id' => $this->warehouse->id];
        $this->post(route('bookings.store'), $header + [
            'booking_date' => now()->toDateString(),
            'notes' => 'Original booking note',
            'items' => [['product_id' => $this->product->id, 'quantity' => 20, 'trade_price' => 100, 'incentive_rule_ids' => [$fixed->id]]],
        ])->assertSessionHas('success');
        $booking = Booking::firstOrFail();
        $this->post(route('bookings.submit', $booking))->assertSessionHas('success');
        $this->post(route('bookings.approve', $booking))->assertSessionHas('success');
        $this->post(route('bookings.convert', $booking), ['lines' => [[
            'id' => $booking->items()->firstOrFail()->id, 'quantity' => 5, 'bonus_quantity' => 0,
        ]]])->assertSessionHas('success');
        $sale = SalesInvoice::firstOrFail();
        $bookingSnapshot = fn () => [
            $booking->fresh(['items.incentives'])->toArray(),
            DB::table('booking_invoice_lines')->where('sales_invoice_id', $sale->id)->orderBy('booking_item_id')->get()->all(),
        ];
        $originalBooking = $bookingSnapshot();
        $this->travel(5)->minutes(); // Detect even an unintended update to the booking timestamp.
        $line = [
            'product_id' => $this->product->id, 'batch_id' => $this->batch->id, 'quantity' => 5,
            'bonus_quantity' => 0, 'trade_price' => 100, 'gst_percent' => 10, 'remarks' => 'Invoice line note',
        ];
        $url = route('sales.update', $sale);
        $header += ['invoice_date' => $sale->invoice_date->toDateString(), 'sale_type' => 'booking', 'notes' => 'Invoice-only note', 'mp_inv_ref' => 'MP-0007'];
        $this->put($url, $header + ['items' => [$line + ['incentive_rule_ids' => [$fixed->id, $percent->id]]]])->assertSessionHas('success');
        $this->assertSame('Invoice-only note', $sale->fresh()->notes);
        $this->assertEquals($originalBooking, $bookingSnapshot());
        $this->get(route('sales.edit', $sale))->assertInertia(fn (Assert $page) => $page
            ->where('trackedConversion', true)
            ->where('invoice.mp_inv_ref', 'MP-0007')
            ->where('invoice.items.0.incentive_discount', '87.50')
            ->where('invoice.items.0.incentives.0.allocated_discount', 37.5)
            ->where('invoice.items.0.incentives.1.rule_name', 'Invoice discount'));
        $this->assertSame('453.75', $sale->items()->firstOrFail()->net_amount);
        $this->get(route('sales.print', $sale))->assertOk()->assertHeader('content-type', 'application/pdf');
        $html = view('pdf.sales-invoice', ['invoice' => $sale->fresh()->load('items.product.company', 'items.incentives')])->render();
        $this->assertStringNotContainsString('Getz Pharma', $html);
        $this->assertStringNotContainsString('Invoice discount', $html);
        $this->assertStringNotContainsString('Booked discount', $html);
        $this->assertStringContainsString('class="items items--compact"', $html);
        $this->assertMatchesRegularExpression('/<td class="num item-rate">87\.50\s+<span class="meta">\(17\.5%\)<\/span>/', $html);
        $this->assertMatchesRegularExpression('/<td class="num item-rate">41\.25\s+<span class="meta">\(10%\)<\/span>/', $html);
        $this->assertStringContainsString('Invoice line note', $html);

        $this->put($url, $header + ['items' => [$line + ['incentive_rule_ids' => [$fixed->id, $percent->id, $bonus->id]]]])
            ->assertSessionHasErrors('items.0.incentive_rule_ids');
        $this->assertCount(2, $sale->items()->firstOrFail()->incentives);
        $this->put($url, $header + ['items' => [array_replace($line, ['quantity' => 6, 'incentive_rule_ids' => [$fixed->id, $percent->id]])]])
            ->assertSessionHas('error');
        $this->assertSame('5.00', $sale->items()->firstOrFail()->quantity);
        $this->assertEquals($originalBooking, $bookingSnapshot());

        $this->put($url, array_replace($header, ['mp_inv_ref' => str_repeat('A', 65)]) + ['items' => [$line]])
            ->assertSessionHasErrors('mp_inv_ref');
        $this->assertSame('MP-0007', $sale->fresh()->mp_inv_ref);
        $this->put($url, $header + ['items' => [$line + ['incentive_rule_ids' => [$fixed->id]]]])->assertSessionHas('success');
        $this->assertSame('37.50', $sale->items()->firstOrFail()->incentive_discount);
        $this->assertEquals($originalBooking, $bookingSnapshot());
        $this->post(route('sales.post', $sale))->assertSessionHas('success');
        $this->assertSame('37.50', $sale->items()->firstOrFail()->discount_amount);
        $this->assertEquals($originalBooking, $bookingSnapshot());
    }

    public function test_incentives_given_report_aggregates_per_customer(): void
    {
        $percent = $this->rule(['name' => '10% off', 'rule_type' => 'percent_discount', 'value' => 10]);

        // Two posted invoices, both granting the same rule.
        foreach (range(1, 2) as $ignored) {
            $this->storeSale([$percent->id])->assertRedirect();
            $sale = SalesInvoice::latest('id')->firstOrFail();
            $this->post(route('sales.post', $sale))->assertRedirect();
        }

        // A cancelled invoice's incentives must be excluded.
        $this->storeSale([$percent->id])->assertRedirect();
        $cancelled = SalesInvoice::latest('id')->firstOrFail();
        $this->post(route('sales.post', $cancelled))->assertRedirect();
        $this->post(route('sales.cancel', $cancelled))->assertRedirect();

        $report = app(ReportService::class)->build('incentives-given', [
            'from' => now()->subDay()->toDateString(),
            'to' => now()->addDay()->toDateString(),
        ]);

        $this->assertCount(1, $report['rows']);
        $row = $report['rows'][0];
        $this->assertSame('City Pharmacy', $row['customer']);
        $this->assertSame(2, $row['times']);
        $this->assertSame(2, $row['invoices']);
        $this->assertEqualsWithDelta(400.0, $row['value_given'], 0.001); // 2 * 200
        $this->assertEqualsWithDelta(400.0, $report['totals']['value_given'], 0.001);
    }

    public function test_incentives_given_excludes_cancelled_only(): void
    {
        $percent = $this->rule(['name' => '10% off', 'rule_type' => 'percent_discount', 'value' => 10]);

        $this->storeSale([$percent->id])->assertRedirect();
        $sale = SalesInvoice::firstOrFail();
        $this->post(route('sales.post', $sale))->assertRedirect();
        $this->post(route('sales.cancel', $sale))->assertRedirect();

        $report = app(ReportService::class)->build('incentives-given', [
            'from' => now()->subDay()->toDateString(),
            'to' => now()->addDay()->toDateString(),
        ]);

        $this->assertCount(0, $report['rows']);
    }
}
