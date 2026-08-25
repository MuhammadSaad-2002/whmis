<?php

namespace App\Services;

use App\Models\Batch;
use App\Models\StockLoan;
use App\Models\StockLoanItem;
use App\Models\StockMovement;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use RuntimeException;

/**
 * Transactional post / return / cancel for stock loans.
 *
 * Loans carry no money: this service only mutates inventory — there is no ledger,
 * receivable, or payment side. Loan-out draws down normal sellable stock (typed
 * loan_out so it never counts as a sale); loan-in creates a segregated is_loan
 * batch that sales and sample issues can never consume.
 */
class StockLoanPostingService
{
    public function __construct(
        private readonly InventoryService $inventory,
    ) {}

    /** Post a draft loan: move the stock and set status to "loaned". */
    public function post(StockLoan $loan): StockLoan
    {
        return DB::transaction(function () use ($loan) {
            $loan = StockLoan::whereKey($loan->id)->lockForUpdate()->firstOrFail();

            if (! $loan->isPending()) {
                throw new RuntimeException("Stock loan {$loan->loan_number} is not a pending draft.");
            }
            if ($loan->items->isEmpty()) {
                throw new RuntimeException('Cannot post a stock loan without items.');
            }

            $totalQty = 0.0;

            foreach ($loan->items as $item) {
                $qty = (float) $item->quantity;

                if ($loan->isIn()) {
                    // Receive the lender's stock into a segregated loan batch.
                    $batch = $this->inventory->receiveLoan($item, $loan);
                    $item->update(['batch_id' => $batch->id]);
                } else {
                    // Send our own stock out (FIFO). Throws if we can't cover it.
                    $allocations = $this->inventory->consumeFifo(
                        $item->product_id,
                        $loan->warehouse_id,
                        $qty,
                        $loan,
                        $item->batch_id,
                        'loan_out',
                    );
                    // Pin the batch only when a single batch satisfied the line.
                    $item->update([
                        'batch_id' => $item->batch_id ?? (count($allocations) === 1 ? $allocations[0]['batch']->id : null),
                    ]);
                }

                $totalQty += $qty;
            }

            $loan->update([
                'total_quantity' => round($totalQty, 2),
                'returned_quantity' => 0,
                'status' => StockLoan::STATUS_LOANED,
                'posted_at' => now(),
                'posted_by' => Auth::id(),
            ]);

            return $loan->refresh();
        });
    }

    /**
     * Record a (partial or full) return against a posted loan.
     *
     * @param  array<int, float>  $lineReturns  item id => quantity being returned now
     */
    public function recordReturn(StockLoan $loan, array $lineReturns): StockLoan
    {
        return DB::transaction(function () use ($loan, $lineReturns) {
            $loan = StockLoan::whereKey($loan->id)->lockForUpdate()->firstOrFail();

            if (! $loan->isActive()) {
                throw new RuntimeException("Stock loan {$loan->loan_number} has no outstanding units to return.");
            }

            $applied = 0.0;

            foreach ($loan->items as $item) {
                $want = (float) ($lineReturns[$item->id] ?? 0);
                if ($want <= 0) {
                    continue;
                }

                $cap = $item->outstandingQuantity();
                $take = min($want, $cap);
                if ($take <= 1e-9) {
                    continue;
                }

                if ($loan->isIn()) {
                    // Hand the lender's units back out of the loan batch.
                    $batch = Batch::findOrFail($item->batch_id);
                    $this->inventory->reverseLoanIn($batch, $take, $loan);
                } else {
                    // Restore our stock to the batches the line was consumed from.
                    $this->restoreLoanOut($loan, $item, $take);
                }

                $item->update(['returned_quantity' => (float) $item->returned_quantity + $take]);
                $applied += $take;
            }

            if ($applied <= 1e-9) {
                throw new RuntimeException('Nothing to return — enter a quantity within the outstanding balance.');
            }

            $this->refreshReturnStatus($loan);

            return $loan->refresh();
        });
    }

    /** Cancel a loan: reverse whatever is still outstanding, then mark cancelled. */
    public function cancel(StockLoan $loan): StockLoan
    {
        return DB::transaction(function () use ($loan) {
            $loan = StockLoan::whereKey($loan->id)->lockForUpdate()->firstOrFail();

            if ($loan->status === StockLoan::STATUS_CANCELLED) {
                throw new RuntimeException('Stock loan is already cancelled.');
            }

            if ($loan->isActive()) {
                foreach ($loan->items as $item) {
                    $outstanding = $item->outstandingQuantity();
                    if ($outstanding <= 1e-9) {
                        continue;
                    }

                    if ($loan->isIn()) {
                        $this->inventory->reverseLoanIn(Batch::findOrFail($item->batch_id), $outstanding, $loan);
                    } else {
                        $this->restoreLoanOut($loan, $item, $outstanding);
                    }

                    $item->update(['returned_quantity' => (float) $item->returned_quantity + $outstanding]);
                }
            }

            $loan->update(['status' => StockLoan::STATUS_CANCELLED]);

            return $loan->refresh();
        });
    }

    /** Manually close a settled/written-off loan (terminal, no stock effect). */
    public function close(StockLoan $loan): StockLoan
    {
        return DB::transaction(function () use ($loan) {
            $loan = StockLoan::whereKey($loan->id)->lockForUpdate()->firstOrFail();

            if (! in_array($loan->status, [
                StockLoan::STATUS_LOANED,
                StockLoan::STATUS_PARTIALLY_RETURNED,
                StockLoan::STATUS_RETURNED,
            ], true)) {
                throw new RuntimeException('Only a posted stock loan can be closed.');
            }

            $loan->update(['status' => StockLoan::STATUS_CLOSED, 'closed_at' => now()]);

            return $loan->refresh();
        });
    }

    /**
     * Restore up to $quantity of a loan-out line back into the batches it left,
     * capped per batch by what is still out (loan_out minus loan_out_return).
     */
    private function restoreLoanOut(StockLoan $loan, StockLoanItem $item, float $quantity): void
    {
        $remaining = $quantity;

        $out = StockMovement::where('reference_type', $loan->getMorphClass())
            ->where('reference_id', $loan->id)
            ->where('product_id', $item->product_id)
            ->where('type', 'loan_out')
            ->orderBy('id')
            ->get();

        $returnedByBatch = StockMovement::where('reference_type', $loan->getMorphClass())
            ->where('reference_id', $loan->id)
            ->where('product_id', $item->product_id)
            ->where('type', 'loan_out_return')
            ->selectRaw('batch_id, SUM(ABS(quantity)) as qty')
            ->groupBy('batch_id')
            ->pluck('qty', 'batch_id');

        foreach ($out as $movement) {
            if ($remaining <= 1e-9) {
                break;
            }

            $sentOut = abs((float) $movement->quantity);
            $alreadyBack = (float) ($returnedByBatch[$movement->batch_id] ?? 0);
            $stillOut = $sentOut - $alreadyBack;
            if ($stillOut <= 1e-9) {
                continue;
            }

            $take = min($stillOut, $remaining);
            $this->inventory->returnToBatch($movement->batch, $take, $loan, 'loan_out_return');

            // Track within this call so two movements on the same batch don't double-fill.
            $returnedByBatch[$movement->batch_id] = $alreadyBack + $take;
            $remaining -= $take;
        }
    }

    /** Derive the header status from how much of the loan has come back. */
    private function refreshReturnStatus(StockLoan $loan): void
    {
        $returned = (float) $loan->items()->sum('returned_quantity');
        $total = (float) $loan->total_quantity;

        $status = $returned <= 1e-9
            ? StockLoan::STATUS_LOANED
            : ($returned + 1e-9 >= $total ? StockLoan::STATUS_RETURNED : StockLoan::STATUS_PARTIALLY_RETURNED);

        $loan->update(['returned_quantity' => round($returned, 2), 'status' => $status]);
    }
}
