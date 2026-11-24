<?php

namespace App\Services;

use App\Models\PurchaseInvoice;
use App\Models\PurchaseReturn;
use App\Models\PurchaseReturnItem;
use App\Models\SalesInvoice;
use App\Models\SalesInvoiceItem;
use App\Models\SalesReturn;
use App\Models\SalesReturnItem;
use App\Models\StockMovement;
use App\Support\Paisa;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use RuntimeException;

/**
 * Returns post immediately: stock and any customer credit are updated in one transaction.
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
     * $lines: [['sales_invoice_item_id' => int, 'quantity' => float, 'bonus_quantity' => float], ...]
     * Refund per unit = line net ÷ billed qty, so discounts/GST return proportionally.
     */
    public function createSalesReturn(SalesInvoice $invoice, array $lines, string $date, ?string $reason = null): SalesReturn
    {
        return DB::transaction(function () use ($invoice, $lines, $date, $reason) {
            $invoice = SalesInvoice::whereKey($invoice->id)->lockForUpdate()->firstOrFail();
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
                $qty = round((float) ($line['quantity'] ?? 0), 2);
                $bonus = round((float) ($line['bonus_quantity'] ?? 0), 2);
                if ($qty < 0 || $bonus < 0) {
                    throw new RuntimeException('Return quantities cannot be negative.');
                }
                if ($qty + $bonus <= 0) {
                    continue;
                }

                $item = $invoice->items()->with(['product' => fn ($q) => $q->withTrashed()])
                    ->whereKey($line['sales_invoice_item_id'])->firstOrFail();

                $previous = SalesReturnItem::where('sales_invoice_item_id', $item->id)
                    ->whereHas('salesReturn', fn ($q) => $q->where('status', SalesReturn::STATUS_POSTED))
                    ->selectRaw('SUM(quantity - bonus_quantity) as billed, SUM(bonus_quantity) as bonus')->first();
                $alreadyReturned = (float) $previous->billed;
                app(DispatchService::class)->assertCanReturnLine($invoice, $item->id, $qty + $bonus, $alreadyReturned + (float) $previous->bonus);
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

                $bonusReturnable = (float) $item->bonus_quantity - (float) $previous->bonus;
                if ($bonus > $bonusReturnable + 1e-9) {
                    throw new RuntimeException("Cannot return {$bonus} bonus units of {$item->product->name}: only {$bonusReturnable} bonus units returnable.");
                }

                $unitPrice = (float) $item->quantity > 0
                    ? round((float) $item->net_amount / (float) $item->quantity, 4)
                    : 0.0;

                foreach ([[false, $qty], [true, $bonus]] as [$isBonus, $units]) {
                    if ($units <= 0) continue;

                    foreach ($this->restoreToConsumedBatches($invoice, $item, $units, $return, $isBonus) as $allocation) {
                        $price = $isBonus ? 0 : $unitPrice;
                        $refund = round($allocation['quantity'] * $price, 2);
                        $cost = round($allocation['quantity'] * $allocation['unit_cost'], 4);

                        $return->items()->create([
                            'sales_invoice_item_id' => $item->id,
                            'product_id' => $item->product_id,
                            'batch_id' => $allocation['batch']->id,
                            'quantity' => $allocation['quantity'],
                            'bonus_quantity' => $isBonus ? $allocation['quantity'] : 0,
                            'unit_price' => $price,
                            'net_amount' => $refund,
                            'cost_amount' => $cost,
                        ]);

                        $totalRefund += $refund;
                        $totalCost += $cost;
                    }
                }
            }

            if ($return->items()->count() === 0) {
                throw new RuntimeException('Nothing to return — enter a quantity on at least one line.');
            }

            $credit = $this->roundedReturnAmount($invoice, $return, $totalRefund);
            $return->update([
                'total_amount' => $credit,
                'total_cost' => round($totalCost, 2),
            ]);

            if ($credit > 0) {
                $this->ledger->post(
                    $invoice->customer, 'credit_note', $date, 0, $credit, $return,
                    "Credit Note {$return->return_number} against {$invoice->invoice_number}",
                );
            }

            app(DispatchService::class)->syncReturns($invoice);
            app(CommissionService::class)->recalculate($invoice);
            return $return->refresh();
        });
    }

    /**
     * Reverse a posted sales return: remove the restored stock (inverse of the
     * batch restore) and reverse any credit note to re-raise the receivable.
     * The return row is kept for audit, flagged cancelled, and dropped from all
     * netting/capacity math.
     */
    public function cancelSalesReturn(SalesReturn $return): SalesReturn
    {
        return DB::transaction(function () use ($return) {
            $invoice = SalesInvoice::whereKey($return->sales_invoice_id)->lockForUpdate()->firstOrFail();
            app(FinanceApprovalService::class)->assertUnconsumed($invoice);
            $return = SalesReturn::whereKey($return->id)->lockForUpdate()->firstOrFail();
            if (! $return->isPosted()) {
                throw new RuntimeException('Only a posted return can be cancelled.');
            }

            $return->load(['items.batch', 'customer']);

            foreach ($return->items as $item) {
                if ($item->batch) {
                    $this->inventory->withdrawReturnedStock($item->batch, (float) $item->quantity, $return);
                }
            }

            // Opposite of the credit note posted on create — receivable goes back up.
            if ((float) $return->total_amount > 0) {
                $this->ledger->post(
                    $return->customer, 'debit_note', now()->toDateString(), (float) $return->total_amount, 0, $return,
                    "Reversal of Credit Note {$return->return_number}",
                );
            }

            $return->update([
                'status' => SalesReturn::STATUS_CANCELLED,
                'cancelled_at' => now(),
                'cancelled_by' => Auth::id(),
            ]);

            app(DispatchService::class)->syncReturns($invoice);
            app(CommissionService::class)->recalculate($invoice);
            return $return->refresh();
        });
    }

    /**
     * Purchase return against a posted purchase invoice: stock out of the
     * invoice lines' batches, debit note. Returnable per line is capped by
     * (received − already returned).
     * $lines: [['purchase_invoice_item_id' => int, 'quantity' => float], ...]
     */
    public function createPurchaseReturn(PurchaseInvoice $invoice, array $lines, string $date, ?string $reason = null): PurchaseReturn
    {
        return DB::transaction(function () use ($invoice, $lines, $date, $reason) {
            if (! $invoice->isPosted()) {
                throw new RuntimeException('Returns can only be made against posted invoices.');
            }

            $return = PurchaseReturn::create([
                'return_number' => $this->numbers->next('purchase_return'),
                'company_id' => $invoice->company_id,
                'purchase_invoice_id' => $invoice->id,
                'warehouse_id' => $invoice->warehouse_id,
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

                $item = $invoice->items()->with(['batch', 'product:id,name'])->whereKey($line['purchase_invoice_item_id'])->firstOrFail();

                if (! $item->batch) {
                    throw new RuntimeException("No batch on record for {$item->product->name} — this line cannot be returned.");
                }

                $alreadyReturned = (float) PurchaseReturnItem::where('purchase_invoice_item_id', $item->id)->sum('quantity');
                $returnable = (float) $item->quantity - $alreadyReturned;
                if ($qty > $returnable + 1e-9) {
                    throw new RuntimeException(sprintf(
                        'Cannot return %s of %s: only %s returnable (received %s, already returned %s).',
                        $qty,
                        $item->product->name,
                        $returnable,
                        (float) $item->quantity,
                        $alreadyReturned,
                    ));
                }

                $rate = (float) $item->purchase_rate;
                $amount = round($qty * $rate, 2);

                // adjust() locks the batch and rejects going negative (can't
                // return stock that has since been sold).
                $this->inventory->adjust($item->batch, -$qty, 'purchase_return', $return, $reason);

                $return->items()->create([
                    'purchase_invoice_item_id' => $item->id,
                    'batch_id' => $item->batch_id,
                    'product_id' => $item->product_id,
                    'quantity' => $qty,
                    'rate' => $rate,
                    'net_amount' => $amount,
                ]);

                $total += $amount;
            }

            if ($return->items()->count() === 0) {
                throw new RuntimeException('Nothing to return — enter a quantity on at least one line.');
            }

            $credit = $this->roundedReturnAmount($invoice, $return, $total);
            $return->update(['total_amount' => $credit]);

            $this->ledger->post(
                $invoice->company,
                'debit_note',
                $date,
                $credit,
                0,
                $return,
                "Debit Note {$return->return_number} against {$invoice->invoice_number}",
            );

            return $return->refresh();
        });
    }

    /** Allocate the cumulative rounding difference to the current note, not to any of its lines. */
    private function roundedReturnAmount(SalesInvoice|PurchaseInvoice $invoice, SalesReturn|PurchaseReturn $return, float $current): float
    {
        if ($invoice->rounding_amount === null || $current <= 0) return round($current, 2);
        $sales = $return instanceof SalesReturn;
        $notes = $sales ? $invoice->postedReturns() : PurchaseReturn::where('purchase_invoice_id', $invoice->id);
        $prior = Paisa::from((clone $notes)->whereKeyNot($return->id)->sum('total_amount'));
        $ids = $notes->pluck('id');
        $items = $sales ? SalesReturnItem::whereIn('sales_return_id', $ids) : PurchaseReturnItem::whereIn('purchase_return_id', $ids);
        $returned = (float) (clone $items)->selectRaw($sales ? 'SUM(quantity - bonus_quantity) AS units' : 'SUM(quantity) AS units')->value('units');
        $full = $returned >= (float) $invoice->items()->sum('quantity') - 0.00001;
        $invoiceTotal = Paisa::from($invoice->total_amount);
        $target = $full ? $invoiceTotal : min($invoiceTotal, Paisa::roundToRupee(Paisa::from($items->sum('net_amount'))));

        return max(0, $target - $prior) / 100;
    }

    public function roundingContext(SalesInvoice|PurchaseInvoice $invoice): ?array
    {
        if ($invoice->rounding_amount === null) return null;
        $sales = $invoice instanceof SalesInvoice;
        $notes = $sales ? $invoice->postedReturns() : PurchaseReturn::where('purchase_invoice_id', $invoice->id);
        $ids = (clone $notes)->pluck('id');
        $items = $sales ? SalesReturnItem::whereIn('sales_return_id', $ids) : PurchaseReturnItem::whereIn('purchase_return_id', $ids);
        $returned = (float) (clone $items)->selectRaw($sales ? 'SUM(quantity - bonus_quantity) AS units' : 'SUM(quantity) AS units')->value('units');

        return [
            'invoice_paisa' => Paisa::from($invoice->total_amount),
            'prior_paisa' => Paisa::from($notes->sum('total_amount')),
            'prior_line_paisa' => Paisa::from($items->sum('net_amount')),
            'remaining_units' => max(0, round((float) $invoice->items->sum('quantity') - $returned, 2)),
        ];
    }

    /**
     * @return array<array{batch: \App\Models\Batch, quantity: float, unit_cost: float}>
     */
    private function restoreToConsumedBatches(SalesInvoice $invoice, SalesInvoiceItem $item, float $qty, SalesReturn $return, bool $isBonus): array
    {
        $movements = StockMovement::where('reference_type', $invoice->getMorphClass())
            ->where('reference_id', $invoice->id)
            ->where('type', 'sale')
            ->where('product_id', $item->product_id)
            ->with('batch')
            ->orderBy('id')
            ->get();

        if ($movements->isEmpty()) {
            throw new RuntimeException('No stock movements found for this invoice line.');
        }

        // Reconstruct a line's part of the ordered product movements. Posting
        // consumes each line's billed units first, then its bonus units.
        $offset = 0.0;
        foreach ($invoice->items->where('product_id', $item->product_id) as $invoiceItem) {
            if ($invoiceItem->id === $item->id) break;
            $offset += (float) $invoiceItem->quantity + (float) $invoiceItem->bonus_quantity;
        }
        $start = $offset + ($isBonus ? (float) $item->quantity : 0);
        $end = $start + (float) ($isBonus ? $item->bonus_quantity : $item->quantity);
        $position = 0.0;
        $eligible = [];
        foreach ($movements as $movement) {
            $next = $position + abs((float) $movement->quantity);
            $overlap = min($next, $end) - max($position, $start);
            if ($overlap > 1e-9) {
                $batchId = $movement->batch_id;
                $eligible[$batchId] ??= ['movement' => $movement, 'quantity' => 0.0];
                $eligible[$batchId]['quantity'] += $overlap;
            }
            $position = $next;
        }

        // Both the original line/category capacity and the total physical batch
        // capacity must hold, including historical billed-only returns.
        $restored = SalesReturnItem::query()
            ->whereHas('salesReturn', fn ($q) => $q->where('sales_invoice_id', $invoice->id)
                ->where('status', SalesReturn::STATUS_POSTED))
            ->where('product_id', $item->product_id)
            ->selectRaw('batch_id, sales_invoice_item_id, SUM(quantity) as total, SUM(bonus_quantity) as bonus')
            ->groupBy('batch_id', 'sales_invoice_item_id')->get()->groupBy('batch_id');
        $consumed = $movements->groupBy('batch_id');

        $remaining = $qty;
        $allocations = [];

        foreach ($eligible as $batchId => $allocation) {
            if ($remaining <= 0) {
                break;
            }

            $previous = $restored->get($batchId, collect());
            $previousLine = $previous->firstWhere('sales_invoice_item_id', $item->id);
            $previousBonus = (float) ($previousLine?->bonus ?? 0);
            $previousOfKind = $isBonus ? $previousBonus : (float) ($previousLine?->total ?? 0) - $previousBonus;
            $capacity = min($allocation['quantity'] - $previousOfKind,
                abs((float) $consumed[$batchId]->sum('quantity')) - (float) $previous->sum('total'));
            if ($capacity <= 1e-9) {
                continue;
            }

            $take = min($capacity, $remaining);
            $movement = $allocation['movement'];
            $batch = $movement->batch;
            $this->inventory->returnToBatch($batch, $take, $return);

            $allocations[] = ['batch' => $batch, 'quantity' => $take, 'unit_cost' => (float) $movement->unit_cost];
            $remaining -= $take;
        }

        if ($remaining > 1e-9) {
            throw new RuntimeException('Return quantity exceeds what was dispatched from stock for this invoice.');
        }

        return $allocations;
    }
}
