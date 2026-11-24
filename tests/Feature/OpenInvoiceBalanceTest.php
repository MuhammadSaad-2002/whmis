<?php

namespace Tests\Feature;

use App\Models\Company;
use App\Models\Customer;
use App\Models\Payment;
use App\Models\PurchaseInvoice;
use App\Models\PurchaseReturn;
use App\Models\SalesInvoice;
use App\Models\SalesReturn;
use App\Models\User;
use App\Services\LedgerService;
use App\Services\PaymentService;
use Database\Seeders\RolePermissionSeeder;
use Database\Seeders\SystemSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class OpenInvoiceBalanceTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed([RolePermissionSeeder::class, SystemSeeder::class]);
        $this->actingAs(User::where('email', 'admin@whmis.local')->firstOrFail());
    }

    public function test_paid_invoice_with_return_credit_is_removed_from_payment_lookup(): void
    {
        $customer = Customer::create(['name' => 'My Pharmacy']);
        $invoice = SalesInvoice::create([
            'invoice_number' => 'SI-2026-0008', 'customer_id' => $customer->id,
            'warehouse_id' => 1, 'invoice_date' => '2026-08-09',
            'status' => 'posted', 'total_amount' => 11325.17,
        ]);
        app(PaymentService::class)->record($customer, [
            'method' => 'cash', 'amount' => 7020, 'payment_date' => '2026-08-11',
        ], [['invoice_type' => 'sales_invoice', 'invoice_id' => $invoice->id, 'amount' => 7020]]);
        SalesReturn::create([
            'return_number' => 'SR-1', 'sales_invoice_id' => $invoice->id,
            'customer_id' => $customer->id, 'warehouse_id' => 1,
            'return_date' => '2026-08-11', 'total_amount' => 4306.10, 'status' => 'posted',
        ]);

        $this->getJson(route('lookup.open-invoices', ['party_type' => 'customer', 'party_id' => $customer->id]))
            ->assertOk()->assertExactJson([]);
    }

    public function test_partial_and_cancelled_returns_and_payments_change_collectible_balance(): void
    {
        $customer = Customer::create(['name' => 'Pharmacy']);
        $invoice = SalesInvoice::create([
            'invoice_number' => 'SI-1', 'customer_id' => $customer->id,
            'warehouse_id' => 1, 'invoice_date' => now(),
            'status' => 'posted', 'total_amount' => 1000,
        ]);
        $payment = app(PaymentService::class)->record($customer, [
            'method' => 'cash', 'amount' => 200, 'payment_date' => now()->toDateString(),
        ], [['invoice_type' => 'sales_invoice', 'invoice_id' => $invoice->id, 'amount' => 200]]);
        $return = SalesReturn::create([
            'return_number' => 'SR-1', 'sales_invoice_id' => $invoice->id,
            'customer_id' => $customer->id, 'warehouse_id' => 1,
            'return_date' => now(), 'total_amount' => 300, 'status' => 'posted',
        ]);
        $url = route('lookup.open-invoices', ['party_type' => 'customer', 'party_id' => $customer->id]);
        $this->getJson($url)->assertOk()->assertJsonPath('0.outstanding', 500);
        $return->update(['status' => 'cancelled']);
        $this->getJson($url)->assertOk()->assertJsonPath('0.outstanding', 800);
        app(PaymentService::class)->cancel($payment);
        $this->getJson($url)->assertOk()->assertJsonPath('0.outstanding', 1000);
        $return->update(['status' => 'posted', 'total_amount' => 1000]);
        $this->getJson($url)->assertOk()->assertExactJson([]);
    }

    public function test_supplier_invoice_balance_deducts_only_returns_linked_to_that_invoice(): void
    {
        $company = Company::create(['name' => 'Supplier']);
        $invoice = PurchaseInvoice::create([
            'invoice_number' => 'PI-1', 'company_id' => $company->id,
            'warehouse_id' => 1, 'invoice_date' => now(),
            'status' => 'posted', 'total_amount' => 1000,
        ]);
        foreach ([['PR-1', $invoice->id, 300], ['PR-2', null, 100]] as [$number, $id, $amount]) {
            PurchaseReturn::create([
                'return_number' => $number, 'purchase_invoice_id' => $id,
                'company_id' => $company->id, 'warehouse_id' => 1,
                'return_date' => now(), 'total_amount' => $amount,
            ]);
        }
        $this->getJson(route('lookup.open-invoices', ['party_type' => 'company', 'party_id' => $company->id]))
            ->assertOk()->assertJsonPath('0.outstanding', 700);
    }

    public function test_customer_lookup_returns_only_open_invoices_in_oldest_first_order(): void
    {
        $customer = Customer::create(['name' => 'City Pharmacy']);
        $other = Customer::create(['name' => 'Other Pharmacy']);
        $newer = $this->sale($customer, 'SI-NEW', '2026-11-01', 90);
        $older = $this->sale($customer, 'SI-OLD', '2026-08-01', 100.23);
        $sameDay = $this->sale($customer, 'SI-TIE', '2026-08-01', 30);
        $this->sale($customer, 'SI-DRAFT', '2026-07-01', 30, 'draft');
        $this->sale($customer, 'SI-CANCELLED', '2026-07-01', 30, 'cancelled');
        $this->sale($other, 'SI-OTHER', '2026-07-01', 30);
        app(LedgerService::class)->post($customer, 'sale', '2026-08-01', 220.23, 0);
        app(PaymentService::class)->record($customer, [
            'method' => 'cash', 'amount' => 40.10, 'payment_date' => '2026-08-02',
        ], [['invoice_type' => 'sales_invoice', 'invoice_id' => $older->id, 'amount' => 40.10]]);
        SalesReturn::create([
            'return_number' => 'SR-1', 'sales_invoice_id' => $older->id,
            'customer_id' => $customer->id, 'warehouse_id' => 1, 'return_date' => '2026-08-02',
            'total_amount' => 10, 'status' => 'posted',
        ]);

        $lookup = route('lookup.open-invoices', ['party_type' => 'customer', 'party_id' => $customer->id, 'with_balance' => 1]);
        $this->getJson($lookup)->assertOk()->assertJsonCount(3, 'invoices')
            ->assertJsonPath('invoices.0.id', $older->id)->assertJsonPath('invoices.0.outstanding', 50.13)
            ->assertJsonPath('invoices.1.id', $sameDay->id)->assertJsonPath('invoices.2.id', $newer->id)
            ->assertJsonPath('balance', 180.13);

        $booker = User::factory()->create();
        $booker->assignRole('Booker');
        $this->actingAs($booker)->getJson($lookup)->assertForbidden();
    }

    public function test_manual_receipt_rejects_overallocation_and_records_a_valid_split(): void
    {
        $customer = Customer::create(['name' => 'City Pharmacy']);
        $other = Customer::create(['name' => 'Other Pharmacy']);
        $older = $this->sale($customer, 'SI-OLD', '2026-08-01', 100.12);
        $newer = $this->sale($customer, 'SI-NEW', '2026-11-01', 90);
        $foreign = $this->sale($other, 'SI-OTHER', '2026-07-01', 30);
        $payload = [
            'party_type' => 'customer', 'party_id' => $customer->id, 'method' => 'cash',
            'amount' => '125.50', 'payment_date' => '2026-11-23',
        ];
        $allocation = fn (SalesInvoice $invoice, string $amount) => [
            'invoice_type' => 'sales_invoice', 'invoice_id' => $invoice->id, 'amount' => $amount,
        ];
        $url = route('payments.store');
        foreach ([
            [$allocation($older, '100.13')],
            [$allocation($older, '100.00'), $allocation($older, '0.13')],
            [$allocation($older, '100.12'), $allocation($newer, '25.39')],
            [$allocation($foreign, '5.00')],
        ] as $badAllocations) {
            $this->postJson($url, $payload + ['allocations' => $badAllocations])
                ->assertUnprocessable()->assertJsonValidationErrors('allocations');
        }
        $this->assertDatabaseCount('payments', 0);
        $this->assertDatabaseCount('ledger_entries', 0);

        $this->post($url, $payload + ['allocations' => [$allocation($older, '100.12'), $allocation($newer, '25.38')]])
            ->assertSessionDoesntHaveErrors()->assertRedirect();
        $payment = Payment::sole();
        $this->assertEquals(126, $payment->amount);
        $this->assertSame(12550, $payment->tendered_paisa);
        $this->assertSame(12600, $payment->received_paisa);
        $this->assertDatabaseHas('payment_allocations', ['payment_id' => $payment->id, 'invoice_id' => $older->id, 'amount' => 100.12]);
        $this->assertDatabaseHas('payment_allocations', ['payment_id' => $payment->id, 'invoice_id' => $newer->id, 'amount' => 25.38]);
        $this->getJson(route('lookup.open-invoices', ['party_type' => 'customer', 'party_id' => $customer->id]))
            ->assertOk()->assertJsonCount(1)->assertJsonPath('0.outstanding', 64.62);
    }

    private function sale(Customer $customer, string $number, string $date, float $total, string $status = 'posted'): SalesInvoice
    {
        return SalesInvoice::create([
            'invoice_number' => $number, 'customer_id' => $customer->id, 'warehouse_id' => 1,
            'invoice_date' => $date, 'status' => $status, 'total_amount' => $total,
        ]);
    }
}
