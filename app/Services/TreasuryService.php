<?php

namespace App\Services;

use App\Models\FinancialAccount;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class TreasuryService
{
    public function control(): object
    {
        return DB::table('treasury_control')->where('id', 1)->first();
    }

    public function live(): bool
    {
        $state = $this->control();
        return $state->locked_at !== null && $state->go_live_date <= now('Asia/Karachi')->toDateString();
    }

    public function visible(User $actor): Builder
    {
        return FinancialAccount::query()->when(! $actor->can('treasury.manage'),
            fn ($query) => $query->whereHas('operators', fn ($users) => $users->whereKey($actor->id)));
    }

    public function options(User $actor): array
    {
        return $this->visible($actor)->where('active', true)->orderBy('name')->get(['id', 'name', 'kind'])->all();
    }

    public function balance(FinancialAccount $account): int
    {
        return (int) DB::table('treasury_entries')->where('account_id', $account->id)->sum('paisa');
    }

    public function cashTotals(?\Illuminate\Support\Carbon $from = null, ?\Illuminate\Support\Carbon $to = null): array
    {
        $movements = DB::table('treasury_entries')->when($from, fn ($q) => $q->where('business_date', '>=', $from->toDateString()))
            ->when($to, fn ($q) => $q->where('business_date', '<=', $to->toDateString()));
        $totals = $movements->selectRaw('kind, SUM(paisa) AS total')->groupBy('kind')->pluck('total', 'kind');
        return [
            'refunds' => (int) ($totals['customer_refund'] ?? 0) + (int) ($totals['refund_recovery'] ?? 0),
            'expenses' => (int) ($totals['expense'] ?? 0),
            'shortage_repayments' => (int) ($totals['shortage_repayment'] ?? 0),
            'net' => array_sum($totals->except(['opening','transfer_in','transfer_out','adjustment'])->map(fn ($value) => (int) $value)->all()),
        ];
    }

    public function shortageReceivable(): float
    {
        return ((int) DB::table('delivery_collections as c')->join('payments as p','p.id','=','c.payment_id')->where('p.status','completed')
                ->sum('c.shortage_paisa') - $this->cashTotals()['shortage_repayments']) / 100;
    }

    public function account(int $id, User $actor, ?string $method = null): FinancialAccount
    {
        $account = $this->visible($actor)->where('active', true)->whereKey($id)->lockForUpdate()->first();
        if (! $account) $this->fail('Select an active cash or bank account you can operate.');
        if (($method === 'cash' && $account->kind === 'bank')
            || ($method && $method !== 'cash' && $account->kind !== 'bank')) $this->fail('The payment method does not match the selected account.');
        return $account;
    }

    public function assertDate(string $date): void
    {
        $state = $this->control();
        if (! $state->locked_at || $date < $state->go_live_date || $date > now('Asia/Karachi')->toDateString()) {
            $this->fail('Treasury must be locked and the date must be between go-live and today.');
        }
    }

    /** Call inside the source transaction, after locking all involved accounts by id. */
    public function entry(FinancialAccount $account, string $kind, string $sourceType, int $sourceId, int $amount,
        string $date, User $actor, ?string $reference = null, ?int $reverses = null): int
    {
        if ($kind !== 'opening') $this->assertDate($date);
        if ($amount < 0) {
            $entries = DB::table('treasury_entries')->where('account_id', $account->id);
            $balance = (int) (clone $entries)->where('business_date', '<=', $date)->sum('paisa') + $amount;
            if ($balance < 0) $this->fail('The account has insufficient funds on the transaction date.');
            foreach ($entries->where('business_date', '>', $date)->orderBy('business_date')->orderBy('id')->pluck('paisa') as $delta) {
                $balance += (int) $delta;
                if ($balance < 0) $this->fail('This backdated movement would make a later balance negative.');
            }
        }
        return DB::table('treasury_entries')->insertGetId([
            'account_id' => $account->id, 'kind' => $kind, 'source_type' => $sourceType, 'source_id' => $sourceId,
            'source_key' => "{$sourceType}:{$sourceId}:{$account->id}:{$kind}", 'paisa' => $amount, 'business_date' => $date,
            'actor_id' => $actor->id, 'reference' => $reference, 'reverses_id' => $reverses, 'created_at' => now(),
        ]);
    }

    public function event(string $type, int $id, string $action, User $actor, array $data = []): void
    {
        DB::table('finance_work_events')->insert(['source_type' => $type, 'source_id' => $id, 'action' => $action,
            'actor_id' => $actor->id, 'data' => json_encode($data, JSON_THROW_ON_ERROR), 'created_at' => now()]);
    }

    public function fail(string $message): never
    {
        throw ValidationException::withMessages(['finance' => $message]);
    }
}
