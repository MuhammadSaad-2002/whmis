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
