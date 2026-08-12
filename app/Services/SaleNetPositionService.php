<?php

namespace App\Services;

use App\Models\PaymentAllocation;
use App\Models\SalesInvoice;
use App\Models\SalesReturn;

/**
 * Computes the net/final position of a posted sales invoice dynamically:
 * original figures minus every valid (non-cancelled) return. The invoice is
 * never mutated — this is the single source of truth for the summary screen,
 * the net-position PDF, and the returned-status badge.
 *
 * Returned discount/tax are derived proportionally from the original line
 * (return items only store net_amount + cost), while returned receivable is
 * the actual credit note posted (Σ return.total_amount) — the figure that
 * really hit the customer ledger.
 */
class SaleNetPositionService
{
    public function positionFor(SalesInvoice $invoice): array
    {
        $invoice->loadMissing(['items', 'returns.items.invoiceItem']);

        $original = [
            'amount' => (float) $invoice->total_amount,
            'qty' => (float) $invoice->items->sum(fn ($i) => (float) $i->quantity),
            'discount' => (float) $invoice->item_discount_total + (float) $invoice->discount_amount,
            'tax' => (float) $invoice->item_gst_total + (float) $invoice->gst_amount,
            'receivable' => (float) $invoice->total_amount,
            'cost' => (float) $invoice->total_cost,
        ];

        $returns = [];
        $returned = ['amount' => 0.0, 'qty' => 0.0, 'discount' => 0.0, 'tax' => 0.0, 'receivable' => 0.0, 'cost' => 0.0];

        foreach ($invoice->returns as $return) {
            $row = $this->summariseReturn($return);
            $returns[] = $row;

            if ($return->status === SalesReturn::STATUS_POSTED) {
                foreach ($returned as $key => $_) {
                    $returned[$key] += $row[$key];
                }
            }
        }

        $net = [];
        foreach ($original as $key => $value) {
            $net[$key] = round($value - $returned[$key], 2);
        }

        $payments = (float) PaymentAllocation::where('invoice_type', $invoice->getMorphClass())
            ->where('invoice_id', $invoice->getKey())
            ->sum('amount');

        $balance = round($net['receivable'] - $payments, 2);

        return [
            'original' => $this->round($original),
            'returns' => $returns,
            'returned' => $this->round($returned),
            'net' => $net,
            'payments' => round($payments, 2),
            'final_outstanding' => max($balance, 0.0),
            'refund_due' => $balance < 0 ? round(-$balance, 2) : 0.0,
            'status' => $invoice->return_status,
        ];
    }

    /**
     * One return's figures. Discount/tax are derived from the matching original
     * line proportionally to the returned quantity.
     */
    private function summariseReturn(SalesReturn $return): array
    {
        $discount = 0.0;
        $tax = 0.0;
        $qty = 0.0;

        foreach ($return->items as $item) {
            $qty += (float) $item->quantity;

            $orig = $item->invoiceItem;
            if ($orig && (float) $orig->quantity > 0) {
                $proportion = (float) $item->quantity / (float) $orig->quantity;
                $discount += (float) $orig->discount_amount * $proportion;
                $tax += (float) $orig->gst_amount * $proportion;
            }
        }

        return [
            'id' => $return->id,
            'return_number' => $return->return_number,
            'date' => $return->return_date->toDateString(),
            'status' => $return->status,
            'amount' => round((float) $return->total_amount, 2),
            'receivable' => round((float) $return->total_amount, 2),
            'qty' => round($qty, 2),
            'discount' => round($discount, 2),
            'tax' => round($tax, 2),
            'cost' => round((float) $return->total_cost, 2),
        ];
    }

    private function round(array $figures): array
    {
        return array_map(fn ($v) => round($v, 2), $figures);
    }
}
