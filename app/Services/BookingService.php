<?php

namespace App\Services;

use App\Models\Booking;
use App\Models\IncentiveRule;
use App\Models\SalesInvoice;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use RuntimeException;

class BookingService
{
    public function __construct(
        private readonly NumberSeriesService $numbers,
        private readonly IncentiveEngine $incentives,
    ) {}

    /**
     * Convert an approved booking into a draft sales invoice. Stock is not
     * reserved — batches are chosen (FIFO) when the invoice is posted.
     */
    public function convertToSale(Booking $booking): SalesInvoice
    {
        return DB::transaction(function () use ($booking) {
            $booking = Booking::whereKey($booking->id)->with('items.incentives')->lockForUpdate()->firstOrFail();

            if ($booking->status !== Booking::STATUS_APPROVED) {
                throw new RuntimeException("Only approved bookings can be converted (current: {$booking->status}).");
            }

            $date = Carbon::parse($booking->booking_date);
            $breakdowns = [];
            $payload = [];

            foreach ($booking->items as $i => $item) {
                // Re-run the engine from the booking line's picked rules so the sale
                // records the same stacked incentives a native sale would.
                $combined = $this->incentives->combine(
                    (int) $item->product_id,
                    $booking->customer_id ? (int) $booking->customer_id : null,
                    (float) $item->quantity,
                    (float) $item->trade_price,
                    $item->incentives->pluck('incentive_rule_id')->filter()->all(),
                    $date,
                );
                $breakdown = $combined['breakdown'];
                $hasBonusRule = collect($breakdown)
                    ->whereIn('rule_type', [IncentiveRule::TYPE_QTY_BONUS, IncentiveRule::TYPE_SLAB_BONUS])
                    ->isNotEmpty();

                $payload[] = [
                    'product_id' => $item->product_id,
                    'batch_id' => null,
                    'quantity' => (float) $item->quantity,
                    'bonus_quantity' => $hasBonusRule ? $combined['bonus_qty'] : (float) $item->requested_bonus,
                    'applied_rule_id' => $breakdown[0]['rule_id'] ?? null,
                    'trade_price' => $combined['trade_price'],
                    'discount_percent' => (float) $item->discount_percent,
                    'incentive_discount' => $combined['incentive_discount'],
                    'gst_percent' => (float) $item->gst_percent,
                    'remarks' => $item->remarks,
                ];
                $breakdowns[$i] = $breakdown;
            }

            $computed = MarginCalculator::computeSalesItems($payload, [
                'discount_percent' => 0,
                'gst_percent' => 0,
            ]);

            $invoice = SalesInvoice::create([
                'invoice_number' => $this->numbers->next('sales_invoice'),
                'customer_id' => $booking->customer_id,
                'booker_id' => $booking->booker_id,
                'warehouse_id' => $booking->warehouse_id,
                'booking_id' => $booking->id,
                'sale_type' => 'booking',
                'invoice_date' => now()->toDateString(),
                'status' => SalesInvoice::STATUS_DRAFT,
                'created_by' => Auth::id(),
            ] + $computed['totals']);

            foreach ($computed['items'] as $i => $itemData) {
                $line = $invoice->items()->create($itemData);
                foreach ($breakdowns[$i] as $b) {
                    $line->incentives()->create([
                        'sales_invoice_id' => $invoice->id,
                        'customer_id' => $invoice->customer_id,
                        'product_id' => $line->product_id,
                        'incentive_rule_id' => $b['rule_id'],
                        'rule_type' => $b['rule_type'],
                        'rule_name' => $b['rule_name'],
                        'bonus_qty' => $b['bonus_qty'],
                        'discount_amount' => $b['discount_amount'],
                        'trade_price' => $b['trade_price'],
                        'value_given' => $b['value_given'],
                        'sort_order' => $b['sort_order'],
                    ]);
                }
            }

            $booking->update([
                'status' => Booking::STATUS_CONVERTED,
                'sales_invoice_id' => $invoice->id,
            ]);

            return $invoice;
        });
    }
}
