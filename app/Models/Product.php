<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use OwenIt\Auditing\Auditable;
use OwenIt\Auditing\Contracts\Auditable as AuditableContract;

class Product extends Model implements AuditableContract
{
    use Auditable, SoftDeletes;

    protected $guarded = [];

    protected $attributes = ['visible_to_bookers' => true];

    protected function casts(): array
    {
        return [
            'purchase_price' => 'decimal:2',
            'trade_price' => 'decimal:2',
            'retail_price' => 'decimal:2',
            'mrp' => 'decimal:2',
            'tax_percent' => 'decimal:2',
            'default_discount_percent' => 'decimal:2',
            'min_stock' => 'decimal:2',
            'reorder_level' => 'decimal:2',
            'visible_to_bookers' => 'boolean',
        ];
    }

    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class);
    }

    public function category(): BelongsTo
    {
        return $this->belongsTo(ProductCategory::class, 'category_id');
    }

    public function batches(): HasMany
    {
        return $this->hasMany(Batch::class);
    }

    public function scopeActive($query)
    {
        return $query->where('status', 'active');
    }

    public function scopeVisibleTo(Builder $query, User $user): Builder
    {
        return $query->when($user->isFieldBooker(), fn (Builder $products) => $products->where('visible_to_bookers', true));
    }

    public function isVisibleTo(User $user): bool
    {
        return ! $user->isFieldBooker() || $this->visible_to_bookers;
    }

    public function availableStock(?int $warehouseId = null): float
    {
        return (float) $this->batches()
            ->where('is_loan', false) // loaned-in stock is the lender's, never sellable
            ->when($warehouseId, fn ($q) => $q->where('warehouse_id', $warehouseId))
            ->sum('qty_available');
    }
}
