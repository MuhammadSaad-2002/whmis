<?php

namespace App\Services;

use App\Models\Batch;
use App\Models\Product;
use App\Models\PurchaseInvoiceItem;
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
     * @throws RuntimeException when available stock is insufficient
     */
    public function consumeFifo(
        int $productId,
        int $warehouseId,
        float $quantity,
        Model $reference,
        ?int $batchId = null,
        string $type = 'sale',
    ): array {
        if ($quantity <= 0) {
            return [];
        }

        $query = Batch::where('product_id', $productId)
            ->where('warehouse_id', $warehouseId)
            ->where('qty_available', '>', 0)
            ->orderByRaw('expiry_date IS NULL, expiry_date ASC')
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
