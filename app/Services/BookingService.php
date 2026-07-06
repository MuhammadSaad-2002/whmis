<?php

namespace App\Services;

use App\Models\Booking;
use App\Models\SalesInvoice;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use RuntimeException;

class BookingService
{
    public function __construct(private readonly NumberSeriesService $numbers) {}

    /**
     * Convert an approved booking into a draft sales invoice. Stock is not
     * reserved — batches are chosen (FIFO) when the invoice is posted.
     */
    public function convertToSale(Booking $booking): SalesInvoice
    {
        return DB::transaction(function () use ($booking) {
            $booking = Booking::whereKey($booking->id)->lockForUpdate()->firstOrFail();

            if ($booking->status !== Booking::STATUS_APPROVED) {
                throw new RuntimeException("Only approved bookings can be converted (current: {$booking->status}).");
            }

            $payload = $booking->items->map(fn ($item) => [
                'product_id' => $item->product_id,
                'batch_id' => null,
                'quantity' => (float) $item->quantity,
                'bonus_quantity' => (float) $item->requested_bonus,
                'applied_rule_id' => $item->applied_rule_id,
                'trade_price' => (float) $item->trade_price,
                'discount_percent' => (float) $item->discount_percent,
                'gst_percent' => (float) $item->gst_percent,
                'remarks' => $item->remarks,
            ])->all();

            $computed = MarginCalculator::computeSalesItems($payload, [
                'discount_percent' => 0,
                'gst_percent' => 0,
            ]);

            $invoice = SalesInvoice::create([
                'invoice_number' => $this->numbers->next('sales_invoice'),
                'customer_id' => $booking->customer_id,
                'warehouse_id' => $booking->warehouse_id,
                'booking_id' => $booking->id,
                'sale_type' => 'booking',
                'invoice_date' => now()->toDateString(),
                'status' => SalesInvoice::STATUS_DRAFT,
                'created_by' => Auth::id(),
            ] + $computed['totals']);

            foreach ($computed['items'] as $item) {
                $invoice->items()->create($item);
            }

            $booking->update([
                'status' => Booking::STATUS_CONVERTED,
                'sales_invoice_id' => $invoice->id,
            ]);

            return $invoice;
        });
    }
}
