<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Batch extends Model
{
    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'expiry_date' => 'date',
            'is_sample' => 'boolean',
            'is_loan' => 'boolean',
            'purchase_rate' => 'decimal:4',
            'effective_cost' => 'decimal:4',
            'trade_price' => 'decimal:2',
            'retail_price' => 'decimal:2',
            'qty_purchased' => 'decimal:2',
            'qty_bonus' => 'decimal:2',
            'qty_sold' => 'decimal:2',
            'qty_reserved' => 'decimal:2',
            'qty_available' => 'decimal:2',
        ];
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    public function warehouse(): BelongsTo
    {
        return $this->belongsTo(Warehouse::class);
    }

    public function movements(): HasMany
    {
        return $this->hasMany(StockMovement::class);
    }

    public function scopeInStock($query)
    {
        return $query->where('qty_available', '>', 0);
    }

    /** Free-sample stock only. */
    public function scopeSamples($query)
    {
        return $query->where('is_sample', true);
    }

    /** Normal purchased stock only (excludes free samples and loaned-in stock). */
    public function scopeNormal($query)
    {
        return $query->where('is_sample', false)->where('is_loan', false);
    }

    /** Loaned-in stock only (owned by a lender, segregated from sellable stock). */
    public function scopeLoans($query)
    {
        return $query->where('is_loan', true);
    }

    public function scopeNotExpired($query)
    {
        return $query->where(fn ($q) => $q->whereNull('expiry_date')->orWhereDate('expiry_date', '>=', now()));
    }
}
