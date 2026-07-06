<?php

namespace App\Services;

use App\Models\Batch;
use App\Models\Company;
use App\Models\PurchaseReturn;
use App\Models\SalesInvoice;
use App\Models\SalesReturn;
use App\Models\SalesReturnItem;
use App\Models\StockMovement;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use RuntimeException;

/**
 * Returns post immediately: stock and ledger are updated in one transaction.
 * Corrections are made with stock adjustments + manual ledger notes.
 */
class ReturnService
{
    public function __construct(
        private readonly NumberSeriesService $numbers,
        private readonly InventoryService $inventory,
        private readonly LedgerService $ledger,
    ) {}

    /**
     * Sales return against a posted invoice.
     * $lines: [['sales_invoice_item_id' => int, 'quantity' => float], ...]
     * Refund per unit = line net ÷ billed qty, so discounts/GST return proportionally.
     */
    public function createSalesReturn(SalesInvoice $invoice, array $lines, string $date, ?string $reason = null): SalesReturn
    {
        return DB::transaction(function () use ($invoice, $lines, $date, $reason) {
            if (! $invoice->isPosted()) {
                throw new RuntimeException('Returns can only be made against posted invoices.');
            }

            $return = SalesReturn::create([
                'return_number' => $this->numbers->next('sales_return'),
                'sales_invoice_id' => $invoice->id,
                'customer_id' => $invoice->customer_id,
                'warehouse_id' => $invoice->warehouse_id,
                'return_date' => $date,
                'reason' => $reason,
                'created_by' => Auth::id(),
            ]);

            $totalRefund = 0.0;
            $totalCost = 0.0;

            foreach ($lines as $line) {
                $qty = (float) ($line['quantity'] ?? 0);
                if ($qty <= 0) {
                    continue;
                }

                $item = $invoice->items()->whereKey($line['sales_invoice_item_id'])->firstOrFail();

                $alreadyReturned = (float) SalesReturnItem::where('sales_invoice_item_id', $item->id)->sum('quantity');
                $returnable = (float) $item->quantity - $alreadyReturned;
                if ($qty > $returnable + 1e-9) {
                    throw new RuntimeException(sprintf(
                        'Cannot return %s of %s: only %s returnable (sold %s, already returned %s).',
                        $qty,
                        $item->product->name,
                        $returnable,
                        (float) $item->quantity,
                        $alreadyReturned,
                    ));
                }

                $unitPrice = (float) $item->quantity > 0
                    ? round((float) $item->net_amount / (float) $item->quantity, 4)
                    : 0.0;

                // Restore stock to the batches this invoice consumed for this
                // product, capped per batch by (consumed − previously returned).
                $allocations = $this->restoreToConsumedBatches($invoice, $item->product_id, $qty, $return);

                foreach ($allocations as $allocation) {
                    $refund = round($allocation['quantity'] * $unitPrice, 2);
                    $cost = round($allocation['quantity'] * (float) $allocation['batch']->effective_cost, 4);

                    $return->items()->create([
                        'sales_invoice_item_id' => $item->id,
                        'product_id' => $item->product_id,
                        'batch_id' => $allocation['batch']->id,
                        'quantity' => $allocation['quantity'],
                        'unit_price' => $unitPrice,
                        'net_amount' => $refund,
                        'cost_amount' => $cost,
                    ]);

                    $totalRefund += $refund;
                    $totalCost += $cost;
                }
            }

            if ($return->items()->count() === 0) {
                throw new RuntimeException('Nothing to return — enter a quantity on at least one line.');
            }

            $return->update([
                'total_amount' => round($totalRefund, 2),
                'total_cost' => round($totalCost, 2),
            ]);

            $this->ledger->post(
                $invoice->customer,
                'credit_note',
                $date,
                0,
                round($totalRefund, 2),
                $return,
                "Credit Note {$return->return_number} against {$invoice->invoice_number}",
            );

            return $return->refresh();
        });
    }

    /**
     * Purchase return to a supplier: stock out of chosen batches, debit note.
     * $lines: [['batch_id' => int, 'quantity' => float, 'rate' => ?float], ...]
     */
    public function createPurchaseReturn(Company $company, int $warehouseId, array $lines, string $date, ?string $reason = null): PurchaseReturn
    {
        return DB::transaction(function () use ($company, $warehouseId, $lines, $date, $reason) {
            $return = PurchaseReturn::create([
                'return_number' => $this->numbers->next('purchase_return'),
                'company_id' => $company->id,
                'warehouse_id' => $warehouseId,
                'return_date' => $date,
                'reason' => $reason,
                'created_by' => Auth::id(),
            ]);

            $total = 0.0;

            foreach ($lines as $line) {
                $qty = (float) ($line['quantity'] ?? 0);
                if ($qty <= 0) {
                    continue;
                }

                $batch = Batch::with('product:id,name,company_id')->findOrFail($line['batch_id']);

                if ((int) $batch->product->company_id !== (int) $company->id) {
                    throw new RuntimeException("Batch {$batch->batch_number} does not belong to {$company->name}.");
                }

                $rate = isset($line['rate']) && $line['rate'] !== null && $line['rate'] !== ''
                    ? (float) $line['rate']
                    : (float) $batch->purchase_rate;
                $amount = round($qty * $rate, 2);

                // adjust() locks the batch and rejects going negative.
                $this->inventory->adjust($batch, -$qty, 'purchase_return', $return, $reason);

                $return->items()->create([
                    'batch_id' => $batch->id,
                    'product_id' => $batch->product_id,
                    'quantity' => $qty,
                    'rate' => $rate,
                    'net_amount' => $amount,
                ]);

                $total += $amount;
            }

            if ($return->items()->count() === 0) {
                throw new RuntimeException('Nothing to return — enter a quantity on at least one batch.');
            }

            $return->update(['total_amount' => round($total, 2)]);

            $this->ledger->post(
                $company,
                'debit_note',
                $date,
                round($total, 2),
                0,
                $return,
                "Debit Note {$return->return_number}",
            );

            return $return->refresh();
        });
    }

    /**
     * @return array<array{batch: Batch, quantity: float}>
     */
    private function restoreToConsumedBatches(SalesInvoice $invoice, int $productId, float $qty, SalesReturn $return): array
    {
        $movements = StockMovement::where('reference_type', $invoice->getMorphClass())
            ->where('reference_id', $invoice->id)
            ->where('type', 'sale')
            ->where('product_id', $productId)
            ->orderBy('id')
            ->get();

        if ($movements->isEmpty()) {
            throw new RuntimeException('No stock movements found for this invoice line.');
        }

        // Capacity per batch = consumed − already restored by earlier returns.
        $restored = SalesReturnItem::query()
            ->whereHas('salesReturn', fn ($q) => $q->where('sales_invoice_id', $invoice->id))
            ->where('product_id', $productId)
            ->selectRaw('batch_id, SUM(quantity) as total')
            ->groupBy('batch_id')
            ->pluck('total', 'batch_id');

        $remaining = $qty;
        $allocations = [];

        foreach ($movements as $movement) {
            if ($remaining <= 0) {
                break;
            }

            $consumed = abs((float) $movement->quantity);
            $capacity = $consumed - (float) ($restored[$movement->batch_id] ?? 0);
            // Account for capacity already used within this same return call.
            foreach ($allocations as $allocation) {
                if ($allocation['batch']->id === $movement->batch_id) {
                    $capacity -= $allocation['quantity'];
                }
            }
            if ($capacity <= 0) {
                continue;
            }

            $take = min($capacity, $remaining);
            $batch = $movement->batch;
            $this->inventory->returnToBatch($batch, $take, $return);

            $allocations[] = ['batch' => $batch, 'quantity' => $take];
            $remaining -= $take;
        }

        if ($remaining > 1e-9) {
            throw new RuntimeException('Return quantity exceeds what was dispatched from stock for this invoice.');
        }

        return $allocations;
    }
}
