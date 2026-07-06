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
