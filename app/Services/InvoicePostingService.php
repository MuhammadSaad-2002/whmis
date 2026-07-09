<?php

namespace App\Services;

use App\Exceptions\CreditLimitExceededException;
use App\Models\Batch;
use App\Models\PurchaseInvoice;
use App\Models\SalesInvoice;
use App\Models\StockMovement;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use RuntimeException;

/**
 * Transactional post/cancel for purchase and sales invoices.
 * Server-side recomputation is authoritative: whatever the client sent
 * for amounts is recalculated here before stock and ledger are touched.
 */
class InvoicePostingService
{
    public function __construct(
        private readonly InventoryService $inventory,
        private readonly LedgerService $ledger,
        private readonly PaymentService $payments,
    ) {}

    public function postPurchase(PurchaseInvoice $invoice): PurchaseInvoice
    {
        return DB::transaction(function () use ($invoice) {
            $invoice = PurchaseInvoice::whereKey($invoice->id)->lockForUpdate()->firstOrFail();

            if (! $invoice->isDraft()) {
                throw new RuntimeException("Invoice {$invoice->invoice_number} is not a draft.");
            }
            if ($invoice->items->isEmpty()) {
                throw new RuntimeException('Cannot post an invoice without items.');
            }

            $computedLines = [];
            $totalMargin = 0.0;

            foreach ($invoice->items as $item) {
                $line = MarginCalculator::purchaseLine($item->only([
                    'quantity', 'bonus_quantity', 'purchase_rate', 'trade_price',
                    'discount_percent', 'gst_percent',
                ]) + ['discount_amount' => null, 'gst_amount' => null]);

                $item->update([
                    'discount_amount' => $line['discount_amount'],
                    'gst_amount' => $line['gst_amount'],
                    'net_amount' => $line['net_amount'],
                    'margin' => $line['margin'],
                    'margin_percent' => $line['margin_percent'],
                ]);

                if ($item->batch_id) {
                    // Restock the chosen existing batch (validated at save time).
                    $this->inventory->restockBatch($item, $line['effective_cost'], $line['net_amount']);
                } else {
                    $batch = $this->inventory->receiveFromPurchaseItem($item, $line['effective_cost']);
                    $item->update(['batch_id' => $batch->id]);
                }

                $computedLines[] = $line;
                $totalMargin += $line['margin'];
            }

            $totals = MarginCalculator::invoiceTotals($computedLines, [
                'discount_percent' => (float) $invoice->discount_percent,
                'gst_percent' => (float) $invoice->gst_percent,
            ]);

            $invoice->update($totals + [
                'total_margin' => round($totalMargin, 2),
                'margin_percent' => $totals['total_amount'] > 0
                    ? round($totalMargin / $totals['total_amount'] * 100, 2)
                    : 0,
                'status' => PurchaseInvoice::STATUS_POSTED,
                'posted_at' => now(),
                'posted_by' => Auth::id(),
            ]);

            $this->ledger->post(
                $invoice->company,
                'purchase',
                $invoice->invoice_date,
                0,
                (float) $invoice->total_amount,
                $invoice,
                "Purchase Invoice {$invoice->invoice_number}",
            );

            if ($invoice->purchase_type === 'cash') {
                $this->payments->createAutoSettlement($invoice, $invoice->company);
            }

            return $invoice->refresh();
        });
    }

    public function cancelPurchase(PurchaseInvoice $invoice): PurchaseInvoice
    {
        return DB::transaction(function () use ($invoice) {
            $invoice = PurchaseInvoice::whereKey($invoice->id)->lockForUpdate()->firstOrFail();

            if ($invoice->status === PurchaseInvoice::STATUS_CANCELLED) {
                throw new RuntimeException('Invoice is already cancelled.');
            }

            if ($invoice->isPosted()) {
                foreach ($invoice->items as $item) {
                    if ($item->batch_id) {
                        $qty = (float) $item->quantity;
                        $bonus = (float) $item->bonus_quantity;
                        $units = $qty + $bonus;
                        $receiptUnitCost = $units > 0 ? (float) $item->net_amount / $units : 0.0;
                        $this->inventory->reversePurchaseReceipt(
                            Batch::findOrFail($item->batch_id),
                            $qty,
                            $bonus,
                            $receiptUnitCost,
                            $invoice,
                        );
                    }
                }

                $this->ledger->post(
                    $invoice->company,
                    'adjustment',
                    now()->toDateString(),
                    (float) $invoice->total_amount,
                    0,
                    $invoice,
                    "Cancellation of {$invoice->invoice_number}",
                );

                $this->payments->reverseAutoSettlement($invoice, $invoice->company);
            }

            $invoice->update(['status' => PurchaseInvoice::STATUS_CANCELLED]);

            return $invoice->refresh();
        });
    }

    public function postSale(SalesInvoice $invoice): SalesInvoice
    {
        return DB::transaction(function () use ($invoice) {
            $invoice = SalesInvoice::whereKey($invoice->id)->lockForUpdate()->firstOrFail();

            if (! $invoice->isDraft()) {
                throw new RuntimeException("Invoice {$invoice->invoice_number} is not a draft.");
            }
            if ($invoice->items->isEmpty()) {
                throw new RuntimeException('Cannot post an invoice without items.');
            }

            $computedLines = [];
            $totalCost = 0.0;
            $totalProfit = 0.0;

            foreach ($invoice->items as $item) {
                $line = MarginCalculator::salesLine($item->only([
                    'quantity', 'trade_price', 'discount_percent', 'gst_percent',
                ]) + ['discount_amount' => null, 'gst_amount' => null]);

                // Bonus units ship for free but still consume stock at cost.
                $unitsOut = (float) $item->quantity + (float) $item->bonus_quantity;
                $allocations = $this->inventory->consumeFifo(
                    $item->product_id,
                    $invoice->warehouse_id,
                    $unitsOut,
                    $invoice,
                    $item->batch_id,
                );

                $cost = round(array_sum(array_column($allocations, 'cost')), 4);
                $profitData = MarginCalculator::profit($line['net_amount'], $cost);

                $item->update([
                    'discount_amount' => $line['discount_amount'],
                    'gst_amount' => $line['gst_amount'],
                    'net_amount' => $line['net_amount'],
                    'cost_amount' => $cost,
                    'profit' => $profitData['profit'],
                    'profit_percent' => $profitData['profit_percent'],
                    'batch_id' => $item->batch_id ?? (count($allocations) === 1 ? $allocations[0]['batch']->id : null),
                ]);

                $computedLines[] = $line;
                $totalCost += $cost;
                $totalProfit += $profitData['profit'];
            }

            $totals = MarginCalculator::invoiceTotals($computedLines, [
                'discount_percent' => (float) $invoice->discount_percent,
                'gst_percent' => (float) $invoice->gst_percent,
            ]);

            // Credit-limit gate: cash sales settle immediately and are exempt.
            if ($invoice->sale_type !== 'cash') {
                $customer = $invoice->customer;
                $limit = (float) $customer->credit_limit;
                if ($limit > 0) {
                    $outstanding = $this->ledger->outstanding($customer);
                    if ($outstanding + $totals['total_amount'] > $limit + 0.005) {
                        throw new CreditLimitExceededException(sprintf(
                            'Credit limit exceeded for %s: outstanding Rs %s + this invoice Rs %s would pass the limit of Rs %s. Receive a payment or raise the limit first.',
                            $customer->name,
                            number_format($outstanding, 2),
                            number_format($totals['total_amount'], 2),
                            number_format($limit, 2),
                        ));
                    }
                }
            }

            // Invoice-level discount/GST shifts total revenue; profit follows.
            $headerDelta = $totals['total_amount']
                - round(array_sum(array_column($computedLines, 'net_amount')), 2);

            $invoice->update($totals + [
                'total_cost' => round($totalCost, 2),
                'total_profit' => round($totalProfit + $headerDelta, 2),
                'profit_percent' => $totals['total_amount'] > 0
                    ? round(($totalProfit + $headerDelta) / $totals['total_amount'] * 100, 2)
                    : 0,
                'status' => SalesInvoice::STATUS_POSTED,
                'posted_at' => now(),
                'posted_by' => Auth::id(),
            ]);

            $this->ledger->post(
                $invoice->customer,
                'sale',
                $invoice->invoice_date,
                (float) $invoice->total_amount,
                0,
                $invoice,
                "Sales Invoice {$invoice->invoice_number}",
            );

            if ($invoice->sale_type === 'cash') {
                $this->payments->createAutoSettlement($invoice, $invoice->customer);
            }

            return $invoice->refresh();
        });
    }

    public function cancelSale(SalesInvoice $invoice): SalesInvoice
    {
        return DB::transaction(function () use ($invoice) {
            $invoice = SalesInvoice::whereKey($invoice->id)->lockForUpdate()->firstOrFail();

            if ($invoice->status === SalesInvoice::STATUS_CANCELLED) {
                throw new RuntimeException('Invoice is already cancelled.');
            }

            if ($invoice->isPosted()) {
                $movements = StockMovement::where('reference_type', $invoice->getMorphClass())
                    ->where('reference_id', $invoice->id)
                    ->where('type', 'sale')
                    ->get();

                foreach ($movements as $movement) {
                    $this->inventory->returnToBatch(
                        $movement->batch,
                        abs((float) $movement->quantity),
                        $invoice,
                    );
                }

                $this->ledger->post(
                    $invoice->customer,
                    'adjustment',
                    now()->toDateString(),
                    0,
                    (float) $invoice->total_amount,
                    $invoice,
                    "Cancellation of {$invoice->invoice_number}",
                );

                $this->payments->reverseAutoSettlement($invoice, $invoice->customer);
            }

            $invoice->update(['status' => SalesInvoice::STATUS_CANCELLED]);

            return $invoice->refresh();
        });
    }
}
