import { toNumber } from '@/lib/format';

export interface Slab {
    min_qty: number | string;
    max_qty: number | string | null;
    bonus_qty: number | string;
}

/** Parameters of an applied bonus rule, kept on a grid row for live recompute. */
export interface AppliedRule {
    rule_type: string;
    base_qty?: number;
    bonus_qty?: number;
    slabs?: Slab[];
}

/** A single incentive rule stacked on a line (mirrors the lookup payload). */
export interface IncentiveHit {
    id: number;
    name: string;
    rule_type: string;
    base_qty?: number;
    bonus_qty?: number;
    slabs?: Slab[];
    value?: number;
    effect: {
        bonus_qty?: number;
        discount_percent?: number;
        discount_amount?: number;
        trade_price?: number;
    };
}

export interface CombinedEffect {
    bonus_qty: number;
    incentive_discount: number;
    trade_price: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Client mirror of IncentiveEngine::combine — aggregate a stack of rules for a
 * line: a price override sets the rate, bonuses sum, percent/fixed discounts
 * combine (capped at the line gross). Assumes one rule per type (the grid
 * blocks duplicates on add).
 */
export function combineEffects(rules: IncentiveHit[], qty: number, basePrice: number): CombinedEffect {
    const override = rules.find((r) => r.rule_type === 'price_override');
    const rate = override ? toNumber(override.value) : basePrice;
    const gross = r2(qty * rate);

    let bonus = 0;
    let discount = 0;
    for (const rule of rules) {
        if (rule.rule_type === 'qty_bonus' || rule.rule_type === 'slab_bonus') {
            bonus += ruleBonus(rule, qty);
        } else if (rule.rule_type === 'percent_discount') {
            discount += r2((gross * toNumber(rule.value)) / 100);
        } else if (rule.rule_type === 'fixed_discount') {
            discount += toNumber(rule.value);
        }
    }

    return { bonus_qty: r2(bonus), incentive_discount: Math.min(r2(discount), gross), trade_price: rate };
}

/** Rs value of an incentive as granted — for the live "incentives given" display. */
export function incentiveValue(rule: IncentiveHit, qty: number, basePrice: number, rate: number): number {
    const gross = r2(qty * rate);
    if (rule.rule_type === 'qty_bonus' || rule.rule_type === 'slab_bonus') {
        return r2(ruleBonus(rule, qty) * rate);
    }
    if (rule.rule_type === 'percent_discount') {
        return r2((gross * toNumber(rule.value)) / 100);
    }
    if (rule.rule_type === 'fixed_discount') {
        return r2(toNumber(rule.value));
    }
    if (rule.rule_type === 'price_override') {
        return r2(Math.max(0, basePrice - rate) * qty);
    }
    return 0;
}

/**
 * Client mirror of IncentiveEngine's bonus math — keep in sync with
 * app/Services/IncentiveEngine.php so applied rules recompute live as the
 * quantity changes.
 */
export function ruleBonus(rule: AppliedRule, qty: number): number {
    if (rule.rule_type === 'qty_bonus') {
        const base = toNumber(rule.base_qty ?? 0);
        return base > 0 ? Math.floor(qty / base) * toNumber(rule.bonus_qty ?? 0) : 0;
    }
    if (rule.rule_type === 'slab_bonus') {
        return slabBonus(rule.slabs ?? [], qty);
    }
    return 0;
}

function slabBonus(slabs: Slab[], qty: number): number {
    // A single open-ended slab (min N, no max) repeats every N units.
    if (slabs.length === 1) {
        const s = slabs[0];
        const min = toNumber(s.min_qty);
        const hasMax = s.max_qty !== null && s.max_qty !== undefined && s.max_qty !== '';
        if (!hasMax && min > 0) {
            return Math.floor(qty / min) * toNumber(s.bonus_qty);
        }
    }

    let best = 0;
    let bestMin = -1;
    for (const s of slabs) {
        const min = toNumber(s.min_qty);
        const hasMax = s.max_qty !== null && s.max_qty !== undefined && s.max_qty !== '';
        const max = hasMax ? toNumber(s.max_qty) : null;
        if (qty >= min && (max === null || qty <= max) && min > bestMin) {
            best = toNumber(s.bonus_qty);
            bestMin = min;
        }
    }
    return best;
}
