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
     * Verify + combine a set of manually picked rules for one line, most
     * specific first. Rules not applicable to the (product, customer, qty, date)
     * context are silently dropped; at most one rule per rule_type is kept
     * (bonuses across types sum, discounts combine). Returns the aggregated line
     * effect plus a per-rule breakdown for the incentive record.
     *
     * @param  int[]  $ruleIds
     * @return array{trade_price: float, bonus_qty: float, incentive_discount: float, breakdown: array<int, array{
     *     rule_id: int, rule_type: string, rule_name: string, bonus_qty: float,
     *     discount_amount: float, trade_price: float|null, value_given: float}>}
     */
    public function combine(int $productId, ?int $customerId, float $qty, float $basePrice, array $ruleIds, ?Carbon $date = null): array
    {
        $wanted = array_map('intval', $ruleIds);

        // Keep only picked rules that still apply, in precedence order, one per type.
        $rules = $this->applicable($productId, $customerId, $qty, $date)
            ->filter(fn (IncentiveRule $rule) => in_array($rule->id, $wanted, true))
            ->unique('rule_type')
            ->values();

        // A price override sets the line rate before any discount is figured.
        $override = $rules->firstWhere('rule_type', IncentiveRule::TYPE_PRICE_OVERRIDE);
        $rate = $override ? (float) $override->value : $basePrice;
        $gross = round($qty * $rate, 2);

        $bonusTotal = 0.0;
        $discountTotal = 0.0;
        $breakdown = [];
        $sort = 0;

        foreach ($rules as $rule) {
            $effect = $this->effect($rule, $qty, $rate);
            $bonusQty = (float) ($effect['bonus_qty'] ?? 0);
            $discount = 0.0;

            if (isset($effect['discount_percent'])) {
                $discount = round($gross * (float) $effect['discount_percent'] / 100, 2);
            } elseif (isset($effect['discount_amount'])) {
                $discount = round((float) $effect['discount_amount'], 2);
            }

            $valueGiven = match ($rule->rule_type) {
                IncentiveRule::TYPE_QTY_BONUS, IncentiveRule::TYPE_SLAB_BONUS => round($bonusQty * $rate, 2),
                IncentiveRule::TYPE_PRICE_OVERRIDE => round(max(0.0, $basePrice - $rate) * $qty, 2),
                default => $discount,
            };

            $bonusTotal += $bonusQty;
            $discountTotal += $discount;

            $breakdown[] = [
                'rule_id' => $rule->id,
                'rule_type' => $rule->rule_type,
                'rule_name' => $rule->name,
                'bonus_qty' => $bonusQty,
                'discount_amount' => $discount,
                'trade_price' => $rule->rule_type === IncentiveRule::TYPE_PRICE_OVERRIDE ? $rate : null,
                'value_given' => $valueGiven,
                'sort_order' => $sort++,
            ];
        }

        return [
            'trade_price' => $rate,
            'bonus_qty' => round($bonusTotal, 2),
            // A line can never be discounted below zero.
            'incentive_discount' => round(min($discountTotal, $gross), 2),
            'breakdown' => $breakdown,
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
