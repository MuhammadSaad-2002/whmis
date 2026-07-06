<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use OwenIt\Auditing\Auditable;
use OwenIt\Auditing\Contracts\Auditable as AuditableContract;

class IncentiveRule extends Model implements AuditableContract
{
    use Auditable;

    public const TYPE_QTY_BONUS = 'qty_bonus';
    public const TYPE_SLAB_BONUS = 'slab_bonus';
    public const TYPE_PERCENT_DISCOUNT = 'percent_discount';
    public const TYPE_FIXED_DISCOUNT = 'fixed_discount';
    public const TYPE_PRICE_OVERRIDE = 'price_override';

    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'slabs' => 'array',
            'base_qty' => 'decimal:2',
            'bonus_qty' => 'decimal:2',
            'value' => 'decimal:2',
            'min_qty' => 'decimal:2',
            'date_from' => 'date',
            'date_to' => 'date',
            'active' => 'boolean',
        ];
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class);
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    /** Human summary of what the rule does, shown in pickers and lists. */
    public function summary(): string
    {
        return match ($this->rule_type) {
            self::TYPE_QTY_BONUS => sprintf('Buy %s get %s free (repeats)', $this->fmt($this->base_qty), $this->fmt($this->bonus_qty)),
            self::TYPE_SLAB_BONUS => collect($this->slabs ?? [])
                ->map(fn ($s) => sprintf('%s+ → %s bonus', $this->fmt($s['min_qty'] ?? 0), $this->fmt($s['bonus_qty'] ?? 0)))
                ->implode(', '),
            self::TYPE_PERCENT_DISCOUNT => sprintf('%s%% discount', $this->fmt($this->value)),
            self::TYPE_FIXED_DISCOUNT => sprintf('Rs %s off per line', $this->fmt($this->value)),
            self::TYPE_PRICE_OVERRIDE => sprintf('Special price Rs %s', $this->fmt($this->value)),
            default => $this->rule_type,
        };
    }

    private function fmt(mixed $n): string
    {
        return rtrim(rtrim(number_format((float) $n, 2), '0'), '.');
    }
}
