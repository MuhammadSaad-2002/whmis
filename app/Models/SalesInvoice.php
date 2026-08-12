<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use OwenIt\Auditing\Auditable;
use OwenIt\Auditing\Contracts\Auditable as AuditableContract;

class SalesInvoice extends Model implements AuditableContract
{
    use Auditable;

    public const STATUS_DRAFT = 'draft';
    public const STATUS_POSTED = 'posted';
    public const STATUS_CANCELLED = 'cancelled';

    /** Derived return lifecycle for a posted invoice. */
    public const RETURN_NONE = 'posted_no_returns';
    public const RETURN_PARTIAL = 'partially_returned';
    public const RETURN_FULL = 'fully_returned';

    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'invoice_date' => 'date',
            'due_date' => 'date',
            'posted_at' => 'datetime',
            'manual_number' => 'boolean',
            'stock_reserved' => 'boolean',
            'subtotal' => 'decimal:2',
            'item_discount_total' => 'decimal:2',
            'item_gst_total' => 'decimal:2',
            'discount_percent' => 'decimal:2',
            'discount_amount' => 'decimal:2',
            'gst_percent' => 'decimal:2',
            'gst_amount' => 'decimal:2',
            'total_amount' => 'decimal:2',
            'total_cost' => 'decimal:2',
            'total_profit' => 'decimal:2',
            'profit_percent' => 'decimal:2',
        ];
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    /** Set when the invoice was created by converting a booking. */
    public function booking(): BelongsTo
    {
        return $this->belongsTo(Booking::class);
    }

    public function warehouse(): BelongsTo
    {
        return $this->belongsTo(Warehouse::class);
    }

    public function items(): HasMany
    {
        return $this->hasMany(SalesInvoiceItem::class)->orderBy('sort_order');
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function returns(): HasMany
    {
        return $this->hasMany(SalesReturn::class)->orderBy('return_date')->orderBy('id');
    }

    /** Only valid (non-cancelled) returns count toward the net position. */
    public function postedReturns(): HasMany
    {
        return $this->returns()->where('status', SalesReturn::STATUS_POSTED);
    }

    public function isDraft(): bool
    {
        return $this->status === self::STATUS_DRAFT;
    }

    public function isPosted(): bool
    {
        return $this->status === self::STATUS_POSTED;
    }

    /**
     * Derived return lifecycle — computed from posted returns, never stored.
     * Keys off quantity so header-level discount/GST can't distort it.
     */
    protected function returnStatus(): Attribute
    {
        return Attribute::make(get: function (): string {
            $returnedQty = (float) $this->postedReturns()
                ->join('sales_return_items', 'sales_return_items.sales_return_id', '=', 'sales_returns.id')
                ->sum('sales_return_items.quantity');

            if ($returnedQty <= 1e-9) {
                return self::RETURN_NONE;
            }

            $soldQty = (float) $this->items()->sum('quantity');

            return $returnedQty + 1e-9 >= $soldQty
                ? self::RETURN_FULL
                : self::RETURN_PARTIAL;
        });
    }
}
