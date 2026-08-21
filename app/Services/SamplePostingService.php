<?php

namespace App\Services;

use App\Models\SampleIssue;
use App\Models\SampleReceipt;
use App\Models\StockMovement;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use RuntimeException;

/**
 * Transactional post/cancel for sample receipts and sample issues.
 *
 * Samples carry no money: this service only mutates inventory — there is no
 * ledger, receivable, or payment side. Free-sample stock is segregated, and a
 * sample issue consumes sample-origin stock first before falling back to normal
 * stock (see InventoryService::consumeFifo with $sampleIssue = true).
 */
class SamplePostingService
{
    public function __construct(
        private readonly InventoryService $inventory,
    ) {}

    public function postReceipt(SampleReceipt $receipt): SampleReceipt
    {
        return DB::transaction(function () use ($receipt) {
            $receipt = SampleReceipt::whereKey($receipt->id)->lockForUpdate()->firstOrFail();

            if (! $receipt->isDraft()) {
                throw new RuntimeException("Sample receipt {$receipt->receipt_number} is not a draft.");
            }
            if ($receipt->items->isEmpty()) {
                throw new RuntimeException('Cannot post a sample receipt without items.');
            }

            foreach ($receipt->items as $item) {
                $batch = $this->inventory->receiveSample($item, $receipt);
                $item->update(['batch_id' => $batch->id]);
            }

            $receipt->update([
                'status' => SampleReceipt::STATUS_POSTED,
                'posted_at' => now(),
                'posted_by' => Auth::id(),
            ]);

            return $receipt->refresh();
        });
    }

    public function cancelReceipt(SampleReceipt $receipt): SampleReceipt
    {
        return DB::transaction(function () use ($receipt) {
            $receipt = SampleReceipt::whereKey($receipt->id)->lockForUpdate()->firstOrFail();

            if ($receipt->status === SampleReceipt::STATUS_CANCELLED) {
                throw new RuntimeException('Sample receipt is already cancelled.');
            }

            if ($receipt->isPosted()) {
                foreach ($receipt->items as $item) {
                    if ($item->batch_id) {
                        $this->inventory->reverseSampleReceipt(
                            \App\Models\Batch::findOrFail($item->batch_id),
                            (float) $item->quantity,
                            $receipt,
                        );
                    }
                }
            }

            $receipt->update(['status' => SampleReceipt::STATUS_CANCELLED]);

            return $receipt->refresh();
        });
    }

    public function postIssue(SampleIssue $issue): SampleIssue
    {
        return DB::transaction(function () use ($issue) {
            $issue = SampleIssue::whereKey($issue->id)->lockForUpdate()->firstOrFail();

            if (! $issue->isDraft()) {
                throw new RuntimeException("Sample issue {$issue->issue_number} is not a draft.");
            }
            if ($issue->items->isEmpty()) {
                throw new RuntimeException('Cannot post a sample issue without items.');
            }

            $totalCost = 0.0;
            $totalQty = 0.0;

            foreach ($issue->items as $item) {
                $qty = (float) $item->quantity;
                $allocations = $this->inventory->consumeFifo(
                    $item->product_id,
                    $issue->warehouse_id,
                    $qty,
                    $issue,
                    $item->batch_id,
                    'sample_out',
                    true, // sample-first FIFO, may fall back to normal stock
                );

                $cost = round(array_sum(array_column($allocations, 'cost')), 4);

                $item->update([
                    'cost_amount' => $cost,
                    // Pin the batch only when a single batch satisfied the line.
                    'batch_id' => $item->batch_id ?? (count($allocations) === 1 ? $allocations[0]['batch']->id : null),
                ]);

                $totalCost += $cost;
                $totalQty += $qty;
            }

            $issue->update([
                'total_quantity' => round($totalQty, 2),
                'total_cost' => round($totalCost, 2),
                'status' => SampleIssue::STATUS_POSTED,
                'posted_at' => now(),
                'posted_by' => Auth::id(),
            ]);

            return $issue->refresh();
        });
    }

    public function cancelIssue(SampleIssue $issue): SampleIssue
    {
        return DB::transaction(function () use ($issue) {
            $issue = SampleIssue::whereKey($issue->id)->lockForUpdate()->firstOrFail();

            if ($issue->status === SampleIssue::STATUS_CANCELLED) {
                throw new RuntimeException('Sample issue is already cancelled.');
            }

            if ($issue->isPosted()) {
                $movements = StockMovement::where('reference_type', $issue->getMorphClass())
                    ->where('reference_id', $issue->id)
                    ->where('type', 'sample_out')
                    ->get();

                foreach ($movements as $movement) {
                    // Restores stock to the exact batch (sample or normal) it left.
                    $this->inventory->returnToBatch(
                        $movement->batch,
                        abs((float) $movement->quantity),
                        $issue,
                        'sample_out_cancel',
                    );
                }
            }

            $issue->update(['status' => SampleIssue::STATUS_CANCELLED]);

            return $issue->refresh();
        });
    }
}
