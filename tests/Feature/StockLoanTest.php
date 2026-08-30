<?php

namespace Tests\Feature;

use App\Models\Batch;
use App\Models\Company;
use App\Models\Customer;
use App\Models\LedgerEntry;
use App\Models\Product;
use App\Models\PurchaseInvoice;
use App\Models\SalesInvoice;
use App\Models\StockLoan;
use App\Models\StockMovement;
use App\Models\User;
use App\Models\Warehouse;
use App\Services\InvoicePostingService;
use App\Services\NumberSeriesService;
use App\Services\StockLoanPostingService;
use Database\Seeders\RolePermissionSeeder;
use Database\Seeders\SystemSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia as Assert;
use RuntimeException;
use Tests\TestCase;

/**
 * Stock loans move real stock but never money — every assertion here also
 * guards that no ledger entry is ever created by a loan action.
 */
class StockLoanTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    private Warehouse $warehouse;

    private Company $company;

    private Customer $customer;

    private Product $product;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed([RolePermissionSeeder::class, SystemSeeder::class]);

        $this->admin = User::where('email', 'admin@whmis.local')->firstOrFail();
        $this->actingAs($this->admin);

        $this->warehouse = Warehouse::where('is_default', true)->firstOrFail();
        $this->company = Company::create(['name' => 'Getz Pharma']);
        $this->customer = Customer::create(['name' => 'Dr. Ahmed Clinic', 'credit_limit' => 100000]);
        $this->product = Product::create([
            'name' => 'Panadol 500mg',
            'company_id' => $this->company->id,
            'trade_price' => 100,
            'purchase_price' => 80,
            'tax_percent' => 0,
        ]);
    }

    private function service(): StockLoanPostingService
    {
        return app(StockLoanPostingService::class);
    }

    private function makeLoan(string $direction, float $quantity = 10, array $itemOverrides = []): StockLoan
    {
        $docType = $direction === StockLoan::DIRECTION_IN ? 'loan_in' : 'loan_out';

        $loan = StockLoan::create([
            'loan_number' => app(NumberSeriesService::class)->next($docType),
            'direction' => $direction,
            'company_id' => $this->company->id,
            'warehouse_id' => $this->warehouse->id,
            'loan_date' => now()->toDateString(),
            'status' => StockLoan::STATUS_PENDING,
        ]);

        $loan->items()->create(array_merge([
            'product_id' => $this->product->id,
            'batch_number' => $direction === StockLoan::DIRECTION_IN ? 'LOAN-A' : null,
            'expiry_date' => $direction === StockLoan::DIRECTION_IN ? now()->addYear()->toDateString() : null,
            'quantity' => $quantity,
            'sort_order' => 0,
        ], $itemOverrides));

        return $loan->refresh();
    }

    /** Normal sellable stock, so loan-out has something to draw from. */
    private function makeNormalStock(float $quantity = 100): void
    {
        $invoice = PurchaseInvoice::create([
            'invoice_number' => app(NumberSeriesService::class)->next('purchase_invoice'),
            'company_id' => $this->company->id,
            'warehouse_id' => $this->warehouse->id,
            'invoice_date' => now()->toDateString(),
            'purchase_type' => 'credit',
        ]);
        $invoice->items()->create([
            'product_id' => $this->product->id,
            'batch_number' => 'NORMAL-1',
            'expiry_date' => now()->addYears(2)->toDateString(),
            'quantity' => $quantity,
            'bonus_quantity' => 0,
            'purchase_rate' => 80,
            'trade_price' => 100,
            'discount_percent' => 0,
            'gst_percent' => 0,
        ]);

        app(InvoicePostingService::class)->postPurchase($invoice->refresh());
    }

    public function test_posting_loan_out_draws_sellable_stock_without_a_ledger_entry(): void
    {
        $this->makeNormalStock(100);
        $ledgerBefore = LedgerEntry::count();

        $loan = $this->service()->post($this->makeLoan(StockLoan::DIRECTION_OUT, 10));

        $this->assertSame(StockLoan::STATUS_LOANED, $loan->status);
        $this->assertEqualsWithDelta(10.0, (float) $loan->total_quantity, 0.001);

        // Sellable stock dropped by exactly the loaned amount.
        $this->assertEqualsWithDelta(90.0, $this->product->availableStock(), 0.001);

        // Movement is typed loan_out (never sale) so it never counts as revenue.
        $movement = StockMovement::where('type', 'loan_out')->firstOrFail();
        $this->assertEqualsWithDelta(10.0, abs((float) $movement->quantity), 0.001);
        $this->assertSame(0, StockMovement::where('type', 'sale')->count());

        // Zero money moved.
        $this->assertSame($ledgerBefore, LedgerEntry::count());
    }

    public function test_loan_out_cannot_oversell(): void
    {
        $this->makeNormalStock(5);

        $this->expectException(RuntimeException::class);
        $this->expectExceptionMessageMatches('/Insufficient stock/');

        $this->service()->post($this->makeLoan(StockLoan::DIRECTION_OUT, 10));
    }

    public function test_loan_out_partial_then_full_return_restores_stock_and_moves_status(): void
    {
        $this->makeNormalStock(100);
        $loan = $this->service()->post($this->makeLoan(StockLoan::DIRECTION_OUT, 10));
        $item = $loan->items->firstOrFail();
        $ledgerBefore = LedgerEntry::count(); // purchase posted one payable — loans add none

        // Partial return of 4 → partially_returned, 94 back in stock.
        $loan = $this->service()->recordReturn($loan, [$item->id => 4]);
        $this->assertSame(StockLoan::STATUS_PARTIALLY_RETURNED, $loan->status);
        $this->assertEqualsWithDelta(4.0, (float) $loan->returned_quantity, 0.001);
        $this->assertEqualsWithDelta(94.0, $this->product->availableStock(), 0.001);

        // Return the remaining 6 → returned, full stock restored.
        $loan = $this->service()->recordReturn($loan, [$item->id => 6]);
        $this->assertSame(StockLoan::STATUS_RETURNED, $loan->status);
        $this->assertEqualsWithDelta(10.0, (float) $loan->returned_quantity, 0.001);
        $this->assertEqualsWithDelta(100.0, $this->product->availableStock(), 0.001);

        $this->assertSame($ledgerBefore, LedgerEntry::count());
    }

    public function test_return_is_capped_at_the_outstanding_balance(): void
    {
        $this->makeNormalStock(100);
        $loan = $this->service()->post($this->makeLoan(StockLoan::DIRECTION_OUT, 10));
        $item = $loan->items->firstOrFail();

        // Ask to return more than was loaned — only 10 comes back.
        $loan = $this->service()->recordReturn($loan, [$item->id => 999]);
        $this->assertSame(StockLoan::STATUS_RETURNED, $loan->status);
        $this->assertEqualsWithDelta(10.0, (float) $loan->returned_quantity, 0.001);
        $this->assertEqualsWithDelta(100.0, $this->product->availableStock(), 0.001);
    }

    public function test_posting_loan_in_creates_a_segregated_batch_a_sale_ignores(): void
    {
        $ledgerBefore = LedgerEntry::count();

        $loan = $this->service()->post($this->makeLoan(StockLoan::DIRECTION_IN, 50));
        $this->assertSame(StockLoan::STATUS_LOANED, $loan->status);

        $batch = Batch::loans()->firstOrFail();
        $this->assertTrue((bool) $batch->is_loan);
        $this->assertEqualsWithDelta(50.0, (float) $batch->qty_available, 0.001);
        $this->assertEqualsWithDelta(0.0, (float) $batch->effective_cost, 0.001);

        // Loaned-in stock is not sellable.
        $this->assertEqualsWithDelta(0.0, $this->product->availableStock(), 0.001);

        // A normal sale finds no stock — the loan batch is untouchable.
        $invoice = SalesInvoice::create([
            'invoice_number' => app(NumberSeriesService::class)->next('sales_invoice'),
            'customer_id' => $this->customer->id,
            'warehouse_id' => $this->warehouse->id,
            'invoice_date' => now()->toDateString(),
            'sale_type' => 'credit',
        ]);
        $invoice->items()->create([
            'product_id' => $this->product->id,
            'quantity' => 10,
            'bonus_quantity' => 0,
            'trade_price' => 100,
            'discount_percent' => 0,
            'gst_percent' => 0,
        ]);

        try {
            app(InvoicePostingService::class)->postSale($invoice->refresh());
            $this->fail('A normal sale must not consume loaned-in stock.');
        } catch (RuntimeException $e) {
            $this->assertMatchesRegularExpression('/Insufficient stock/', $e->getMessage());
        }

        // Loan batch is still intact and no money moved.
        $this->assertEqualsWithDelta(50.0, (float) Batch::loans()->firstOrFail()->qty_available, 0.001);
        $this->assertSame($ledgerBefore, LedgerEntry::count());
    }

    public function test_returning_loan_in_drains_the_loan_bucket(): void
    {
        $loan = $this->service()->post($this->makeLoan(StockLoan::DIRECTION_IN, 50));
        $item = $loan->items->firstOrFail();

        $loan = $this->service()->recordReturn($loan, [$item->id => 20]);
        $this->assertSame(StockLoan::STATUS_PARTIALLY_RETURNED, $loan->status);
        $this->assertEqualsWithDelta(30.0, (float) Batch::loans()->firstOrFail()->qty_available, 0.001);

        $loan = $this->service()->recordReturn($loan, [$item->id => 30]);
        $this->assertSame(StockLoan::STATUS_RETURNED, $loan->status);
        $this->assertEqualsWithDelta(0.0, (float) Batch::loans()->firstOrFail()->qty_available, 0.001);

        $this->assertSame(0, LedgerEntry::count());
    }

    public function test_cancelling_a_posted_loan_out_restores_all_outstanding_stock(): void
    {
        $this->makeNormalStock(100);
        $loan = $this->service()->post($this->makeLoan(StockLoan::DIRECTION_OUT, 10));
        $ledgerBefore = LedgerEntry::count();

        $loan = $this->service()->cancel($loan);

        $this->assertSame(StockLoan::STATUS_CANCELLED, $loan->status);
        $this->assertEqualsWithDelta(100.0, $this->product->availableStock(), 0.001);
        $this->assertSame($ledgerBefore, LedgerEntry::count());
    }

    public function test_index_filters_by_direction_and_status(): void
    {
        // One posted loan-out, one draft loan-in.
        $this->makeNormalStock(100);
        $out = $this->service()->post($this->makeLoan(StockLoan::DIRECTION_OUT, 10));
        $this->makeLoan(StockLoan::DIRECTION_IN, 5);

        // The "out" register shows only the out loan.
        $this->get(route('loans.index', 'out'))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('loans/index')
                ->where('direction', 'out')
                ->has('loans.data', 1)
                ->where('loans.data.0.id', $out->id));

        // The "in" register shows only the in loan.
        $this->get(route('loans.index', 'in'))
            ->assertInertia(fn (Assert $page) => $page->has('loans.data', 1));

        // Status filter on the out register: no drafts there, so 0 rows.
        $this->get(route('loans.index', ['direction' => 'out', 'status' => 'pending']))
            ->assertInertia(fn (Assert $page) => $page->has('loans.data', 0));

        // Filtering for the actual loaned status returns the row.
        $this->get(route('loans.index', ['direction' => 'out', 'status' => 'loaned']))
            ->assertInertia(fn (Assert $page) => $page->has('loans.data', 1));
    }

    public function test_loan_out_accepts_external_people_and_clears_internal_requested_received(): void
    {
        $requestHandler = User::factory()->create(['name' => 'Ali Storekeeper']);
        $handoverHandler = User::factory()->create(['name' => 'Sara Warehouse']);

        $this->post(route('loans.store'), [
            'direction' => StockLoan::DIRECTION_OUT,
            'company_id' => $this->company->id,
            'warehouse_id' => $this->warehouse->id,
            'loan_date' => now()->toDateString(),
            // These are intentionally ignored for loan-out because they are
            // local users, not the outside-party requested/received people.
            'requested_by_id' => $this->admin->id,
            'received_by_id' => $this->admin->id,
            'external_requested_by' => 'Partner Pharmacist',
            'external_received_by' => 'Partner Rider',
            'request_received_by_id' => $requestHandler->id,
            'handed_over_by_id' => $handoverHandler->id,
            'items' => [[
                'product_id' => $this->product->id,
                'quantity' => 5,
            ]],
        ])->assertRedirect();

        $loan = StockLoan::where('direction', StockLoan::DIRECTION_OUT)->latest('id')->firstOrFail();

        $this->assertSame('Partner Pharmacist', $loan->external_requested_by);
        $this->assertSame('Partner Rider', $loan->external_received_by);
        $this->assertNull($loan->requested_by_id);
        $this->assertNull($loan->received_by_id);
        $this->assertSame($requestHandler->id, $loan->request_received_by_id);
        $this->assertSame($handoverHandler->id, $loan->handed_over_by_id);
    }

    public function test_loan_out_requires_external_people(): void
    {
        $handler = User::factory()->create();

        $this->post(route('loans.store'), [
            'direction' => StockLoan::DIRECTION_OUT,
            'company_id' => $this->company->id,
            'warehouse_id' => $this->warehouse->id,
            'loan_date' => now()->toDateString(),
            'request_received_by_id' => $handler->id,
            'handed_over_by_id' => $handler->id,
            'items' => [[
                'product_id' => $this->product->id,
                'quantity' => 5,
            ]],
        ])->assertSessionHasErrors(['external_requested_by', 'external_received_by']);
    }

    public function test_loan_in_keeps_internal_people_and_clears_external_people(): void
    {
        $requester = User::factory()->create(['name' => 'Internal Requester']);
        $receiver = User::factory()->create(['name' => 'Internal Receiver']);

        $this->post(route('loans.store'), [
            'direction' => StockLoan::DIRECTION_IN,
            'company_id' => $this->company->id,
            'warehouse_id' => $this->warehouse->id,
            'loan_date' => now()->toDateString(),
            'requested_by_id' => $requester->id,
            'received_by_id' => $receiver->id,
            'external_requested_by' => 'Ignored Partner Requester',
            'external_received_by' => 'Ignored Partner Receiver',
            'items' => [[
                'product_id' => $this->product->id,
                'batch_number' => 'LOAN-IN-B',
                'expiry_date' => now()->addYear()->toDateString(),
                'quantity' => 5,
            ]],
        ])->assertRedirect();

        $loan = StockLoan::where('direction', StockLoan::DIRECTION_IN)->latest('id')->firstOrFail();

        $this->assertSame($requester->id, $loan->requested_by_id);
        $this->assertSame($receiver->id, $loan->received_by_id);
        $this->assertNull($loan->external_requested_by);
        $this->assertNull($loan->external_received_by);
        $this->assertNull($loan->request_received_by_id);
        $this->assertNull($loan->handed_over_by_id);
    }

    public function test_loan_out_index_payload_uses_external_people_and_filters_internal_staff(): void
    {
        $requestHandler = User::factory()->create(['name' => 'Internal Desk']);
        $handoverHandler = User::factory()->create(['name' => 'Internal Warehouse']);
        $notInvolved = User::factory()->create(['name' => 'Not Involved']);

        $loan = StockLoan::create([
            'loan_number' => app(NumberSeriesService::class)->next('loan_out'),
            'direction' => StockLoan::DIRECTION_OUT,
            'company_id' => $this->company->id,
            'warehouse_id' => $this->warehouse->id,
            'loan_date' => now()->toDateString(),
            'status' => StockLoan::STATUS_PENDING,
            'external_requested_by' => 'Outside Buyer',
            'external_received_by' => 'Outside Receiver',
            'request_received_by_id' => $requestHandler->id,
            'handed_over_by_id' => $handoverHandler->id,
        ]);
        $loan->items()->create([
            'product_id' => $this->product->id,
            'quantity' => 3,
            'sort_order' => 0,
        ]);

        $this->get(route('loans.index', 'out'))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->where('loans.data.0.external_requested_by', 'Outside Buyer')
                ->where('loans.data.0.external_received_by', 'Outside Receiver')
                ->where('loans.data.0.request_received_by.name', 'Internal Desk')
                ->where('loans.data.0.handed_over_by.name', 'Internal Warehouse'));

        $this->get(route('loans.index', ['direction' => 'out', 'user_id' => $requestHandler->id]))
            ->assertInertia(fn (Assert $page) => $page->has('loans.data', 1));

        $this->get(route('loans.index', ['direction' => 'out', 'user_id' => $notInvolved->id]))
            ->assertInertia(fn (Assert $page) => $page->has('loans.data', 0));
    }

    public function test_loans_require_the_loans_permission(): void
    {
        $outsider = User::factory()->create();
        $outsider->assignRole('Booker'); // Booker has no loans.* permission.

        $this->actingAs($outsider);
        $this->get(route('loans.index', 'in'))->assertForbidden();

        // The seeded Super Admin can see it.
        $this->actingAs($this->admin);
        $this->get(route('loans.index', 'in'))->assertOk();
    }
}
