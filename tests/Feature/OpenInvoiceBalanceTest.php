<?php

namespace Tests\Feature;

use App\Models\Company;
use App\Models\Customer;
use App\Models\PurchaseInvoice;
use App\Models\PurchaseReturn;
use App\Models\SalesInvoice;
use App\Models\SalesReturn;
use App\Models\User;
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
}
