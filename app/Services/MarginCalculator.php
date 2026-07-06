<?php

namespace App\Services;

/**
 * Single source of truth for invoice line and header math.
 * The client mirrors these formulas for live display, but posted
 * figures are always recomputed here.
 */
class MarginCalculator
{
    /**
     * Purchase line: gross -> discount -> GST -> net, margin vs trade price.
     *
     * Input keys: quantity, bonus_quantity, purchase_rate, trade_price,
     *             discount_percent, discount_amount, gst_percent, gst_amount
     * When *_amount is null it is derived from the matching percent.
     */
    public static function purchaseLine(array $line): array
    {
        $qty = (float) ($line['quantity'] ?? 0);
        $bonus = (float) ($line['bonus_quantity'] ?? 0);
        $rate = (float) ($line['purchase_rate'] ?? 0);
        $trade = (float) ($line['trade_price'] ?? 0);

        $gross = round($qty * $rate, 2);
        $discount = self::resolveAmount($gross, $line['discount_percent'] ?? 0, $line['discount_amount'] ?? null);
        $taxable = $gross - $discount;
        $gst = self::resolveAmount($taxable, $line['gst_percent'] ?? 0, $line['gst_amount'] ?? null);
        $net = round($taxable + $gst, 2);

        $totalUnits = $qty + $bonus;
        $effectiveCost = $totalUnits > 0 ? round($net / $totalUnits, 4) : 0.0;
        // Margin: what the stock is worth at trade price vs what it cost.
        $margin = round($trade * $totalUnits - $net, 2);
        $marginPercent = $net > 0.0 ? round($margin / $net * 100, 2) : 0.0;

        return [
            'gross' => $gross,
            'discount_amount' => $discount,
            'gst_amount' => $gst,
            'net_amount' => $net,
            'effective_cost' => $effectiveCost,
            'margin' => $margin,
            'margin_percent' => $marginPercent,
        ];
    }

    /**
     * Sales line: gross -> discount -> GST -> net. Profit needs the FIFO
     * cost of consumed stock, so it is applied after consumption.
     *
     * Input keys: quantity, trade_price, discount_percent, discount_amount,
     *             gst_percent, gst_amount
     */
    public static function salesLine(array $line): array
    {
        $qty = (float) ($line['quantity'] ?? 0);
        $rate = (float) ($line['trade_price'] ?? 0);

        $gross = round($qty * $rate, 2);
        $discount = self::resolveAmount($gross, $line['discount_percent'] ?? 0, $line['discount_amount'] ?? null);
        $taxable = $gross - $discount;
        $gst = self::resolveAmount($taxable, $line['gst_percent'] ?? 0, $line['gst_amount'] ?? null);
        $net = round($taxable + $gst, 2);

        return [
            'gross' => $gross,
            'discount_amount' => $discount,
            'gst_amount' => $gst,
            'net_amount' => $net,
        ];
    }

    public static function profit(float $netAmount, float $costAmount): array
    {
        $profit = round($netAmount - $costAmount, 2);

        return [
            'profit' => $profit,
            'profit_percent' => $netAmount > 0.0 ? round($profit / $netAmount * 100, 2) : 0.0,
        ];
    }

    /**
     * Invoice header totals from computed lines plus invoice-level
     * discount/GST (each percent- or amount-driven).
     */
    public static function invoiceTotals(array $lines, array $header): array
    {
        $subtotal = round(array_sum(array_column($lines, 'gross')), 2);
        $itemDiscount = round(array_sum(array_column($lines, 'discount_amount')), 2);
        $itemGst = round(array_sum(array_column($lines, 'gst_amount')), 2);
        $itemNet = round(array_sum(array_column($lines, 'net_amount')), 2);

        $invDiscount = self::resolveAmount($itemNet, $header['discount_percent'] ?? 0, $header['discount_amount'] ?? null);
        $afterDiscount = $itemNet - $invDiscount;
        $invGst = self::resolveAmount($afterDiscount, $header['gst_percent'] ?? 0, $header['gst_amount'] ?? null);
        $total = round($afterDiscount + $invGst, 2);

        return [
            'subtotal' => $subtotal,
            'item_discount_total' => $itemDiscount,
            'item_gst_total' => $itemGst,
            'discount_amount' => $invDiscount,
            'gst_amount' => $invGst,
            'total_amount' => $total,
        ];
    }

    /**
     * Compute display amounts for a set of sales line payloads plus header
     * totals. Shared by draft saving (SalesInvoiceController) and booking
     * conversion (BookingService) so both write identical figures.
     *
     * @param  array  $items  each: product_id, quantity, trade_price,
     *                        discount_percent?, gst_percent?, ...passthrough
     * @return array{items: array, totals: array}
     */
    public static function computeSalesItems(array $items, array $header): array
    {
        $lines = [];
        $computedItems = [];

        foreach (array_values($items) as $index => $item) {
            $line = self::salesLine($item + ['discount_amount' => null, 'gst_amount' => null]);

            $computedItems[] = $item + [
                'discount_amount' => $line['discount_amount'],
                'gst_amount' => $line['gst_amount'],
                'net_amount' => $line['net_amount'],
                'sort_order' => $index,
            ];
            $lines[] = $line;
        }

        return [
            'items' => $computedItems,
            'totals' => self::invoiceTotals($lines, $header),
        ];
    }

    private static function resolveAmount(float $base, float|int|string|null $percent, float|int|string|null $amount): float
    {
        if ($amount !== null && $amount !== '' && (float) $amount > 0) {
            return round((float) $amount, 2);
        }

        return round($base * ((float) ($percent ?? 0)) / 100, 2);
    }
}
