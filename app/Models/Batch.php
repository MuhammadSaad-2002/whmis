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

    public function scopeNotExpired($query)
    {
        return $query->where(fn ($q) => $q->whereNull('expiry_date')->orWhereDate('expiry_date', '>=', now()));
    }
}
