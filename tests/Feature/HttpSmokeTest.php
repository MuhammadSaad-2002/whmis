<?php

namespace Tests\Feature;

use App\Models\Batch;
use App\Models\Company;
use App\Models\Customer;
use App\Models\Product;
use App\Models\PurchaseInvoice;
use App\Models\SalesInvoice;
use App\Models\User;
use Database\Seeders\RolePermissionSeeder;
use Database\Seeders\SystemSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

/**
 * Drives the full trading loop through real HTTP routes with RBAC active.
 */
class HttpSmokeTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed([RolePermissionSeeder::class, SystemSeeder::class]);
        $this->admin = User::where('email', 'admin@whmis.local')->firstOrFail();
    }

    public function test_full_trading_loop_over_http(): void
    {
        $this->actingAs($this->admin);

        // --- Master data via HTTP
        $this->post(route('suppliers.store'), [
            'name' => 'Getz Pharma', 'status' => 'active',
        ])->assertRedirect()->assertSessionHas('success');
        $company = Company::firstOrFail();

        $this->post(route('customers.store'), [
            'name' => 'City Pharmacy', 'status' => 'active', 'city' => 'Lahore',
            'credit_limit' => 50000, 'opening_balance' => 1000,
        ])->assertRedirect()->assertSessionHas('success');
        $customer = Customer::firstOrFail();
        $this->assertEquals(1000.0, $customer->outstandingBalance(), 'Opening balance should post to ledger');

        $this->post(route('products.store'), [
            'name' => 'Panadol 500mg', 'company_id' => $company->id, 'status' => 'active',
            'purchase_price' => 80, 'trade_price' => 100, 'retail_price' => 120, 'tax_percent' => 0,
        ])->assertRedirect()->assertSessionHas('success');
        $product = Product::firstOrFail();

        // --- Purchase draft -> post
        $this->post(route('purchases.store'), [
            'company_id' => $company->id,
            'warehouse_id' => 1,
            'invoice_date' => now()->toDateString(),
            'purchase_type' => 'credit',
            'items' => [[
                'product_id' => $product->id,
                'batch_number' => 'B-100',
                'expiry_date' => now()->addYear()->toDateString(),
                'quantity' => 100, 'bonus_quantity' => 10,
                'purchase_rate' => 80, 'trade_price' => 100, 'retail_price' => 120,
                'discount_percent' => 5, 'gst_percent' => 17,
            ]],
        ])->assertRedirect();

        $purchase = PurchaseInvoice::firstOrFail();
        $this->assertSame('draft', $purchase->status);
        $this->assertStringStartsWith('PI-', $purchase->invoice_number);

        $this->post(route('purchases.post', $purchase))->assertRedirect()->assertSessionHas('success');
        $this->assertSame('posted', $purchase->refresh()->status);
        $this->assertEqualsWithDelta(110.0, (float) Batch::firstOrFail()->qty_available, 0.001);

        // --- Sale draft -> post (manual invoice number)
        $this->post(route('sales.store'), [
            'invoice_number' => 'MANUAL-001',
            'customer_id' => $customer->id,
            'warehouse_id' => 1,
            'invoice_date' => now()->toDateString(),
            'sale_type' => 'credit',
            'items' => [[
                'product_id' => $product->id,
                'quantity' => 20, 'bonus_quantity' => 2,
                'trade_price' => 100, 'discount_percent' => 0, 'gst_percent' => 0,
            ]],
        ])->assertRedirect();

        $sale = SalesInvoice::firstOrFail();
        $this->assertSame('MANUAL-001', $sale->invoice_number);
        $this->assertTrue($sale->manual_number);

        $this->post(route('sales.post', $sale))->assertRedirect()->assertSessionHas('success');
        $sale->refresh();
        $this->assertSame('posted', $sale->status);
        $this->assertEqualsWithDelta(88.0, (float) Batch::firstOrFail()->qty_available, 0.001);
        $this->assertGreaterThan(0, (float) $sale->total_profit);

        // Customer owes opening 1000 + sale 2000
        $this->assertEqualsWithDelta(3000.0, $customer->outstandingBalance(), 0.01);

        // --- Payment with allocation
        $this->post(route('payments.store'), [
            'party_type' => 'customer', 'party_id' => $customer->id,
            'method' => 'bank', 'amount' => 1500,
            'payment_date' => now()->toDateString(),
            'allocations' => [
                ['invoice_type' => 'sales_invoice', 'invoice_id' => $sale->id, 'amount' => 1500],
            ],
        ])->assertRedirect()->assertSessionHas('success');
        $this->assertEqualsWithDelta(1500.0, $customer->outstandingBalance(), 0.01);

        // --- Pages render with correct Inertia components
        $pages = [
            ['dashboard', [], 'dashboard'],
            ['suppliers.index', [], 'suppliers/index'],
            ['categories.index', [], 'categories/index'],
            ['products.index', [], 'products/index'],
            ['customers.index', [], 'customers/index'],
            ['purchases.index', [], 'purchases/index'],
            ['purchases.create', [], 'purchases/form'],
            ['purchases.edit', [$purchase], 'purchases/form'],
            ['sales.index', [], 'sales/index'],
            ['sales.create', [], 'sales/form'],
            ['sales.edit', [$sale], 'sales/form'],
            ['inventory.index', [], 'inventory/index'],
            ['inventory.batches', [], 'inventory/batches'],
            ['inventory.movements', [], 'inventory/movements'],
            ['payments.index', [], 'payments/index'],
            ['ledger.outstanding', [], 'ledger/outstanding'],
            ['ledger.customer', [$customer], 'ledger/party'],
            ['ledger.supplier', [$company], 'ledger/party'],
        ];

        foreach ($pages as [$name, $params, $component]) {
            $this->get(route($name, $params))
                ->assertOk()
                ->assertInertia(fn (Assert $page) => $page->component($component));
        }

        // --- Lookups
        $this->getJson(route('lookup.products', ['q' => 'Pana', 'warehouse_id' => 1]))
            ->assertOk()
            ->assertJsonPath('0.name', 'Panadol 500mg')
            ->assertJsonPath('0.stock', 88);

        $this->getJson(route('lookup.batches', ['product' => $product->id, 'warehouse_id' => 1]))
            ->assertOk()
            ->assertJsonPath('0.batch_number', 'B-100');

        $this->getJson(route('lookup.open-invoices', ['party_type' => 'customer', 'party_id' => $customer->id]))
            ->assertOk()
            ->assertJsonPath('0.outstanding', 500); // 2000 - 1500 allocated

        // --- PDFs stream
        $this->get(route('sales.print', $sale))->assertOk()->assertHeader('content-type', 'application/pdf');
        $this->get(route('ledger.customer.pdf', $customer))->assertOk()->assertHeader('content-type', 'application/pdf');
    }

    public function test_manual_batch_number_resolves_to_specific_batch(): void
    {
        $this->actingAs($this->admin);

        $company = Company::create(['name' => 'Sami Pharma']);
        $product = Product::create(['name' => 'Amoxil', 'company_id' => $company->id, 'trade_price' => 50]);
        $customer = Customer::create(['name' => 'Corner Pharmacy']);

        // Two batches: EARLY expires first (FIFO default), LATE second.
        foreach ([['EARLY', 6], ['LATE', 24]] as [$number, $months]) {
            $this->post(route('purchases.store'), [
                'company_id' => $company->id, 'warehouse_id' => 1,
                'invoice_date' => now()->toDateString(), 'purchase_type' => 'credit',
                'items' => [[
                    'product_id' => $product->id, 'batch_number' => $number,
                    'expiry_date' => now()->addMonths($months)->toDateString(),
                    'quantity' => 50, 'purchase_rate' => 40, 'trade_price' => 50,
                ]],
            ]);
            $this->post(route('purchases.post', PurchaseInvoice::latest('id')->first()));
        }

        // Typing "late" (case-insensitive) must pull stock from LATE, not FIFO.
        $this->post(route('sales.store'), [
            'customer_id' => $customer->id, 'warehouse_id' => 1,
            'invoice_date' => now()->toDateString(), 'sale_type' => 'credit',
            'items' => [[
                'product_id' => $product->id, 'batch_number' => 'late',
                'quantity' => 10, 'trade_price' => 50,
            ]],
        ])->assertRedirect()->assertSessionHas('success');

        $sale = SalesInvoice::latest('id')->firstOrFail();
        $this->post(route('sales.post', $sale))->assertSessionHas('success');

        $this->assertEqualsWithDelta(40.0, (float) Batch::where('batch_number', 'LATE')->first()->qty_available, 0.001);
        $this->assertEqualsWithDelta(50.0, (float) Batch::where('batch_number', 'EARLY')->first()->qty_available, 0.001);

        // Unknown batch number is rejected with a clear error and nothing saved.
        $before = SalesInvoice::count();
        $this->post(route('sales.store'), [
            'customer_id' => $customer->id, 'warehouse_id' => 1,
            'invoice_date' => now()->toDateString(), 'sale_type' => 'credit',
            'items' => [[
                'product_id' => $product->id, 'batch_number' => 'NOPE',
                'quantity' => 1, 'trade_price' => 50,
            ]],
        ])->assertRedirect()->assertSessionHas('error');
        $this->assertStringContainsString('NOPE', session('error'));
        $this->assertSame($before, SalesInvoice::count());
    }

    public function test_rbac_blocks_unauthorized_roles(): void
    {
        $booker = User::factory()->create();
        $booker->assignRole('Booker');

        $this->actingAs($booker);
        $this->get(route('purchases.index'))->assertForbidden();
        $this->get(route('payments.index'))->assertForbidden();
        $this->get(route('sales.index'))->assertForbidden();
        $this->get(route('bookings.index'))->assertOk();

        $warehouse = User::factory()->create();
        $warehouse->assignRole('Warehouse Staff');
        $this->actingAs($warehouse);
        $this->get(route('inventory.index'))->assertOk();
        $this->get(route('ledger.outstanding'))->assertForbidden();
    }

    public function test_draft_lifecycle_edit_and_cancel_rules(): void
    {
        $this->actingAs($this->admin);

        $company = Company::create(['name' => 'Sami Pharma']);
        $product = Product::create([
            'name' => 'Augmentin', 'company_id' => $company->id, 'trade_price' => 300,
        ]);

        $this->post(route('purchases.store'), [
            'company_id' => $company->id, 'warehouse_id' => 1,
            'invoice_date' => now()->toDateString(), 'purchase_type' => 'credit',
            'items' => [[
                'product_id' => $product->id, 'quantity' => 10,
                'purchase_rate' => 250, 'trade_price' => 300,
            ]],
        ]);
        $purchase = PurchaseInvoice::latest('id')->firstOrFail();

        // Draft can be edited
        $this->put(route('purchases.update', $purchase), [
            'company_id' => $company->id, 'warehouse_id' => 1,
            'invoice_date' => now()->toDateString(), 'purchase_type' => 'credit',
            'items' => [[
                'product_id' => $product->id, 'quantity' => 15,
                'purchase_rate' => 250, 'trade_price' => 300,
            ]],
        ])->assertRedirect()->assertSessionHas('success');
        $this->assertEqualsWithDelta(15.0, (float) $purchase->refresh()->items->first()->quantity, 0.001);

        // Posted invoice cannot be edited
        $this->post(route('purchases.post', $purchase));
        $this->put(route('purchases.update', $purchase), [
            'company_id' => $company->id, 'warehouse_id' => 1,
            'invoice_date' => now()->toDateString(), 'purchase_type' => 'credit',
            'items' => [['product_id' => $product->id, 'quantity' => 1, 'purchase_rate' => 1]],
        ])->assertSessionHas('error');

        // Duplicate creates a fresh draft
        $this->post(route('purchases.duplicate', $purchase))->assertRedirect();
        $this->assertSame(2, PurchaseInvoice::count());
        $copy = PurchaseInvoice::latest('id')->firstOrFail();
        $this->assertSame('draft', $copy->status);
        $this->assertNotSame($purchase->invoice_number, $copy->invoice_number);

        // Cancel posted purchase (nothing sold) reverses stock
        $this->post(route('purchases.cancel', $purchase))->assertSessionHas('success');
        $this->assertSame('cancelled', $purchase->refresh()->status);
    }

    public function test_sale_base_requires_terms_and_is_treated_like_credit(): void
    {
        $this->actingAs($this->admin);

        $company = Company::create(['name' => 'Getz Pharma']);
        $customer = Customer::create(['name' => 'City Pharmacy', 'credit_limit' => 1500]);
        $product = Product::create(['name' => 'Panadol 500mg', 'company_id' => $company->id, 'trade_price' => 100]);

        // Stock: 100 units via posted purchase.
        $purchase = PurchaseInvoice::create([
            'invoice_number' => 'PI-SB-1', 'company_id' => $company->id, 'warehouse_id' => 1,
            'invoice_date' => now()->toDateString(), 'purchase_type' => 'credit',
        ]);
        $purchase->items()->create([
            'product_id' => $product->id, 'batch_number' => 'B1',
            'quantity' => 100, 'purchase_rate' => 80, 'trade_price' => 100,
        ]);
        app(\App\Services\InvoicePostingService::class)->postPurchase($purchase->refresh());

        $line = ['product_id' => $product->id, 'quantity' => 20, 'trade_price' => 100];

        // Sale Base without terms → validation error, nothing saved.
        $this->post(route('sales.store'), [
            'customer_id' => $customer->id, 'warehouse_id' => 1,
            'invoice_date' => now()->toDateString(), 'sale_type' => 'sale_base',
            'items' => [$line],
        ])->assertSessionHasErrors('sale_terms');
        $this->assertSame(0, SalesInvoice::count());

        // With terms → draft saved, terms persisted.
        $this->post(route('sales.store'), [
            'customer_id' => $customer->id, 'warehouse_id' => 1,
            'invoice_date' => now()->toDateString(), 'sale_type' => 'sale_base',
            'sale_terms' => 'Return unsold within 30 days; balance due in 45 days.',
            'items' => [$line],
        ])->assertRedirect();

        $sale = SalesInvoice::firstOrFail();
        $this->assertSame('sale_base', $sale->sale_type);
        $this->assertStringContainsString('Return unsold', $sale->sale_terms);

        // Like credit: 20 × 100 = 2000 exceeds the 1500 limit → posting blocked.
        $this->post(route('sales.post', $sale))->assertSessionHas('error');
        $this->assertSame('draft', $sale->refresh()->status);

        // Raise the limit → posts, receivable increases (non-cash behavior).
        $customer->update(['credit_limit' => 100000]);
        $this->post(route('sales.post', $sale))->assertSessionHas('success');
        $this->assertSame('posted', $sale->refresh()->status);
        $this->assertEqualsWithDelta(
            2000.0,
            app(\App\Services\LedgerService::class)->outstanding($customer),
            0.01,
        );
    }

    public function test_duplicate_product_on_one_invoice_is_rejected(): void
    {
        $this->actingAs($this->admin);

        $company = Company::create(['name' => 'Getz Pharma']);
        $customer = Customer::create(['name' => 'City Pharmacy']);
        $product = Product::create(['name' => 'Panadol 500mg', 'company_id' => $company->id, 'trade_price' => 100]);

        // Purchase: same product on two lines → rejected, nothing saved.
        $this->post(route('purchases.store'), [
            'company_id' => $company->id, 'warehouse_id' => 1,
            'invoice_date' => now()->toDateString(), 'purchase_type' => 'credit',
            'items' => [
                ['product_id' => $product->id, 'quantity' => 10, 'purchase_rate' => 80, 'trade_price' => 100],
                ['product_id' => $product->id, 'quantity' => 5, 'purchase_rate' => 80, 'trade_price' => 100],
            ],
        ])->assertRedirect()->assertSessionHas('error');
        $this->assertSame(0, PurchaseInvoice::count());

        // Sales: same guard.
        $this->post(route('sales.store'), [
            'customer_id' => $customer->id, 'warehouse_id' => 1,
            'invoice_date' => now()->toDateString(), 'sale_type' => 'credit',
            'items' => [
                ['product_id' => $product->id, 'quantity' => 3, 'trade_price' => 100],
                ['product_id' => $product->id, 'quantity' => 4, 'trade_price' => 100],
            ],
        ])->assertRedirect()->assertSessionHas('error');
        $this->assertSame(0, SalesInvoice::count());

        $error = session('error');
        $this->assertStringContainsString('Panadol 500mg', $error);
        $this->assertStringContainsString('more than one line', $error);
    }
}
