<?php

namespace Tests\Feature;

use App\Models\Batch;
use App\Models\Company;
use App\Models\Customer;
use App\Models\Product;
use App\Models\SalesInvoice;
use App\Models\User;
use App\Models\Warehouse;
use Database\Seeders\RolePermissionSeeder;
use Database\Seeders\SystemSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Tests\TestCase;

class NotificationTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed([RolePermissionSeeder::class, SystemSeeder::class]);
        $this->admin = User::where('email', 'admin@whmis.local')->firstOrFail();
    }

    private function makeAlertConditions(): void
    {
        $company = Company::create(['name' => 'Getz Pharma']);
        $customer = Customer::create(['name' => 'City Pharmacy']);

        // Low stock: reorder level above available.
        $product = Product::create([
            'name' => 'Panadol', 'company_id' => $company->id, 'reorder_level' => 50,
        ]);

        // Expiring batch with stock.
        Batch::create([
            'product_id' => $product->id, 'warehouse_id' => Warehouse::default()->id,
            'batch_number' => 'EXP-1', 'expiry_date' => now()->addDays(30),
            'qty_purchased' => 10, 'qty_available' => 10, 'effective_cost' => 80,
        ]);

        // Overdue posted invoice.
        SalesInvoice::create([
            'invoice_number' => 'SI-OVERDUE', 'customer_id' => $customer->id,
            'warehouse_id' => 1, 'invoice_date' => now()->subDays(45)->toDateString(),
            'due_date' => now()->subDays(15)->toDateString(),
            'status' => 'posted', 'total_amount' => 5000, 'sale_type' => 'credit',
        ]);
    }

    public function test_check_alerts_creates_notifications_and_dedups_on_rerun(): void
    {
        $this->makeAlertConditions();

        Artisan::call('whmis:check-alerts');

        $types = $this->admin->notifications->pluck('data.type');
        $this->assertContains('low_stock', $types);
        $this->assertContains('expiry', $types);
        $this->assertContains('overdue_invoice', $types);
        $firstCount = $this->admin->notifications()->count();

        // Re-run: unread alerts for the same entities must not duplicate.
        Artisan::call('whmis:check-alerts');
        $this->assertSame($firstCount, $this->admin->notifications()->count());

        // After reading, the next run may alert again.
        $this->admin->unreadNotifications->markAsRead();
        Artisan::call('whmis:check-alerts');
        $this->assertGreaterThan($firstCount, $this->admin->notifications()->count());
    }

    public function test_booking_submission_notifies_approvers_not_the_booker(): void
    {
        $company = Company::create(['name' => 'Sami']);
        $customer = Customer::create(['name' => 'Pharmacy X']);
        $product = Product::create(['name' => 'Med', 'company_id' => $company->id, 'trade_price' => 10]);

        $booker = User::factory()->create();
        $booker->assignRole('Booker');

        $this->actingAs($booker);
        $this->post(route('bookings.store'), [
            'customer_id' => $customer->id, 'warehouse_id' => 1,
            'booking_date' => now()->toDateString(),
            'items' => [['product_id' => $product->id, 'quantity' => 5, 'trade_price' => 10]],
        ]);
        $booking = \App\Models\Booking::firstOrFail();
        $this->post(route('bookings.submit', $booking));

        $this->assertTrue(
            $this->admin->notifications()->where('data->type', 'booking_pending')->exists(),
            'Approver should be notified of pending booking',
        );
        $this->assertSame(0, $booker->notifications()->count(), 'Booker has no approve permission and gets no alert');
    }

    public function test_bell_endpoints_list_and_mark_read(): void
    {
        $this->makeAlertConditions();
        Artisan::call('whmis:check-alerts');

        $this->actingAs($this->admin);

        $response = $this->getJson(route('notifications.index'));
        $response->assertOk();
        $this->assertGreaterThan(0, $response->json('unread_count'));
        $id = $response->json('notifications.0.id');

        $this->postJson(route('notifications.read', $id))->assertOk();
        $this->assertNotNull($this->admin->notifications()->whereKey($id)->first()->read_at);

        $this->postJson(route('notifications.read-all'))->assertOk();
        $this->assertSame(0, $this->admin->unreadNotifications()->count());
    }
}
