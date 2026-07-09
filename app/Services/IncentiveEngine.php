<?php

namespace App\Services;

use App\Models\IncentiveRule;
use App\Models\Product;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;

/**
 * Matches incentive rules to a (product, customer, qty, date) context and
 * computes their line effect. Rules only fill invoice line fields (bonus,
 * discount, price) — posting math never changes, so manual override is free.
 */
class IncentiveEngine
{
    /**
     * All rules applicable to the context, most specific first.
     */
    public function applicable(int $productId, ?int $customerId, float $qty, ?Carbon $date = null): Collection
    {
        $date = $date ?? Carbon::today();
        $companyId = Product::whereKey($productId)->value('company_id');

        return IncentiveRule::query()
            ->where('active', true)
            ->where(fn ($q) => $q->whereNull('product_id')->orWhere('product_id', $productId))
            ->where(fn ($q) => $q->whereNull('company_id')->orWhere('company_id', $companyId))
            ->where(function ($q) use ($customerId) {
                $q->whereNull('customer_id');
                if ($customerId) {
                    $q->orWhere('customer_id', $customerId);
                }
            })
            ->where(fn ($q) => $q->whereNull('date_from')->orWhereDate('date_from', '<=', $date))
            ->where(fn ($q) => $q->whereNull('date_to')->orWhereDate('date_to', '>=', $date))
            ->where(fn ($q) => $q->whereNull('min_qty')->orWhere('min_qty', '<=', $qty))
            ->get()
            ->sort(fn (IncentiveRule $a, IncentiveRule $b) => [$this->specificity($b), $b->priority, $b->id]
                <=> [$this->specificity($a), $a->priority, $a->id])
            ->values();
    }

    /**
     * Best matching rule with its computed effect, or null.
     *
     * @return array{rule: IncentiveRule, effect: array, explanation: string}|null
     */
    public function resolve(int $productId, ?int $customerId, float $qty, float $currentPrice, ?Carbon $date = null): ?array
    {
        $rule = $this->applicable($productId, $customerId, $qty, $date)->first();
        if (! $rule) {
            return null;
        }

        return [
            'rule' => $rule,
            'effect' => $this->effect($rule, $qty, $currentPrice),
            'explanation' => $rule->summary(),
        ];
    }

    /**
     * Line effect of a rule for a quantity. Keys absent = leave field as-is.
     *
     * @return array{bonus_qty?: float, discount_percent?: float, discount_amount?: float, trade_price?: float}
     */
    public function effect(IncentiveRule $rule, float $qty, float $currentPrice): array
    {
        return match ($rule->rule_type) {
            IncentiveRule::TYPE_QTY_BONUS => [
                'bonus_qty' => (float) $rule->base_qty > 0
                    ? floor($qty / (float) $rule->base_qty) * (float) $rule->bonus_qty
                    : 0.0,
            ],
            IncentiveRule::TYPE_SLAB_BONUS => [
                'bonus_qty' => $this->slabBonus($rule->slabs ?? [], $qty),
            ],
            IncentiveRule::TYPE_PERCENT_DISCOUNT => [
                'discount_percent' => (float) $rule->value,
            ],
            IncentiveRule::TYPE_FIXED_DISCOUNT => [
                'discount_amount' => (float) $rule->value,
            ],
            IncentiveRule::TYPE_PRICE_OVERRIDE => [
                'trade_price' => (float) $rule->value,
            ],
            default => [],
        };
    }

    private function slabBonus(array $slabs, float $qty): float
    {
        // A single open-ended slab (min N, no max) repeats its bonus every N
        // units — e.g. "every 10 → 1 bonus" gives 4 at qty 45.
        if (count($slabs) === 1) {
            $slab = $slabs[array_key_first($slabs)];
            $min = (float) ($slab['min_qty'] ?? 0);
            $hasMax = isset($slab['max_qty']) && $slab['max_qty'] !== null && $slab['max_qty'] !== '';
            if (! $hasMax && $min > 0) {
                return floor($qty / $min) * (float) ($slab['bonus_qty'] ?? 0);
            }
        }

        $best = 0.0;
        $bestMin = -1.0;

        foreach ($slabs as $slab) {
            $min = (float) ($slab['min_qty'] ?? 0);
            $max = isset($slab['max_qty']) && $slab['max_qty'] !== null && $slab['max_qty'] !== ''
                ? (float) $slab['max_qty']
                : null;

            if ($qty >= $min && ($max === null || $qty <= $max) && $min > $bestMin) {
                $best = (float) ($slab['bonus_qty'] ?? 0);
                $bestMin = $min;
            }
        }

        return $best;
    }

    private function specificity(IncentiveRule $rule): int
    {
        return ($rule->customer_id ? 4 : 0)
            + ($rule->product_id ? 2 : 0)
            + ($rule->company_id ? 1 : 0);
    }
}
