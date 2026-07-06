<?php

namespace App\Services;

use App\Models\Company;
use App\Models\Customer;
use App\Models\LedgerEntry;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Carbon;
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
        $asOf = $asOf ?? now();
        $isCustomer = $party instanceof Customer;

        $entries = LedgerEntry::where('party_type', $party->getMorphClass())
            ->where('party_id', $party->getKey())
            ->orderBy('entry_date')
            ->orderBy('id')
            ->get();

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
            $days = (int) $charge['date']->diffInDays($asOf);
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

            return [
                'id' => $entry->id,
                'date' => $entry->entry_date->toDateString(),
                'type' => $entry->entry_type,
                'description' => $entry->description,
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
