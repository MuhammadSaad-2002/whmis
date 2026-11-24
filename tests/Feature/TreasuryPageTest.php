<?php

namespace Tests\Feature;

use App\Models\{FinanceWorkItem, FinancialAccount, User};
use Database\Seeders\{RolePermissionSeeder, SystemSeeder};
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

class TreasuryPageTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed([RolePermissionSeeder::class, SystemSeeder::class]);
    }

    public function test_ledger_search_and_movement_filters_keep_the_unfiltered_running_balance_and_account_totals(): void
    {
        $actor = User::factory()->create(['name' => 'Treasury tester'])->assignRole('Super Admin');
        $account = FinancialAccount::create(['name' => 'Test bank', 'kind' => 'bank', 'opening_paisa' => 10000]);
        foreach ([['opening', 10000, 'Opening'], ['receipt', 2500, 'Receipt reference'], ['expense', -750, 'Expense reference']] as $offset => [$kind, $paisa, $reference]) {
            DB::table('treasury_entries')->insert([
                'account_id' => $account->id, 'kind' => $kind, 'paisa' => $paisa, 'reference' => $reference,
                'business_date' => '2026-11-24', 'source_type' => 'test', 'source_key' => 'test-'.$offset, 'source_id' => $offset + 1,
                'actor_id' => $actor->id,
            ]);
        }

        $this->actingAs($actor)->get(route('treasury.index', ['account' => $account->id, 'movement' => 'receipt', 'search' => 'reference']))
            ->assertOk()->assertInertia(fn (Assert $page) => $page->component('operations/treasury')
                ->where('account.balance_paisa', 11750)
                ->where('accountStats.opening', 10000)->where('accountStats.opened', '2026-11-24')
                ->where('accountStats.receipts', 2500)->where('accountStats.payouts', 750)->where('accountStats.entries', 3)
                ->where('totals.closing', 11750)
                ->where('filters.search', 'reference')->where('filters.movement', 'receipt')
                ->has('entries.data', 1)->where('entries.data.0.reference', 'Receipt reference')
                ->where('entries.data.0.running_paisa', fn ($value) => (int) $value === 12500)
                ->where('entries.data.0.actor_name', 'Treasury tester'));
    }

    public function test_account_and_approval_drawer_data_are_scoped_to_the_current_user(): void
    {
        $admin = User::factory()->create()->assignRole('Super Admin');
        $operator = User::factory()->create()->assignRole('Accountant');
        $viewer = User::factory()->create()->givePermissionTo('treasury.view');
        $own = FinancialAccount::create(['name' => 'First till', 'kind' => 'cash']);
        $own->operators()->attach($operator);
        $other = FinancialAccount::create(['name' => 'Other till', 'kind' => 'cash']);
        $request = fn ($kind, $payload) => FinanceWorkItem::create([
            'kind' => $kind, 'status' => 'pending', 'request_key' => (string) Str::uuid(),
            'created_by' => $admin->id, 'payload' => ['date' => '2026-11-24', 'notes' => 'Private note'] + $payload,
        ]);
        $ownRequest = $request('expense', ['account_id' => $own->id]);
        $privateRequest = $request('expense', ['account_id' => $other->id]);
        $opening = $request('opening', []);

        $this->actingAs($admin)->get(route('treasury.index'))->assertInertia(fn (Assert $page) => $page
            ->where('approvalQueue.count', 3)->where('approvalQueue.openings', 1)
            ->where('approvalQueue.opening_items.0.id', $opening->id));
        $this->actingAs($operator)->get(route('treasury.index', ['account' => $other->id]))->assertInertia(fn (Assert $page) => $page
            ->has('accounts', 1)->where('accounts.0.id', $own->id)->where('account', null)->where('entries', null)
            ->where('approvalLimits', null)->where('approvalQueue.count', 1)->where('approvalQueue.openings', 0)
            ->has('approvalQueue.items', 1)->where('approvalQueue.items.0.id', $ownRequest->id)->missing('approvalQueue.items.0.payload'));
        $this->get(route('finance.approvals', ['request_id' => $privateRequest->id]))->assertInertia(fn (Assert $page) => $page->has('items.data', 0));
        $this->actingAs($viewer)->get(route('treasury.index'))->assertInertia(fn (Assert $page) => $page->has('accounts', 0)->where('approvalQueue', null));
    }

    public function test_only_super_admin_can_save_multiple_limits_and_unedited_limits_are_preserved(): void
    {
        $admin = User::factory()->create()->assignRole('Admin');
        $superAdmin = User::factory()->create()->assignRole('Super Admin');
        DB::table('treasury_control')->update(['approval_limits' => json_encode(['opening' => 10000, 'expense' => 20000])]);

        $limits = ['opening' => null, 'transfer' => '312.50', 'adjustment' => '0.00'];
        $this->actingAs($admin)->post('/treasury/limits', ['limits' => $limits])->assertForbidden();
        $this->actingAs($superAdmin)->post('/treasury/limits', ['limits' => ['invalid' => 100]])->assertSessionHasErrors('limits');
        $this->post('/treasury/limits', ['limits' => $limits])->assertSessionHasNoErrors()->assertSessionHas('success');

        $this->assertSame(['expense' => 20000, 'transfer' => 31250, 'adjustment' => 0],
            json_decode(DB::table('treasury_control')->value('approval_limits'), true, flags: JSON_THROW_ON_ERROR));
        $this->assertDatabaseHas('finance_work_events', ['source_type' => 'control', 'actor_id' => $superAdmin->id, 'action' => 'limits_updated']);
    }

    public function test_approval_queue_filters_live_items_without_exposing_hidden_counts_or_evidence_paths(): void
    {
        $admin = User::factory()->create(['name' => 'Request author'])->assignRole('Super Admin');
        $operator = User::factory()->create(['name' => 'Account operator'])->assignRole('Accountant');
        $account = FinancialAccount::create(['name' => 'Assigned till', 'kind' => 'cash']);
        $account->operators()->attach($operator);
        $private = FinancialAccount::create(['name' => 'Other till', 'kind' => 'cash']);
        $create = fn ($status, $kind, $accountId, $amount, $note) => FinanceWorkItem::create([
            'status' => $status, 'kind' => $kind, 'request_key' => (string) Str::uuid(), 'created_by' => $admin->id, 'amount_paisa' => $amount,
            'payload' => ['date' => '2026-11-24', 'notes' => $note, 'account_id' => $accountId, 'imports' => ['private snapshot']],
            'evidence_path' => 'finance-evidence/private-report.pdf',
        ]);
        $pending = $create('pending', 'expense', $account->id, 12500, 'Office maintenance');
        $posted = $create('posted', 'adjustment', $account->id, 2500, 'Verified cash count');
        $hidden = $create('pending', 'expense', $private->id, 55000, 'Hidden account');
        $create('pending', 'commission_payout', $account->id, 10000, 'Private commission');

        $this->actingAs($operator)->get(route('finance.approvals'))->assertInertia(fn (Assert $page) => $page
            ->component('operations/finance-approvals')->where('filters.status', 'pending')->has('items.data', 1)
            ->where('items.data.0.id', $pending->id)->where('items.data.0.requester_name', 'Request author')
            ->where('items.data.0.has_evidence', true)->missing('items.data.0.evidence_path')->missing('items.data.0.payload.imports')
            ->where('summary.pending.count', 1)->where('summary.pending.amount_paisa', 12500)->where('summary.posted.count', 1));
        $this->get(route('finance.approvals', ['status' => 'all', 'search' => 'cash count', 'type' => 'adjustment']))->assertInertia(fn (Assert $page) => $page
            ->has('items.data', 1)->where('items.data.0.id', $posted->id)->where('summary.pending.count', 1));
        $this->get(route('finance.approvals', ['status' => 'all', 'search' => '#'.$pending->id]))->assertInertia(fn (Assert $page) => $page
            ->has('items.data', 1)->where('items.data.0.id', $pending->id));
        $this->get(route('finance.approvals', ['request_id' => $posted->id]))->assertInertia(fn (Assert $page) => $page
            ->where('requestId', $posted->id)->where('items.data.0.id', $posted->id));
        $this->get(route('finance.approvals', ['request_id' => $hidden->id]))->assertInertia(fn (Assert $page) => $page->has('items.data', 0));
        $this->get('/finance-approvals/'.$hidden->id.'/evidence')->assertNotFound();
    }
}
