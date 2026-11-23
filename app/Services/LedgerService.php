<?php

namespace App\Services;

use App\Models\Company;
use App\Models\Customer;
use App\Models\LedgerEntry;
use App\Models\Payment;
use App\Models\PurchaseInvoice;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Auth;

/**
 * Customer ledger: debit = receivable up (sale), credit = receivable down (receipt).
 * Supplier ledger: credit = payable up (purchase), debit = payable down (payment).
 */
class LedgerService
{
    public function post(
        Customer|Company $party,
        string $entryType,
        Carbon|string $date,
        float $debit,
        float $credit,
        ?Model $reference = null,
        ?string $description = null,
    ): LedgerEntry {
        return LedgerEntry::create([
            'party_type' => $party->getMorphClass(),
            'party_id' => $party->getKey(),
            'entry_date' => $date,
            'entry_type' => $entryType,
            'reference_type' => $reference?->getMorphClass(),
            'reference_id' => $reference?->getKey(),
            'debit' => round($debit, 2),
            'credit' => round($credit, 2),
            'description' => $description,
            'created_by' => Auth::id(),
        ]);
    }

    public function outstanding(Customer|Company $party): float
    {
        $balance = (float) LedgerEntry::where('party_type', $party->getMorphClass())
            ->where('party_id', $party->getKey())
            ->selectRaw('COALESCE(SUM(debit - credit), 0) as balance')
            ->value('balance');

        // Customers owe us (debit balance); we owe suppliers (credit balance).
        return $party instanceof Customer ? $balance : -$balance;
    }

    /**
     * Aging buckets for receivables/payables based on posted invoice dates,
     * netted against everything received/paid (oldest-first application).
     */
    public function aging(Customer|Company $party, ?Carbon $asOf = null): array
    {
        $entries = LedgerEntry::where('party_type', $party->getMorphClass())
            ->where('party_id', $party->getKey())
            ->orderBy('entry_date')
            ->orderBy('id')
            ->get();

        return $this->ageEntries($entries, $party instanceof Customer, $asOf ?? now());
    }

    /** Customer balances in one aggregate query, with debit/credit identical to outstanding(). */
    public function customerBalances(array $ids): Collection
    {
        return LedgerEntry::where('party_type', (new Customer)->getMorphClass())
            ->whereIntegerInRaw('party_id', $ids)
            ->selectRaw('party_id, SUM(debit - credit) AS balance')->groupBy('party_id')->pluck('balance', 'party_id');
    }

    /** Age positive receivables in batches without issuing a separate query for each account. */
    public function customerAging(array $ids, ?Carbon $asOf = null): array
    {
        $asOf ??= now();
        $aged = [];
        foreach (array_chunk($ids, 250) as $batch) {
            $entries = LedgerEntry::where('party_type', (new Customer)->getMorphClass())
                ->whereIntegerInRaw('party_id', $batch)
                ->selectRaw('party_id, entry_date, SUM(CASE WHEN debit > 0 THEN debit ELSE 0 END) AS debit, SUM(credit) AS credit')
                ->groupBy('party_id', 'entry_date')->orderBy('entry_date')
                ->toBase()->get()->groupBy('party_id');

            foreach ($entries as $partyId => $group) {
                $aged[$partyId] = $this->ageEntries($group, true, $asOf);
            }
        }

        return $aged;
    }

    private function ageEntries(iterable $entries, bool $isCustomer, Carbon $asOf): array
    {
        // Charges increase the balance owed; credits reduce oldest charges first.
        $charges = [];
        $creditPool = 0.0;

        foreach ($entries as $entry) {
            $charge = $isCustomer ? (float) $entry->debit : (float) $entry->credit;
            $credit = $isCustomer ? (float) $entry->credit : (float) $entry->debit;

            if ($charge > 0) {
                $charges[] = ['date' => Carbon::parse($entry->entry_date), 'amount' => $charge];
            }
            $creditPool += $credit;
        }

        foreach ($charges as &$charge) {
            if ($creditPool <= 0) {
                break;
            }
            $applied = min($charge['amount'], $creditPool);
            $charge['amount'] -= $applied;
            $creditPool -= $applied;
        }
        unset($charge);

        $buckets = ['current' => 0.0, '31_60' => 0.0, '61_90' => 0.0, 'over_90' => 0.0];
        foreach ($charges as $charge) {
            if ($charge['amount'] <= 0) {
                continue;
            }
            // Ledger entry dates have no time of day. Compare them in the
            // snapshot's calendar zone so the 30/60/90 cutoffs stay exact.
            $days = (int) Carbon::parse($charge['date']->toDateString(), $asOf->getTimezone())
                ->diffInDays($asOf->copy()->startOfDay());
            $key = match (true) {
                $days <= 30 => 'current',
                $days <= 60 => '31_60',
                $days <= 90 => '61_90',
                default => 'over_90',
            };
            $buckets[$key] += $charge['amount'];
        }

        $buckets = array_map(fn ($v) => round($v, 2), $buckets);
        $buckets['total'] = round(array_sum($buckets), 2);

        return $buckets;
    }

    /**
     * Consolidated two-sided money picture: receivables (customers owe us),
     * payables (we owe suppliers), a chronological payments log, and totals.
     *
     * Balances are current/all-time (Σ debit − credit). Aging uses the current date.
     * Per-party "paid" and the payments log cover [$from, $to].
     */
    public function financialPosition(?Carbon $from = null, ?Carbon $to = null, ?Carbon $asOf = null): array
    {
        $asOf ??= Carbon::today('Asia/Karachi');
        $to = ($to ?? now())->copy()->endOfDay();
        $from = ($from ?? now()->startOfMonth())->copy()->startOfDay();

        // One query for every completed payment in the window; used for both the
        // log and each party's "paid in period" (grouped by party) — no N+1.
        $payments = Payment::with('party')
            ->where('status', 'completed')
            ->whereBetween('payment_date', [$from, $to])
            ->orderBy('payment_date')
            ->orderBy('id')
            ->get();

        $paidByParty = $payments->groupBy(fn (Payment $p) => $p->party_type.':'.$p->party_id)
            ->map(fn ($group) => (float) $group->sum('amount'));

        $paidFor = fn (Customer|Company $party) => round(
            $paidByParty->get($party->getMorphClass().':'.$party->getKey(), 0.0), 2
        );

        $receivables = Customer::active()
            ->withSum('ledgerEntries as debit_sum', 'debit')
            ->withSum('ledgerEntries as credit_sum', 'credit')
            ->orderBy('name')
            ->get()
            ->map(function (Customer $customer) use ($asOf, $paidFor) {
                $balance = round((float) $customer->debit_sum - (float) $customer->credit_sum, 2);

                return [
                    'id' => $customer->id,
                    'name' => $customer->name,
                    'city' => $customer->city,
                    'phone' => $customer->phone,
                    'credit_limit' => (float) $customer->credit_limit,
                    'balance' => $balance,
                    'aging' => $balance > 0 ? $this->aging($customer, $asOf) : null,
                    'paid' => $paidFor($customer),
                ];
            })
            // Keep outstanding parties plus any settled in the period (paid > 0).
            ->filter(fn ($row) => $row['balance'] != 0.0 || $row['paid'] != 0.0)
            // Outstanding first (largest balance), settled rows last.
            ->sortBy(fn ($row) => [$row['balance'] == 0.0 ? 1 : 0, -$row['balance']])
            ->values();

        $payables = Company::active()
            ->withSum('ledgerEntries as debit_sum', 'debit')
            ->withSum('ledgerEntries as credit_sum', 'credit')
            ->orderBy('name')
            ->get()
            ->map(function (Company $company) use ($asOf, $paidFor) {
                $balance = round((float) $company->credit_sum - (float) $company->debit_sum, 2);

                return [
                    'id' => $company->id,
                    'name' => $company->name,
                    'city' => $company->city,
                    'balance' => $balance,
                    'aging' => $balance > 0 ? $this->aging($company, $asOf) : null,
                    'paid' => $paidFor($company),
                ];
            })
            // Keep outstanding parties plus any settled in the period (paid > 0).
            ->filter(fn ($row) => $row['balance'] != 0.0 || $row['paid'] != 0.0)
            // Outstanding first (largest balance), settled rows last.
            ->sortBy(fn ($row) => [$row['balance'] == 0.0 ? 1 : 0, -$row['balance']])
            ->values();

        $log = $payments->map(fn (Payment $p) => [
            'id' => $p->id,
            'number' => $p->payment_number,
            'reference_no' => $p->reference_no,
            'date' => Carbon::parse($p->payment_date)->toDateString(),
            'direction' => $p->direction, // 'in' = customer receipt, 'out' = supplier payment
            'party_type' => $p->party_type,
            'party_id' => $p->party_id,
            'party_name' => $p->party?->name,
            'method' => $p->method,
            'amount' => (float) $p->amount,
        ])->values();

        $received = round((float) $payments->where('direction', Payment::DIRECTION_IN)->sum('amount'), 2);
        $paid = round((float) $payments->where('direction', Payment::DIRECTION_OUT)->sum('amount'), 2);
        $totalReceivable = round((float) $receivables->sum('balance'), 2);
        $totalPayable = round((float) $payables->sum('balance'), 2);
        $hr = app(HrReportService::class)->totals();
        $hrPeriod = app(HrReportService::class)->totals($from, $to);

        return [
            'receivables' => $receivables->all(),
            'payables' => $payables->all(),
            'payments' => $log->all(),
            'totals' => [
                'total_receivable' => $totalReceivable,
                'total_payable' => $totalPayable,
                'net' => round($totalReceivable + $hr['advance'] - $totalPayable - $hr['payable'], 2),
                'employee_payable' => $hr['payable'],
                'employee_advances' => $hr['advance'],
                'payroll_expense' => $hrPeriod['expense'],
                'employee_cash_out' => $hrPeriod['cash_out'],
                'net_cash_flow' => round($received - $paid - $hrPeriod['cash_out'], 2),
                // Counts cover outstanding parties only; settled shown separately.
                'customer_count' => $receivables->where('balance', '!=', 0.0)->count(),
                'supplier_count' => $payables->where('balance', '!=', 0.0)->count(),
                'settled_customer_count' => $receivables->where('balance', '==', 0.0)->count(),
                'settled_supplier_count' => $payables->where('balance', '==', 0.0)->count(),
                'received' => $received,
                'paid' => $paid,
            ],
        ];
    }

    /**
     * Statement rows with running balance for a party.
     */
    public function statement(Customer|Company $party, ?Carbon $from = null, ?Carbon $to = null): array
    {
        $opening = 0.0;
        if ($from) {
            $opening = (float) LedgerEntry::where('party_type', $party->getMorphClass())
                ->where('party_id', $party->getKey())
                ->where('entry_date', '<', $from)
                ->selectRaw('COALESCE(SUM(debit - credit), 0) as balance')
                ->value('balance');
        }

        $entries = LedgerEntry::with('reference')
            ->where('party_type', $party->getMorphClass())
            ->where('party_id', $party->getKey())
            ->when($from, fn ($q) => $q->where('entry_date', '>=', $from))
            ->when($to, fn ($q) => $q->where('entry_date', '<=', $to))
            ->orderBy('entry_date')
            ->orderBy('id')
            ->get();

        $running = $opening;
        $rows = $entries->map(function (LedgerEntry $entry) use (&$running) {
            $running += (float) $entry->debit - (float) $entry->credit;

            // For purchases, prefer the supplier's own invoice number (the
            // reference we entered) over our internal PI- number.
            $ref = $entry->reference;
            $description = ($ref instanceof PurchaseInvoice && filled($ref->supplier_invoice_number))
                ? "Supplier Inv {$ref->supplier_invoice_number}"
                : $entry->description;

            return [
                'id' => $entry->id,
                'date' => $entry->entry_date->toDateString(),
                'type' => $entry->entry_type,
                'description' => $description,
                'debit' => (float) $entry->debit,
                'credit' => (float) $entry->credit,
                'balance' => round($running, 2),
            ];
        })->all();

        return [
            'opening_balance' => round($opening, 2),
            'rows' => $rows,
            'closing_balance' => round($running, 2),
        ];
    }
}
