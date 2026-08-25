<?php

namespace App\Services;

use App\Models\Batch;
use App\Models\Product;
use App\Models\PurchaseInvoiceItem;
use App\Models\SampleReceipt;
use App\Models\SampleReceiptItem;
use App\Models\StockLoan;
use App\Models\StockLoanItem;
use App\Models\StockMovement;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Auth;
use RuntimeException;

/**
 * All stock mutations flow through this service. Batch quantity columns
 * are maintained aggregates; stock_movements is the append-only truth.
 */
class InventoryService
{
    /**
     * Create a batch from a posted purchase invoice item and stock it in.
     */
    public function receiveFromPurchaseItem(PurchaseInvoiceItem $item, float $effectiveCost): Batch
    {
        $invoice = $item->invoice;
        $totalUnits = (float) $item->quantity + (float) $item->bonus_quantity;

        $batch = Batch::create([
            'product_id' => $item->product_id,
            'warehouse_id' => $invoice->warehouse_id,
            'batch_number' => $item->batch_number ?: 'N/A',
            'expiry_date' => $item->expiry_date,
            'purchase_rate' => $item->purchase_rate,
            'effective_cost' => $effectiveCost,
            'trade_price' => $item->trade_price,
            'retail_price' => $item->retail_price,
            'qty_purchased' => $item->quantity,
            'qty_bonus' => $item->bonus_quantity,
            'qty_available' => $totalUnits,
            'purchase_invoice_item_id' => $item->id,
        ]);

        $this->recordMovement($batch, 'purchase', $totalUnits, $invoice, $effectiveCost);

        return $batch;
    }

    /**
     * Stock in a free-of-charge sample from a posted sample receipt. Creates a
     * dedicated sample batch (is_sample = true) at zero cost, so it is segregated
     * from purchased stock and never contributes to COGS.
     */
    public function receiveSample(SampleReceiptItem $item, SampleReceipt $receipt): Batch
    {
        $quantity = (float) $item->quantity;

        $batch = Batch::create([
            'product_id' => $item->product_id,
            'warehouse_id' => $receipt->warehouse_id,
            'is_sample' => true,
            'batch_number' => $item->batch_number ?: 'SAMPLE',
            'expiry_date' => $item->expiry_date,
            'purchase_rate' => 0,
            'effective_cost' => 0,
            'trade_price' => 0,
            'retail_price' => 0,
            'qty_purchased' => $quantity,
            'qty_bonus' => 0,
            'qty_available' => $quantity,
        ]);

        $this->recordMovement($batch, 'sample_in', $quantity, $receipt, 0);

        return $batch;
    }

    /**
     * Reverse a sample receipt (cancellation). Removes the received units from
     * the sample batch; fails if any of it has already been issued.
     */
    public function reverseSampleReceipt(Batch $batch, float $quantity, Model $reference): void
    {
        $batch = Batch::whereKey($batch->id)->lockForUpdate()->firstOrFail();

        if ((float) $batch->qty_available + 1e-9 < $quantity) {
            throw new RuntimeException(
                "Cannot cancel: sample stock from batch {$batch->batch_number} has already been issued."
            );
        }

        $batch->qty_available = (float) $batch->qty_available - $quantity;
        $batch->qty_purchased = max(0, (float) $batch->qty_purchased - $quantity);
        $batch->save();

        $this->recordMovement($batch, 'sample_in_cancel', -$quantity, $reference, 0);
    }

    /**
     * Stock in loaned-in goods from a posted stock loan (direction = in). Creates
     * a dedicated loan batch (is_loan = true) at zero cost — segregated from both
     * purchased and sample stock, and never consumed by a sale or sample issue.
     */
    public function receiveLoan(StockLoanItem $item, StockLoan $loan): Batch
    {
        $quantity = (float) $item->quantity;

        $batch = Batch::create([
            'product_id' => $item->product_id,
            'warehouse_id' => $loan->warehouse_id,
            'is_loan' => true,
            'batch_number' => $item->batch_number ?: 'LOAN',
            'expiry_date' => $item->expiry_date,
            'purchase_rate' => 0,
            'effective_cost' => 0,
            'trade_price' => 0,
            'retail_price' => 0,
            'qty_purchased' => $quantity,
            'qty_bonus' => 0,
            'qty_available' => $quantity,
        ]);

        $this->recordMovement($batch, 'loan_in', $quantity, $loan, 0);

        return $batch;
    }

    /**
     * Return loaned-in units to their owner (or reverse a loan-in receipt on
     * cancellation). Removes the units from the loan batch; guards against having
     * already handed back more than is on hand.
     */
    public function reverseLoanIn(Batch $batch, float $quantity, Model $reference): void
    {
        $batch = Batch::whereKey($batch->id)->lockForUpdate()->firstOrFail();

        if ((float) $batch->qty_available + 1e-9 < $quantity) {
            throw new RuntimeException(
                "Cannot return: only {$batch->qty_available} of loan batch {$batch->batch_number} is still on hand."
            );
        }

        $batch->qty_available = (float) $batch->qty_available - $quantity;
        $batch->qty_purchased = max(0, (float) $batch->qty_purchased - $quantity);
        $batch->save();

        $this->recordMovement($batch, 'loan_in_return', -$quantity, $reference, 0);
    }

    /**
     * Add a purchase receipt to an existing batch (restock). Stock accumulates
     * and effective_cost becomes the moving weighted average over on-hand units.
     */
    public function restockBatch(PurchaseInvoiceItem $item, float $effectiveCost, float $receiptNet): Batch
    {
        $invoice = $item->invoice;
        $batch = Batch::whereKey($item->batch_id)->lockForUpdate()->firstOrFail();

        $qty = (float) $item->quantity;
        $bonus = (float) $item->bonus_quantity;
        $units = $qty + $bonus;

        $value = (float) $batch->qty_available * (float) $batch->effective_cost;
        $newAvailable = (float) $batch->qty_available + $units;

        $batch->qty_purchased = (float) $batch->qty_purchased + $qty;
        $batch->qty_bonus = (float) $batch->qty_bonus + $bonus;
        $batch->qty_available = $newAvailable;
        $batch->effective_cost = $newAvailable > 1e-9 ? round(($value + $receiptNet) / $newAvailable, 4) : $effectiveCost;
        // Latest receipt refreshes the batch's rates/selling prices.
        $batch->purchase_rate = $item->purchase_rate;
        $batch->trade_price = $item->trade_price;
        $batch->retail_price = $item->retail_price;
        $batch->save();

        $this->recordMovement($batch, 'purchase', $units, $invoice, $effectiveCost);

        return $batch;
    }

    /**
     * Reverse a single purchase receipt from its batch (purchase cancellation),
     * for both freshly-created and restocked batches. Removes only this
     * receipt's units and unwinds its share of the moving-average cost.
     */
    public function reversePurchaseReceipt(Batch $batch, float $qty, float $bonus, float $receiptUnitCost, Model $reference): void
    {
        $batch = Batch::whereKey($batch->id)->lockForUpdate()->firstOrFail();
        $units = $qty + $bonus;

        if ((float) $batch->qty_available + 1e-9 < $units) {
            throw new RuntimeException(
                "Cannot cancel: stock from batch {$batch->batch_number} has already been sold or adjusted."
            );
        }

        $value = (float) $batch->qty_available * (float) $batch->effective_cost;
        $newAvailable = (float) $batch->qty_available - $units;

        $batch->qty_purchased = max(0, (float) $batch->qty_purchased - $qty);
        $batch->qty_bonus = max(0, (float) $batch->qty_bonus - $bonus);
        $batch->qty_available = $newAvailable;
        if ($newAvailable > 1e-9) {
            $batch->effective_cost = round(($value - $units * $receiptUnitCost) / $newAvailable, 4);
        }
        $batch->save();

        $this->recordMovement($batch, 'purchase_return', -$units, $reference, $receiptUnitCost);
    }

    /**
     * FIFO-consume stock for a product. Batches are locked, ordered by
     * earliest expiry then arrival. Returns allocations:
     * [['batch' => Batch, 'quantity' => float, 'cost' => float], ...]
     *
     * Normal sales (default) consume ONLY normal purchased stock — free-sample
     * batches are excluded so the two are fully segregated. A sample issue
     * ($sampleIssue = true) drains sample stock first, then falls back to normal
     * stock (still FIFO within each group).
     *
     * @throws RuntimeException when available stock is insufficient
     */
    public function consumeFifo(
        int $productId,
        int $warehouseId,
        float $quantity,
        Model $reference,
        ?int $batchId = null,
        string $type = 'sale',
        bool $sampleIssue = false,
    ): array {
        if ($quantity <= 0) {
            return [];
        }

        $query = Batch::where('product_id', $productId)
            ->where('warehouse_id', $warehouseId)
            ->where('qty_available', '>', 0);

        if ($sampleIssue) {
            // Sample-first: free-sample batches (is_sample = 1) drain before normal stock.
            $query->orderByRaw('is_sample DESC');
        } else {
            // Normal consumption never touches free-sample stock.
            $query->where('is_sample', false);
        }

        // Loaned-in stock belongs to the lender: neither sales nor sample issues
        // may ever consume it. It leaves only via a Stock Loan return.
        $query->where('is_loan', false);

        $query->orderByRaw('expiry_date IS NULL, expiry_date ASC')
            ->orderBy('id')
            ->lockForUpdate();

        if ($batchId) {
            $query->where('id', $batchId);
        }

        $batches = $query->get();
        $available = (float) $batches->sum('qty_available');

        if ($available + 1e-9 < $quantity) {
            $product = Product::find($productId);
            throw new RuntimeException(sprintf(
                'Insufficient stock for %s: need %s, available %s%s.',
                $product?->name ?? "product #{$productId}",
                rtrim(rtrim(number_format($quantity, 2), '0'), '.'),
                rtrim(rtrim(number_format($available, 2), '0'), '.'),
                $batchId ? ' in selected batch' : '',
            ));
        }

        $remaining = $quantity;
        $allocations = [];

        foreach ($batches as $batch) {
            if ($remaining <= 0) {
                break;
            }

            $take = min((float) $batch->qty_available, $remaining);
            $cost = round($take * (float) $batch->effective_cost, 4);

            $batch->qty_sold = (float) $batch->qty_sold + $take;
            $batch->qty_available = (float) $batch->qty_available - $take;
            $batch->save();

            $this->recordMovement($batch, $type, -$take, $reference, (float) $batch->effective_cost);

            $allocations[] = ['batch' => $batch, 'quantity' => $take, 'cost' => $cost];
            $remaining -= $take;
        }

        return $allocations;
    }

    /**
     * Return stock into a batch (sale cancellation / sales return).
     */
    public function returnToBatch(Batch $batch, float $quantity, Model $reference, string $type = 'sale_return'): void
    {
        $batch = Batch::whereKey($batch->id)->lockForUpdate()->firstOrFail();
        $batch->qty_sold = (float) $batch->qty_sold - $quantity;
        $batch->qty_available = (float) $batch->qty_available + $quantity;
        $batch->save();

        $this->recordMovement($batch, $type, $quantity, $reference, (float) $batch->effective_cost);
    }

    /**
     * Remove purchased stock when a purchase invoice is cancelled.
     * Fails if any of it has already been sold.
     */
    public function withdrawPurchasedStock(Batch $batch, Model $reference): void
    {
        $batch = Batch::whereKey($batch->id)->lockForUpdate()->firstOrFail();
        $totalUnits = (float) $batch->qty_purchased + (float) $batch->qty_bonus;

        if ((float) $batch->qty_available + 1e-9 < $totalUnits) {
            throw new RuntimeException(
                "Cannot cancel: stock from batch {$batch->batch_number} has already been sold or adjusted."
            );
        }

        $batch->qty_available = 0;
        $batch->qty_purchased = 0;
        $batch->qty_bonus = 0;
        $batch->save();

        $this->recordMovement($batch, 'purchase_return', -$totalUnits, $reference, (float) $batch->effective_cost);
    }

    /**
     * Reserve stock for a saved draft sale — moves units from available to
     * reserved so they can't be committed on another invoice.
     */
    public function reserve(Batch $batch, float $units, Model $reference): void
    {
        if ($units <= 0) {
            return;
        }

        $batch = Batch::whereKey($batch->id)->lockForUpdate()->firstOrFail();

        if ((float) $batch->qty_available + 1e-9 < $units) {
            throw new RuntimeException(
                "Not enough stock in batch {$batch->batch_number} to reserve {$units} (available {$batch->qty_available})."
            );
        }

        $batch->qty_available = (float) $batch->qty_available - $units;
        $batch->qty_reserved = (float) $batch->qty_reserved + $units;
        $batch->save();

        $this->recordMovement($batch, 'reservation', -$units, $reference, (float) $batch->effective_cost);
    }

    /**
     * Release a draft's reservation back to available stock (edit / delete, or
     * just before posting converts it to a real sale).
     */
    public function releaseReservation(Batch $batch, float $units, Model $reference): void
    {
        if ($units <= 0) {
            return;
        }

        $batch = Batch::whereKey($batch->id)->lockForUpdate()->firstOrFail();
        $release = min($units, (float) $batch->qty_reserved);
        if ($release <= 0) {
            return;
        }

        $batch->qty_available = (float) $batch->qty_available + $release;
        $batch->qty_reserved = (float) $batch->qty_reserved - $release;
        $batch->save();

        $this->recordMovement($batch, 'reservation_release', $release, $reference, (float) $batch->effective_cost);
    }

    /**
     * Reverse a sales return: the exact inverse of returnToBatch(). Removes the
     * units a return added back (qty_sold up, qty_available down) and guards
     * against the stock having been re-sold in the meantime.
     */
    public function withdrawReturnedStock(Batch $batch, float $quantity, Model $reference): void
    {
        if ($quantity <= 0) {
            return;
        }

        $batch = Batch::whereKey($batch->id)->lockForUpdate()->firstOrFail();

        if ((float) $batch->qty_available + 1e-9 < $quantity) {
            throw new RuntimeException(
                "Cannot cancel return: stock restored to batch {$batch->batch_number} has since been sold or adjusted."
            );
        }

        $batch->qty_sold = (float) $batch->qty_sold + $quantity;
        $batch->qty_available = (float) $batch->qty_available - $quantity;
        $batch->save();

        $this->recordMovement($batch, 'sale_return_cancel', -$quantity, $reference, (float) $batch->effective_cost);
    }

    /**
     * Manual adjustment. Positive quantity adds stock, negative removes.
     */
    public function adjust(Batch $batch, float $quantity, string $type, Model $reference, ?string $remarks = null): void
    {
        $batch = Batch::whereKey($batch->id)->lockForUpdate()->firstOrFail();
        $newAvailable = (float) $batch->qty_available + $quantity;

        if ($newAvailable < 0) {
            throw new RuntimeException("Adjustment would make batch {$batch->batch_number} stock negative.");
        }

        $batch->qty_available = $newAvailable;
        $batch->save();

        $this->recordMovement($batch, $type, $quantity, $reference, (float) $batch->effective_cost, $remarks);
    }

    private function recordMovement(
        Batch $batch,
        string $type,
        float $quantity,
        ?Model $reference,
        float $unitCost,
        ?string $remarks = null,
    ): StockMovement {
        return StockMovement::create([
            'batch_id' => $batch->id,
            'product_id' => $batch->product_id,
            'warehouse_id' => $batch->warehouse_id,
            'type' => $type,
            'quantity' => $quantity,
            'unit_cost' => $unitCost,
            'reference_type' => $reference?->getMorphClass(),
            'reference_id' => $reference?->getKey(),
            'user_id' => Auth::id(),
            'remarks' => $remarks,
        ]);
    }
}
