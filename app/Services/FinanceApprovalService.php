<?php

namespace App\Services;

use App\Models\{FinanceWorkItem, FinancialAccount, SalesInvoice, User};
use App\Support\Paisa;
use Illuminate\Support\Facades\DB;

class FinanceApprovalService
{
    public const EMPLOYEE_KINDS = ['commission_payout', 'recovery_repayment', 'recovery_waiver', 'recovery_hold', 'recovery_resume'];
    public const PRIVATE_KINDS = [...self::EMPLOYEE_KINDS, 'commission_cap', 'commission_share'];
    public const KINDS = ['opening', 'transfer', 'expense', 'adjustment', 'statement', 'close_variance', 'refund', 'credit_apply', 'credit_release',
        'shortage', 'shortage_repayment', 'shortage_receipt_reverse', 'refund_recovery', 'refund_correction', 'commission_cap', 'commission_share', 'delivery_correction', ...self::EMPLOYEE_KINDS];

    public function __construct(private TreasuryService $treasury, private InvoiceBalanceService $balance, private LedgerService $ledger) {}

    public function visibleRequests(User $actor): \Illuminate\Database\Eloquent\Builder
    {
        $query = FinanceWorkItem::query()->when(! $actor->can('manage-employee-commissions'), fn ($q) => $q->whereNotIn('kind', self::PRIVATE_KINDS));
        if ($actor->can('treasury.manage')) return $query;
        $accountIds = $this->treasury->visible($actor)->select('financial_accounts.id');
        $cast = in_array(DB::getDriverName(), ['mysql','mariadb'], true) ? 'UNSIGNED' : 'INTEGER';
        $account = DB::raw("CAST(JSON_EXTRACT(payload, '$.account_id') AS {$cast})");
        $target = DB::raw("CAST(JSON_EXTRACT(payload, '$.target_id') AS {$cast})");
        return $query->where('kind', '!=', 'opening')
            ->where(fn ($q) => $q->whereNull('payload->account_id')->orWhereIn($account, clone $accountIds))
            ->where(fn ($q) => $q->where('kind', '!=', 'transfer')->orWhereIn($target, $accountIds));
    }

    public function saveAccount(User $actor, array $data): FinancialAccount
    {
        return DB::transaction(function () use ($actor, $data) {
            $control = DB::table('treasury_control')->where('id', 1)->lockForUpdate()->first();
            $account = isset($data['id']) ? FinancialAccount::whereKey($data['id'])->lockForUpdate()->firstOrFail() : new FinancialAccount;
            $kind = $data['kind'];
            $custodian = $kind === 'custody' ? (int) ($data['custodian_id'] ?? 0) : null;
            if ($kind === 'custody' && ! app(DeliveryPlanningService::class)->activeSalesmen()->whereKey($custodian)->exists()) $this->treasury->fail('Select an active Salesman for custody.');
            $opening = Paisa::from($data['opening'] ?? 0);
            if ($control->locked_at && (($account->exists && ($account->kind !== $kind || (int) $account->custodian_id !== (int) $custodian
                || (int) $account->opening_paisa !== $opening || $account->opening_reference !== ($data['opening_reference'] ?? null))) || (! $account->exists && $opening !== 0))) {
                $this->treasury->fail('Account type, custody owner and opening balance are locked; use a correction for balances.');
            }
            if ($opening && ! trim($data['opening_reference'] ?? '')) $this->treasury->fail('Supply a statement or cash count reference.');
            $account->fill(['name' => $data['name'], 'kind' => $kind, 'custodian_id' => $custodian,
                'opening_paisa' => $opening, 'opening_reference' => $data['opening_reference'] ?? null])->save();
            $account->operators()->sync($data['operators'] ?? []);
            $this->treasury->event('account', $account->id, 'account_saved', $actor, $data);
            return $account;
        }, 3);
    }

    public function request(User $actor, string $kind, array $data, ?string $evidence): FinanceWorkItem
    {
        abort_if(in_array($kind, self::PRIVATE_KINDS, true) && ! $actor->can('manage-employee-commissions'), 403);

        return DB::transaction(function () use ($actor, $kind, $data, $evidence) {
            $existing = FinanceWorkItem::where('request_key', $data['request_key'])->first();
            if ($existing) {
                abort_unless($existing->kind === $kind && (int) $existing->created_by === $actor->id, 409);
                return $existing;
            }
            $amount = Paisa::from($data['amount'] ?? 0);
            $beneficiary = null;
            if ($kind === 'opening') {
                abort_unless($actor->can('treasury.manage'), 403);
                $control = DB::table('treasury_control')->where('id', 1)->lockForUpdate()->first();
                if ($control->locked_at) $this->treasury->fail('Opening balances have already been locked.');
                $accounts = $this->openingSnapshot();
                if ($accounts === [] || empty($data['date']) || $data['date'] < now('Asia/Karachi')->toDateString()
                    || ! $evidence) $this->treasury->fail('Create accounts and supply a current/future date and opening reconciliation file.');
                $data['accounts'] = $accounts;
                $amount = array_sum(array_column($accounts, 'opening_paisa'));
            } elseif ($kind === 'close_variance') {
                $day = app(DeliveryCollectionService::class)->lockedDay((int) ($data['day_id'] ?? 0), $actor);
                $cash = DB::table('delivery_collections')->where('collection_day_id', $day->id)->where('method', 'cash');
                $data += ['reported' => (int) (clone $cash)->sum('reported_paisa'), 'verified' => (int) (clone $cash)->sum('verified_paisa'),
                    'counted' => (int) $day->counted_cash_paisa];
                $amount = max(abs($data['reported'] - $data['counted']), abs($data['verified'] - $data['counted']));
                $beneficiary = $day->salesman_id;
            } elseif (in_array($kind, ['shortage','shortage_repayment','shortage_receipt_reverse'], true)) {
                $row = DB::table('delivery_collections')->where('id', $data['collection_id'] ?? 0)->where('method', 'cash')->first();
                abort_unless($row, 404);
                $beneficiary = $row->reporter_id;
                if ($kind === 'shortage_receipt_reverse') {
                    abort_unless($actor->can('payments.manage'), 403);
                    $amount = (int) $row->shortage_paisa + (int) $row->verified_paisa;
                    if ($this->shortageBalance($row) <= 0 || $this->shortageBalance($row) !== (int) $row->shortage_paisa) {
                        $this->treasury->fail('Only an open shortage with no employee repayments can be reversed here.');
                    }
                }
                if (! $evidence || $amount <= 0 || ($kind === 'shortage' && ($row->recorded_at || $amount > $row->reported_paisa))
                    || ($kind === 'shortage_repayment' && $amount > $this->shortageBalance($row))) {
                    $this->treasury->fail('Attach supporting evidence and enter a valid cash shortage or recovery amount.');
                }
            } elseif (in_array($kind, ['refund', 'credit_apply'], true)) {
                if ($amount <= 0) $this->treasury->fail('Enter a positive amount.');
                $invoice = SalesInvoice::whereKey((int) ($data['invoice_id'] ?? 0))->lockForUpdate()->firstOrFail();
                if ($amount > $this->refundable($invoice)) $this->treasury->fail('Amount exceeds the unreserved, receipt-backed invoice credit.');
                $data['customer_id'] = $invoice->customer_id;
                $data['credit_note_ids'] = $invoice->postedReturns()->pluck('id')->all();
                $data['source_cancellation'] = ! $invoice->isPosted();
            } elseif ($kind === 'credit_release') {
                $credit = FinanceWorkItem::where('kind', 'credit_apply')->where('status', 'posted')->findOrFail($data['credit_id'] ?? 0);
                $amount = (int) $credit->amount_paisa;
            } elseif (in_array($kind, ['refund_recovery','refund_correction'], true)) {
                $refund = FinanceWorkItem::where('kind', 'refund')->where('status', 'posted')->findOrFail($data['credit_id'] ?? 0);
                $remaining = (int) $refund->amount_paisa - $this->resolvedRefund($refund->id);
                if (! $evidence || $amount <= 0 || $amount > $remaining) $this->treasury->fail('Attach evidence and enter an amount within the unresolved payout.');
                $data['invoice_id'] = $refund->payload['invoice_id'];
            } elseif ($kind === 'commission_cap') {
                $scope = DB::table('commission_scopes')->where('booking_id', $data['booking_id'] ?? 0)->first();
                if (! $scope) $this->treasury->fail('This booking does not have a locked commission snapshot.');
                $role = $data['commission_role'] ?? null;
                $rules = json_decode($scope->rules, true, flags: JSON_THROW_ON_ERROR);
                if (! in_array($rules[$role]['mode'] ?? null, ['full_fixed','proportional'], true)) $this->treasury->fail('Choose a existing fixed commission role.');
                $data['previous_paisa'] = (int) $rules[$role]['rate'];
                $beneficiary = $role === 'booker' ? $scope->booker_id : $scope->original_salesman_id;
            } elseif (in_array($kind, ['commission_share', 'delivery_correction'], true)) {
                $invoice = SalesInvoice::where('status','posted')->findOrFail($data['invoice_id'] ?? 0);
                if ($kind === 'commission_share') {
                    if (! isset($data['share']) || (float) $data['share'] < 0 || (float) $data['share'] > 100) $this->treasury->fail('Enter a share between 0 and 100 percent.');
                    $data['share_bp'] = Paisa::from($data['share']);
                } else {
                    abort_unless($actor->can('dispatch.manage'), 403);
                    if (empty($data['items']) || array_sum(array_column($data['items'], 'quantity')) <= 0) $this->treasury->fail('Enter quantities to remove from the recorded delivery.');
                }
                $amount = Paisa::from($invoice->total_amount);
            } elseif (in_array($kind, self::EMPLOYEE_KINDS, true)) {
                $employee = \App\Models\Employee::findOrFail($data['employee_id'] ?? 0);
                $beneficiary = $employee->user_id;
                if (! in_array($kind, ['recovery_hold','recovery_resume'], true) && $amount <= 0) $this->treasury->fail('Enter a positive amount.');
                if ($kind === 'commission_payout' && isset($data['award_id'])) {
                    $award = app(CommissionService::class)->payoutAward($employee->id, (int) $data['award_id'], $amount);
                    $data['award_invoice_number'] = $award->invoice_number;
                    $data['commission_role'] = $award->role;
                }
            } else {
                if (! $evidence && in_array($kind, ['statement', 'adjustment'], true)) $this->treasury->fail('Attach the count, statement, or adjustment evidence.');
                if ($kind !== 'statement' && $amount <= 0) $this->treasury->fail('Enter a positive amount.');
            }
            $item = FinanceWorkItem::create([
                'kind' => $kind, 'request_key' => $data['request_key'], 'created_by' => $actor->id, 'beneficiary_id' => $beneficiary,
                'amount_paisa' => $amount, 'payload' => $data, 'evidence_path' => $evidence,
            ]);
            $this->treasury->event('approval', $item->id, 'requested', $actor);
            return $item;
        }, 3);
    }

    public function approve(int $id, User $actor, string $note, bool $approve): void
    {
        DB::transaction(function () use ($id, $actor, $note, $approve) {
            $item = $this->visibleRequests($actor)->whereKey($id)->lockForUpdate()->firstOrFail();
            abort_unless($item->status === 'pending', 409);
            abort_if(in_array($actor->id, [(int) $item->created_by, (int) $item->beneficiary_id], true), 403);
            if (! $actor->hasRole('Super Admin')) {
                $limits = json_decode($this->treasury->control()->approval_limits ?? '{}', true, flags: JSON_THROW_ON_ERROR);
                abort_unless(array_key_exists($item->kind, $limits) && $item->amount_paisa <= $limits[$item->kind], 403);
                if ($item->kind === 'recovery_waiver') abort_unless($actor->can('commission.waive'), 403);
            }
            if (in_array($item->kind, self::PRIVATE_KINDS, true)) {
                abort_unless($actor->can('manage-employee-commissions'), 403);
                if ($item->kind === 'commission_cap') {
                    abort_if(DB::table('commission_awards as a')->join('employees as e', 'e.id', '=', 'a.employee_id')
                        ->join('commission_scopes as s', 's.id', '=', 'a.commission_scope_id')
                        ->where('s.booking_id', $item->payload['booking_id'])->where('a.role', $item->payload['commission_role'])->where('e.user_id', $actor->id)->exists(), 403);
                }
            }
            if (in_array($item->kind, ['commission_share','delivery_correction'], true)) {
                abort_if(DB::table('commission_awards as a')->join('employees as e', 'e.id', '=', 'a.employee_id')
                    ->where('a.sales_invoice_id', $item->payload['invoice_id'])->where('e.user_id', $actor->id)->exists(), 403);
                $dispatch = \App\Models\Dispatch::where('sales_invoice_id', $item->payload['invoice_id'])->first();
                abort_if($dispatch && (in_array($actor->id, [(int) $dispatch->original_assignee_id, (int) $dispatch->assigned_to], true)
                    || $dispatch->events()->where('action','delivered')->where('created_by',$actor->id)->exists()), 403);
            }
            if ($item->kind === 'opening') {
                $import = collect($item->payload['imports'] ?? []);
                abort_if($import->contains(fn ($row) => (int) ($row['salesman_id'] ?? 0) === $actor->id)
                    || \App\Models\Employee::where('user_id',$actor->id)->whereKey($import->pluck('employee_id')->filter()->all())->exists(), 403);
            }
            $item->update(['status' => $approve ? 'approved' : 'rejected', 'approved_by' => $actor->id, 'approved_at' => now(), 'approval_note' => $note]);
            $this->treasury->event('approval', $id, $approve ? 'approved' : 'rejected', $actor, ['note' => $note]);
        }, 3);
    }

    public function post(int $id, User $actor, ?string $reference, ?int $openingRefundAccount = null): void
    {
        DB::transaction(function () use ($id, $actor, $reference, $openingRefundAccount) {
            $item = $this->visibleRequests($actor)->whereKey($id)->lockForUpdate()->firstOrFail();
            if ($item->status === 'posted') return;
            abort_unless($item->status === 'approved', 409);
            $data = $item->payload;
            $date = $data['date'] ?? now('Asia/Karachi')->toDateString();
            $amount = (int) $item->amount_paisa;
            if ($item->kind === 'opening') {
                $control = DB::table('treasury_control')->where('id', 1)->lockForUpdate()->first();
                if ($control->locked_at || $this->openingSnapshot() !== $data['accounts']) $this->treasury->fail('Accounts changed after review. Request a new opening approval.');
                foreach (FinancialAccount::orderBy('id')->lockForUpdate()->get() as $account) {
                    $this->treasury->entry($account, 'opening', 'approval', $id, (int) $account->opening_paisa, $date, $actor, $account->opening_reference);
                }
                DB::table('treasury_control')->where('id', 1)->update(['go_live_date' => $date, 'locked_at' => now()]);
                app(TreasuryOpeningImport::class)->apply($item, $actor);
            } elseif (in_array($item->kind, ['close_variance','shortage'], true)) {
                $this->treasury->fail('Apply the variance approval from Daily Reconciliation.');
            } else {
                $this->treasury->assertDate($date);
                if ($item->kind === 'commission_share') {
                    abort_unless($actor->can('manage-employee-commissions'), 403);
                    $invoice = SalesInvoice::where('status','posted')->whereKey($data['invoice_id'])->lockForUpdate()->firstOrFail();
                } elseif ($item->kind === 'delivery_correction') {
                    abort_unless($actor->can('dispatch.manage'), 403);
                    $invoice = SalesInvoice::findOrFail($data['invoice_id']);
                    app(DispatchService::class)->record($invoice, ['action' => 'correct_delivery', 'items' => $data['items'],
                        'notes' => $data['notes'], 'request_key' => $item->request_key], $actor, true);
                } elseif (in_array($item->kind, ['refund_recovery','refund_correction'], true)) {
                    $invoice = SalesInvoice::whereKey($data['invoice_id'])->lockForUpdate()->firstOrFail();
                    $refund = FinanceWorkItem::where('kind','refund')->where('status','posted')->lockForUpdate()->findOrFail($data['credit_id']);
                    if ($amount + $this->resolvedRefund($refund->id) > (int) $refund->amount_paisa) $this->treasury->fail('The refund is already resolved for this amount.');
                    if ($item->kind === 'refund_recovery') {
                        if (! trim($reference ?? '')) $this->treasury->fail('Confirm the repayment and enter its reference.');
                        $account = $this->treasury->account((int) ($data['account_id'] ?? 0), $actor);
                        $this->treasury->entry($account, 'refund_recovery', 'approval', $id, $amount, $date, $actor, $reference);
                        $this->ledger->post($invoice->customer, 'refund_recovery', $date, 0, (float) Paisa::rupees($amount), $item, "Refund recovery on {$invoice->invoice_number}");
                    }
                } elseif ($item->kind === 'commission_cap') {
                    abort_unless($actor->can('manage-employee-commissions'), 403);
                    $booking = \App\Models\Booking::whereKey($data['booking_id'])->lockForUpdate()->firstOrFail();
                    $scope = DB::table('commission_scopes')->where('booking_id', $booking->id)->lockForUpdate()->first();
                    $rules = json_decode($scope->rules, true, flags: JSON_THROW_ON_ERROR);
                    $role = $data['commission_role'];
                    if ((int) ($rules[$role]['rate'] ?? -1) !== $data['previous_paisa']) $this->treasury->fail('The fixed cap changed after review. Resubmit with the current rate.');
                    $rules[$role]['rate'] = $amount;
                    DB::table('commission_scopes')->where('id', $scope->id)->update(['rules' => json_encode($rules, JSON_THROW_ON_ERROR), 'updated_at' => now()]);
                    if ($latest = $booking->salesInvoices()->latest('id')->first()) app(CommissionService::class)->recalculate($latest);
                } elseif ($item->kind === 'shortage_receipt_reverse') {
                    abort_unless($actor->can('payments.manage'), 403);
                    $row = DB::table('delivery_collections')->where('id', $data['collection_id'])->first();
                    $payment = \App\Models\Payment::findOrFail($row?->payment_id);
                    if ($payment->status !== 'completed') $this->treasury->fail('The source receipt is not completed.');
                    app(PaymentService::class)->cancel($payment, $item);
                } elseif ($item->kind === 'shortage_repayment') {
                    $source = DB::table('delivery_collections')->where('id', $data['collection_id'])->first();
                    abort_unless($source && $source->payment_id, 404);
                    SalesInvoice::whereKey($source->sales_invoice_id)->lockForUpdate()->firstOrFail();
                    \App\Models\Payment::whereKey($source->payment_id)->lockForUpdate()->firstOrFail();
                    $row = DB::table('delivery_collections')->where('id', $data['collection_id'])->lockForUpdate()->first();
                    if (! $row || $amount > $this->shortageBalance($row) || ! trim($reference ?? '')) $this->treasury->fail('Confirm funds and enter a reference; amount cannot exceed the shortage.');
                    $account = $this->treasury->account((int) ($data['account_id'] ?? 0), $actor);
                    $this->treasury->entry($account, 'shortage_repayment', 'approval', $id, $amount, $date, $actor, $reference);
                } elseif (in_array($item->kind, self::EMPLOYEE_KINDS, true)) {
                    abort_unless($actor->can('manage-employee-commissions'), 403);
                    app(CommissionService::class)->postEmployeeAction($item, $actor, $reference);
                } elseif ($item->kind === 'credit_release') {
                    $credit = FinanceWorkItem::where('kind', 'credit_apply')->lockForUpdate()->findOrFail($data['credit_id']);
                    if ($credit->status !== 'posted') $this->treasury->fail('The credit application has already been released.');
                    SalesInvoice::whereKey([(int) $credit->payload['invoice_id'], (int) $credit->payload['target_id']])->orderBy('id')->lockForUpdate()->get();
                    $this->assertUnconsumed(SalesInvoice::findOrFail($credit->payload['target_id']));
                    $credit->update(['status' => 'reversed']);
                    $this->treasury->event('approval', $credit->id, 'credit_released', $actor, ['correction_id' => $id]);
                } elseif (in_array($item->kind, ['refund', 'credit_apply'], true)) {
                    $ids = array_filter([(int) $data['invoice_id'], (int) ($data['target_id'] ?? 0)]);
                    $invoices = SalesInvoice::whereKey($ids)->orderBy('id')->lockForUpdate()->get()->keyBy('id');
                    $invoice = $invoices[$data['invoice_id']];
                    if ($amount > $this->refundable($invoice, $id)) $this->treasury->fail('The invoice no longer has enough refundable credit.');
                    if ($item->kind === 'refund') {
                        if (! trim($reference ?? '')) $this->treasury->fail('Confirm the actual payout and enter its transaction reference.');
                        $account = ! empty($data['opening_id'])
                            ? $this->treasury->account($openingRefundAccount ?? 0, $actor)
                            : $this->treasury->account((int) ($data['account_id'] ?? 0), $actor, $data['method'] ?? 'cash');
                        if (! empty($data['opening_id'])) $date = now('Asia/Karachi')->toDateString();
                        $this->treasury->entry($account, 'customer_refund', 'approval', $id, -$amount, $date, $actor, $reference);
                        $this->ledger->post($invoice->customer, 'refund', $date, (float) Paisa::rupees($amount), 0, $item, "Refund against {$invoice->invoice_number}");
                    } else {
                        $target = $invoices[$data['target_id'] ?? 0] ?? null;
                        if (! $target || $target->id === $invoice->id || $target->customer_id !== $invoice->customer_id
                            || Paisa::from($this->balance->sales()->whereKey($target->id)->value('outstanding')) < $amount) {
                            $this->treasury->fail('Choose another open invoice for the same customer with sufficient balance.');
                        }
                    }
                } elseif ($item->kind === 'transfer') {
                    if (! trim($reference ?? '')) $this->treasury->fail('Enter the completed transfer reference.');
                    $ids = [(int) ($data['account_id'] ?? 0), (int) ($data['target_id'] ?? 0)];
                    if ($ids[0] === $ids[1]) $this->treasury->fail('Use two different accounts.');
                    $accounts = collect($ids)->sort()->mapWithKeys(fn ($account) => [$account => $this->treasury->account($account, $actor)]);
                    $this->treasury->entry($accounts[$ids[0]], 'transfer_out', 'approval', $id, -$amount, $date, $actor, $reference);
                    $this->treasury->entry($accounts[$ids[1]], 'transfer_in', 'approval', $id, $amount, $date, $actor, $reference);
                } else {
                    $account = $this->treasury->account((int) ($data['account_id'] ?? 0), $actor);
                    if ($item->kind === 'statement') {
                        $book = (int) DB::table('treasury_entries')->where('account_id', $account->id)->where('business_date', '<=', $date)->sum('paisa');
                        $this->treasury->event('approval', $id, 'reconciled', $actor, ['book' => $book, 'actual' => $amount, 'variance' => $amount - $book]);
                    } else {
                        $this->treasury->entry($account, $item->kind, 'approval', $id,
                            $item->kind === 'adjustment' && ($data['direction'] ?? null) === 'in' ? $amount : -$amount, $date, $actor, $reference);
                    }
                }
            }
            $item->update(['status' => 'posted', 'posted_by' => $actor->id, 'posted_at' => now()]);
            $this->treasury->event('approval', $id, 'posted', $actor, ['reference' => $reference]);
            if (isset($target) && $item->kind === 'credit_apply') app(CommissionService::class)->recalculate($target);
            if ($item->kind === 'credit_release') app(CommissionService::class)->recalculate(SalesInvoice::findOrFail($credit->payload['target_id']));
            if (isset($invoice) && $item->kind === 'refund') app(CommissionService::class)->recalculate($invoice);
            if (isset($invoice) && $item->kind === 'commission_share') app(CommissionService::class)->recalculate($invoice);
        }, 3);
    }

    public function refundable(SalesInvoice $invoice, ?int $except = null): int
    {
        if ($invoice->isDraft()) return 0;
        $paid = Paisa::from($invoice->paymentAllocations()->whereHas('payment', fn ($q) => $q->where('status', 'completed')->where('direction', 'in'))->sum('amount'));
        $credit = $invoice->isPosted() ? Paisa::from($invoice->postedReturns()->sum('total_amount')) : Paisa::from($invoice->total_amount);
        $unfunded = DB::table('delivery_collections')->where('sales_invoice_id', $invoice->id)->where('shortage_paisa', '>', 0)->get()
            ->sum(fn ($row) => $this->shortageBalance($row));
        $excess = min(max(0, $paid - $unfunded), max(0, $paid + $credit - Paisa::from($invoice->total_amount) - $unfunded));
        $reserved = (int) FinanceWorkItem::whereIn('kind', ['refund', 'credit_apply'])->whereIn('status', ['pending', 'approved', 'posted'])
            ->where('payload->invoice_id', $invoice->id)->when($except, fn ($q) => $q->whereKeyNot($except))->sum('amount_paisa');
        return max(0, $excess - $reserved);
    }

    public function shortageBalance(object $row): int
    {
        if ($row->payment_id && ! \App\Models\Payment::whereKey($row->payment_id)->where('status','completed')->exists()) return 0;
        return max(0, (int) $row->shortage_paisa - (int) FinanceWorkItem::where('kind', 'shortage_repayment')->where('status', 'posted')
            ->where('payload->collection_id', (int) $row->id)->sum('amount_paisa'));
    }

    public function assertUnconsumed(SalesInvoice $invoice): void
    {
        $links = $this->dependencies($invoice);
        if ($links->isNotEmpty()) $this->treasury->fail('Resolve dependent refunds or credit applications first: '.$links->map(
            fn ($link) => "{$link->kind} #{$link->id} ({$link->status}, PKR ".Paisa::rupees($link->amount_paisa).')')->implode(', '));
    }

    public function dependencies(SalesInvoice $invoice): \Illuminate\Support\Collection
    {
        return FinanceWorkItem::whereIn('kind', ['refund','credit_apply'])->whereIn('status', ['pending','approved','posted'])
            ->where('payload->invoice_id', $invoice->id)->get(['id','kind','status','amount_paisa','payload'])
            ->reject(fn ($row) => $row->kind === 'refund' && $row->status === 'posted' && $this->resolvedRefund($row->id) >= (int) $row->amount_paisa);
    }

    private function resolvedRefund(int $id): int
    {
        return (int) FinanceWorkItem::whereIn('kind', ['refund_recovery','refund_correction'])->where('status', 'posted')
            ->where('payload->credit_id', $id)->sum('amount_paisa');
    }

    public function withdraw(int $id, User $actor, string $reason): void
    {
        DB::transaction(function () use ($id, $actor, $reason) {
            $item = $this->visibleRequests($actor)->whereKey($id)->lockForUpdate()->firstOrFail();
            abort_if(in_array($item->kind, self::PRIVATE_KINDS, true) && ! $actor->can('manage-employee-commissions'), 403);
            abort_unless(in_array($item->status, ['pending','approved'], true), 409);
            abort_unless($actor->id === $item->created_by || $actor->can('finance.approve'), 403);
            $item->update(['status' => 'cancelled']);
            $this->treasury->event('approval', $id, 'withdrawn', $actor, ['reason' => $reason]);
        }, 3);
    }

    private function openingSnapshot(): array
    {
        return FinancialAccount::orderBy('id')->get(['id','kind','name','custodian_id','opening_paisa','opening_reference'])->toArray();
    }
}
