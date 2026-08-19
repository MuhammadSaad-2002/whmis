<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One incentive rule as applied to a booking line — the durable record of what
 * was promised. rule_type/rule_name/value_given are snapshotted so the row
 * survives later edits or deletion of the underlying rule. Mirrors
 * SalesInvoiceItemIncentive so the two flows stay consistent.
 */
class BookingItemIncentive extends Model
{
    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'bonus_qty' => 'decimal:2',
            'discount_amount' => 'decimal:2',
            'trade_price' => 'decimal:2',
            'value_given' => 'decimal:2',
        ];
    }

    public function item(): BelongsTo
    {
        return $this->belongsTo(BookingItem::class, 'booking_item_id');
    }

    public function booking(): BelongsTo
    {
        return $this->belongsTo(Booking::class);
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    public function rule(): BelongsTo
    {
        return $this->belongsTo(IncentiveRule::class, 'incentive_rule_id');
    }
}
