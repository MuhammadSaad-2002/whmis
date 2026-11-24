<?php

namespace App\Services;

use App\Models\{Dispatch, FinanceWorkItem, SalesInvoice, User};
use App\Support\Paisa;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\DB;

class DeliveryCollectionService
{
    public const CASH_NOTES = [5000, 1000, 500, 100, 50, 20, 10];

    public function __construct(private TreasuryService $treasury, private InvoiceBalanceService $balances, private PaymentService $payments) {}

    /** Read the posted balance and unapplied reports in the same snapshot, across all collection days and reporters. */
    public function invoiceBalances(): Builder
    {
        return $this->balances->sales()->addSelect([
            'pending_collection_paisa' => $this->pendingReportsForInvoice()->selectRaw('COALESCE(SUM(reported_paisa), 0)'),
        ]);
    }

    public function pendingReportsForInvoice(): \Illuminate\Database\Query\Builder
    {
        return DB::table('delivery_collections')->whereColumn('delivery_collections.sales_invoice_id', 'sales_invoices.id')
            ->whereNull('recorded_at')->whereNull('payment_id');
    }

    public function remainingPaisa(int|float|string|null $outstanding, int $pending): int
    {
        return max(0, Paisa::from($outstanding) - $pending);
    }

    public function remainingFor(SalesInvoice $invoice): int
    {
        $snapshot = $this->invoiceBalances()->whereKey($invoice->id)->first();

        return $snapshot ? $this->remainingPaisa($snapshot->outstanding, (int) $snapshot->pending_collection_paisa) : 0;
    }

    public function report(SalesInvoice $invoice, User $actor, array $data, ?int $eventId = null): void
    {
        DB::transaction(function () use ($invoice, $actor, $data, $eventId) {
            $invoice = SalesInvoice::whereKey($invoice->id)->lockForUpdate()->firstOrFail();
            $dispatch = Dispatch::where('sales_invoice_id', $invoice->id)->first();
            abort_unless($actor->is_active && $actor->can('dispatch.assigned') && $dispatch && (int) $dispatch->assigned_to === $actor->id, 404);
            if ($dispatch->isHistoricalDelivery()) $this->treasury->fail('This historical delivery is read-only.');
            if (! $invoice->isPosted() || ! in_array($dispatch->status, ['partial', 'delivered'], true)) $this->treasury->fail('Record a delivery before reporting a collection.');
            $amount = Paisa::from($data['amount']);
            $method = $amount === 0 ? 'none' : $data['method'];
            if ($amount < 0 || ($amount > 0 && ! in_array($method, ['cash', 'online'], true))) $this->treasury->fail('Choose cash or online transfer for a positive collection.');
            if ($method === 'online' && ! trim($data['reference'] ?? '')) $this->treasury->fail('Enter the online transaction reference.');
            $existing = DB::table('delivery_collections')->where('request_key', $data['request_key'])->first();
            if ($existing) {
                abort_unless((int) $existing->sales_invoice_id === $invoice->id && (int) $existing->reporter_id === $actor->id, 409);
                return;
            }
            // Keep the check inside the invoice lock, shared with payment posting and collection verification.
            $snapshot = $this->invoiceBalances()->whereKey($invoice->id)->firstOrFail();
            if ($amount > 0) {
                $remaining = $this->remainingPaisa($snapshot->outstanding, (int) $snapshot->pending_collection_paisa);
                if ($remaining === 0) $this->treasury->fail('No amount remains to collect on this invoice.');
                if ($amount > $remaining) $this->treasury->fail('The collection exceeds the remaining amount available to collect (PKR '.Paisa::rupees($remaining).').');
            }
            // One user lock serializes first report and supplement creation per day.
            User::whereKey($actor->id)->lockForUpdate()->firstOrFail();
            $date = now('Asia/Karachi')->toDateString();
            $day = DB::table('collection_days')->where('salesman_id', $actor->id)->where('business_date', $date)->orderByDesc('revision')->lockForUpdate()->first();
            if (! $day || $day->submitted_at) {
                $dayId = DB::table('collection_days')->insertGetId(['salesman_id' => $actor->id, 'business_date' => $date,
                    'revision' => ($day->revision ?? 0) + 1, 'created_at' => now(), 'updated_at' => now()]);
            } else {
                $dayId = $day->id;
            }
            $id = DB::table('delivery_collections')->insertGetId(['collection_day_id' => $dayId, 'sales_invoice_id' => $invoice->id,
                'reporter_id' => $actor->id, 'dispatch_event_id' => $eventId, 'request_key' => $data['request_key'], 'method' => $method,
                'reference' => $data['reference'] ?? null, 'reported_paisa' => $amount, 'previous_paid_paisa' => Paisa::from($snapshot->paid_amount),
                'created_at' => now()]);
            $this->treasury->event('collection', $id, 'reported', $actor);
        }, 3);
    }

    public function submit(int $id, User $actor): void
    {
        DB::transaction(function () use ($id, $actor) {
            $day = DB::table('collection_days')->where('salesman_id', $actor->id)->where('id', $id)->lockForUpdate()->first();
            abort_unless($day && $actor->is_active, 404);
            if ($day->submitted_at) return;
            DB::table('collection_days')->where('id', $id)->update(['submitted_at' => now(), 'updated_at' => now()]);
            $this->treasury->event('collection_day', $id, 'submitted', $actor);
        }, 3);
    }

    public function countCash(int $id, User $actor, int $paisa, ?array $breakdown = null): void
    {
        if ($breakdown !== null) {
            $total = Paisa::from($breakdown['coins'] ?? 0);
            foreach (self::CASH_NOTES as $note) $total += $note * 100 * (int) ($breakdown[$note] ?? 0);
            if ($total !== $paisa) $this->treasury->fail('The denomination breakdown does not match the cash count.');
        }
        DB::transaction(function () use ($id, $actor, $paisa, $breakdown) {
            $day = $this->lockedDay($id, $actor);
            $posted = (int) DB::table('delivery_collections')->where('collection_day_id', $id)->where('method', 'cash')->sum('verified_paisa');
            if ($paisa < $posted) $this->treasury->fail('Count cannot be lower than cash already posted.');
            DB::table('collection_days')->where('id', $id)->update(['counted_cash_paisa' => $paisa, 'updated_at' => now()]);
            $this->treasury->event('collection_day', $id, 'cash_counted', $actor, ['previous_paisa' => $day->counted_cash_paisa,
                'paisa' => $paisa, 'breakdown' => $breakdown]);
        }, 3);
    }

    /** Explicitly verify matching cash; a count alone must never create a receipt. */
    public function recordMatchingCash(int $id, User $actor, int $accountId, array $selectedIds): int
    {
        $cashRows = DB::table('delivery_collections')->where('collection_day_id', $id)->where('method', 'cash');
        // Read IDs before the transaction so the posting snapshot starts after the invoice locks.
        $invoiceIds = (clone $cashRows)->distinct()->pluck('sales_invoice_id');

        return DB::transaction(function () use ($id, $actor, $accountId, $selectedIds, $cashRows, $invoiceIds) {
            SalesInvoice::whereKey($invoiceIds->all())->orderBy('id')->lockForUpdate()->get(['id']);
            $day = $this->lockedDay($id, $actor);
            $rows = (clone $cashRows)->orderBy('id')->lockForUpdate()->get();
            $pending = $rows->whereNull('recorded_at');
            if ($pending->isEmpty()) return 0;

            $actual = $pending->pluck('id')->map(fn ($rowId) => (int) $rowId)->sort()->values()->all();
            $requested = array_map('intval', $selectedIds);
            sort($requested);
            if ($actual !== $requested || $rows->pluck('sales_invoice_id')->diff($invoiceIds)->isNotEmpty()) {
                $this->treasury->fail('The cash reports changed. Refresh the day before posting.');
            }
            if ($day->counted_cash_paisa === null || (int) $day->counted_cash_paisa !== (int) $rows->sum('reported_paisa')) {
                $this->treasury->fail('Bulk posting needs an exact match between counted and reported cash. Review any differences by invoice.');
            }
            $posted = $rows->whereNotNull('recorded_at');
            $postedPayments = DB::table('payments')->whereIn('id', $posted->pluck('payment_id')->filter())
                ->where('status', 'completed')->pluck('id')->flip();
            if ($pending->contains(fn ($row) => $row->payment_id || $row->included_in_opening || (int) $row->reported_paisa <= 0)
                || $posted->contains(fn ($row) => (int) $row->reported_paisa !== (int) $row->verified_paisa || $row->shortage_paisa || ! $postedPayments->has($row->payment_id))) {
                $this->treasury->fail('Opening, adjusted or reversed cash reports must be reviewed by invoice.');
            }

            $due = $this->balances->sales()->whereKey($pending->pluck('sales_invoice_id')->unique()->values()->all())->get()->keyBy('id');
            foreach ($pending->groupBy('sales_invoice_id') as $invoiceId => $reports) {
                if ((int) $reports->sum('reported_paisa') > Paisa::from($due->get($invoiceId)?->outstanding)) {
                    $this->treasury->fail('Cash reports exceed an invoice’s outstanding balance. Review the amounts or duplicate reports individually.');
                }
            }
            foreach ($pending as $row) {
                $this->record($row->id, $actor, ['amount' => Paisa::rupees((int) $row->reported_paisa), 'account_id' => $accountId]);
            }
            $this->treasury->event('collection_day', $id, 'matching_cash_recorded', $actor, ['collection_ids' => $actual, 'account_id' => $accountId]);

            return count($actual);
        }, 3);
    }

    public function record(int $id, User $actor, array $data): void
    {
        DB::transaction(function () use ($id, $actor, $data) {
            $source = DB::table('delivery_collections')->where('id', $id)->first();
            abort_unless($source, 404);
            $invoice = SalesInvoice::whereKey($source->sales_invoice_id)->lockForUpdate()->firstOrFail();
            // Retries after day close return success when the row was already recorded.
            if (DB::table('delivery_collections')->where('id', $id)->whereNotNull('recorded_at')->exists()) return;
            $day = $this->lockedDay($source->collection_day_id, $actor);
            $row = DB::table('delivery_collections')->where('id', $id)->lockForUpdate()->first();
            if ($row->recorded_at) return;
            $amount = Paisa::from($data['amount']);
            $notes = trim($data['notes'] ?? '');
            $approval = null;
            $shortage = 0;
            if (! empty($data['shortage_approval_id'])) {
                $approval = FinanceWorkItem::where('kind', 'shortage')->where('status', 'approved')->lockForUpdate()->findOrFail($data['shortage_approval_id']);
                $shortage = (int) $approval->amount_paisa;
                if ((int) $approval->payload['collection_id'] !== $id || $row->method !== 'cash'
                    || $shortage <= 0 || $amount + $shortage > $row->reported_paisa || $day->counted_cash_paisa === null) {
                    $this->treasury->fail('The approved shortage, counted and verified cash must match this collection.');
                }
            }
            if ($amount !== (int) $row->reported_paisa && $notes === '') $this->treasury->fail('Enter the reason for changing the reported amount.');
            if ($amount < 0 || ($row->method === 'none' && $amount > 0)) $this->treasury->fail('This report cannot receive that amount.');
            if ($row->method === 'cash' && ($amount > 0 || $shortage > 0)) {
                $cashRows = DB::table('delivery_collections')->where('collection_day_id', $day->id)->where('method', 'cash');
                $posted = (int) (clone $cashRows)->sum('verified_paisa');
                if ($day->counted_cash_paisa === null || $posted + $amount > (int) $day->counted_cash_paisa) {
                    $this->treasury->fail('Count cash first; the total posted cash cannot exceed the counted amount.');
                }
                if ($shortage && $shortage + (int) (clone $cashRows)->sum('shortage_paisa') > (int) (clone $cashRows)->sum('reported_paisa') - (int) $day->counted_cash_paisa) {
                    $this->treasury->fail('The approved shortage would exceed this day’s physical cash variance.');
                }
            }
            $payment = null;
            if ($row->payment_id && ($amount !== (int) $row->reported_paisa || $shortage)) {
                $this->treasury->fail('An opening collection linked to a historical receipt must match that receipt.');
            }
            if ($row->included_in_opening && ($amount !== (int) $row->reported_paisa || $shortage)) {
                $this->treasury->fail('Reconcile any discrepancy to the locked opening balance before recording this collection.');
            }
            if ($amount + $shortage > 0) {
                $date = now('Asia/Karachi')->toDateString();
                $this->treasury->assertDate($date);
                $method = $row->method === 'online' ? 'online' : 'cash';
                $reference = trim($data['reference'] ?? $row->reference ?? '');
                if ($method === 'online' && $reference === '') $this->treasury->fail('Verify and enter the bank transaction reference.');
                $account = $this->treasury->account((int) ($data['account_id'] ?? 0), $actor, $method);
                if ($row->included_in_opening) {
                    $evidence = DB::table('finance_work_events')->where('source_type', 'collection')->where('source_id', $row->id)
                        ->where('action', 'opening_collection')->value('data');
                    $matchedAccountId = $evidence ? (int) (json_decode($evidence, true, flags: JSON_THROW_ON_ERROR)['opening_account_id'] ?? 0) : 0;
                    if ((int) $account->id !== $matchedAccountId) $this->treasury->fail('Select the account documented in the locked opening.');
                }
                if ($method === 'online' && DB::table('treasury_entries')->where('account_id', $account->id)->where('kind', 'receipt')->where('reference', $reference)->exists()) {
                    $this->treasury->fail('This bank reference is already posted to the selected account.');
                }
                if ($row->payment_id) {
                    $payment = \App\Models\Payment::where('status','completed')->findOrFail($row->payment_id);
                    if (! $row->included_in_opening) $this->treasury->entry($account, 'receipt', 'opening_collection', $id, $amount, $date, $actor, $reference ?: null);
                } else {
                    $payment = $this->payments->recordManual($invoice->customer, [
                    'method' => $method, 'amount' => Paisa::rupees($amount + $shortage), 'payment_date' => $date, 'reference_no' => $reference ?: null,
                    '_verified_cash_paisa' => $row->included_in_opening ? 0 : $amount,
                    'notes' => $notes ?: "Verified delivery collection #{$id}", 'financial_account_id' => $account->id,
                    ], [['invoice_type' => $invoice->getMorphClass(), 'invoice_id' => $invoice->id, 'amount' => Paisa::rupees($amount + $shortage)]]);
                }
            }
            DB::table('delivery_collections')->where('id', $id)->update(['verified_paisa' => $amount, 'payment_id' => $payment?->id,
                'shortage_paisa' => $shortage, 'reviewer_id' => $actor->id, 'review_note' => $notes ?: null, 'recorded_at' => now()]);
            if ($approval) {
                $approval->update(['status' => 'posted', 'posted_by' => $actor->id, 'posted_at' => now()]);
                $this->treasury->event('approval', $approval->id, 'posted', $actor, ['payment_id' => $payment->id]);
            }
            $this->treasury->event('collection', $id, 'verified', $actor, ['paisa' => $amount, 'shortage_paisa' => $shortage, 'payment_id' => $payment?->id, 'notes' => $notes]);
        }, 3);
    }

    public function close(int $id, User $actor, string $note): void
    {
        DB::transaction(function () use ($id, $actor, $note) {
            $day = $this->lockedDay($id, $actor);
            $rows = DB::table('delivery_collections')->where('collection_day_id', $id);
            if ((clone $rows)->whereNull('recorded_at')->exists()) $this->treasury->fail('Verify all reported collections before closing.');
            $reported = (int) (clone $rows)->where('method', 'cash')->sum('reported_paisa');
            $verified = (int) (clone $rows)->where('method', 'cash')->sum('verified_paisa');
            $count = (int) $day->counted_cash_paisa;
            if ($reported !== $count || $verified !== $count) {
                $approval = FinanceWorkItem::where('kind', 'close_variance')->where('status', 'approved')
                    ->where('payload->day_id', $id)->latest('id')->first();
                if (trim($note) === '' || ! $approval || $approval->payload['reported'] !== $reported
                    || $approval->payload['counted'] !== $count || $approval->payload['verified'] !== $verified) {
                    $this->treasury->fail('A matching independently approved variance and an explanation are required.');
                }
                $approval->update(['status' => 'posted', 'posted_by' => $actor->id, 'posted_at' => now()]);
                $this->treasury->event('approval', $approval->id, 'posted', $actor);
            }
            DB::table('collection_days')->where('id', $id)->update(['closed_at' => now(), 'closed_by' => $actor->id, 'variance_note' => $note ?: null, 'updated_at' => now()]);
            $this->treasury->event('collection_day', $id, 'closed', $actor, compact('reported', 'verified', 'count', 'note'));
        }, 3);
    }

    public function lockedDay(int $id, User $actor): object
    {
        $day = DB::table('collection_days')->where('id', $id)->lockForUpdate()->first();
        abort_unless($day, 404);
        if (! $day->submitted_at || $day->closed_at) $this->treasury->fail('The day must be submitted and open.');
        abort_if((int) $day->salesman_id === $actor->id, 403);
        return $day;
    }
}
